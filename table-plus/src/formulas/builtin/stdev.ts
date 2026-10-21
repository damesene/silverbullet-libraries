import { FormulaError } from "../values.ts";
import { withNumbers } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "STDEV",
  syntax: "STDEV(number1, [number2], …)",
  description: "The standard deviation of the numbers as a sample (divided by their count less one); of times, a time.",
  category: "math",
  example: "=STDEV([score])",
  minArgs: 1,
  call: (args) =>
    withNumbers(args, (ns) => {
      if (ns.length < 2) return new FormulaError("#DIV/0!", "a standard deviation needs two numbers at least");
      const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
      return Math.sqrt(ns.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (ns.length - 1));
    }, true),
} satisfies FormulaFunction;
