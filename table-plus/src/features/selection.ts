// Selecting cells by dragging across them, to copy them for a spreadsheet
// (Ctrl+C) or empty them (Delete).
import type { CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { cellValue } from "../dom.ts";
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

  /**
   * Empties the selected cells, formulas included, as one edit; header cells
   * keep their names (a column needs one). The selection stays.
   */
  private async emptyCells(): Promise<void> {
    const selection = this.selection;
    const widget = selection && this.host.widgetForKey(selection.key);
    const info = widget && this.host.infoOf(widget);
    const cells = this.cells();
    if (!widget || !info || !cells) return;
    const refs = cells
      .flat()
      .map((cell) => this.host.cellRef(info, cell))
      .filter((ref): ref is CellRef => ref !== undefined && ref.row > 0);
    await this.host.write(widget, (t) => refs.reduce((table, ref) => setCell(table, ref.row, ref.column, ""), t));
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
