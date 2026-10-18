// View state of a table: sorting and filtering change what is shown, never the markdown.

export type SortDirection = "asc" | "desc";

export type ViewState = {
  readonly sort?: { readonly column: number; readonly direction: SortDirection };
  readonly filters: readonly string[];
  readonly showFilters: boolean;
};

export const DEFAULT_VIEW: ViewState = { filters: [], showFilters: false };

/** True when rows are shown in another order or some are hidden */
export function isRearranged(view: ViewState): boolean {
  return !!view.sort || view.filters.some((f) => f.trim() !== "");
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

export function withFilter(view: ViewState, column: number, value: string): ViewState {
  const filters = [...view.filters];
  while (filters.length <= column) filters.push("");
  filters[column] = value;
  return { ...view, filters };
}

/** Back to the source order with nothing hidden */
export function resetView(view: ViewState): ViewState {
  return { filters: [], showFilters: view.showFilters };
}

/**
 * Moves the view's per-column state along with a column change. `map` returns
 * a column's new index, or undefined when the column was deleted.
 */
export function remapColumns(
  view: ViewState,
  map: (column: number) => number | undefined,
): ViewState {
  const filters: string[] = [];
  view.filters.forEach((value, column) => {
    const target = map(column);
    if (target === undefined || value === "") return;
    while (filters.length <= target) filters.push("");
    filters[target] = value;
  });
  const sortColumn = view.sort ? map(view.sort.column) : undefined;
  const result: ViewState = { filters, showFilters: view.showFilters };
  return view.sort && sortColumn !== undefined
    ? { ...result, sort: { column: sortColumn, direction: view.sort.direction } }
    : result;
}

// Case and diacritics do not matter when filtering: "cesky" finds "Český"
export function normalizeForFilter(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const NUMBER_RE = /^[-+]?(\d{1,3}([  ]\d{3})+|\d+)([.,]\d+)?\s*%?$/;

function asNumber(s: string): number | undefined {
  const t = s.trim();
  if (!NUMBER_RE.test(t)) return undefined;
  return Number(t.replace(/[  %]/g, "").replace(",", "."));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareValues(a: string, b: string): number {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== undefined && nb !== undefined) return na - nb;
  return collator.compare(a.trim(), b.trim());
}

/**
 * The body rows to show, in display order, as indexes into `values` (one array
 * of cell texts per body row). Empty cells sort last in both directions; ties
 * keep the source order.
 */
export function visibleRows(values: readonly (readonly string[])[], view: ViewState): number[] {
  const filters = view.filters.map((f) => normalizeForFilter(f.trim()));
  const indexes = values
    .map((_, i) => i)
    .filter((i) =>
      filters.every(
        (filter, column) =>
          filter === "" || normalizeForFilter(values[i]![column] ?? "").includes(filter),
      ),
    );
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
