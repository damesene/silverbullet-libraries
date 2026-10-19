import { FormulaError, isError, isRange, sameValue, single, toText } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "XLOOKUP",
  syntax: "XLOOKUP(value, lookup_range, result_range, [if_not_found])",
  description:
    'Finds the value in one range or column and gives the value in the same place of another, e.g. XLOOKUP("Pear", prices![Name], prices![Price]); text is found ignoring case. Not found: if_not_found, else #N/A.',
  minArgs: 3,
  maxArgs: 4,
  call: ([value, lookIn, results, notFound]) => {
    const v = single(value!);
    if (isError(v)) return v;
    // A range that is an error (a column that does not exist) is the result, not "not found"
    if (isError(lookIn!)) return lookIn;
    if (isError(results!)) return results;
    const keys = isRange(lookIn!) ? lookIn : [lookIn!];
    const found = isRange(results!) ? results : [results!];
    if (keys.length !== found.length) {
      return new FormulaError("#VALUE!", `the ranges are not the same size (${keys.length} and ${found.length} cells)`);
    }
    const index = keys.findIndex((key) => sameValue(v, key));
    if (index < 0) return notFound === undefined ? new FormulaError("#N/A", `"${toText(v)}" is not in the range`) : single(notFound);
    return found[index] ?? null;
  },
} satisfies FormulaFunction;
