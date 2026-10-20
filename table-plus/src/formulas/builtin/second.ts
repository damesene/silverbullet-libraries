import { partOf, toClock } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "SECOND",
  syntax: "SECOND(time)",
  description: "The second of a time, or of a date's time, 0 to 59.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toClock(date!);
    return isError(d) ? d : partOf(d, "second");
  },
} satisfies FormulaFunction;
