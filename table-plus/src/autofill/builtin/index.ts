// The built-in series AutoFill goes on with, one per file in this folder, in
// the order they are tried: only series, what decides when none fits (the
// values repeat) is the registry's.
import dates from "./dates.ts";
import lists from "./lists.ts";
import numbered from "./numbered.ts";
import numbers from "./numbers.ts";
import times from "./times.ts";
import type { Series } from "../series.ts";

/** Dates before numbers (2025-11-06 is no number), numbers before text with a number in it */
export const BUILT_IN_SERIES: readonly Series[] = [dates, times, numbers, lists, numbered];
