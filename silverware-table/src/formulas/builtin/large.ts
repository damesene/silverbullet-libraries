import { FormulaError, isError } from "../values.ts";
import { toWhole, withNumbers } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "LARGE",
  syntax: "LARGE(array, k)",
  description: "The k-th largest of the numbers (or of the times): LARGE(A1:A9, 1) is the largest.",
  category: "math",
  example: "=LARGE([score], 2)",
  minArgs: 2,
  maxArgs: 2,
  call: ([array, k]) => {
    const at = toWhole(k!);
    if (isError(at)) return at;
    return withNumbers(
      [array!],
      (ns) =>
        at >= 1 && at <= ns.length
          ? [...ns].sort((a, b) => b - a)[at - 1]!
          : new FormulaError("#NUM!", `k is ${at}, not 1 to ${ns.length} (how many numbers there are)`),
      true,
    );
  },
} satisfies FormulaFunction;
