// The cell editor: an input in place of a cell's content. Enter, Tab and
// Ctrl+arrows save and move on, Ctrl+Alt+arrows move the row or column with
// the cell, Esc cancels. Features shape what it shows and saves (a formula)
// through the editor hooks of core/feature.ts.
import { escapeCell, parseTable, type Table, unescapeCell } from "../markdown.ts";
import { columnAfterMove, moveColumn, moveRow, setCell } from "../ops.ts";
import { appendRowAt, clampColumnMove, clampRowMove } from "../pins.ts";
import { UI_CLASS } from "../dom.ts";
import type { CellEditor, Feature, FocusTarget, TableHost, WidgetInfo, WriteResult } from "./feature.ts";
import { STICKY_GAP } from "./layout.ts";
import { insertRowWith, MOVE_BLOCKED } from "./structure.ts";
import { withoutTags } from "../tags.ts";

// Ctrl+Alt + these keys move the edited cell's row or column
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

// Ctrl(+Shift) + these keys move the cell editor to another cell
const NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

// Rows a PageUp / PageDown jumps (Ctrl; in a selection without Ctrl) or moves a row (Ctrl+Alt)
export const PAGE_ROWS = 10;

// The cell editor as features see it, and what it takes to put the cell back
type ActiveEditor = CellEditor & {
  readonly kept: DocumentFragment;
  readonly cellStyle: string | null;
};

/** What the cell editor needs from the controller besides the host API */
export type EditorContext = {
  readonly features: readonly Feature[];
  // Keyboard and input events from the field must not reach SilverBullet's editor
  isolate(element: HTMLElement): void;
  // The hover controls go while a cell is edited
  endHover(): void;
  // Rows are being rearranged: the field losing its focus to that is not leaving it
  movingRows(): boolean;
  // A row is entered: it stays where it is shown, sorting and filters notwithstanding, until it is left
  holdRow(widget: HTMLElement, info: WidgetInfo, row: number): void;
  // The row held is left: sorting and filters place it
  releaseRow(): void;
  // The editor of a cell of the table closed
  editingEnded(widget: HTMLElement): void;
  // A cell's editor opened: its field's focus makes SilverBullet scroll elsewhere on a touch screen (core/touch-keyboard.ts)
  editingStarted(): void;
};

export class CellEditing {
  private editor: ActiveEditor | undefined;
  // A cell to edit once its table is rendered again (after a write)
  private pending: (FocusTarget & { key: string; until: number }) | undefined;
  // The selectOnClick setting: a plain click, Enter, Tab and Ctrl+arrows select the cell's text
  selectOnClick = false;

  constructor(
    private readonly host: TableHost,
    private readonly context: EditorContext,
  ) {}

  get active(): CellEditor | undefined {
    return this.editor;
  }

  /** After a write: edit `focus` in the table with `key` once it is rendered again */
  editAfterWrite(key: string, focus: FocusTarget): void {
    this.pending = { key, ...focus, until: Date.now() + 3000 };
  }

  /** No cell waits to be edited (a write failed, or editing was cancelled) */
  dropPending(): void {
    this.pending = undefined;
  }

