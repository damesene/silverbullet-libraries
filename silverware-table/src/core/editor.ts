// The cell editor: an input in place of a cell's content, or (for text that
// does not fit, a long formula) a textarea in the cell's popup, a panel over
// the cell where the text wraps. Enter, Tab and Ctrl+arrows save and move on,
// Ctrl+Alt+arrows move the row or column with the cell, Esc cancels, F2 goes
// on in the popup. Features shape what it shows and saves (a formula) through
// the editor hooks of core/feature.ts.
import { escapeCell, type Table, unescapeCell } from "../markdown.ts";
import { columnAfterMove, moveColumn, moveRow, setCell } from "../ops.ts";
import { appendRowAt, clampColumnMove, clampRowMove } from "../pins.ts";
import { OUT_OF_LINE_CLASS, UI_CLASS } from "../dom.ts";
import type { AdapterFeature, CellField, CellRef, FocusTarget, RenderedEditor, TableHost, WidgetInfo, WriteResult } from "./feature.ts";
import { STICKY_GAP } from "./layout.ts";
import { type Growth, growTo, insertRowWith, MOVE_BLOCKED } from "./structure.ts";
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
type ActiveEditor = RenderedEditor & {
  readonly kept: DocumentFragment;
  readonly cellStyle: string | null;
  // The popup's panel
  readonly panel?: HTMLElement;
  // A cell past the table's last row or column (editBeyond): saved, the table grows to hold it
  readonly growth?: Growth;
};

// Opened in the cell's popup: with what was typed so far (from the cell's editor) and its selection
type PopupOptions = {
  readonly value?: string;
  readonly initial?: string;
  readonly selection?: readonly [number, number];
};

// The popup's width: at least this, the cell's if wider, at most the view's
const POPUP_MIN_WIDTH = 420;

