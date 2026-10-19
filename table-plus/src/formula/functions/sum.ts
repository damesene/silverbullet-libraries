import { withNumbers } from "./helpers.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "SUM",
  syntax: "SUM(number1, [number2], …)",
  description: "Adds numbers, cells and ranges.",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => ns.reduce((a, b) => a + b, 0)),
} satisfies FormulaFunction;
