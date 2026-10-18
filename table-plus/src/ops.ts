// Structural edits of a table model. Each returns a new table.
import type { Align, Row, Table } from "./markdown.ts";

function withRows(table: Table, rows: readonly Row[]): Table {
  return { ...table, rows };
}

function emptyRow(columns: number): Row {
  return { cells: Array.from({ length: columns }, () => "") };
}

// The row keeps its source: the serializer rewrites it only if its cells differ
function withCells(row: Row, cells: readonly string[]): Row {
  return { ...row, cells };
}

function padded(cells: readonly string[], length: number): string[] {
  const result = [...cells];
  while (result.length < length) result.push("");
  return result;
}

function moved<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item as T);
  return result;
}

export function setCell(table: Table, row: number, column: number, value: string): Table {
  return withRows(
    table,
    table.rows.map((r, i) => {
      if (i !== row) return r;
      const cells = padded(r.cells, column + 1);
      cells[column] = value;
      return withCells(r, cells);
    }),
  );
}

/** Inserts an empty body row so that it becomes rows[at] */
export function insertRow(table: Table, at: number): Table {
  const rows = [...table.rows];
  rows.splice(Math.max(1, Math.min(at, rows.length)), 0, emptyRow(table.align.length));
  return withRows(table, rows);
}

export function deleteRow(table: Table, row: number): Table {
  if (row < 1 || row >= table.rows.length) return table;
  return withRows(
    table,
    table.rows.filter((_, i) => i !== row),
  );
}

/** Inserts a copy of body row `row` right below it */
export function duplicateRow(table: Table, row: number): Table {
  const original = table.rows[row];
  if (row < 1 || !original) return table;
  const rows = [...table.rows];
  rows.splice(row + 1, 0, { cells: [...original.cells] });
  return withRows(table, rows);
}

/** Moves body row `from` so that it ends up at index `to` */
export function moveRow(table: Table, from: number, to: number): Table {
  const last = table.rows.length - 1;
  if (from < 1 || from > last || to < 1 || to > last || from === to) return table;
  return withRows(table, moved(table.rows, from, to));
}

/** Inserts an empty column so that it becomes column `at` */
// SilverBullet does not render an empty header cell, so a new column gets a name
export function newColumnName(table: Table): string {
  const names = new Set(table.rows[0]?.cells ?? []);
  let n = table.align.length + 1;
  while (names.has(`Column ${n}`)) n++;
  return `Column ${n}`;
}

/** Names every empty header cell "Column N" (N its position, or the next free number) */
export function nameEmptyHeaders(table: Table): Table {
  const header = table.rows[0];
  if (!header) return table;
  const names = new Set(header.cells);
  const cells = header.cells.map((cell, i) => {
    if (cell !== "") return cell;
    let n = i + 1;
    while (names.has(`Column ${n}`)) n++;
    const name = `Column ${n}`;
    names.add(name);
    return name;
  });
  return { ...table, rows: [{ ...header, cells }, ...table.rows.slice(1)] };
}

/** Inserts a column so that it becomes column `at`, with a generated header */
export function insertColumn(table: Table, at: number): Table {
  const column = Math.max(0, Math.min(at, table.align.length));
  const header = newColumnName(table);
  const align = [...table.align];
  align.splice(column, 0, "");
  return {
    ...table,
    align,
    rows: table.rows.map((r, i) => {
      const cells = padded(r.cells, column);
      cells.splice(column, 0, i === 0 ? header : "");
      return withCells(r, cells);
    }),
  };
}

export function deleteColumn(table: Table, column: number): Table {
  if (table.align.length <= 1 || column < 0 || column >= table.align.length) return table;
  return {
    ...table,
    align: table.align.filter((_, i) => i !== column),
    rows: table.rows.map((r) =>
      withCells(
        r,
        r.cells.filter((_, i) => i !== column),
      ),
    ),
  };
}

/** Moves column `from` so that it ends up at index `to` */
export function moveColumn(table: Table, from: number, to: number): Table {
  const columns = table.align.length;
  if (from < 0 || from >= columns || to < 0 || to >= columns || from === to) return table;
  return {
    ...table,
    align: moved(table.align, from, to),
    rows: table.rows.map((r) => withCells(r, moved(padded(r.cells, columns), from, to))),
  };
}

export function setAlign(table: Table, column: number, align: Align): Table {
  return {
    ...table,
    align: table.align.map((a, i) => (i === column ? align : a)),
  };
}

/** Where column `c` ends up after moving column `from` to `to` */
export function columnAfterMove(c: number, from: number, to: number): number {
  if (c === from) return to;
  if (from < to && c > from && c <= to) return c - 1;
  if (from > to && c >= to && c < from) return c + 1;
  return c;
}
