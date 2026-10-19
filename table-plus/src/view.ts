// View state of a table: sorting changes what is shown, never the markdown
// (filters are the filters module's: features/filters.ts).

export type SortDirection = "asc" | "desc";

// Pinned rows and columns are moved to the edges of the table in the markdown
// and kept there: the first `top` and last `bottom` body rows, the first `left`
// and last `right` columns. Pinned rows are not sorted or filtered, and both
// stay in view while the table scrolls.
export type Pins = {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
};

export const NO_PINS: Pins = { top: 0, bottom: 0, left: 0, right: 0 };

export type ViewState = {
  readonly sort?: { readonly column: number; readonly direction: SortDirection };
  readonly pins?: Pins;
};

export const DEFAULT_VIEW: ViewState = {};

export function pinsOf(view: ViewState): Pins {
  return view.pins ?? NO_PINS;
}

export function hasPins(pins: Pins): boolean {
  return pins.top + pins.bottom + pins.left + pins.right > 0;
}

export function withPins(view: ViewState, pins: Pins): ViewState {
  if (hasPins(pins)) return { ...view, pins };
  const { pins: _pins, ...rest } = view;
  return rest;
}

/** Click on a column's sort control: ascending, descending, then source order */
export function cycleSort(view: ViewState, column: number): ViewState {
  if (view.sort?.column !== column) return { ...view, sort: { column, direction: "asc" } };
  if (view.sort.direction === "asc") return { ...view, sort: { column, direction: "desc" } };
  return withoutSort(view);
}

export function withSort(view: ViewState, column: number, direction: SortDirection): ViewState {
  return { ...view, sort: { column, direction } };
}

export function withoutSort(view: ViewState): ViewState {
  const { sort: _sort, ...rest } = view;
  return rest;
}

/**
 * Moves the sorting along with a column change. `map` returns a column's new
 * index, or undefined when the column was deleted (the sorting ends).
 */
export function remapColumns(
  view: ViewState,
  map: (column: number) => number | undefined,
): ViewState {
  const column = view.sort ? map(view.sort.column) : undefined;
  // Pins are counts at the edges: whoever changes the columns sets them
  const result = withoutSort(view);
  return view.sort && column !== undefined ? { ...result, sort: { column, direction: view.sort.direction } } : result;
}

// A number with an optional currency symbol in front and a unit after it:
// "12,99 €", "$5", "15 %", "3 kg", "1 000"
const NUMBER_RE = /^\p{Sc}?\s*([-+]?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)(?:[.,]\d+)?)\s*[\p{L}\p{Sc}%°]*$/u;

export function asNumber(s: string): number | undefined {
  const m = NUMBER_RE.exec(s.trim());
  return m ? Number(m[1]!.replace(/[ \u00a0]/g, "").replace(",", ".")) : undefined;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareValues(a: string, b: string): number {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== undefined && nb !== undefined) return na - nb;
  return collator.compare(a.trim(), b.trim());
}

/**
 * The body rows to show between the pinned ones, in display order, as indexes
 * into `values` (one array of cell texts per body row, values[0] being row 1),
 * but those `hidden` (by a feature: filters). Pinned rows are left out: they
 * are not sorted or hidden. Empty cells sort last in both directions; ties
 * keep the source order.
 */
export function visibleRows(
  values: readonly (readonly string[])[],
  view: ViewState,
  hidden: ReadonlySet<number> = new Set(),
): number[] {
  const { top, bottom } = pinsOf(view);
  const indexes = values
    .map((_, i) => i)
    .filter((i) => i >= top && i < values.length - bottom && !hidden.has(i));
  const sort = view.sort;
  if (!sort) return indexes;
  const sign = sort.direction === "asc" ? 1 : -1;
  return indexes.sort((a, b) => {
    const va = values[a]![sort.column] ?? "";
    const vb = values[b]![sort.column] ?? "";
    const ea = va.trim() === "";
    const eb = vb.trim() === "";
    if (ea !== eb) return ea ? 1 : -1;
    return sign * compareValues(va, vb) || a - b;
  });
}
