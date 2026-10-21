import { dayNumber, toDate, weekdayOf } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "ISOWEEKNUM",
  syntax: "ISOWEEKNUM(date)",
  description: "The week of the year by ISO 8601, 1 to 53: weeks start on Monday, and week 1 is the one with the year's first Thursday.",
  category: "date",
  example: "=ISOWEEKNUM([@date])",
  minArgs: 1,
  maxArgs: 1,
  call: ([date]) => {
    const d = toDate(date!);
    if (isError(d)) return d;
    const day = dayNumber(d);
    // The week's Thursday decides its year
    const thursday = day + 3 - ((weekdayOf(day) + 6) % 7);
    const yearStart = new Date(thursday * 86_400_000);
    yearStart.setUTCMonth(0, 1);
    return Math.floor((thursday - Math.floor(yearStart.getTime() / 86_400_000)) / 7) + 1;
  },
} satisfies FormulaFunction;
