// Selecting cells by dragging across them, Shift+click (from the cell edited or
// the selection's first cell) and Shift+arrows (or whole rows and columns with
// their grips), to copy them for a spreadsheet (Ctrl+C) or
// empty them (Delete); whole rows or columns already empty, Delete deletes
// them. Copy, Clear and Delete rows / columns in the menu of a cell or of the
// cells selected.
import type { CellMenuGroup, CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { cellValue } from "../dom.ts";
import { PAGE_ROWS } from "../core/editor.ts";
import { deleteColumnsAt, deleteRowsAt } from "../core/structure.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { withoutTags } from "../tags.ts";
import type { Table } from "../markdown.ts";
import { setCell } from "../ops.ts";

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

// What Shift+arrows move the selection's last cell by: rows (as shown), columns
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
  // The selection a Shift+press goes on from: the press itself ends it first
  private extending: { readonly key: string; readonly anchor: CellRef } | undefined;

  constructor(private readonly host: TableHost) {}

  start(): void {
    this.host.doc.defaultView!.addEventListener("copy", this.onCopy, true);
  }

  stop(): void {
    this.host.doc.defaultView!.removeEventListener("copy", this.onCopy, true);
    this.stopSelecting?.();
  }

  // Any click ends a selection (one on Table Plus' own controls aside)
  beforeMouseDown(e: MouseEvent): void {
    const selection = this.selection;
    this.extending = e.shiftKey && selection ? { key: selection.key, anchor: selection.anchor } : undefined;
    if (selection && !(e.target instanceof Node && this.host.isFloating(e.target))) this.clear();
  }

  /**
   * Shift+click on a cell selects the cells from the selection's first cell,
   * else from the cell being edited (saved), else just this cell
   */
  beforeCellPress(_widget: HTMLElement, info: WidgetInfo, ref: CellRef, e: MouseEvent): boolean {
    const extending = this.extending;
    this.extending = undefined;
    if (!e.shiftKey) return false;
    const editing = this.host.editing;
    const edited = editing && this.host.infoOf(editing.widget)?.key === info.key ? { row: editing.row, column: editing.column } : undefined;
    const anchor = extending?.key === info.key ? extending.anchor : (edited ?? ref);
    // A cell being edited is saved: the press selects now
    const taken = this.host.takeEditor();
    if (taken) void this.host.write(taken.widget, taken.save);
    this.selectCells(info, anchor, ref);
    return true;
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
   * Where a key takes the selection's last cell (rows as shown): Ctrl+arrows
   * and Shift+arrows a cell, Home / End the row's first / last cell, Ctrl+Home
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
      // Plain arrows stay with SilverBullet's editor
      if (!e.shiftKey && !ctrl) return undefined;
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
    cell?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
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
    const clipboard = this.host.doc.defaultView!.navigator.clipboard;
    try {
      const win = this.host.doc.defaultView as (Window & { ClipboardItem?: typeof ClipboardItem }) | null;
      if (win?.ClipboardItem && clipboard.write) {
        const blob = (type: string, text: string) => new Blob([text], { type });
        await clipboard.write([
          new win.ClipboardItem({ "text/plain": blob("text/plain", clipboardText(values)), "text/html": blob("text/html", clipboardHtml(values)) }),
        ]);
      } else {
        await clipboard.writeText(clipboardText(values));
      }
    } catch (e) {
      void this.host.bridge.flash(`Table Plus: could not copy (${String(e)})`, "error");
    }
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
    for (const row of this.cells() ?? []) for (const cell of row) cell.classList.add("tp-selected");
  }

  private clear(): void {
    this.selection = undefined;
    this.unmark();
  }

  private unmark(): void {
    for (const cell of Array.from(this.host.doc.querySelectorAll(".tp-selected"))) cell.classList.remove("tp-selected");
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
    const cells = this.selection && this.cells();
    const active = this.host.doc.activeElement;
    if (!cells || !e.clipboardData || (active instanceof HTMLInputElement && active.selectionStart !== active.selectionEnd)) return;
    const values = cells.map((row) => row.map(cellValue));
    e.clipboardData.setData("text/plain", clipboardText(values));
    e.clipboardData.setData("text/html", clipboardHtml(values));
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.host.bridge.flash(`Table Plus: copied ${values.length} × ${values[0]?.length ?? 0} cells`, "info");
  };
}
