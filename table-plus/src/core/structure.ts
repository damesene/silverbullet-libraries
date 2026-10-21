// Structural edits of a rendered table: inserting, duplicating, deleting,
// moving and pinning rows and columns; moving and copying cells. Each is one write, rows and columns
// pinned to the edges stay there (pins.ts), and formulas and the stored
// sorting follow through the write steps (rowMap, columnMap).
import type { Table } from "../markdown.ts";
import {
  columnAfterMove,
  deleteColumn,
  deleteRow,
  type IndexMap,
  insertColumn,
  insertRow,
  lineAfterBlockMove,
  moveColumn,
  moveColumns,
  moveRow,
  moveRows,
  setCell,
} from "../ops.ts";
import { type MoveRules, moveCells } from "../paste.ts";
import { cellTags, withoutTags, withoutTagsWith } from "../tags.ts";
import {
  clampColumnMove,
  clampRowMove,
  type ColumnZone,
  deleteColumnPins,
  deleteRowPins,
  insertColumnAt,
  insertRowAt,
  pinColumn,
  pinRow,
  type RowZone,
} from "../pins.ts";
import type { CellRef, TableHost, WidgetInfo, WriteResult } from "./feature.ts";

/**
 * What moving cells does with their hidden tags: the text and the tags a
 * feature manages (a formula's) go with a cell; the others (a row's or a
 * cell's name) stay where they are, at both ends, so names keep naming their
 * rows and places
 */
export function cellMoveRules(host: TableHost): MoveRules {
  // The tags no feature manages: those keepTags keeps from a cell
  const unmanaged = (cell: string) => new Set(cellTags(host.keepTags("", cell)));
  return {
    emptied: (cell) => host.keepTags("", cell),
    placed: (moved, over) => {
      const stay = unmanaged(moved);
      const content = [withoutTags(moved), ...cellTags(moved).filter((tag) => !stay.has(tag))].filter((part) => part !== "").join(" ");
      return host.keepTags(content, over);
    },
  };
}

/**
 * Moves the cells (rows of the markdown and columns, as they are shown: row
 * by row) so that the first goes to `to`, in the table as it is (no rows or
 * columns added), as one edit; with `copy` they are copied instead, as
 * AutoFill copies (a formula with its references moved: TableHost.fillCell),
 * the names of the cells written over kept. Body cells only.
 */
export function moveCellsTo(
  host: TableHost,
  widget: HTMLElement,
  info: WidgetInfo,
  cells: readonly (readonly CellRef[])[],
  to: CellRef,
  copy: boolean,
): Promise<WriteResult> {
  const rows = cells.map((_, i) => to.row + i);
  const columns = (cells[0] ?? []).map((_, j) => to.column + j);
  if (to.row < 1 || rows[rows.length - 1]! >= info.rows || columns[columns.length - 1]! >= info.columns) return Promise.resolve("unchanged");
  const plan = { rows, columns, newRows: { at: 0, count: 0 }, newColumns: { at: 0, count: 0 }, pins: info.pins };
  if (!copy) return host.write(widget, (t) => moveCells(t, cells, plan, cellMoveRules(host)));
  return host.write(widget, (t) => {
    // Read before any is written: the copy may overlap its cells
    const raw = cells.map((row) => row.map((ref) => t.rows[ref.row]?.cells[ref.column] ?? ""));
    let result = t;
    cells.forEach((row, i) =>
      row.forEach((from, j) => {
        const dest = { row: rows[i]!, column: columns[j]! };
        const cell = raw[i]![j]!;
        const value = host.fillCell(info, cell, from, dest) ?? withoutTags(cell);
        result = setCell(result, dest.row, dest.column, host.keepTags(value, result.rows[dest.row]?.cells[dest.column] ?? ""));
      }),
    );
    return result;
  });
}

export const MOVE_BLOCKED = "Clear sorting and filters to move rows";

/** Where the rows of the markdown go when a row is inserted at `at` */
export function rowAfterInsert(at: number): IndexMap {
  return (r) => (r >= at ? r + 1 : r);
}

