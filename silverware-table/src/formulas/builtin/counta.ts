import { flatten } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "COUNTA",
  syntax: "COUNTA(value1, [value2], …)",
  description: "How many of the values are not empty.",
  category: "math",
  example: "=COUNTA([name])",
  minArgs: 1,
  call: (args) => flatten(args).filter((v) => v !== null && v !== "").length,
} satisfies FormulaFunction;
