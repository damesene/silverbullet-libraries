// Names Table Plus keeps in cells, in a hidden tag after the cell's text: a
// column's fixed name in its header cell (`| Unit price <meta n="price"> |`),
// by which formulas and the stored sorting name the column whatever its header
// says. SilverBullet does not show the tag, and leaves it out of the column's
// key in its index (verified), so queries see the header as before. In a body
// cell it is the cell's name, by which formulas use the cell. A row's name is
// a `<meta r="pear">` in its first cell: `pear[price]` is the row's Price cell.
import { escapeMetaValue, type Table, unescapeMetaValue } from "./markdown.ts";
import { setCell } from "./ops.ts";

const NAME_TAG_RE = /\s*<meta\s+n\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/?>/gi;
const ROW_TAG_RE = /\s*<meta\s+r\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/?>/gi;

// A cell's A1 name in formulas: column letters, then the row from 1
export const CELL_RE = /^([A-Za-z]{1,3})([1-9]\d*)$/;

// A name formulas can write: letters, digits and _, not starting with a digit
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a text cannot be a name (of a table, a column, a cell); undefined when it can */
export function nameProblem(name: string, what: string): string | undefined {
  if (!NAME_RE.test(name)) return `"${name}" is not a ${what} name: letters, digits and _, not starting with a digit`;
  // Formulas would read it as a cell (A1, AB12) or a logical value
  if (CELL_RE.test(name) || /^(true|false)$/i.test(name)) return `"${name}" would read as a cell or a value`;
  return undefined;
}

function tagValue(cell: string, re: RegExp): string | undefined {
  const match = Array.from(cell.matchAll(re)).pop();
  const value = match && unescapeMetaValue(match[1] ?? match[2] ?? "").trim();
  return value || undefined;
}

/** The name a cell holds, if any */
export function nameOf(cell: string): string | undefined {
  return tagValue(cell, NAME_TAG_RE);
}

/** The row name a (first) cell holds, if any */
export function rowNameOf(cell: string): string | undefined {
  return tagValue(cell, ROW_TAG_RE);
}

/** The cell without its names (its own and its row's) */
export function withoutName(cell: string): string {
  return cell.replace(NAME_TAG_RE, "").replace(ROW_TAG_RE, "").trim();
}

/** The cell's text with these names after it */
function named(text: string, name: string | undefined, row: string | undefined): string {
  const tags = [
    ...(name ? [`<meta n="${escapeMetaValue(name)}">`] : []),
    ...(row ? [`<meta r="${escapeMetaValue(row)}">`] : []),
  ];
  return [text, ...tags].filter((part) => part !== "").join(" ");
}

/** The cell named `name` (undefined: without a name), its text and row name kept */
export function withName(cell: string, name: string | undefined): string {
  return named(withoutName(cell), name, rowNameOf(cell));
}

/** The (first) cell with the row name `row` (undefined: none), its text and own name kept */
export function withRowName(cell: string, row: string | undefined): string {
  return named(withoutName(cell), nameOf(cell), row);
}

/** `cell` with the names `from` has: a new value for a cell keeps its names */
export function keepNames(cell: string, from: string): string {
  return named(withoutName(cell), nameOf(from), rowNameOf(from));
}

/**
 * A row's name and the column of the cell holding it. Written in the first
 * cell, but a column inserted before it or the column moved takes the tag
 * along, so any cell of the row counts (the first one holding a name).
 */
export function rowNameIn(cells: readonly string[]): { readonly name: string; readonly column: number } | undefined {
  for (let column = 0; column < cells.length; column++) {
    const name = rowNameOf(cells[column]!);
    if (name) return { name, column };
  }
  return undefined;
}

/** A table's named rows by their names (lowercase), the first row of each name; rows of the markdown (header 0) */
export function namedRows(table: Table): Map<string, number> {
  const rows = new Map<string, number>();
  table.rows.forEach((r, row) => {
    const name = row === 0 ? undefined : rowNameIn(r.cells)?.name.toLowerCase();
    if (name && !rows.has(name)) rows.set(name, row);
  });
  return rows;
}

/** A table's named body cells by their names (lowercase), the first cell of each name; rows of the markdown (header 0) */
export function namedCells(table: Table): Map<string, { readonly row: number; readonly column: number }> {
  const cells = new Map<string, { readonly row: number; readonly column: number }>();
  table.rows.forEach((r, row) => {
    if (row === 0) return;
    r.cells.forEach((cell, column) => {
      const name = nameOf(cell)?.toLowerCase();
      if (name && !cells.has(name)) cells.set(name, { row, column });
    });
  });
  return cells;
}

/** Whether a table has names in its cells */
export function hasNames(table: Table): boolean {
  return table.rows.some((row) => row.cells.some((cell) => nameOf(cell) !== undefined || rowNameOf(cell) !== undefined));
}

/** The table with every name in its cells removed */
export function withoutNames(table: Table): Table {
  let result = table;
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (withoutName(cell) !== cell.trim()) result = setCell(result, r, c, withoutName(cell));
    }),
  );
  return result;
}