/** Adds a row asked for at `at` (see insertRowAt) and edits it in `column`; `prepare` is part of the same edit */
export function insertRowWith(
  host: TableHost,
  widget: HTMLElement,
  info: WidgetInfo,
  at: number,
  column: number,
  prepare: (t: Table) => Table | undefined = (t) => t,
  // Where the new row shows while it is edited (rows of the markdown before the insert); none: last
  beside: { readonly after?: number; readonly before?: number } = {},
): Promise<WriteResult> {
  const insert = insertRowAt(info.pins, info.rows, at);
  const rowMap = rowAfterInsert(insert.at);
  const hold = {
    ...(beside.after !== undefined ? { after: rowMap(beside.after) } : {}),
    ...(beside.before !== undefined ? { before: rowMap(beside.before) } : {}),
  };
  return host.write(
    widget,
    (t) => {
      const prepared = prepare(t);
      return prepared && insertRow(prepared, insert.at);
    },
    { focus: { row: insert.at, column }, pins: insert.pins, rowMap, hold },
  );
}

export function duplicateRowAt(host: TableHost, widget: HTMLElement, info: WidgetInfo, row: number): Promise<WriteResult> {
  // The copy goes below the row, or above it when the row is the last one pinned to the bottom
  const insert = insertRowAt(info.pins, info.rows, row + 1);
  return host.write(
    widget,
    (t) => {
      // What is one cell's or row's (names) the copy does not take
      const unique = host.uniqueTags();
      const cells = t.rows[row]?.cells.map((cell) => {
        const copy = withoutTagsWith(cell, unique);
        return copy === cell.trim() ? cell : copy;
      });
      return cells ? insertRow(t, insert.at, cells) : undefined;
    },
    { pins: insert.pins, rowMap: rowAfterInsert(insert.at) },
  );
}

export function deleteRowAt(host: TableHost, widget: HTMLElement, info: WidgetInfo, row: number): Promise<WriteResult> {
  return deleteRowsAt(host, widget, info, [row]);
}

/** Deletes rows (of the markdown; the header is not one of them), as one edit */
export function deleteRowsAt(host: TableHost, widget: HTMLElement, info: WidgetInfo, rows: readonly number[]): Promise<WriteResult> {
  const doomed = [...new Set(rows.filter((r) => r > 0))].sort((a, b) => b - a);
  if (doomed.length === 0) return Promise.resolve("unchanged");
  // From the last up: the rows above keep their places, the pins count down zone by zone
  let pins = info.pins;
  doomed.forEach((row, i) => (pins = deleteRowPins(pins, info.rows - i, row)));
  return host.write(widget, (t) => doomed.reduce((table, row) => deleteRow(table, row), t), {
    pins,
    rowMap: (r) => (doomed.includes(r) ? undefined : r - doomed.filter((d) => d < r).length),
  });
}

/** Moves a row, within its zone when pinned, outside the zones when not */
export function moveRowTo(host: TableHost, widget: HTMLElement, info: WidgetInfo, from: number, asked: number): Promise<WriteResult> {
  const to = clampRowMove(info.pins, info.rows, from, asked);
  if (to === from) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveRow(t, from, to), { rowMap: (r) => columnAfterMove(r, from, to) });
}

/**
 * Where lines `first`..`last` can go when moved to start at `asked`: within
 * their zone of pins (all of them in one, else they stay), the whole block
 */
function blockTo(clamp: (from: number, to: number) => number, first: number, last: number, asked: number): number {
  const min = clamp(first, -Infinity);
  const max = clamp(last, Infinity);
  // Lines of different zones (pinned and not) do not move together
  if (clamp(first, Infinity) !== max) return first;
  return Math.max(min, Math.min(asked, max - (last - first)));
}

/** Where body rows `first`..`last` asked to start at `asked` go: the first's index (`first`: they stay) */
export function rowBlockTo(info: WidgetInfo, first: number, last: number, asked: number): number {
  return blockTo((from, at) => clampRowMove(info.pins, info.rows, from, at), first, last, asked);
}

/** Where columns `first`..`last` asked to start at `asked` go: the first's index (`first`: they stay) */
export function columnBlockTo(info: WidgetInfo, first: number, last: number, asked: number): number {
  return blockTo((from, at) => clampColumnMove(info.pins, info.columns, from, at), first, last, asked);
}

