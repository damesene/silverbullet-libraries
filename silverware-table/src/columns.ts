// How metadata names a column: attributes of columns in the metadata row
// (sort.qty="desc", meta.ts) and formula references ([qty]) name it by its header, so the name
// survives the column being moved, and both write it as SilverBullet's index
// keys table columns (`Unit price` is `unit_price`, as in a query). Any
// spelling with the same key names the same column ([Unit price] is
// [unit_price]). Of several columns with the same key, the occurrence tells
// which one (the second qty is qty:2). A column with a fixed name in its
// header (`<meta core.n='price'>`, names.ts) is named by it instead, so renaming
// the header changes nothing.
import { unescapeCell } from "./markdown.ts";
import { nameOf } from "./names.ts";
import { metaTagPattern } from "./tags.ts";

export type ColumnId = { readonly name: string; readonly nth: number };

// A hashtag in a header (`Price #euro`): SilverBullet leaves it out of the column's key
const HASHTAG_RE = /(^|\s)#[^\s#]+/g;

/**
 * A header cell as a column name: markdown escapes, hashtags and the
 * emphasis around it (**Qty**) dropped
 */
export function columnName(header: string): string {
  return unescapeCell(header)
    // Tags are not part of it either: SilverBullet leaves <meta> out of the key
    .replace(metaTagPattern(), "")
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
  // A fixed name first: it is the column's whatever the headers say
  const fixed = fixedColumn(headers, id.name);
  if (fixed >= 0 && id.nth === 1) return fixed;
  // A name written as a key is that key first: its _ at an end is a character the key stands for (`Množství` is
  // `mno_stv_`); else as a header names it (markdown's emphasis dropped: `_Draft_` is `draft`)
  const asKey = /^\w+$/.test(id.name) ? id.name.replace(/_+/g, "_").toLowerCase() : undefined;
  const find = (wanted: string) => {
    // The column with the fixed name is the first of that name, the headers of that key follow it
    let seen = fixed >= 0 ? 1 : 0;
    const index = headers.findIndex((header, c) => c !== fixed && columnKey(header) === wanted && ++seen === id.nth);
    return index < 0 ? undefined : index;
  };
  return (asKey === undefined ? undefined : find(asKey)) ?? find(columnKey(id.name));
}

/** The column whose fixed name is `name`, or -1 */
function fixedColumn(headers: readonly string[], name: string): number {
  const wanted = name.toLowerCase();
  return headers.findIndex((header) => nameOf(header)?.toLowerCase() === wanted);
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
  const fixed = nameOf(header);
  if (fixed) return { name: fixed, nth: 1, shared: false };
  const wanted = columnKey(header);
  // Another column with this key as its fixed name comes first (findColumn)
  const fixedOther = fixedColumn(headers, wanted);
  const counted = (h: string, c: number) => c !== fixedOther && columnKey(h) === wanted;
  const before = fixedOther >= 0 ? 1 : 0;
  const same = before + headers.filter(counted).length;
  const nth = before + headers.slice(0, column + 1).filter(counted).length;
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