/** What the cell editor needs from the controller besides the host API */
export type EditorContext = {
  readonly features: readonly AdapterFeature[];
  // Keyboard and input events from the field must not reach SilverBullet's editor
  isolate(element: HTMLElement): void;
  // The hover controls go while a cell is edited
  endHover(): void;
  // Rows are being rearranged: the field losing its focus to that is not leaving it
  movingRows(): boolean;
  // A feature's dialog is open (TableHost.openDialog): the field losing its focus to it is not leaving it either
  dialogOpen(): boolean;
  // A row is entered: it stays where it is shown, sorting and filters notwithstanding, until it is left
  holdRow(widget: HTMLElement, info: WidgetInfo, row: number): void;
  // The row held is left: sorting and filters place it
  releaseRow(): void;
  // The editor of a cell of the table closed
  editingEnded(widget: HTMLElement): void;
  // A cell's editor opened: its field's focus makes SilverBullet scroll elsewhere on a touch screen (core/touch-keyboard.ts)
  editingStarted(): void;
  // Ctrl held (or let go) in a cell editor: arrows move between cells, the pointer shows it
  navigating(on: boolean): void;
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

  get active(): RenderedEditor | undefined {
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
    // In the cell's popup
    popup?: PopupOptions,
    // A cell past the table's last row or column, shown by a feature's element (`cell`)
    beyond?: CellRef,
  ): void {
    const ref = beyond ?? this.host.cellRef(info, cell);
    if (!ref || this.editor) return;
    // Measured below: in the document (a large table keeps only the rows in view there)
    if (ref.row > 0 && !beyond) this.host.rowNeeded(info, cell.parentElement as HTMLTableRowElement);
    this.context.holdRow(widget, info, ref.row);
    // The cell as shown: with an edit a feature holds for it (the lazy module)
    const original = this.host.tableOf(info).rows[ref.row]?.cells[ref.column] ?? "";
    // The cell's hidden tags are not edited as text: they are kept (tags.ts)
    const bare = withoutTags(original);
    // What the field shows: the cell's text, unless a feature shows it otherwise (a formula)
    const initial =
      popup?.initial ??
      this.context.features.reduce<string | undefined>((text, f) => text ?? f.editorText?.(info, ref, original), undefined) ??
      unescapeCell(bare);

    const cellStyle = cell.getAttribute("style");
    const kept = this.host.doc.createDocumentFragment();
    let field: CellField;
    let panel: HTMLElement | undefined;
    if (popup) {
      // The cell stays as it is, marked edited; the field is in a panel over it
      const area = this.host.doc.createElement("textarea");
      area.className = `${UI_CLASS} swt-cell-editor swt-cell-popup-field`;
      area.rows = 1;
      area.spellcheck = true;
      panel = this.host.floating("div", "swt-cell-popup swt-visible");
      // The cell's type, whatever the theme
      const font = this.host.doc.defaultView!.getComputedStyle(cell);
      Object.assign(panel.style, { fontFamily: font.fontFamily, fontSize: font.fontSize, fontWeight: font.fontWeight, lineHeight: font.lineHeight });
      panel.append(area);
      field = area;
    } else {
      // The cell keeps its size while its content is swapped for the field
      const rect = cell.getBoundingClientRect();
      if (rect.width > 0) {
        cell.style.boxSizing = "border-box";
        cell.style.width = `${rect.width}px`;
        cell.style.minWidth = `${rect.width}px`;
        cell.style.maxWidth = `${rect.width}px`;
        cell.style.height = `${rect.height}px`;
      }
      const input = this.host.doc.createElement("input");
      input.type = "text";
      input.className = `${UI_CLASS} swt-cell-editor`;
      // A small intrinsic width, so the field never widens the column
      input.size = 1;
      input.spellcheck = true;
      // What sits out of the cell's line (a pin mark, a width handle) stays, the rest makes room for the field
      for (const node of Array.from(cell.childNodes)) {
        if (!(node instanceof Element && node.classList.contains(OUT_OF_LINE_CLASS))) kept.append(node);
      }
      cell.append(input);
      field = input;
    }
    field.value = popup?.value ?? initial;
    cell.classList.add("swt-editing");
    const doc = this.host.doc;
    const opened: ActiveEditor = {
      key: info.key,
      widget,
      cell,
      ...ref,
      original,
      initial,
      field,
      kept,
      cellStyle,
      popup: !!popup,
      ...(panel ? { panel } : {}),
      ...(beyond ? { growth: growTo(info, beyond) } : {}),
      get text() {
        return field.value;
      },
      get selection() {
        const end = field.value.length;
        return [field.selectionStart ?? end, field.selectionEnd ?? end] as const;
      },
      setText: (text, selection) => {
        field.value = text;
        field.setSelectionRange(selection?.[0] ?? text.length, selection?.[1] ?? text.length);
        this.input(opened);
      },
      insert: (from, to, text) => {
        const expected = field.value.slice(0, from) + text + field.value.slice(to);
        field.setSelectionRange(from, to);
        try {
          // As typing: Ctrl+Z in the field undoes it, and the field's input event comes (features hear it)
          if (typeof doc.execCommand === "function") doc.execCommand("insertText", false, text);
        } catch {
          // Not supported: set directly below
        }
        if (field.value !== expected) {
          field.value = expected;
          field.setSelectionRange(from + text.length, from + text.length);
          this.input(opened);
        }
      },
      select: (from, to) => field.setSelectionRange(from, to),
      focus: () => field.focus({ preventScroll: true }),
      commit: () => {
        if (this.editor !== opened) return;
        void (opened.growth ? this.finish(true) : this.enter(false));
      },
    };
    this.editor = opened;
    if (replace) field.value = "";
    this.reveal(widget, cell);
    if (panel) {
      this.placePopup();
      // It grows with what is typed (up to its maximum height)
      field.addEventListener("input", () => this.placePopup());
    }
    this.context.endHover();

    this.context.isolate(field);
    field.addEventListener("input", () => {
      if (this.editor === opened) this.input(opened);
    });
    // The caret may have moved: features that follow it (a formula's help for the argument it is in) hear it
    for (const type of ["keyup", "click", "focus"]) {
      field.addEventListener(type, () => {
        if (this.editor === opened) for (const feature of this.context.features) feature.editorCaret?.(opened);
      });
    }
    // Text pasted: a feature may take it (cells from a spreadsheet go into the table)
    (field as HTMLElement).addEventListener("paste", (e) => {
      if (this.editor !== opened) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (this.context.features.some((f) => f.editorPaste?.(opened, text))) e.preventDefault();
    });
    field.addEventListener("blur", () => {
      // Focus went elsewhere on purpose: save, but leave the focus there
      if (this.editor?.field === field && !this.context.movingRows() && !this.context.dialogOpen()) void this.finish(true, undefined, false);
    });
    // (Through HTMLElement: on the input | textarea union the events lose their types)
    (field as HTMLElement).addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      const editing = this.editor;
      if (editing?.field === field && this.context.features.some((f) => f.editorKeyDown?.(e, editing))) {
        e.preventDefault();
        return;
      }
      // A cell past the table: Enter and Tab save it (the table grows), Esc drops it; nothing moves from it
      if (editing?.growth) {
        if (e.key === "Escape" || e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          void (e.key === "Escape" ? this.cancel() : this.finish(true));
        }
        return;
      }
      // In the popup the keys are the text's (Ctrl+arrows go by words, Ctrl+Home to its start), as in a
      // spreadsheet's edit mode: they do not move the editor, the cell or its row and column, nor add a row
      const inText = editing?.popup === true;
      if (e.key === "Control" && !inText) this.setNavigating(true);
      const ctrl = e.ctrlKey && !e.metaKey;
      if (ctrl && e.altKey && !e.shiftKey && MOVE_KEYS.has(e.key)) {
        if (inText) return;
        e.preventDefault();
        void this.moveWithKeyboard(e.key);
      } else if (ctrl && !e.altKey && NAVIGATION_KEYS.has(e.key)) {
        if (inText) return;
        e.preventDefault();
        void this.navigate(e.key, e.shiftKey);
      } else if (e.key === "Escape") {
        e.preventDefault();
        void this.cancel();
      } else if (e.key === "Enter" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && !inText) {
        e.preventDefault();
        void this.ctrlEnter();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.enter(e.shiftKey);
      } else if (e.key === "Tab") {
        e.preventDefault();
        void this.step(e.shiftKey ? -1 : 1);
      } else if (e.key === "F2" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && !this.editor?.popup) {
        // The text does not fit (a long formula): on in the popup, wrapped
        e.preventDefault();
        this.toPopup();
      }
    });
    this.context.editingStarted();
    field.focus({ preventScroll: true });
    if (popup?.selection) field.setSelectionRange(popup.selection[0], popup.selection[1]);
    else if (select) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
    for (const feature of this.context.features) feature.editorOpened?.(opened);
  }

  /** What the field holds changed: the features hear it */
  private input(editor: ActiveEditor): void {
    for (const feature of this.context.features) feature.editorInput?.(editor);
  }

  /**
   * F2 (or the expand button): the cell edited in its editor in the cell goes
   * on in its popup, with what was typed and where the cursor was; nothing is
   * saved meanwhile
   */
  toPopup(): void {
    const active = this.editor;
    const info = active && this.host.infoOf(active.widget);
    if (!active || !info || active.popup || active.growth) return;
    const { field, widget, cell, initial } = active;
    const value = field.value;
    const selection = [field.selectionStart ?? value.length, field.selectionEnd ?? value.length] as const;
    this.close(true);
    this.open(widget, info, cell, false, false, { value, initial, selection });
  }

  /**
   * The popup over its cell: left-aligned with it, as wide as the cell (at
   * least POPUP_MIN_WIDTH, at most what the view has), its field as tall as
   * its text (the CSS caps it, then it scrolls)
   */
  placePopup(): void {
    const active = this.editor;
    const panel = active?.panel;
    // The table rendered anew meanwhile (an edit from elsewhere): the popup stays where it is, Enter still saves
    if (!active || !panel || !active.cell.isConnected) return;
    const rect = active.cell.getBoundingClientRect();
    const view = this.host.viewBounds(active.widget);
    const width = Math.max(120, Math.min(Math.max(rect.width, POPUP_MIN_WIDTH), view.right - view.left - 16));
    panel.style.width = `${Math.round(width)}px`;
    const field = active.field;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
    const left = Math.max(view.left + 8, Math.min(rect.left, view.right - width - 8));
    // Over the cell, moved up as far as the view (above an on-screen keyboard) needs to show it whole
    const top = Math.min(rect.top, view.bottom - panel.offsetHeight - 4);
    this.host.place(panel, left, top);
    // Cut as its cell is (scrolled under the held header, out of the table's box or the page's view), as the
    // field in the cell would be; not laid out (in tests): whole
    const info = this.host.infoOf(active.widget);
    const part = info && (rect.width > 0 || rect.height > 0) ? this.host.shownPart(active.widget, info, active.cell) : rect;
    const cutTop = part && part.top > rect.top ? part.top - top : 0;
    const cutLeft = part && part.left > rect.left ? part.left - left : 0;
    panel.style.clipPath = !part ? "inset(50%)" : cutTop > 0 || cutLeft > 0 ? `inset(${Math.round(cutTop)}px 0 0 ${Math.round(cutLeft)}px)` : "";
  }

  /** Puts the rendered cell back; returns what was being edited. `reopening`: it opens again at once (in its popup), its table not left */
  close(reopening = false): (ActiveEditor & { value: string }) | undefined {
    const active = this.editor;
    if (!active) return undefined;
    this.editor = undefined;
    for (const feature of this.context.features) feature.editorClosed?.(active);
    // Reopening: nothing is saved, so nothing is made of what is typed (a formula fixed, announced)
    let value = reopening ? active.field.value : this.cellValue(active);
    if (!reopening && active.row === 0 && withoutTags(value) === "" && active.original !== "") {
      // SilverBullet would not show a column without a name
      value = active.original;
      void this.host.bridge.flash("Silverware Table: a column needs a name; the old name was kept", "info");
    }
    active.field.remove();
    active.panel?.remove();
    active.cell.classList.remove("swt-editing");
    if (active.cellStyle === null) active.cell.removeAttribute("style");
    else active.cell.setAttribute("style", active.cellStyle);
    active.cell.append(active.kept);
    if (!reopening) this.context.editingEnded(active.widget);
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
    const growth = closed.growth;
    if (growth && changed && withoutTags(closed.value) !== "") {
      // Past the table: written with the rows and columns that reach it (nothing typed: nothing written). A cell
      // pressed meanwhile (`next`) is edited once the table is rendered anew, where the growth moved it.
      const row = next && sameTable ? growth.rowMap(next.row) : undefined;
      const column = next && sameTable ? growth.columnMap(next.column) : undefined;
      let changedMeanwhile = false;
      result = await this.host.write(
        closed.widget,
        (t) => {
          const grown = growth.grow(t);
          changedMeanwhile = !grown;
          return grown && setCell(grown, growth.cell.row, growth.cell.column, closed.value);
        },
        {
          rowMap: growth.rowMap,
          columnMap: growth.columnMap,
          ...(row !== undefined && column !== undefined ? { focus: { row, column, ...(next?.select ? { select: true } : {}) } } : {}),
        },
      );
      if (changedMeanwhile) void this.host.bridge.flash("Silverware Table: the table changed meanwhile, so it was not grown; type the value again", "info");
    }
    // A feature may keep a cell's edit to write it later (the lazy module); a header's name is written at once
    const info = changed && closed.row > 0 ? this.host.infoOf(closed.widget) : undefined;
    const edit = { row: closed.row, column: closed.column, original: closed.original, value: closed.value };
    const held = !growth && !!info && this.context.features.some((f) => f.holdCellEdit?.(info, edit));
    if (changed && !held && !growth) {
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
    if (info) await insertRowWith(this.host, info, closed.row + 1, closed.column, (t) => this.withSaved(t, closed), { after: closed.row });
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
    if (active && info && !active.growth && this.host.selectsCells()) {
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
        void this.host.bridge.flash(`Silverware Table: ${MOVE_BLOCKED.toLowerCase()}`, "info");
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
    await insertRowWith(this.host, info, appendRowAt(info.pins, info.rows), 0, (t) => this.withSaved(t, closed), { after: closed.row });
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
    this.placePopup();
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
    this.context.navigating(on);
  }
}
