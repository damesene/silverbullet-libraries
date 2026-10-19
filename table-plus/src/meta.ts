// What Table Plus keeps in a table's metadata row (`<meta …>`):
// - pin-top="2", pin-bottom, pin-left, pin-right: how many rows (columns) at
//   each edge of the table are pinned
// - name="prices": the table's name, by which formulas refer to it (prices!B2)
// - attributes of a column, `<what>.<column>`: the column named as columns.ts
//   names columns (its key or fixed name), with the occurrence after a colon
//   when several columns share it (`qty:2`), so it survives moves and
//   renames, which every edit follows here whatever the attribute is for:
//   sort.qty="desc" (the sorting), filter.status="=open|blocked" (the filters
//   module's)
import { type ColumnId, columnIdOf, findColumn } from "./columns.ts";
import type { Row, Table } from "./markdown.ts";
import { nameProblem } from "./names.ts";
import { NO_PINS, type Pins, type SortDirection } from "./view.ts";

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

// ---- attributes of columns ------------------------------------------------------

// `<what>.<column>` and `<what>.<column>:<occurrence>`: a column's key or fixed
// name has no "." or ":"; it is empty for a header with only hashtags (`#stars`)
const COLUMN_ATTRIBUTE_RE = /^([\w-]+)\.([^.:]*)(?::(\d+))?$/;

function parseColumnAttribute(name: string): { readonly what: string; readonly id: ColumnId } | undefined {
  const match = COLUMN_ATTRIBUTE_RE.exec(name);
  return match ? { what: match[1]!, id: { name: match[2]!, nth: Number(match[3] ?? 1) } } : undefined;
}

/** The name of the attribute `what` of a column, as the headers name the column */
function columnAttributeName(headers: readonly string[], what: string, column: number): string | undefined {
  const id = columnIdOf(headers, column);
  return id && `${what}.${id.name}${id.shared ? `:${id.nth}` : ""}`;
}

/** The attribute `what` of each column that has it, by the column, in the order they are written */
export function columnMeta(table: Table, what: string): Map<number, string> {
  const headers = table.rows[0]?.cells ?? [];
  const values = new Map<number, string>();
  for (const [name, value] of Object.entries(table.meta ?? {})) {
    const attribute = parseColumnAttribute(name);
    const column = attribute?.what === what ? findColumn(headers, attribute.id) : undefined;
    if (column !== undefined && !values.has(column)) values.set(column, value);
  }
  return values;
}

/** The table with the attribute `what` of the columns as `values` (by column), and of no other */
export function withColumnMeta(table: Table, what: string, values: ReadonlyMap<number, string>): Table {
  const headers = table.rows[0]?.cells ?? [];
  const meta: Record<string, string> = {};
  for (const [name, value] of Object.entries(table.meta ?? {})) {
    if (parseColumnAttribute(name)?.what !== what) meta[name] = value;
  }
  for (const [column, value] of values) {
    const name = columnAttributeName(headers, what, column);
    if (name) meta[name] = value;
  }
  const current = table.meta ?? {};
  const same = Object.keys(meta).length === Object.keys(current).length && Object.entries(meta).every(([n, v]) => current[n] === v);
  return same ? table : { ...table, meta };
}

/**
 * Keeps the columns' attributes on their columns through an edit: each one
 * the table before had, unchanged by the edit, names its column as moved by
 * `map` (undefined: deleted, and the attribute goes) and as the table after
 * names it, so renamed, moved and duplicate-named columns are followed, in
 * the place it was written. Attributes the edit set are its own.
 */
