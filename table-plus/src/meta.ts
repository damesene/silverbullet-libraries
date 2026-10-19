// What Table Plus keeps in a table's metadata row (`<meta …>`):
// - sort="Name:asc": the sorting, by column name as columns.ts names columns,
//   so it survives moving columns; with several columns of the same name the
//   occurrence is added ("Qty:desc:2" is the second column named Qty)
// - pin-top="2", pin-bottom, pin-left, pin-right: how many rows (columns) at
//   each edge of the table are pinned
import { columnIdOf, findColumn } from "./columns.ts";
import type { Row, Table } from "./markdown.ts";
import { DEFAULT_VIEW, NO_PINS, type Pins, type SortDirection, type ViewState } from "./view.ts";

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

// ---- sorting ------------------------------------------------------------------

function parseSort(value: string): { name: string; direction: SortDirection; nth: number } | undefined {
  const match = /^(.*):(asc|desc)(?::(\d+))?$/.exec(value);
  return match ? { name: match[1]!, direction: match[2] as SortDirection, nth: Number(match[3] ?? 1) } : undefined;
}

/** The sorting stored in the table, if its column still exists */
export function metaSort(table: Table): MetaSort | undefined {
  const sort = table.meta?.sort === undefined ? undefined : parseSort(table.meta.sort);
  const column = sort && findColumn(table.rows[0]?.cells ?? [], sort);
  return sort && column !== undefined ? { column, direction: sort.direction } : undefined;
}

/** Stores (or, with undefined, removes) the sorting */
export function withMetaSort(table: Table, sort: MetaSort | undefined): Table {
  const id = sort && columnIdOf(table.rows[0]?.cells ?? [], sort.column);
  if (!sort || !id) return withMeta(table, "sort", undefined);
  return withMeta(table, "sort", `${id.name}:${sort.direction}${id.shared ? `:${id.nth}` : ""}`);
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

// ---- the view as stored -----------------------------------------------------------

/** The sorting stored in the table as a view, or undefined when none is */
export function metaView(table: Table): ViewState | undefined {
  const sort = metaSort(table);
  return sort ? { ...DEFAULT_VIEW, sort } : undefined;
}

// ---- keeping the stored sorting through edits ---------------------------------------

/**
 * Keeps the stored sorting on its column through an edit: read from the table
 * before, the column moved by `map` (undefined: deleted), written for the table
 * after, so renamed, moved and duplicate-named columns are followed. Tables
 * without a stored sorting, and edits that set the sorting themselves, are
 * returned as they are. (Pins are counts at the edges: the edits that change
 * them set them.)
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

export { NO_PINS };
export type { Row };
