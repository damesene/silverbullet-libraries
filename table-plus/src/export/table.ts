// What a table gives the modules that export it (export: CSV; excel): its
// header and rows as values, cells as Ctrl+C copies them (host.cellValue:
// what a column type keeps of a cell, else its text as shown). The rows as
// shown (sorted, filtered) for a copy of what is in view, or all of them in
// the order of the markdown, where formulas refer to them by their place.
import type { TableHost, WidgetInfo } from "../core/feature.ts";

export type ExportedRow = {
  // Its row in the markdown (the header 0)
  readonly row: number;
  readonly values: readonly string[];
};

export type ExportedTable = {
  readonly header: readonly string[];
  readonly rows: readonly ExportedRow[];
};

/** The table as rendered now: the one rendered anew for its key since `info` was taken, if any */
export function currentTable(host: TableHost, widget: HTMLElement, info: WidgetInfo): { widget: HTMLElement; info: WidgetInfo } {
  const current = host.widgetForKey(info.key) ?? widget;
  return { widget: current, info: host.infoOf(current) ?? info };
}

/** The table's header and its rows: `shown` as the view shows them, `all` in the order of the markdown, hidden ones too */
export function exportedTable(host: TableHost, info: WidgetInfo, rows: "shown" | "all"): ExportedTable {
  const values = (tr: HTMLTableRowElement) => Array.from(tr.cells).map((cell) => host.cellValue(cell));
  const body = rows === "shown" ? host.shownRows(info).filter((tr) => tr.dataset.tpRow !== undefined) : host.bodyRows(info);
  return {
    header: values(info.table.rows[0]!),
    rows: body.map((tr) => ({ row: Number(tr.dataset.tpRow), values: values(tr) })),
  };
}
