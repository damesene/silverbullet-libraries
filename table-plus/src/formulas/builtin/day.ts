import { partOf, toDate } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "DAY",
  syntax: "DAY(date)",
  description: "The day of a date's month, 1 to 31.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date!);
    return isError(d) ? d : partOf(d, "day");
  },
} satisfies FormulaFunction;
