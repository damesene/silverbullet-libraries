// Names Silverware Table keeps in cells, in one hidden tag after the cell's text:
// `n` names the line the cell heads, `cn` the cell itself. In a header cell,
// `n` is the column's fixed name (`| Unit price <meta n="price"> |`), by which
// formulas and the stored sorting name the column whatever its header says;
// in a body cell, the row's name (`| Pear <meta n="pear"> |`: `pear[price]` is
// the row's Price cell). `cn` names a body cell for formulas
// (`| 0.21 <meta cn="vat"> |`); a cell holding both has one tag,
// `<meta n="pear" cn="first">`. SilverBullet does not show the tag, and leaves
// it out of the column's key in its index (verified), so queries see the
// header as before.
import { escapeMetaValue, type Table, unescapeMetaValue } from "./markdown.ts";
import { setCell } from "./ops.ts";

// A tag of names only: n and cn, in any order (a formula's <meta f> is another tag)
const NAMES_TAG_RE = /\s*<meta((?:\s+c?n\s*=\s*(?:"[^"]*"|'[^']*'))+)\s*\/?>/gi;
const NAMES_ATTRIBUTE_RE = /(c?n)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

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

type Names = { readonly n?: string; readonly cn?: string };

function namesOf(cell: string): Names {
  // The last tag Silverware Table writes counts, an attribute's last value in it
  const tag = Array.from(cell.matchAll(NAMES_TAG_RE)).pop();
  const names: { n?: string; cn?: string } = {};
  for (const match of tag?.[1]?.matchAll(NAMES_ATTRIBUTE_RE) ?? []) {
    const value = unescapeMetaValue(match[2] ?? match[3] ?? "").trim();
    names[match[1]!.toLowerCase() as "n" | "cn"] = value || undefined;
  }
  return names;
}

/** The name of the line a cell heads: in a header the column's fixed name, in a body cell its row's name */
export function nameOf(cell: string): string | undefined {
  return namesOf(cell).n;
}

/** A body cell's own name, if any */
export function cellNameOf(cell: string): string | undefined {
  return namesOf(cell).cn;
}

/** The cell without its names */
export function withoutName(cell: string): string {
  return cell.replace(NAMES_TAG_RE, "").trim();
}

/** The cell's text with these names after it, in one tag */
function named(text: string, { n, cn }: Names): string {
  const attributes = [...(n ? [`n="${escapeMetaValue(n)}"`] : []), ...(cn ? [`cn="${escapeMetaValue(cn)}"`] : [])];
  return [text, ...(attributes.length ? [`<meta ${attributes.join(" ")}>`] : [])].filter((part) => part !== "").join(" ");
}

/** The cell with the line name `name` (undefined: none), its text and own name kept */
export function withName(cell: string, name: string | undefined): string {
  return named(withoutName(cell), { n: name, cn: cellNameOf(cell) });
}

/** The cell named `name` (undefined: without a name), its text and line name kept */
export function withCellName(cell: string, name: string | undefined): string {
  return named(withoutName(cell), { n: nameOf(cell), cn: name });
}

/**
 * A row's name and the column of the cell holding it. Written in the first
 * cell, but a column inserted before it or the column moved takes the tag
 * along, so any cell of the row counts (the first one holding a name).
 */
export function rowNameIn(cells: readonly string[]): { readonly name: string; readonly column: number } | undefined {
  for (let column = 0; column < cells.length; column++) {
    const name = nameOf(cells[column]!);
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
      const name = cellNameOf(cell)?.toLowerCase();
      if (name && !cells.has(name)) cells.set(name, { row, column });
    });
  });
  return cells;
}

/** Whether a table has names in its cells */
export function hasNames(table: Table): boolean {
  return table.rows.some((row) => row.cells.some((cell) => withoutName(cell) !== cell.trim()));
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
