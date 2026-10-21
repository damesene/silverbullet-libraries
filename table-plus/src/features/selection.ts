// Selecting cells by dragging across them, Shift+click (from the cell edited or
// the selection's first cell) and Shift+arrows (or whole rows and columns with
// their grips); in select mode (the table menu's Edit mode off) a click selects
// a cell and a second click edits it. Typing on a selected cell edits it, its
// text replaced; Enter or F2 edit it, arrows move it. Cells selected are copied
// for a spreadsheet (Ctrl+C) or
// empty them (Delete); whole rows or columns already empty, Delete deletes
// them. Copy, Clear and Delete rows / columns in the menu of a cell or of the
// cells selected. On a touch screen, handles at the selection's corners are
// dragged to select more (whole rows and columns stay whole), and a tap on a
// selection of several cells opens their menu.
import type { CellMenuGroup, CellRef, Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { copyingFromMenu, writeClipboard } from "../clipboard.ts";
import { cellValue, OUT_OF_LINE_CLASS, UI_CLASS } from "../dom.ts";
import { PAGE_ROWS } from "../core/editor.ts";
import { columnBlockTo, deleteColumnsAt, deleteRowsAt, MOVE_BLOCKED, moveColumnsTo, moveRowsTo, rowBlockTo } from "../core/structure.ts";
import { lineAfterBlockMove } from "../ops.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { withoutTags } from "../tags.ts";
import type { Table } from "../markdown.ts";
import { setCell } from "../ops.ts";

// Ctrl+Alt + these keys move the rows (up, down, 10 rows) or columns (left, right, to the first or last) selected, as in the cell editor
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

/** Cells as spreadsheets copy them: tabs and line breaks between; a cell with either or a quote in quotes */
export function clipboardText(values: readonly (readonly string[])[]): string {
  const quote = (v: string) => (/[\t\n"]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return values.map((row) => row.map(quote).join("\t")).join("\n");
}

export function clipboardHtml(values: readonly (readonly string[])[]): string {
  const escape = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const rows = values.map((row) => `<tr>${row.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("");
  return `<table>${rows}</table>`;
}

const EDIT_MODE_KEY = "tablePlus.editMode";

// A handle dragged near an edge of the view (of a table's box that scrolls sideways) scrolls it by this much a move
const AUTOSCROLL_EDGE = 40;
const AUTOSCROLL_STEP = 12;

// A touch shorter than this (a long press opens the menu anyway), moved no further, is a tap
const TAP_MS = 500;
const TAP_MOVE = 10;

/** Edit mode as this browser keeps it (off: select mode, the default) */
function readEditMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(EDIT_MODE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeEditMode(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(EDIT_MODE_KEY, on ? "on" : "off");
  } catch {
    // Not kept: it stays for this page
  }
}

// What arrows move the selection's last cell by: rows (as shown), columns
const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export class Selection implements Feature {
  // The cells selected (rows of the markdown, header 0), in the table with this key
  private selection: { readonly key: string; readonly anchor: CellRef; focus: CellRef } | undefined;
  private stopSelecting: (() => void) | undefined;
  // The selection when a press came: the press itself ends it first
  private pressed: { readonly key: string; readonly anchor: CellRef; readonly focus: CellRef } | undefined;
  // A touch on cells selected, until it is a tap (their menu) or not
  private stopTap: (() => void) | undefined;
  // Edit mode: a click edits a cell; off (select mode, the default) a click selects it. Kept in this browser.
  private editMode = readEditMode();

  // The handles at the selection's first and last cell, shown by CSS after a touch (html[data-tp-pointer="touch"])
  private readonly handles: readonly [HTMLElement, HTMLElement];

  constructor(private readonly host: TableHost) {
    const handle = (corner: "start" | "end") => {
      const element = host.doc.createElement("div");
      element.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-select-handle tp-select-${corner}`;
      element.addEventListener("pointerdown", (e) => this.dragHandle(e, corner));
      return element;
    };
    this.handles = [handle("start"), handle("end")];
  }

  start(): void {
    this.host.doc.defaultView!.addEventListener("copy", this.onCopy, true);
    this.host.doc.defaultView!.addEventListener("pointerdown", this.onTouch, true);
  }

  stop(): void {
    this.host.doc.defaultView!.removeEventListener("copy", this.onCopy, true);
    this.host.doc.defaultView!.removeEventListener("pointerdown", this.onTouch, true);
    this.stopTap?.();
    this.stopSelecting?.();
    for (const handle of this.handles) handle.remove();
  }

  owns(node: Node): boolean {
    return this.handles.some((handle) => handle.contains(node));
  }

  // A press on a handle is the handle's (a mouse's, after a touch has shown them): not the cell's
  mouseDown(e: MouseEvent): boolean {
    if (!(e.target instanceof Node) || !this.owns(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  // Any click ends a selection (one on Table Plus' own controls aside)
  beforeMouseDown(e: MouseEvent): void {
    const selection = this.selection;
    this.pressed = selection && { ...selection };
    if (selection && !(e.target instanceof Node && this.host.isFloating(e.target))) this.clear();
  }

  /**
   * Shift+click on a cell selects the cells from the selection's first cell,
   * else from the cell being edited (saved), else just this cell. In select
   * mode a click selects the cell (dragging on selects more); on the cell
   * selected alone, it edits it (so does a double click).
   */
  beforeCellPress(_widget: HTMLElement, info: WidgetInfo, ref: CellRef, e: MouseEvent): boolean {
    const pressed = this.pressed?.key === info.key ? this.pressed : undefined;
    this.pressed = undefined;
    const same = (a: CellRef, b: CellRef) => a.row === b.row && a.column === b.column;
    if (!e.shiftKey && (this.editMode || (pressed && same(pressed.anchor, ref) && same(pressed.focus, ref)))) return false;
    const editing = this.host.editing;
    const edited = editing && this.host.infoOf(editing.widget)?.key === info.key ? { row: editing.row, column: editing.column } : undefined;
    const anchor = !e.shiftKey ? ref : (pressed?.anchor ?? edited ?? ref);
    // A cell being edited is saved: the press selects now
    void this.host.saveEditing();
    this.selectCells(info, anchor, ref);
    if (!e.shiftKey) this.afterCellPress(info, ref);
    return true;
  }

  /** Edit mode, a switch in the toolbar (left of its menu): a click edits a cell; off, a click selects it */
  toolbarButtons(): ToolbarButton[] {
    return [
      {
        label: "Edit mode",
        title: this.editMode
          ? "On: a click edits a cell. Click to select cells first, as in a spreadsheet"
          : "Off: a click selects a cell; a second click, a double click, Enter or typing edits it. Click to edit on the first click",
        icon: ICONS.editMode,
        place: "icon",
        pressed: this.editMode,
        run: () => {
          this.editMode = !this.editMode;
          writeEditMode(this.editMode);
          this.host.toolbarChanged();
        },
      },
    ];
  }

  /**
   * After a press on a cell: dragging on to another cell of the table, with
   * the button held, selects the cells between the two as shown (sorting and
   * filters included), and closes the cell editor the press opened, unchanged
   */
  afterCellPress(info: WidgetInfo, anchor: CellRef): void {
    this.stopSelecting?.();
    const { key } = info;
    const win = this.host.doc.defaultView!;
    const move = (ev: MouseEvent) => {
      if (ev.buttons === 0) {
        end();
        return;
      }
      const hit = this.host.enhancedWidgetOf(ev.target);
      const cell = hit && hit[1].key === key ? this.host.tableCellOf(hit[1], ev.target) : undefined;
      const ref = hit && cell ? this.host.cellRef(hit[1], cell) : undefined;
      if (!ref) return;
      const current = this.selection;
      if (!current) {
        if (ref.row === anchor.row && ref.column === anchor.column) return;
        // The press opened the anchor's editor: it goes, nothing was typed in it
        this.host.cancelEditing();
        this.selection = { key, anchor, focus: ref };
      } else if (current.focus.row === ref.row && current.focus.column === ref.column) return;
      else current.focus = ref;
      this.show();
    };
    const end = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", end, true);
      this.stopSelecting = undefined;
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", end, true);
    this.stopSelecting = end;
  }

  keyDown(e: KeyboardEvent): boolean {
    if (!this.selection) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      this.clear();
      return true;
    }
    // Delete empties the selected cells; in a field (a cell editor, a filter) it deletes text as usual
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    // Ctrl+V (Ctrl+Shift+V): pasted from the first cell selected, by its editor opened for it (the paste goes there)
    if (!inField && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "v") {
      const at = this.selection.anchor;
      const widget = this.host.widgetForKey(this.selection.key);
      const info = widget && this.host.infoOf(widget);
      this.clear();
      if (info) this.host.editCell(info, at, "select");
      return false;
    }
    if (!inField && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && MOVE_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      void this.moveLines(e.key);
      return true;
    }
    if (!inField && this.editFromKey(e)) return true;
    // Keys that move the selection's last cell: Shift extends to it, else the selection is that cell
    const target = !inField && !e.altKey && !e.metaKey ? this.keyTarget(e) : undefined;
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      this.moveTo(target, e.shiftKey);
      return true;
    }
    if (e.key === "Delete" && !inField && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      void this.emptyCells();
      return true;
    }
    return false;
  }

  /**
   * The cells the cell menu is for: the selection when it holds `at`; else
   * `at` is selected (marked, not edited), as a right click selects in a
   * spreadsheet, and stays so for Ctrl+C and Delete
   */
  selectedCells(info: WidgetInfo, at: CellRef): readonly CellRef[] {
    const refs = this.selection?.key === info.key ? this.refs(info) : [];
    if (refs.some((ref) => ref.row === at.row && ref.column === at.column)) return refs;
    // A cell being edited is saved as the menu takes the focus
    this.selection = { key: info.key, anchor: at, focus: at };
    this.show();
    return [at];
  }

  selectCells(info: WidgetInfo, anchor: CellRef, focus: CellRef): void {
    this.selection = { key: info.key, anchor, focus };
    this.show();
  }

  /**
   * Typing on the cells selected edits the first of them, its text replaced
   * (the key goes on into the editor, so accents typed with dead keys work);
   * Backspace empties it so; Enter and F2 edit it as it is
   */
  private editFromKey(e: KeyboardEvent): boolean {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !info || e.metaKey || e.isComposing) return false;
    // AltGr comes as Ctrl+Alt: it types
    const typing = (e.key.length === 1 || e.key === "Dead") && e.ctrlKey === e.altKey;
    const plain = !e.ctrlKey && !e.altKey && !e.shiftKey;
    const asIs = plain && (e.key === "Enter" || e.key === "F2");
    const emptied = plain && e.key === "Backspace";
    if (!typing && !asIs && !emptied) return false;
    if (!typing) e.preventDefault();
    e.stopPropagation();
    const at = selection.anchor;
    this.clear();
    this.host.editCell(info, at, asIs ? undefined : "replace");
    return true;
  }

  /**
   * Where a key takes the selection's last cell (rows as shown): arrows (with
   * Ctrl too) a cell, Home / End the row's first / last cell, Ctrl+Home
   * / End the table's first / last cell, PageUp / PageDown 10 rows (PageUp
   * stops at the first body row, as in the cell editor); undefined: not such a key
   */
  private keyTarget(e: KeyboardEvent): CellRef | undefined {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !info) return undefined;
    const shown = this.host.shownRows(info);
    const rowOf = (tr: HTMLTableRowElement) => (tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow));
    const at = shown.findIndex((tr) => rowOf(tr) === selection.focus.row);
    if (at < 0) return undefined;
    const ctrl = e.ctrlKey;
    let r = at;
    let column = selection.focus.column;
    const step = STEPS[e.key];
    if (step) {
      r += step[0];
      column += step[1];
    } else if (e.key === "Home") {
      column = 0;
      if (ctrl) r = 0;
    } else if (e.key === "End") {
      column = info.columns - 1;
      if (ctrl) r = shown.length - 1;
    } else if (e.key === "PageUp" && !ctrl) r = r === 0 ? 0 : Math.max(1, r - PAGE_ROWS);
    else if (e.key === "PageDown" && !ctrl) r = r + PAGE_ROWS;
    else return undefined;
    const tr = shown[Math.max(0, Math.min(shown.length - 1, r))]!;
    return { row: rowOf(tr), column: Math.max(0, Math.min(info.columns - 1, column)) };
  }

  /** The selection's last cell to `to`; without `extend` the selection is just that cell */
  private moveTo(to: CellRef, extend: boolean): void {
    const selection = this.selection;
    if (!selection) return;
    this.selection = { key: selection.key, anchor: extend ? selection.anchor : to, focus: to };
    this.show();
    // Out of view (a page down): scrolled to
    const widget = this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    const cell = info && this.host.cellAt(info, to);
    if (cell && info && to.row > 0) this.host.rowNeeded(info, cell.parentElement as HTMLTableRowElement);
    cell?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  /**
   * Ctrl+Alt+arrows: the rows of the selection move up or down (not while
   * sorted or filtered, nor with the header), its columns left or right, as
   * one edit; the selection goes with them
   */
  private async moveLines(key: string): Promise<void> {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !widget || !info) return;
    const vertical = key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
    const lines = vertical ? [selection.anchor.row, selection.focus.row] : [selection.anchor.column, selection.focus.column];
    const first = Math.min(...lines);
    const last = Math.max(...lines);
    if (vertical) {
      if (first === 0) return;
      if (this.host.rearranged(info)) {
        void this.host.bridge.flash(`Table Plus: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
    }
    const asked =
      key === "Home"
        ? 0
        : key === "End"
          ? info.columns - (last - first + 1)
          : key === "PageUp"
            ? first - PAGE_ROWS
            : key === "PageDown"
              ? first + PAGE_ROWS
              : key === "ArrowUp" || key === "ArrowLeft"
                ? first - 1
                : first + 1;
    const to = vertical ? rowBlockTo(info, first, last, asked) : columnBlockTo(info, first, last, asked);
    if (to === first) return;
    // The selection goes with its lines (shown so once the table is rendered again)
    const follow = (ref: CellRef): CellRef =>
      vertical ? { ...ref, row: lineAfterBlockMove(ref.row, first, last, to) } : { ...ref, column: lineAfterBlockMove(ref.column, first, last, to) };
    this.selection = { key: selection.key, anchor: follow(selection.anchor), focus: follow(selection.focus) };
    const result = await (vertical ? moveRowsTo(this.host, widget, info, first, last, to) : moveColumnsTo(this.host, widget, info, first, last, to));
    if (result === "failed" && this.selection?.key === selection.key) {
      this.selection = selection;
      this.show();
      return;
    }
    // Moved out of view: scrolled to
    const now = this.host.widgetForKey(selection.key);
    const nowInfo = now && this.host.infoOf(now);
    const focus = this.selection?.focus;
    if (nowInfo && focus) this.host.cellAt(nowInfo, focus)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  selected(info: WidgetInfo): readonly CellRef[] | undefined {
    return this.selection?.key === info.key ? this.refs(info) : undefined;
  }

  /** Copy and Clear in the menu of a cell or of the cells selected */
  cellMenuEntries(widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): CellMenuGroup[] {
    const body = cells.filter((ref) => ref.row > 0).length;
    const entries: MenuEntry[] = [
      {
        kind: "item",
        label: cells.length > 1 ? `Copy ${cells.length} cells` : "Copy",
        icon: ICONS.duplicate,
        hint: "Copy as Ctrl+C does: a spreadsheet pastes it into cells",
        run: () => void this.copy(info, cells),
      },
    ];
    // A header keeps its name: a column needs one
    if (body > 0) {
      entries.push({
        kind: "item",
        label: body > 1 ? `Clear ${body} cells` : "Clear",
        icon: ICONS.clear,
        hint: "Empty the cells, formulas included, as Delete does",
        run: () => void this.empty(widget, info, cells),
      });
    }
    // Cells selected: the rows and the columns they are in, deleted whole, last
    const deleting: MenuEntry[] = [];
    if (cells.length > 1) {
      const rows = [...new Set(cells.map((ref) => ref.row).filter((row) => row > 0))];
      const columns = [...new Set(cells.map((ref) => ref.column))];
      if (rows.length) {
        deleting.push({
          kind: "item",
          label: rows.length > 1 ? `Delete ${rows.length} rows` : "Delete row",
          icon: ICONS.trash,
          danger: true,
          hint: "Delete the rows these cells are in",
          run: () => void this.deleteRows(widget, info, rows),
        });
      }
      deleting.push({
        kind: "item",
        label: columns.length > 1 ? `Delete ${columns.length} columns` : "Delete column",
        icon: ICONS.trash,
        danger: true,
        hint: "Delete the columns these cells are in",
        run: () => void this.deleteColumns(widget, info, columns),
        ...(columns.length >= info.columns ? { disabled: "A table needs at least one column" } : {}),
      });
    }
    return [
      { order: 1, entries },
      { order: 9, entries: deleting },
    ];
  }

  /** The cells, as values in rows as shown, onto the clipboard as Ctrl+C puts them */
  private async copy(info: WidgetInfo, cells: readonly CellRef[]): Promise<void> {
    const rows = new Map<number, string[]>();
    for (const ref of cells) {
      const cell = this.host.cellAt(info, ref, true);
      const row = rows.get(ref.row) ?? [];
      row.push(cell ? cellValue(cell) : "");
      rows.set(ref.row, row);
    }
    const values = Array.from(rows.values());
    try {
      await writeClipboard(this.host.doc, clipboardText(values), clipboardHtml(values));
      // Said, as Ctrl+C says it: a menu's copy shows nothing else (on a phone, nothing at all)
      void this.host.bridge.flash(`Table Plus: copied ${values.length} × ${values[0]?.length ?? 0} cells`, "info");
    } catch (e) {
      void this.host.bridge.flash(`Table Plus: could not copy (${String(e)})`, "error");
    }
  }

  // A cell's editor opened (also from a + or a menu, which leave the selection): the selection ends
  editorOpened(): void {
    if (this.selection) this.clear();
  }

  // A table rendered again (after a write) shows the selection again
  enhanced(_widget: HTMLElement, info: WidgetInfo): void {
    if (this.selection?.key === info.key) this.show();
  }

  /** The selected cells as shown: rows top to bottom (the header first), columns left to right */
  private cells(): HTMLTableCellElement[][] | undefined {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!selection || !info) return undefined;
    const shown = this.host.shownRows(info);
    const index = (row: number) =>
      shown.findIndex((tr) => (row === 0 ? tr === info.table.rows[0] : tr.dataset.tpRow === String(row)));
    const a = index(selection.anchor.row);
    const b = index(selection.focus.row);
    if (a < 0 || b < 0) return undefined;
    const left = Math.min(selection.anchor.column, selection.focus.column);
    const right = Math.max(selection.anchor.column, selection.focus.column);
    return shown.slice(Math.min(a, b), Math.max(a, b) + 1).map((tr) => Array.from(tr.cells).slice(left, right + 1));
  }

  private show(): void {
    this.unmark();
    const cells = this.cells() ?? [];
    for (const row of cells) for (const cell of row) cell.classList.add("tp-selected");
    this.placeHandles(cells);
    this.host.selectionChanged();
  }

  /**
   * The handles in the selection's first and last cell, on their corners;
   * inside them on the table's edges, where its box would cut what is past
   * them and leave them half to grab
   */
  private placeHandles(cells: readonly (readonly HTMLTableCellElement[])[]): void {
    const first = cells[0]?.[0];
    const lastRow = cells[cells.length - 1];
    const last = lastRow?.[lastRow.length - 1];
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!first || !last || !info) return;
    const shown = this.host.shownRows(info);
    const [start, end] = this.handles;
    start.classList.toggle("tp-select-edge-row", first.parentElement === shown[0]);
    start.classList.toggle("tp-select-edge-column", first.cellIndex === 0);
    end.classList.toggle("tp-select-edge-row", last.parentElement === shown[shown.length - 1]);
    end.classList.toggle("tp-select-edge-column", last.cellIndex === info.columns - 1);
    first.append(start);
    last.append(end);
  }

  /**
   * A handle dragged (a touch): the selection goes from its other corner to
   * the cell under the finger; whole rows (columns) stay whole, so more of
   * them are selected. Near the view's edge the page scrolls, near the edge
   * of a table's box that scrolls sideways the table does.
   */
  private dragHandle(e: PointerEvent, corner: "start" | "end"): void {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    const cells = this.cells();
    if (e.button !== 0 || !selection || !widget || !info || !cells?.length) return;
    e.preventDefault();
    e.stopPropagation();
    const lastRow = cells[cells.length - 1]!;
    const startRef = this.host.cellRef(info, cells[0]![0]!);
    const endRef = this.host.cellRef(info, lastRow[lastRow.length - 1]!);
    if (!startRef || !endRef) return;
    const [anchor, dragged] = corner === "start" ? [endRef, startRef] : [startRef, endRef];
    const wholeRows = cells[0]!.length === info.columns;
    const wholeColumns = startRef.row === 0 && cells.length === this.host.shownRows(info).length;
    const { key } = selection;
    const doc = this.host.doc;
    const win = doc.defaultView!;
    doc.body.classList.add("tp-select-dragging");
    // A finger held still near an edge: it goes on scrolling, the selection with it
    let last: PointerEvent | undefined;
    const timer = win.setInterval(() => last && move(last), 50);
    const move = (ev: PointerEvent) => {
      last = ev;
      this.autoscroll(widget, ev);
      const under = doc.elementFromPoint?.(ev.clientX, ev.clientY) ?? null;
      const hit = this.host.enhancedWidgetOf(under);
      const cell = hit && hit[1].key === key ? this.host.tableCellOf(hit[1], under) : undefined;
      const ref = hit && cell ? this.host.cellRef(hit[1], cell) : undefined;
      if (!hit || !ref) return;
      const focus = { row: wholeColumns ? dragged.row : ref.row, column: wholeRows ? dragged.column : ref.column };
      const now = this.selection;
      if (now?.key === key && now.anchor === anchor && now.focus.row === focus.row && now.focus.column === focus.column) return;
      this.selectCells(hit[1], anchor, focus);
    };
    const end = () => {
      win.clearInterval(timer);
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", end, true);
      win.removeEventListener("pointercancel", end, true);
      doc.body.classList.remove("tp-select-dragging");
      this.stopSelecting = undefined;
    };
    this.stopSelecting?.();
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", end, true);
    win.addEventListener("pointercancel", end, true);
    this.stopSelecting = end;
  }

  /**
   * A tap on a cell of a selection of several opens their menu, as in a
   * spreadsheet's app. Told by the touch's pointer events, which always come
   * (the mouse events a browser fires after a tap may not); the core then
   * swallows those, as after a long press.
   */
  private onTouch = (e: PointerEvent): void => {
    this.stopTap?.();
    const selection = this.selection;
    if (e.pointerType !== "touch" || e.button !== 0 || !selection || (e.target instanceof Node && this.owns(e.target))) return;
    const hit = this.host.enhancedWidgetOf(e.target);
    if (!hit || hit[1].key !== selection.key) return;
    const [widget, info] = hit;
    const cell = this.host.tableCellOf(info, e.target);
    const ref = cell && this.host.cellRef(info, cell);
    const refs = this.refs(info);
    if (!ref || refs.length < 2 || !refs.some((r) => r.row === ref.row && r.column === ref.column)) return;
    const { clientX: x, clientY: y } = e;
    const at = Date.now();
    const win = this.host.doc.defaultView!;
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > TAP_MOVE) stop();
    };
    const up = () => {
      stop();
      if (Date.now() - at < TAP_MS && !this.host.pressTaken()) this.host.openCellMenu(widget, info, ref, { x, y });
    };
    const stop = () => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", stop, true);
      this.stopTap = undefined;
    };
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", stop, true);
    this.stopTap = stop;
  };

  /** Near an edge the box scrolls: the table's own (Maximum table height, full screen) up and down, else the page's; the table's sideways */
  private autoscroll(widget: HTMLElement, ev: PointerEvent): void {
    const scroller = widget.scrollHeight > widget.clientHeight ? widget : this.host.scrollParentOf(widget);
    if (scroller) {
      const view = scroller.getBoundingClientRect();
      if (ev.clientY < view.top + AUTOSCROLL_EDGE) scroller.scrollTop -= AUTOSCROLL_STEP;
      else if (ev.clientY > view.bottom - AUTOSCROLL_EDGE) scroller.scrollTop += AUTOSCROLL_STEP;
    }
    if (widget.scrollWidth > widget.clientWidth) {
      const box = widget.getBoundingClientRect();
      if (ev.clientX < box.left + AUTOSCROLL_EDGE) widget.scrollLeft -= AUTOSCROLL_STEP;
      else if (ev.clientX > box.right - AUTOSCROLL_EDGE) widget.scrollLeft += AUTOSCROLL_STEP;
    }
  }

  private clear(): void {
    this.selection = undefined;
    this.unmark();
    this.host.selectionChanged();
  }

  private unmark(): void {
    for (const cell of Array.from(this.host.doc.querySelectorAll(".tp-selected"))) cell.classList.remove("tp-selected");
    for (const handle of this.handles) handle.remove();
  }

  /** The selected cells as references, rows as shown (the header first), columns left to right */
  private refs(info: WidgetInfo): CellRef[] {
    return (this.cells() ?? []).flat().flatMap((cell) => this.host.cellRef(info, cell) ?? []);
  }

  /**
   * Delete: empties the selected cells (the selection stays). Whole rows (all
   * columns) or whole columns (the header and every row shown) whose cells are
   * empty already are deleted: a first Delete empties them, a second deletes them.
   */
  private async emptyCells(): Promise<void> {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (!widget || !info) return;
    const refs = this.refs(info);
    const table = parseTable(info.source);
    const empty = (row: number, column: number) => withoutTags(table.rows[row]?.cells[column] ?? "") === "";
    const rows = [...new Set(refs.map((ref) => ref.row))];
    const columns = [...new Set(refs.map((ref) => ref.column))];
    const body = rows.filter((row) => row > 0);
    const wholeRows = columns.length === info.columns && body.length > 0;
    const shown = this.host.shownRows(info).length;
    const wholeColumns = rows.includes(0) && rows.length === shown;
    if (wholeRows && body.every((row) => columns.every((column) => empty(row, column)))) {
      this.clear();
      await deleteRowsAt(this.host, widget, info, body);
      return;
    }
    // Every row's cell, also the rows a filter hides: their data would go too
    if (wholeColumns && !wholeRows && columns.every((column) => table.rows.every((_, row) => row === 0 || empty(row, column)))) {
      this.clear();
      await deleteColumnsAt(this.host, widget, info, columns);
      return;
    }
    await this.empty(widget, info, refs);
  }

  private async deleteRows(shownWidget: HTMLElement, info: WidgetInfo, rows: readonly number[]): Promise<void> {
    this.clear();
    const widget = this.host.widgetForKey(info.key) ?? shownWidget;
    await deleteRowsAt(this.host, widget, this.host.infoOf(widget) ?? info, rows);
  }

  private async deleteColumns(shownWidget: HTMLElement, info: WidgetInfo, columns: readonly number[]): Promise<void> {
    this.clear();
    const widget = this.host.widgetForKey(info.key) ?? shownWidget;
    await deleteColumnsAt(this.host, widget, this.host.infoOf(widget) ?? info, columns);
  }

  /**
   * Empties cells, formulas included, as one edit; header cells keep their
   * names (a column needs one), cells their hidden tags (names)
   */
  private async empty(shownWidget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): Promise<void> {
    const widget = this.host.widgetForKey(info.key) ?? shownWidget;
    const refs = cells.filter((ref) => ref.row > 0);
    const emptied = (table: Table, ref: CellRef) => setCell(table, ref.row, ref.column, this.host.keepTags("", table.rows[ref.row]?.cells[ref.column] ?? ""));
    await this.host.write(widget, (t) => refs.reduce(emptied, t));
  }

  /**
   * Ctrl+C with cells selected copies them as a spreadsheet does: as text with
   * a tab between cells and a line break between rows, and as an HTML table,
   * so Excel and Google Sheets paste them into cells. Cells copy what they
   * show (a formula's result, a link's text), a typed cell its value.
   */
  private onCopy = (e: ClipboardEvent): void => {
    // A copy from a menu (Copy, Copy as CSV) puts its own text there
    if (copyingFromMenu()) return;
    const cells = this.selection && this.cells();
    const active = this.host.doc.activeElement;
    if (!cells || !e.clipboardData || ((active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== active.selectionEnd)) return;
    const values = cells.map((row) => row.map(cellValue));
    e.clipboardData.setData("text/plain", clipboardText(values));
    e.clipboardData.setData("text/html", clipboardHtml(values));
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.host.bridge.flash(`Table Plus: copied ${values.length} × ${values[0]?.length ?? 0} cells`, "info");
  };
}
