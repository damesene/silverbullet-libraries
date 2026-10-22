import { isError, single, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "ISNUMBER",
  syntax: "ISNUMBER(value)",
  description: "TRUE if the value is a number, a time or text that reads as a number (12.5, 12,99 €, 15 %), as COUNT counts them; FALSE otherwise.",
  category: "logic",
  example: '=IF(ISNUMBER([@qty]), [@qty] * [@price], "")',
  minArgs: 1,
  maxArgs: 1,
  call: ([value]) => {
    const v = single(value!);
    if (v === null || isError(v) || typeof v === "boolean" || (typeof v === "string" && v.trim() === "")) return false;
    return !isError(toNumber(v));
  },
} satisfies FormulaFunction;
