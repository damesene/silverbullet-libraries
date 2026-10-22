// Which series AutoFill tries: the built-in ones (builtin/) and the custom
// ones the user defines (custom.ts), and what fills a line when none fits: its
// values over again, as a spreadsheet does.
import { BUILT_IN_SERIES } from "./builtin/index.ts";
import type { Generator, Series } from "./series.ts";

// The custom series, as last defined
let custom: readonly Series[] = [];
// Space Lua is loaded again: the next definitions replace those of before
let anew = false;

/**
 * Every series, in the order they are tried: the custom ones first (so they
 * can take values a built-in one would), except one with a built-in one's
 * name, which is tried in its place
 */
export function allSeries(): readonly Series[] {
  const replacing = new Map(custom.map((s) => [s.name, s]));
  return [...custom.filter((s) => !BUILT_IN_SERIES.some((b) => b.name === s.name)), ...BUILT_IN_SERIES.map((s) => replacing.get(s.name) ?? s)];
}

/** What the values go on with: the first series that fits them, else the values over again */
export function seriesFor(values: readonly string[]): { readonly name: string; readonly next: Generator } {
  for (const series of allSeries()) {
    const next = series.match(values);
    if (next) return { name: series.name, next };
  }
  const k = values.length;
  return { name: "repeat", next: (i) => values[((i % k) + k) % k] ?? "" };
}

/** Custom series, added to those defined before (one of the same name replaced, in its place: the last of a name), or replacing them all after `customSeriesAnew` */
export function defineCustomSeries(series: readonly Series[]): void {
  custom = Array.from(new Map([...(anew ? [] : custom), ...series].map((s) => [s.name, s])).values());
  anew = false;
}

/**
 * Space Lua is loaded again: the scripts define the series anew. Those of
 * before are kept until then; when no script defines any any more, they stay
 * until a reload.
 */
export function customSeriesAnew(): void {
  anew = true;
}

/** Forgets the custom series */
export function clearCustomSeries(): void {
  custom = [];
  anew = false;
}
