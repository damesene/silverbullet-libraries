import { withNumbers } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "PRODUCT",
  syntax: "PRODUCT(number1, [number2], …)",
  description: "Multiplies the numbers.",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => ns.reduce((a, b) => a * b, 1)),
} satisfies FormulaFunction;
