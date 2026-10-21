import { FormulaError, isError } from "../values.ts";
import { toWhole, withNumbers } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "SMALL",
  syntax: "SMALL(array, k)",
  description: "The k-th smallest of the numbers (or of the times): SMALL(A1:A9, 1) is the smallest.",
  category: "math",
  example: "=SMALL([time], 1)",
  minArgs: 2,
  maxArgs: 2,
  call: ([array, k]) => {
    const at = toWhole(k!);
    if (isError(at)) return at;
    return withNumbers(
      [array!],
      (ns) =>
        at >= 1 && at <= ns.length
          ? [...ns].sort((a, b) => a - b)[at - 1]!
          : new FormulaError("#NUM!", `k is ${at}, not 1 to ${ns.length} (how many numbers there are)`),
      true,
    );
  },
} satisfies FormulaFunction;
