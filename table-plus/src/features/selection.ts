// Selecting cells by dragging across them, to copy them for a spreadsheet
// (Ctrl+C) or empty them (Delete); Copy and Clear in the menu of a cell or of
// the cells selected.
import type { CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { cellValue } from "../dom.ts";
import { ICONS } from "../icons.ts";
import type { MenuEntry } from "../menu.ts";
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

export class Selection implements Feature {
  // The cells selected (rows of the markdown, header 0), in the table with this key
  private selection: { readonly key: string; readonly anchor: CellRef; focus: CellRef } | undefined;
  private stopSelecting: (() => void) | undefined;

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
    if (this.selection && !(e.target instanceof Node && this.host.isFloating(e.target))) this.clear();
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

  /** Copy and Clear in the menu of a cell or of the cells selected */
  cellMenuEntries(widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): { order: number; entries: MenuEntry[] } {
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
    return { order: 1, entries };
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

  /** Empties the selected cells (Delete). The selection stays. */
  private async emptyCells(): Promise<void> {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    if (widget && info) await this.empty(widget, info, this.refs(info));
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
