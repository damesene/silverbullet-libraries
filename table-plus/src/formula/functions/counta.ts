import { flatten } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "COUNTA",
  syntax: "COUNTA(value1, [value2], …)",
  description: "How many of the values are not empty.",
  minArgs: 1,
  call: (args) => flatten(args).filter((v) => v !== null && v !== "").length,
} satisfies FormulaFunction;
