// Values formulas compute with, and the conversions formula functions use.
import { formatLuaNumber } from "../format.ts";
import { asNumber } from "../view.ts";

export type ErrorCode = "#VALUE!" | "#DIV/0!" | "#REF!" | "#NAME?" | "#NUM!" | "#CYCLE!" | "#ERROR!";

export const ERROR_CODES: readonly ErrorCode[] = ["#VALUE!", "#DIV/0!", "#REF!", "#NAME?", "#NUM!", "#CYCLE!", "#ERROR!"];

/** A formula's error: the cell shows the code, the cell's tooltip the detail */
export class FormulaError {
  constructor(
    readonly code: ErrorCode,
    readonly detail: string,
  ) {}
}

// null: an empty cell
export type Scalar = number | string | boolean | null | FormulaError;

// A range (A1:B3, [Qty]) is passed to functions as the list of its cells' values
export type Value = Scalar | readonly Scalar[];

export function isError(value: unknown): value is FormulaError {
  return value instanceof FormulaError;
}

export function isRange(value: Value): value is readonly Scalar[] {
  return Array.isArray(value);
}

/** The first error among the values, ranges included */
export function firstError(values: readonly Value[]): FormulaError | undefined {
  for (const value of values) {
    for (const item of isRange(value) ? value : [value]) {
      if (isError(item)) return item;
    }
  }
  return undefined;
}

/** A range of one cell is that cell; a larger one cannot be one value */
export function single(value: Value): Scalar {
  if (!isRange(value)) return value;
  return value.length === 1 ? value[0]! : new FormulaError("#VALUE!", "a range where one value is expected");
}

/**
 * One value as a number: an empty cell is 0, TRUE 1, and text a number as
 * Table Plus reads it in cells (`12,99 €`, `1 000`, `15 %`)
 */
export function toNumber(value: Value): number | FormulaError {
  const v = single(value);
  if (isError(v) || typeof v === "number") return v;
  if (v === null) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v.trim() === "") return 0;
  return asNumber(v) ?? new FormulaError("#VALUE!", `"${v}" is not a number`);
}

export function toText(value: Value): string | FormulaError {
  const v = single(value);
  if (isError(v)) return v;
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return formatNumber(v);
  return v;
}

export function toBoolean(value: Value): boolean | FormulaError {
  const v = single(value);
  if (isError(v) || typeof v === "boolean") return v;
  if (v === null) return false;
  if (typeof v === "number") return v !== 0;
  const upper = v.trim().toUpperCase();
  if (upper === "TRUE") return true;
  if (upper === "FALSE") return false;
  const n = asNumber(v);
  return n !== undefined ? n !== 0 : new FormulaError("#VALUE!", `"${v}" is not TRUE or FALSE`);
}

/**
 * The numbers among the arguments, as spreadsheets take them: in a range,
 * empty cells and text that is not a number are skipped; an argument given
 * directly must be a number. The first error is returned instead.
 */
export function numbers(args: readonly Value[]): number[] | FormulaError {
  const result: number[] = [];
  for (const arg of args) {
    if (isRange(arg)) {
      for (const item of arg) {
        if (isError(item)) return item;
        if (typeof item === "number") result.push(item);
        else if (typeof item === "string") {
          const n = asNumber(item);
          if (n !== undefined) result.push(n);
        }
      }
    } else if (arg !== null) {
      const n = toNumber(arg);
      if (isError(n)) return n;
      result.push(n);
    }
  }
  return result;
}

/** All values of the arguments in one list, ranges flattened */
export function flatten(args: readonly Value[]): Scalar[] {
  return args.flatMap((arg) => (isRange(arg) ? [...arg] : [arg]));
}

/** A number as a cell shows it: at most 14 significant digits, so 0.1 + 0.2 is 0.3 */
export function formatNumber(n: number): string {
  return formatLuaNumber(n);
}
