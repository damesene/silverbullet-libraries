// View state of a table: sorting and filtering change what is shown, never the markdown.

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
  readonly filters: readonly string[];
  readonly showFilters: boolean;
  readonly pins?: Pins;
};

export const DEFAULT_VIEW: ViewState = { filters: [], showFilters: false };

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

// Smart filters (a setting): comparisons, regular expressions, `=` and `!`
export type FilterOptions = { readonly smart: boolean };

export const DEFAULT_FILTER_OPTIONS: FilterOptions = { smart: true };

/** True when rows are shown in another order or some are hidden (pins aside) */
export function isRearranged(view: ViewState, options = DEFAULT_FILTER_OPTIONS): boolean {
  return !!view.sort || view.filters.some((f) => filterMatcher(f, options) !== undefined);
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
  // Pins are counts at the edges: whoever changes the columns sets them
  const result: ViewState = view.pins ? { filters, showFilters: view.showFilters, pins: view.pins } : { filters, showFilters: view.showFilters };
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

type Match = (value: string) => boolean;

// A parsed filter field: `match` undefined means no filtering; `error` explains
// a filter that cannot be used (an invalid regular expression)
export type ParsedFilter = { readonly match?: Match; readonly error?: string };

// Flags: JavaScript's i, m, s, u, plus c for case-sensitive
const REGEX_RE = /^\/(.*)\/([cimsu]*)$/s;
const COMPARISON_RE = /^(<=|>=|<|>)\s*(.*)$/s;

/**
 * What a filter field accepts. Plain text is found anywhere in a cell, case
 * and diacritics ignored. With smart filters:
 * - `>10`, `<10`, `>=10`, `<=10` compare the cells as numbers (others are hidden)
 * - `/pattern/flags` is a regular expression, case-insensitive unless the flags
 *   include `c`; it is matched against the cell text as shown
 * - `=text` matches whole cells (case and diacritics ignored)
 * - `!filter` hides the cells the rest matches
 * A filter still being typed (only an operator, a regular expression without
 * its closing slash and flags) does not filter yet.
 */
export function parseFilter(filter: string, options = DEFAULT_FILTER_OPTIONS): ParsedFilter {
  const text = filter.trim();
  if (text === "") return {};
  if (options.smart) {
    if (text.startsWith("!")) {
      const inner = parseFilter(text.slice(1), options);
      const match = inner.match;
      return match ? { match: (value) => !match(value) } : inner;
    }
    if (text.startsWith("=")) {
      const whole = normalizeForFilter(text.slice(1).trim());
      return whole === "" ? {} : { match: (value) => normalizeForFilter(value.trim()) === whole };
    }
    const regex = REGEX_RE.exec(text);
    if (regex) return parseRegex(regex[1]!, regex[2]!);
    // A regular expression still being typed: wait for its closing slash
    if (text.startsWith("/")) return {};
    const comparison = COMPARISON_RE.exec(text);
    if (comparison) {
      const [, operator, rest] = comparison;
      if (rest!.trim() === "") return {};
      const limit = asNumber(rest!);
      if (limit !== undefined) {
        return {
          match: (value) => {
            const n = asNumber(value);
            if (n === undefined) return false;
            if (operator === ">") return n > limit;
            if (operator === "<") return n < limit;
            if (operator === ">=") return n >= limit;
            return n <= limit;
          },
        };
      }
    }
  }
  const needle = normalizeForFilter(text);
  return { match: (value) => normalizeForFilter(value).includes(needle) };
}

function parseRegex(pattern: string, flags: string): ParsedFilter {
  if (pattern === "") return {};
  const caseSensitive = flags.includes("c");
  const jsFlags = [...new Set(flags.replace(/[ci]/g, "") + (caseSensitive ? "" : "i"))].join("");
  try {
    const re = new RegExp(pattern, jsFlags);
    return { match: (value) => re.test(value) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function filterMatcher(filter: string, options = DEFAULT_FILTER_OPTIONS): Match | undefined {
  return parseFilter(filter, options).match;
}

/**
 * The body rows to show between the pinned ones, in display order, as indexes
 * into `values` (one array of cell texts per body row, values[0] being row 1).
 * Pinned rows are left out: they are not sorted or filtered. Empty cells sort
 * last in both directions; ties keep the source order.
 */
export function visibleRows(
  values: readonly (readonly string[])[],
  view: ViewState,
  options = DEFAULT_FILTER_OPTIONS,
): number[] {
  const { top, bottom } = pinsOf(view);
  const matchers = view.filters.map((filter) => filterMatcher(filter, options));
  const indexes = values
    .map((_, i) => i)
    .filter((i) => i >= top && i < values.length - bottom)
    .filter((i) => matchers.every((match, column) => !match || match(values[i]![column] ?? "")));
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
