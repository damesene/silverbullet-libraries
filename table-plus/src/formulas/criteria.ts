// Conditions of the -IFS functions (SUMIFS, COUNTIFS…) and wildcards, as
// spreadsheets write them: ">10", "<>done", "open" (the same text, ignoring
// case), "app*" (* any text, ? one character, ~ before either for itself),
// "" (an empty cell), "<>" (a cell that is not empty), or a value to equal.
import { parseDate } from "./dates.ts";
import { asNumber } from "../view.ts";
import {
  asTime,
  DAY_SECONDS,
  FormulaError,
  isError,
  isRange,
  sameValue,
  type Scalar,
  single,
  TimeValue,
  type Value,
} from "./values.ts";

/** A wildcard pattern as a regular expression (ignoring case), matching the whole text or anywhere in it */
export function wildcardRegExp(pattern: string, whole: boolean): RegExp {
  const literal = (c: string) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "~" && (pattern[i + 1] === "*" || pattern[i + 1] === "?" || pattern[i + 1] === "~")) source += literal(pattern[++i]!);
    else if (c === "*") source += "[\\s\\S]*";
    else if (c === "?") source += "[\\s\\S]";
    else source += literal(c);
  }
  return new RegExp(whole ? `^${source}$` : source, "iu");
}

/** A cell's value as a number where it reads as one (text such as `12,99 €`, a time as a fraction of a day) */
function numberOf(cell: Scalar): number | undefined {
  if (typeof cell === "number") return cell;
  if (cell instanceof TimeValue) return cell.seconds / DAY_SECONDS;
  if (typeof cell !== "string") return undefined;
  const n = asNumber(cell);
  if (n !== undefined) return n;
  const time = asTime(cell);
  return time ? time.seconds / DAY_SECONDS : undefined;
}

const isEmpty = (cell: Scalar) => cell === null || (typeof cell === "string" && cell.trim() === "");

const ORDER: Readonly<Record<string, (order: number) => boolean>> = {
  "=": (o) => o === 0,
  "<>": (o) => o !== 0,
  "<": (o) => o < 0,
  ">": (o) => o > 0,
  "<=": (o) => o <= 0,
  ">=": (o) => o >= 0,
};

/** A condition as a test of a cell's value */
export function criterion(value: Scalar): (cell: Scalar) => boolean {
  // A number, TRUE / FALSE or a time: a cell of that value
  if (typeof value !== "string") return (cell) => !isError(cell) && sameValue(value, cell);
  const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(value)!;
  const op = m[1] ?? "=";
  const rest = m[2]!;
  const order = ORDER[op]!;
  // "" and "=": an empty cell; "<>": one that is not empty
  if (rest === "") return op === "<>" ? (cell) => !isEmpty(cell) : op === "=" ? isEmpty : () => false;
  const date = parseDate(rest);
  if (date) {
    return (cell) => {
      const d = typeof cell === "string" ? parseDate(cell) : undefined;
      return d ? order(d.ms - date.ms) : op === "<>";
    };
  }
  const n = numberOf(rest);
  if (n !== undefined) {
    return (cell) => {
      const c = isError(cell) || typeof cell === "boolean" ? undefined : numberOf(cell);
      return c !== undefined ? order(c - n) : op === "<>";
    };
  }
  if (op === "=" || op === "<>") {
    const re = wildcardRegExp(rest, true);
    // Text and TRUE / FALSE; an empty cell is no text, not even for "*"
    const text = (cell: Scalar) =>
      typeof cell === "boolean" ? (cell ? "TRUE" : "FALSE") : typeof cell === "string" && !isEmpty(cell) ? cell.trim() : undefined;
    return (cell) => {
      const t = isError(cell) ? undefined : text(cell);
      const matches = t !== undefined && re.test(t);
      return op === "=" ? matches : !matches;
    };
  }
  // < > <= >= with text: text cells compared ignoring case
  const lower = rest.toLowerCase();
  return (cell) => {
    if (typeof cell !== "string" || isEmpty(cell) || numberOf(cell) !== undefined) return false;
    const t = cell.trim().toLowerCase();
    return order(t < lower ? -1 : t > lower ? 1 : 0);
  };
}

/** A range argument's cells (a single value is one cell) */
export function cellsOf(value: Value): readonly Scalar[] {
  return isRange(value) ? value : [value];
}

/**
 * The places (indexes into the ranges) whose cells meet every condition of
 * pairs of a range and a condition, all ranges `size` cells long
 */
export function matchingPlaces(pairs: readonly Value[], size: number | undefined): number[] | FormulaError {
  if (pairs.length === 0 || pairs.length % 2 !== 0) {
    return new FormulaError("#VALUE!", "the conditions come in pairs: a range, then its condition");
  }
  const ranges: (readonly Scalar[])[] = [];
  const tests: ((cell: Scalar) => boolean)[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    // A range that is an error (a column that does not exist) is the result
    if (isError(pairs[i]!)) return pairs[i] as FormulaError;
    const cells = cellsOf(pairs[i]!);
    const condition = single(pairs[i + 1]!);
    if (isError(condition)) return condition;
    const expected = size ?? ranges[0]?.length ?? cells.length;
    if (cells.length !== expected) {
      return new FormulaError("#VALUE!", `the ranges are not the same size (${expected} and ${cells.length} cells)`);
    }
    ranges.push(cells);
    tests.push(criterion(condition));
  }
  const places: number[] = [];
  for (let at = 0; at < ranges[0]!.length; at++) {
    if (ranges.every((cells, i) => tests[i]!(cells[at]!))) places.push(at);
  }
  return places;
}

/**
 * The cells of `values` (the first argument of SUMIFS, AVERAGEIFS…) in the
 * places that meet the conditions after it, as a range for the function that
 * takes them on
 */
export function matchingCells(values: Value, pairs: readonly Value[]): readonly Scalar[] | FormulaError {
  if (isError(values)) return values;
  const cells = cellsOf(values);
  const places = matchingPlaces(pairs, cells.length);
  return isError(places) ? places : places.map((at) => cells[at]!);
}
