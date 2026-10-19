import { withNumbers } from "./helpers.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "MIN",
  syntax: "MIN(number1, [number2], …)",
  description: "The smallest of the numbers (0 if there are none).",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => (ns.length ? Math.min(...ns) : 0)),
} satisfies FormulaFunction;
