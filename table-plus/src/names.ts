// Names Table Plus keeps in cells, in a hidden tag after the cell's text: a
// column's fixed name in its header cell (`| Unit price <meta n="price"> |`),
// by which formulas and the stored sorting name the column whatever its header
// says. SilverBullet does not show the tag, and leaves it out of the column's
// key in its index (verified), so queries see the header as before.
import { escapeMetaValue, type Table, unescapeMetaValue } from "./markdown.ts";
import { setCell } from "./ops.ts";

const NAME_TAG_RE = /\s*<meta\s+n\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/?>/gi;

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

/** The name a cell holds, if any */
export function nameOf(cell: string): string | undefined {
  const match = Array.from(cell.matchAll(NAME_TAG_RE)).pop();
  const name = match && unescapeMetaValue(match[1] ?? match[2] ?? "").trim();
  return name || undefined;
}

/** The cell without its name */
export function withoutName(cell: string): string {
  return cell.replace(NAME_TAG_RE, "").trim();
}

/** The cell named `name` (undefined: without a name), its text kept */
export function withName(cell: string, name: string | undefined): string {
  const text = withoutName(cell);
  if (!name) return text;
  const tag = `<meta n="${escapeMetaValue(name)}">`;
  return text === "" ? tag : `${text} ${tag}`;
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
  return table.rows.some((row) => row.cells.some((cell) => nameOf(cell) !== undefined));
}

/** The table with every name in its cells removed */
export function withoutNames(table: Table): Table {
  let result = table;
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (nameOf(cell) !== undefined) result = setCell(result, r, c, withoutName(cell));
    }),
  );
  return result;
}
