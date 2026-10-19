// Structural edits of a rendered table: inserting, duplicating, deleting,
// moving and pinning rows and columns. Each is one write, rows and columns
// pinned to the edges stay there (pins.ts), and formulas and the stored
// sorting follow through the write steps (rowMap, columnMap).
import type { Table } from "../markdown.ts";
import { columnAfterMove, deleteColumn, deleteRow, type IndexMap, insertColumn, insertRow, moveColumn, moveRow } from "../ops.ts";
import { withoutTagsWith } from "../tags.ts";
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
import type { TableHost, WidgetInfo, WriteResult } from "./feature.ts";

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
  return host.write(widget, (t) => deleteRow(t, row), {
    pins: deleteRowPins(info.pins, info.rows, row),
    rowMap: (r) => (r === row ? undefined : r > row ? r - 1 : r),
  });
}

/** Moves a row, within its zone when pinned, outside the zones when not */
export function moveRowTo(host: TableHost, widget: HTMLElement, info: WidgetInfo, from: number, asked: number): Promise<WriteResult> {
  const to = clampRowMove(info.pins, info.rows, from, asked);
  if (to === from) return Promise.resolve("unchanged");
  return host.write(widget, (t) => moveRow(t, from, to), { rowMap: (r) => columnAfterMove(r, from, to) });
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
export async function deleteColumnAt(host: TableHost, widget: HTMLElement, info: WidgetInfo, column: number): Promise<WriteResult> {
  const lost = host.columnDeleteWarnings(info, column);
  if (lost.length) {
    const question = `Deleting this column also removes ${lost.join(", and ")}. Delete the column? Ctrl+Z brings it back.`;
    if (!(await host.ask(question))) return "unchanged";
  }
  return host.write(widget, (t) => deleteColumn(t, column), {
    columnMap: (c) => (c === column ? undefined : c > column ? c - 1 : c),
    pins: deleteColumnPins(info.pins, info.columns, column),
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
