import { partOf, toClock } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "HOUR",
  syntax: "HOUR(time)",
  description: "The hour of a time, or of a date's time, 0 to 23 (0 for a date without a time).",
  category: "date",
  example: "=HOUR([@at])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date!);
    return isError(d) ? d : partOf(d, "hour");
  },
} satisfies FormulaFunction;
