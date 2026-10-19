import { partOf, toClock } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "HOUR",
  syntax: "HOUR(time)",
  description: "The hour of a time, or of a date's time, 0 to 23 (0 for a date without a time).",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date!);
    return isError(d) ? d : partOf(d, "hour");
  },
} satisfies FormulaFunction;