  open(
    widget: HTMLElement,
    info: WidgetInfo,
    cell: HTMLTableCellElement,
    // Opened with the keyboard (or after a write): as the setting says
    select = this.selectOnClick,
    // Typing on a selected cell: the field starts empty, what is typed replaces the text
    replace = false,
  ): void {
    const ref = this.host.cellRef(info, cell);
    if (!ref || this.editor) return;
    this.context.holdRow(widget, info, ref.row);
    const original = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    // The cell's hidden tags are not edited as text: they are kept (tags.ts)
    const bare = withoutTags(original);

    // The cell keeps its size while its content is swapped for the field
    const cellStyle = cell.getAttribute("style");
    const rect = cell.getBoundingClientRect();
    if (rect.width > 0) {
      cell.style.boxSizing = "border-box";
      cell.style.width = `${rect.width}px`;
      cell.style.minWidth = `${rect.width}px`;
      cell.style.maxWidth = `${rect.width}px`;
      cell.style.height = `${rect.height}px`;
    }

    const field = this.host.doc.createElement("input");
    field.type = "text";
    field.className = `${UI_CLASS} tp-cell-editor`;
    // A small intrinsic width, so the field never widens the column
    field.size = 1;
    field.spellcheck = true;
    // What the field shows: the cell's text, unless a feature shows it otherwise (a formula)
    field.value = this.context.features.reduce<string | undefined>((text, f) => text ?? f.editorText?.(info, ref, original), undefined) ?? unescapeCell(bare);
    const kept = this.host.doc.createDocumentFragment();
    while (cell.firstChild) kept.append(cell.firstChild);
    cell.classList.add("tp-editing");
    cell.append(field);
    this.editor = { widget, cell, ...ref, original, initial: field.value, field, kept, cellStyle };
    if (replace) field.value = "";
    this.reveal(widget, cell);
    this.context.endHover();

    this.context.isolate(field);
    field.addEventListener("blur", () => {
      // Focus went elsewhere on purpose: save, but leave the focus there
      if (this.editor?.field === field && !this.context.movingRows()) void this.finish(true, undefined, false);
    });
    field.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const editing = this.editor;
      if (editing?.field === field && this.context.features.some((f) => f.editorKeyDown?.(e, editing))) {
        e.preventDefault();
        return;
      }
      if (e.key === "Control") this.setNavigating(true);
      const ctrl = e.ctrlKey && !e.metaKey;
      if (ctrl && e.altKey && !e.shiftKey && MOVE_KEYS.has(e.key)) {
        e.preventDefault();
        void this.moveWithKeyboard(e.key);
      } else if (ctrl && !e.altKey && NAVIGATION_KEYS.has(e.key)) {
        e.preventDefault();
        void this.navigate(e.key, e.shiftKey);
      } else if (e.key === "Escape") {
        e.preventDefault();
        void this.cancel();
      } else if (e.key === "Enter" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        void this.ctrlEnter();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.enter(e.shiftKey);
      } else if (e.key === "Tab") {
        e.preventDefault();
        void this.step(e.shiftKey ? -1 : 1);
      }
    });
    this.context.editingStarted();
    field.focus({ preventScroll: true });
    if (select) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
    const opened = this.editor;
    for (const feature of this.context.features) feature.editorOpened?.(opened);
  }

  /** Puts the rendered cell back; returns what was being edited */
  close(): (ActiveEditor & { value: string }) | undefined {
    const active = this.editor;
    if (!active) return undefined;
    this.editor = undefined;
    for (const feature of this.context.features) feature.editorClosed?.(active);
    let value = this.cellValue(active);
    if (active.row === 0 && withoutTags(value) === "" && active.original !== "") {
      // SilverBullet would not show a column without a name
      value = active.original;
      void this.host.bridge.flash("Table Plus: a column needs a name; the old name was kept", "info");
    }
    active.field.remove();
    active.cell.classList.remove("tp-editing");
    if (active.cellStyle === null) active.cell.removeAttribute("style");
    else active.cell.setAttribute("style", active.cellStyle);
    active.cell.append(active.kept);
    this.context.editingEnded(active.widget);
    return { ...active, value };
  }

  /**
   * The markdown for what the editor holds: the cell as it was when nothing was
   * changed, what a feature makes of it (a formula), else the text
   */
  private cellValue(active: ActiveEditor): string {
    const typed = active.field.value;
    if (typed === active.initial) return active.original;
    const value = this.context.features.reduce<string | undefined>((v, f) => v ?? f.editorValue?.(active, typed), undefined) ?? escapeCell(typed);
    return this.host.keepTags(value, active.original);
  }

  /**
   * Ends editing, saving the cell if asked and changed, then opens `next`
   * (a cell of the same or another table) or hands the keyboard back to the editor.
   */
  async finish(
    save: boolean,
    next?: FocusTarget & { widget: HTMLElement },
    refocus = true,
  ): Promise<void> {
    const closed = this.close();
    if (!closed) return;
    const changed = save && closed.value !== closed.original;
    const sameTable = next?.widget === closed.widget;
    // Leaving the row: sorting and filters place it (Tab within the row keeps it held)
    if (!(sameTable && next?.row === closed.row)) this.context.releaseRow();
    let result: WriteResult = "unchanged";
    if (changed) {
      result = await this.host.write(closed.widget, (t) => this.withCellEdit(t, closed), { focus: sameTable ? next : undefined });
    }
    if (next && (result === "unchanged" || !sameTable)) {
      // The other table was not re-rendered by this edit unless they share text
      const info = this.host.infoOf(next.widget);
      const cell = info && this.host.cellAt(info, next);
      if (info && cell) this.open(next.widget, info, cell, next.select);
      return;
    }
    if (!next && refocus) this.host.focusEditor(closed.widget);
  }

  private withCellEdit(
    table: Table,
    edit: { row: number; column: number; original: string; value: string },
  ): Table | undefined {
    if ((table.rows[edit.row]?.cells[edit.column] ?? "") !== edit.original) return undefined;
    return setCell(table, edit.row, edit.column, edit.value);
  }

  /**
   * Ctrl+Enter: save the cell, add an empty row below its row and edit the
   * new row in the same column, as one edit. The ctrlEnterAddsRow setting off:
   * a plain Enter.
   */
  private async ctrlEnter(): Promise<void> {
    const active = this.editor;
    if (!active) return;
    if (!(await this.host.setting("ctrlEnterAddsRow")) || this.editor !== active) {
      if (this.editor === active) await this.enter(false);
      return;
    }
    const info = this.host.infoOf(active.widget);
    const closed = this.close()!;
    if (info) await insertRowWith(this.host, closed.widget, info, closed.row + 1, closed.column, (t) => this.withSaved(t, closed), { after: closed.row });
  }

  /** The table with the closed editor's value saved, if it changed */
  withSaved(table: Table, closed: ActiveEditor & { value: string }): Table | undefined {
    return closed.value !== closed.original ? this.withCellEdit(table, closed) : table;
  }

  /**
   * Whether a cell reached with the keyboard opens with its text selected:
   * as the selectOnClick setting says, with Shift (Shift+Enter) the reverse
   */
  private selectsWith(shift: boolean): boolean {
    return shift !== this.selectOnClick;
  }

  /** Esc: the edit is dropped, the cell stays selected (marked) where a feature selects; a second Esc ends that */
  private async cancel(): Promise<void> {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    await this.finish(false);
    if (active && info && this.host.selectsCells()) {
      const at = { row: active.row, column: active.column };
      this.host.selectCells(info, at, at);
    }
  }

  /** Enter: save; with the moveDown setting also edit the cell below (Shift: as on a Shift+click) */
  private async enter(shift: boolean): Promise<void> {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    if ((await this.host.setting("enterKey")) !== "moveDown" || this.editor !== active) {
      if (this.editor === active) await this.finish(true);
      return;
    }
    const shown = this.host.shownRows(info);
    const target = shown[shown.indexOf(active.cell.parentElement as HTMLTableRowElement) + 1];
    const cell = target?.cells[active.column];
    const ref = cell && this.host.cellRef(info, cell);
    await this.finish(true, ref ? { widget: active.widget, ...ref, select: this.selectsWith(shift) } : undefined);
  }

  /**
   * Ctrl+Alt+arrows: move the edited cell's row up / down, or its column
   * left / right; Ctrl+Alt+Home / End: its column to the first / last place;
   * Ctrl+Alt+PageUp / PageDown: its row 10 places up / down.
   * The cell is saved in the same edit and the editor stays on it. Rows cannot
   * move while sorted or filtered, nor the header row.
   */
  private async moveWithKeyboard(key: string): Promise<void> {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const vertical = key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
    const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
    const from = vertical ? active.row : active.column;
    const asked =
      key === "Home"
        ? 0
        : key === "End"
          ? info.columns - 1
          : key === "PageUp"
            ? from - PAGE_ROWS
            : key === "PageDown"
              ? from + PAGE_ROWS
              : from + step;
    if (vertical) {
      if (from === 0) return;
      if (this.host.rearranged(info)) {
        void this.host.bridge.flash(`Table Plus: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
    }
    // Pinned rows and columns stay within their zone, the others outside them
    const to = vertical
      ? clampRowMove(info.pins, info.rows, from, asked)
      : clampColumnMove(info.pins, info.columns, from, asked);
    if (to === from) return;
    const closed = this.close()!;
    await this.host.write(
      closed.widget,
      (t) => {
        const edited = this.withSaved(t, closed);
        if (!edited) return undefined;
        return vertical ? moveRow(edited, from, to) : moveColumn(edited, from, to);
      },
      vertical
        ? { focus: { row: to, column: closed.column }, rowMap: (r) => columnAfterMove(r, from, to) }
        : { focus: { row: closed.row, column: to }, columnMap: (c) => columnAfterMove(c, from, to) },
    );
  }

  /**
   * Ctrl+arrows: save and edit the neighbouring shown cell; Ctrl+Home / End:
   * the first / last cell of the row. Nothing happens at the table's edge.
   * With Shift the cells from the edited one to that one are selected (the
   * editor closes, saving); where no feature selects, the cell opens with its text selected.
   */
  private async navigate(key: string, shift: boolean): Promise<void> {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const shown = this.host.shownRows(info);
    let r = shown.indexOf(active.cell.parentElement as HTMLTableRowElement);
    let column = active.column;
    if (key === "ArrowLeft") column--;
    else if (key === "ArrowRight") column++;
    else if (key === "ArrowUp") r--;
    else if (key === "ArrowDown") r++;
    else if (key === "Home") column = 0;
    else if (key === "End") column = info.columns - 1;
    // A page jump stops at the first / last body row; from the header it goes down only
    else if (key === "PageUp") r = r === 0 ? 0 : Math.max(1, r - PAGE_ROWS);
    else if (key === "PageDown") r = Math.min(shown.length - 1, r + PAGE_ROWS);
    const target = shown[r]?.cells[column];
    if (!target || target === active.cell) return;
    const ref = this.host.cellRef(info, target);
    if (!ref) return;
    if (shift && this.host.selectsCells()) {
      await this.finish(true);
      this.host.selectCells(info, { row: active.row, column: active.column }, ref);
      return;
    }
    await this.finish(true, { widget: active.widget, ...ref, select: this.selectsWith(shift) });
  }

  /** Tab / Shift+Tab: save and move to the next / previous shown cell */
  private async step(direction: 1 | -1): Promise<void> {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info) return;
    const shown = this.host.shownRows(info);
    const rowIndex = shown.indexOf(active.cell.parentElement as HTMLTableRowElement);
    let r = rowIndex;
    let column = active.column + direction;
    if (column >= info.columns) {
      column = 0;
      r++;
    } else if (column < 0) {
      column = info.columns - 1;
      r--;
    }
    if (r < 0) {
      await this.finish(true);
      return;
    }
    const target = shown[r];
    if (target) {
      const ref = this.host.cellRef(info, target.cells[column] ?? target.cells[0]!);
      if (ref) await this.finish(true, { widget: active.widget, ...ref });
      return;
    }
    // Tab on the last cell adds a row (above the rows pinned to the bottom)
    const closed = this.close()!;
    await insertRowWith(this.host, closed.widget, info, appendRowAt(info.pins, info.rows), 0, (t) => this.withSaved(t, closed), { after: closed.row });
  }

  takePending(widget: HTMLElement, info: WidgetInfo): void {
    const pending = this.pending;
    if (!pending || pending.key !== info.key) return;
    this.pending = undefined;
    if (Date.now() > pending.until || this.editor) return;
    const cell = this.host.cellAt(info, pending);
    if (cell) this.open(widget, info, cell, pending.select);
  }

  /** The view changed its size (an on-screen keyboard showed): the cell being edited is scrolled into it again */
  revealActive(): void {
    const active = this.editor;
    if (active?.cell.isConnected) this.reveal(active.widget, active.cell);
  }

  /**
   * Scrolls so that the cell is fully visible: a wide table sideways, the page
   * up or down, keeping a body cell clear of the header held at the top
   */
  private reveal(widget: HTMLElement, cell: HTMLElement): void {
    const box = this.host.innerBox(widget);
    let rect = cell.getBoundingClientRect();
    if (rect.right > box.right) widget.scrollLeft += rect.right - box.right;
    else if (rect.left < box.left) widget.scrollLeft -= box.left - rect.left;

    const head = this.host.infoOf(widget)?.table.tHead;
    const headHeight = head && !head.contains(cell) ? head.offsetHeight : 0;
    if (this.host.scrollsInside(widget)) {
      rect = cell.getBoundingClientRect();
      if (rect.top < box.top + headHeight) widget.scrollTop -= box.top + headHeight - rect.top;
      else if (rect.bottom > box.bottom) widget.scrollTop += rect.bottom - box.bottom;
    }

    const scroller = this.host.scrollParentOf(widget);
    if (!scroller) return;
    rect = cell.getBoundingClientRect();
    // The part of the page in view, above an on-screen keyboard
    const view = this.host.viewBounds(widget);
    const top = view.top + (headHeight ? STICKY_GAP + headHeight : 0);
    if (rect.top < top) scroller.scrollTop -= top - rect.top;
    else if (rect.bottom > view.bottom) scroller.scrollTop += rect.bottom - view.bottom;
  }

  // While Ctrl is held in a cell editor, arrows move between cells: the pointer shows it
  setNavigating(on: boolean): void {
    this.host.doc.body.classList.toggle("tp-navigating", on);
  }
}
