// How metadata names a column: the sorting in the metadata row (sort="qty:desc")
// and formula references ([qty]) both name it by its header, so the name
// survives the column being moved, and both write it as SilverBullet's index
// keys table columns (`Unit price` is `unit_price`, as in a query). Any
// spelling with the same key names the same column ([Unit price] is
// [unit_price]). Of several columns with the same key, the occurrence tells
// which one (the second qty is qty #2).
import { unescapeCell } from "./markdown.ts";

export type ColumnId = { readonly name: string; readonly nth: number };

// A hashtag in a header (`Price #euro`): SilverBullet leaves it out of the column's key
const HASHTAG_RE = /(^|\s)#[^\s#]+/g;

/**
 * A header cell as a column name: markdown escapes, hashtags and the
 * emphasis around it (**Qty**) dropped
 */
export function columnName(header: string): string {
  return unescapeCell(header)
    .replace(HASHTAG_RE, "$1")
    .trim()
    .replace(/^[*_`]+|[*_`]+$/g, "")
    .trim();
}

/**
 * The key SilverBullet's index gives a column (cleanHeaderFieldName in
 * plugs/index/table.ts): lower case, every run of characters other than
 * A-Z, a-z and 0-9 one "_". Letters with diacritics count as such characters,
 * as there: `Množství` is `mno_stv_`.
 */
export function columnKey(name: string): string {
  return columnName(name).replace(/[\W_]+/g, "_").toLowerCase();
}

/** The column `id` names, or undefined if the table has none of that name (and occurrence) */
export function findColumn(headers: readonly string[], id: ColumnId): number | undefined {
  const wanted = columnKey(id.name);
  let seen = 0;
  const index = headers.findIndex((header) => columnKey(header) === wanted && ++seen === id.nth);
  return index < 0 ? undefined : index;
}

/**
 * How metadata names a column (its key), and whether other columns share its
 * key (then the occurrence must be written to tell them apart)
 */
export function columnIdOf(
  headers: readonly string[],
  column: number,
): (ColumnId & { readonly shared: boolean }) | undefined {
  const header = headers[column];
  if (header === undefined) return undefined;
  const wanted = columnKey(header);
  const same = headers.filter((h) => columnKey(h) === wanted).length;
  const nth = headers.slice(0, column + 1).filter((h) => columnKey(h) === wanted).length;
  return { name: wanted, nth, shared: same > 1 };
}

/**
 * The name of a column after an edit: the column `id` named in `before`,
 * moved by `map`, named as in `after`, so a rename or a move is followed.
 * Null: the column was deleted; undefined: `before` had no such column.
 */
export function followColumn(
  before: readonly string[],
  after: readonly string[],
  id: ColumnId,
  map: (column: number) => number | undefined = (c) => c,
): ColumnId | null | undefined {
  const column = findColumn(before, id);
  if (column === undefined) return undefined;
  const moved = map(column);
  if (moved === undefined) return null;
  return columnIdOf(after, moved) ?? null;
}

/** Whether two ids name the same column the same way */
export function sameColumnId(a: ColumnId, b: ColumnId): boolean {
  return columnKey(a.name) === columnKey(b.name) && a.nth === b.nth;
}
