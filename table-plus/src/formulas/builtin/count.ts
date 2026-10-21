import { isError, isRange, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "COUNT",
  syntax: "COUNT(value1, [value2], …)",
  description: "How many of the values are numbers.",
  category: "math",
  example: "=COUNT([qty])",
  minArgs: 1,
  call: (args) => {
    let count = 0;
    for (const arg of args) {
      for (const item of isRange(arg) ? arg : [arg]) {
        if (item === null || isError(item) || typeof item === "boolean") continue;
        if (!isError(toNumber(item))) count++;
      }
    }
    return count;
  },
} satisfies FormulaFunction;
