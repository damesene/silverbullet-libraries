// What Table Plus keeps in a table's metadata row (`<meta …>`). For now: the
// sorting, as `sort="Name:asc"`, by column name so it survives moving columns.
// With several columns of the same name, the occurrence is added: "Qty:desc:2"
// is the second column named Qty.
import { type Table, unescapeCell } from "./markdown.ts";
import type { SortDirection } from "./view.ts";

export type MetaSort = { readonly column: number; readonly direction: SortDirection };

/** Sets or (with undefined) removes a metadata attribute; unchanged: the same table */
export function withMeta(table: Table, name: string, value: string | undefined): Table {
  const current = table.meta ?? {};
  if (current[name] === value) return table;
  const meta: Record<string, string> = { ...current };
  if (value === undefined) delete meta[name];
  else meta[name] = value;
  return { ...table, meta };
}

function headerNames(table: Table): string[] {
  return (table.rows[0]?.cells ?? []).map(unescapeCell);
}

function parseSort(value: string): { name: string; direction: SortDirection; nth: number } | undefined {
  const match = /^(.*):(asc|desc)(?::(\d+))?$/.exec(value);
  return match ? { name: match[1]!, direction: match[2] as SortDirection, nth: Number(match[3] ?? 1) } : undefined;
}

/** The sorting stored in the table, if its column still exists */
export function metaSort(table: Table): MetaSort | undefined {
  const sort = table.meta?.sort === undefined ? undefined : parseSort(table.meta.sort);
  if (!sort) return undefined;
  let seen = 0;
  const column = headerNames(table).findIndex((name) => name === sort.name && ++seen === sort.nth);
  return column < 0 ? undefined : { column, direction: sort.direction };
}

/** Stores (or, with undefined, removes) the sorting */
export function withMetaSort(table: Table, sort: MetaSort | undefined): Table {
  const names = headerNames(table);
  const name = sort ? names[sort.column] : undefined;
  if (!sort || name === undefined) return withMeta(table, "sort", undefined);
  const same = names.filter((n) => n === name).length;
  const nth = names.slice(0, sort.column + 1).filter((n) => n === name).length;
  return withMeta(table, "sort", `${name}:${sort.direction}${same > 1 ? `:${nth}` : ""}`);
}

/**
 * Keeps the stored sorting on its column through an edit: read from the table
 * before, the column moved by `map` (undefined: deleted), written for the table
 * after, so renamed, moved and duplicate-named columns are followed. Tables
 * without a stored sorting, and edits that set the sorting themselves, are
 * returned as they are.
 */
export function followMetaSort(
  before: Table,
  after: Table,
  map: (column: number) => number | undefined,
): Table {
  if (after.meta?.sort === undefined || after.meta.sort !== before.meta?.sort) return after;
  const sort = metaSort(before);
  const column = sort && map(sort.column);
  return withMetaSort(after, sort && column !== undefined ? { column, direction: sort.direction } : undefined);
}
