// Argument handling shared by several functions
import { FormulaError, isError, isRange, numbers, type Scalar, toBoolean, type Value } from "../values.ts";

/** Calls `f` with the numbers among the arguments, or returns their first error */
export function withNumbers(args: readonly Value[], f: (ns: number[]) => Scalar): Scalar {
  const ns = numbers(args);
  return isError(ns) ? ns : f(ns);
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
