import { partOf, toDate } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "YEAR",
  syntax: "YEAR(date)",
  description: "The year of a date.",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date!);
    return isError(d) ? d : partOf(d, "year");
  },
} satisfies FormulaFunction;
