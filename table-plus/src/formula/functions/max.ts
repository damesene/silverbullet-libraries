import { withNumbers } from "./helpers.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "MAX",
  syntax: "MAX(number1, [number2], …)",
  description: "The largest of the numbers (0 if there are none).",
  minArgs: 1,
  call: (args) => withNumbers(args, (ns) => (ns.length ? Math.max(...ns) : 0)),
} satisfies FormulaFunction;
