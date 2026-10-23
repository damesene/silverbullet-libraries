// The names of what tables keep: each attribute's whole name, made of its
// owner's (a module's name in lowercase, or the core's) and its key. Nothing
// else: the parts that read and write tables (meta.ts, names.ts) take their
// names from here.
// - an attribute of a table: `<owner>.<key>` (`core.name`, `sheet.at`)
// - an attribute of a column: `<owner>.-c-<column>.<key>` (`core.-c-qty.sort`),
//   the column as columns.ts names it, with its occurrence where several share
//   it (`-c-qty:2`); a segment starting `-x-` marks what the key is of (`-c-`:
//   a column), which no owner, key or column name starts with
// - an attribute in a cell's hidden tags: `<owner>.<key>` (`formulas.f`)
// The metadata row carries `core.table`, by which it is told from a last row
// whose one cell holds only a tag.

/** Whose an attribute is: a module's name in lowercase, or the core's */
export type Owner = string;
export const CORE: Owner = "core";

/** The mark of a table's metadata row (an attribute without a value) */
export const TABLE_MARKER = `${CORE}.table`;

/** The segment before a column's name in an attribute of a column */
export const COLUMN_MARK = "-c-";

/** The name of an owner's attribute of a table */
export function tableAttributeName(owner: Owner, key: string): string {
  return `${owner}.${key}`;
}

/** The name of an owner's attribute in cells' hidden tags */
export function cellTagName(owner: Owner, key: string): string {
  return `${owner}.${key}`;
}

/** What an owner's attribute of columns is, its owner and key (`<owner>.<key>`): written with the column between them */
export function columnWhat(owner: Owner, key: string): string {
  return `${owner}.${key}`;
}
