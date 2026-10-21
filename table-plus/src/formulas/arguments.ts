// Argument handling shared by several functions
import { parseDate } from "./dates.ts";
import {
  allTimes,
  DAY_SECONDS,
  flatten,
  FormulaError,
  isError,
  isRange,
  numbers,
  type Scalar,
  TimeValue,
  toBoolean,
  toNumber,
  type Value,
} from "./values.ts";

/**
 * Calls `f` with the numbers among the arguments, or returns their first
 * error. With `keepTime`, when the values are all times the result is a time
 * too (SUM of 14:00 and 20:00 is 34:00).
 */
export function withNumbers(args: readonly Value[], f: (ns: number[]) => Scalar, keepTime = false): Scalar {
  const ns = numbers(args);
  if (isError(ns)) return ns;
  const result = f(ns);
  return keepTime && typeof result === "number" && allTimes(args) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
}

/**
 * When the values are all dates (empty cells skipped), the latest or the
 * earliest of them as it is written; undefined otherwise, for the numbers
 */
export function extremeDate(args: readonly Value[], latest: boolean): Scalar | undefined {
  let best: { ms: number; text: string } | undefined;
  for (const item of flatten(args)) {
    if (item === null) continue;
    if (isError(item)) return item;
    const date = typeof item === "string" ? parseDate(item) : undefined;
    if (!date) return undefined;
    if (!best || (latest ? date.ms > best.ms : date.ms < best.ms)) best = { ms: date.ms, text: (item as string).trim() };
  }
  return best?.text;
}

/** The logical values among the arguments: in a range, empty cells and text are skipped */
export function booleans(args: readonly Value[]): boolean[] | FormulaError {
  const result: boolean[] = [];
  for (const arg of args) {
    for (const item of isRange(arg) ? arg : [arg]) {
      if (item === null || (isRange(arg) && typeof item === "string")) continue;
      const b = toBoolean(item);
      if (isError(b)) return b;
      result.push(b);
    }
  }
  return result;
}

/**
 * A number rid of the noise of binary fractions (0.29 * 100 is
 * 28.999999999999996): 15 significant digits, as spreadsheets keep, so it
 * rounds up or down to where it should. Of `like`'s size: a difference of
 * large numbers (5.1 - 5) has the noise of those numbers.
 */
export function tidy(n: number, like = n): number {
  if (!Number.isFinite(n) || n === 0) return n;
  const decimals = 14 - Math.floor(Math.log10(Math.abs(like || n)));
  const result = decimals >= 0 && decimals <= 100 ? Number(n.toFixed(decimals)) : Number(n.toPrecision(15));
  // Not -0, which would be written as such
  return result === 0 ? 0 : result;
}

/** An argument as a whole number (truncated), or its error */
export function toWhole(value: Value): number | FormulaError {
  const n = toNumber(value);
  return isError(n) ? n : Math.trunc(n);
}
