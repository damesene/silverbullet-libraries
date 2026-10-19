import { FormulaError } from "../values.ts";
import { withNumbers } from "./helpers.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "AVERAGE",
  syntax: "AVERAGE(number1, [number2], …)",
  description: "The arithmetic mean of the numbers.",
  minArgs: 1,
  call: (args) =>
    withNumbers(args, (ns) =>
      ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : new FormulaError("#DIV/0!", "no numbers to average"),
    ),
} satisfies FormulaFunction;
