import { partOf, toDate } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "MONTH",
  syntax: "MONTH(date)",
  description: "The month of a date, 1 to 12.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date!);
    return isError(d) ? d : partOf(d, "month");
  },
} satisfies FormulaFunction;
