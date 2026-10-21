import { FormulaError } from "../values.ts";
import { withNumbers } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "MEDIAN",
  syntax: "MEDIAN(number1, [number2], …)",
  description: "The middle of the numbers (or of the times) in order; of an even count, the mean of the two in the middle.",
  category: "math",
  example: "=MEDIAN([price])",
  minArgs: 1,
  call: (args) =>
    withNumbers(
      args,
      (ns) => {
        if (!ns.length) return new FormulaError("#NUM!", "no numbers");
        const sorted = [...ns].sort((a, b) => a - b);
        const mid = sorted.length >> 1;
        return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      },
      true,
    ),
} satisfies FormulaFunction;
