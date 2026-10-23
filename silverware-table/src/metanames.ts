// The names of what tables keep: each attribute's whole name, made of its
// owner's (a module's name in lowercase, or the core's) and its key, the way
// tables have them written. Nothing else: the parts that read and write
// tables (meta.ts, names.ts) take their names from here.

/** Whose an attribute is: a module's name in lowercase, or the core's */
export type Owner = string;
export const CORE: Owner = "core";

// How each owner's keys are written in tables (a key not listed: `<owner>.<key>`)
export const TABLE_NAMES: Readonly<Record<string, string>> = {
  "core.name": "name",
  "core.pin-top": "pin-top",
  "core.pin-bottom": "pin-bottom",
  "core.pin-left": "pin-left",
  "core.pin-right": "pin-right",
  "themes.name": "theme",
  "themes.stripes": "stripes",
  "sheet.name": "sheet",
  "sheet.at": "at",
};
const COLUMN_NAMES: Readonly<Record<string, string>> = { "core.sort": "sort", "filters.condition": "filter", "widths.size": "width" };
const CELL_NAMES: Readonly<Record<string, string>> = { "formulas.f": "f", "core.n": "n", "core.cn": "cn" };

/** The name of an owner's attribute of a table, as written in its metadata row */
export function tableAttributeName(owner: Owner, key: string): string {
  const full = `${owner}.${key}`;
  return TABLE_NAMES[full] ?? full;
}

/** The name of an owner's attribute in cells' hidden tags */
export function cellTagName(owner: Owner, key: string): string {
  const full = `${owner}.${key}`;
  return CELL_NAMES[full] ?? full;
}

/** What an owner's attribute of columns is written as before the column (`<what>.<column>`) */
export function columnWhat(owner: Owner, key: string): string {
  const full = `${owner}.${key}`;
  return COLUMN_NAMES[full] ?? full;
}