export function followColumnMeta(before: Table, after: Table, map: (column: number) => number | undefined): Table {
  const old = before.meta ?? {};
  const current = after.meta ?? {};
  const beforeHeaders = before.rows[0]?.cells ?? [];
  const afterHeaders = after.rows[0]?.cells ?? [];
  let changed = false;
  const meta: Record<string, string> = {};
  for (const [name, value] of Object.entries(current)) {
    const attribute = old[name] === value ? parseColumnAttribute(name) : undefined;
    const column = attribute && findColumn(beforeHeaders, attribute.id);
    if (!attribute || column === undefined) {
      meta[name] = value;
      continue;
    }
    const moved = map(column);
    const renamed = moved === undefined ? undefined : columnAttributeName(afterHeaders, attribute.what, moved);
    if (renamed !== name) changed = true;
    if (renamed !== undefined) meta[renamed] = value;
  }
  return changed ? { ...after, meta } : after;
}

// ---- sorting ------------------------------------------------------------------

/** The sorting stored in the table (sort.qty="desc"), if its column still exists */
export function metaSort(table: Table): MetaSort | undefined {
  for (const [column, direction] of columnMeta(table, "sort")) {
    if (direction === "asc" || direction === "desc") return { column, direction };
  }
  return undefined;
}

/** Stores (or, with undefined, removes) the sorting */
export function withMetaSort(table: Table, sort: MetaSort | undefined): Table {
  return withColumnMeta(table, "sort", new Map(sort ? [[sort.column, sort.direction]] : []));
}

// ---- pins -----------------------------------------------------------------------

const PIN_ATTRIBUTES = { top: "pin-top", bottom: "pin-bottom", left: "pin-left", right: "pin-right" } as const;

/** The pins stored in the table, limited to what it has room for */
export function metaPins(table: Table): Pins {
  const count = (name: string) => {
    const n = Number(table.meta?.[name]);
    return Number.isInteger(n) && n > 0 ? n : 0;
  };
  const bodyRows = Math.max(0, table.rows.length - 1);
  const columns = table.align.length;
  const top = Math.min(count(PIN_ATTRIBUTES.top), bodyRows);
  const left = Math.min(count(PIN_ATTRIBUTES.left), columns);
  return {
    top,
    bottom: Math.min(count(PIN_ATTRIBUTES.bottom), bodyRows - top),
    left,
    right: Math.min(count(PIN_ATTRIBUTES.right), columns - left),
  };
}

/** Stores the pins; a count of 0 removes its attribute */
export function withMetaPins(table: Table, pins: Pins): Table {
  let result = table;
  for (const edge of ["top", "bottom", "left", "right"] as const) {
    result = withMeta(result, PIN_ATTRIBUTES[edge], pins[edge] > 0 ? String(pins[edge]) : undefined);
  }
  return result;
}

export function hasMetaPins(table: Table): boolean {
  return Object.values(PIN_ATTRIBUTES).some((name) => table.meta?.[name] !== undefined);
}

// ---- the table's name ---------------------------------------------------------------

/** Why a text cannot be a table's name (written before "!" in formulas); undefined when it can */
export function tableNameProblem(name: string): string | undefined {
  return nameProblem(name, "table");
}

/** The table's name, if it has a valid one */
export function metaName(table: Table): string | undefined {
  const name = table.meta?.name?.trim();
  return name && !tableNameProblem(name) ? name : undefined;
}

/** Names (or, with undefined, unnames) the table */
export function withMetaName(table: Table, name: string | undefined): Table {
  return withMeta(table, "name", name);
}

/** Whether two table names are the same: names are compared ignoring case */
export function sameTableName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

// ---- keeping the metadata through edits ------------------------------------------

/**
 * The step every table edit goes through for the metadata row: the columns'
 * attributes follow their columns (`columnMap`), and edits that change the
 * pins store them. (Pins are counts at the edges: the edits that change them
 * set them.)
 */
export function metadataAfterEdit(
  before: Table,
  after: Table,
  edit: { readonly columnMap?: (column: number) => number | undefined; readonly pins?: Pins },
): Table {
  const followed = followColumnMeta(before, after, edit.columnMap ?? ((c) => c));
  return edit.pins ? withMetaPins(followed, edit.pins) : followed;
}

export { NO_PINS };
export type { Row };
