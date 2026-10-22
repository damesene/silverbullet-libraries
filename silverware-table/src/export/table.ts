// What a table gives the modules that export it (export: CSV; excel): its
// header and rows as values, cells as Ctrl+C copies them (host.shownValue:
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

/** The table as shown now: the one rendered anew for its key since `info` was taken, if any */
export function currentTable(host: TableHost, info: WidgetInfo): WidgetInfo {
  return host.tableFor(info.key) ?? info;
}

/** The table's header and its rows: `shown` as the view shows them, `all` in the order of the markdown, hidden ones too */
export function exportedTable(host: TableHost, info: WidgetInfo, rows: "shown" | "all"): ExportedTable {
  const values = (row: number) => Array.from({ length: info.columns }, (_, column) => host.shownValue(info, { row, column }) ?? "");
  const body = rows === "shown" ? host.shownOrder(info).filter((row) => row > 0) : Array.from({ length: info.rows - 1 }, (_, i) => i + 1);
  return {
    header: values(0),
    rows: body.map((row) => ({ row, values: values(row) })),
  };
}
