// Each table's rows as SilverBullet rendered them, whether a feature took some
// of them out of the document or not (a large table keeps only the rows in
// view there): features read rows through these, never by querying the
// table's DOM, so they have every row.
import type { CellRef, WidgetInfo } from "./feature.ts";

export class TableRows {
  // The rows as rendered (the header first), taken as SilverBullet put the table in, before any was taken out
  private readonly rendered = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();
  // The body rows, in the order of the markdown
  private readonly body = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();
  // The rows shown, in display order, as the view last placed them
  private readonly shown = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();
  // A row each table keeps in the document whatever a feature takes out (a row being dragged)
  private readonly held = new WeakMap<HTMLTableElement, HTMLTableRowElement>();

  /** The rows of a table as rendered, the header first (taken now if they were not yet) */
  renderedRows(table: HTMLTableElement): HTMLTableRowElement[] {
    let rows = this.rendered.get(table);
    if (!rows) this.rendered.set(table, (rows = Array.from(table.rows)));
    return rows;
  }

  /** Whether the rows of a table were taken already (it is not new) */
  knows(table: HTMLTableElement): boolean {
    return this.rendered.has(table);
  }

  setBodyRows(table: HTMLTableElement, rows: HTMLTableRowElement[]): void {
    this.body.set(table, rows);
  }

  setShownRows(table: HTMLTableElement, rows: HTMLTableRowElement[]): void {
    this.shown.set(table, rows);
  }

  /** The body rows as rendered, in the order of the markdown, hidden ones included */
  bodyRows(info: WidgetInfo): HTMLTableRowElement[] {
    // In the document or not (a feature may keep only the rows in view there)
    const kept = this.body.get(info.table);
    if (kept) return [...kept];
    return Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]")).sort((a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow));
  }

  /** The header row and the shown body rows, in display order */
  shownRows(info: WidgetInfo): HTMLTableRowElement[] {
    // As the view placed them, also those a feature keeps out of the document
    const placed = this.shown.get(info.table);
    if (placed) return [...placed];
    return [info.table.rows[0]!, ...Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)"))];
  }

  /** A cell by its row in the markdown; hidden rows only with includeHidden */
  cellAt(info: WidgetInfo, ref: CellRef, includeHidden = false): HTMLTableCellElement | undefined {
    const tr = ref.row === 0 ? info.table.rows[0] : this.bodyRows(info)[ref.row - 1];
    if (!tr || (tr.classList.contains("tp-hidden") && !includeHidden)) return undefined;
    return tr.cells[ref.column];
  }

  /** The row of the markdown a row rendered is (the header 0) */
  rowOf(info: WidgetInfo, tr: HTMLTableRowElement): number {
    return tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow);
  }

  /** Where a cell rendered is in the markdown; undefined for a row that is none of its (the filter row) */
  cellRef(info: WidgetInfo, cell: HTMLTableCellElement): CellRef | undefined {
    const tr = cell.parentElement as HTMLTableRowElement | null;
    if (!tr) return undefined;
    const row = this.rowOf(info, tr);
    return Number.isInteger(row) ? { row, column: cell.cellIndex } : undefined;
  }

  holdInDocument(info: WidgetInfo, row: HTMLTableRowElement | undefined): void {
    if (row) this.held.set(info.table, row);
    else this.held.delete(info.table);
  }

  heldInDocument(info: WidgetInfo): HTMLTableRowElement | undefined {
    return this.held.get(info.table);
  }
}

/**
 * Puts the rows at the end of `parent`, in this order, moving only those out
 * of place: rows already in order keep their DOM node where it is (moving the
 * row of a focused cell editor would take its focus).
 */
export function placeAtEnd(parent: Element, rows: readonly HTMLTableRowElement[]): void {
  let next: Node | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i]!;
    if (tr.parentElement !== parent || tr.nextSibling !== next) parent.insertBefore(tr, next);
    next = tr;
  }
}