/** Moves body rows `first`..`last` so that the first is at `asked` (within their zone), as one edit */
export function moveRowsTo(host: TableHost, widget: HTMLElement, info: WidgetInfo, first: number, last: number, asked: number): Promise<WriteResult> {
  const to = rowBlockTo(info, first, last, asked);
  if (to === first) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveRows(t, first, last, to), { rowMap: (r) => lineAfterBlockMove(r, first, last, to) });
}

/** Moves columns `first`..`last` so that the first is at `asked` (within their zone), as one edit */
export function moveColumnsTo(host: TableHost, widget: HTMLElement, info: WidgetInfo, first: number, last: number, asked: number): Promise<WriteResult> {
  const to = columnBlockTo(info, first, last, asked);
  if (to === first) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveColumns(t, first, last, to), { columnMap: (c) => lineAfterBlockMove(c, first, last, to) });
}

/** Adds a column asked for at `at` and edits its name */
export function insertColumnWith(host: TableHost, widget: HTMLElement, info: WidgetInfo, at: number): Promise<WriteResult> {
  const insert = insertColumnAt(info.pins, info.columns, at);
  return host.write(widget, (t) => insertColumn(t, insert.at), {
    focus: { row: 0, column: insert.at, select: true },
    columnMap: (c) => (c >= insert.at ? c + 1 : c),
    pins: insert.pins,
  });
}

/**
 * Deletes a column. What the features keep in it that goes with it (names of
 * rows and cells, which formulas use) is asked first.
 */
export function deleteColumnAt(host: TableHost, widget: HTMLElement, info: WidgetInfo, column: number): Promise<WriteResult> {
  return deleteColumnsAt(host, widget, info, [column]);
}

/** Deletes columns, as one edit; at least one stays (a table needs one) */
export async function deleteColumnsAt(host: TableHost, widget: HTMLElement, info: WidgetInfo, columns: readonly number[]): Promise<WriteResult> {
  const doomed = [...new Set(columns)].sort((a, b) => b - a);
  if (doomed.length === 0) return "unchanged";
  if (doomed.length >= info.columns) {
    void host.bridge.flash("Table Plus: a table keeps at least one column", "info");
    return "unchanged";
  }
  // Left to right, as the columns are shown
  const lost = [...doomed].reverse().flatMap((column) => host.columnDeleteWarnings(info, column));
  if (lost.length) {
    const what = doomed.length === 1 ? "this column" : "these columns";
    const question = `Deleting ${what} also removes ${lost.join(", and ")}. Delete ${doomed.length === 1 ? "the column" : `the ${doomed.length} columns`}? Ctrl+Z brings it back.`;
    if (!(await host.ask(question))) return "unchanged";
  }
  let pins = info.pins;
  doomed.forEach((column, i) => (pins = deleteColumnPins(pins, info.columns - i, column)));
  return host.write(widget, (t) => doomed.reduce((table, column) => deleteColumn(table, column), t), {
    columnMap: (c) => (doomed.includes(c) ? undefined : c - doomed.filter((d) => d < c).length),
    pins,
  });
}

export function moveColumnTo(host: TableHost, widget: HTMLElement, info: WidgetInfo, from: number, asked: number): Promise<WriteResult> {
  const to = clampColumnMove(info.pins, info.columns, from, asked);
  if (to === from) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveColumn(t, from, to), { columnMap: (c) => columnAfterMove(c, from, to) });
}

/** Pins a row to the top or bottom (moving it there), or unpins it; pinning needs the metadata setting */
export async function pinRowAt(host: TableHost, widget: HTMLElement, info: WidgetInfo, row: number, pin: RowZone | undefined): Promise<void> {
  if (pin && !(await host.setting("metadata"))) return;
  const { to, pins } = pinRow(info.pins, info.rows, row, pin);
  await host.write(widget, (t) => moveRow(t, row, to), { pins, rowMap: (r) => columnAfterMove(r, row, to) });
}

export async function pinColumnAt(
  host: TableHost,
  widget: HTMLElement,
  info: WidgetInfo,
  column: number,
  pin: ColumnZone | undefined,
): Promise<void> {
  if (pin && !(await host.setting("metadata"))) return;
  const { to, pins } = pinColumn(info.pins, info.columns, column, pin);
  await host.write(widget, (t) => moveColumn(t, column, to), { columnMap: (c) => columnAfterMove(c, column, to), pins });
}
