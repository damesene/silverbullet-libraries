import { extremeDate, withNumbers } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "MAX",
  syntax: "MAX(number1, [number2], …)",
  description: "The largest of the numbers (0 if there are none), the longest of the times, or the latest of the dates.",
  minArgs: 1,
  call: (args) => extremeDate(args, true) ?? withNumbers(args, (ns) => (ns.length ? Math.max(...ns) : 0), true),
} satisfies FormulaFunction;
