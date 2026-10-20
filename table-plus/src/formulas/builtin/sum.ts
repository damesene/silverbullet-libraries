import { withNumbers } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "SUM",
  syntax: "SUM(number1, [number2], …)",
  description: "Adds numbers, cells and ranges; times add up to a time (14:00 and 20:00 are 34:00).",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => ns.reduce((a, b) => a + b, 0), true),
} satisfies FormulaFunction;
