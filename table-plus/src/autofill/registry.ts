// Which series AutoFill tries (builtin/), and what fills a line when none
// fits: its values over again, as a spreadsheet does.
import { BUILT_IN_SERIES } from "./builtin/index.ts";
import type { Generator, Series } from "./series.ts";

/** Every series, in the order they are tried */
export function allSeries(): readonly Series[] {
  return BUILT_IN_SERIES;
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
