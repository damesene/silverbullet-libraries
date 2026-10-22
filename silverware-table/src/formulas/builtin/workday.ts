import { dayDate, dayNumber, holidayDays, toDate, weekdayOf } from "../dates.ts";
import { toWhole } from "../arguments.ts";
import { FormulaError, isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

// More working days than the years 0 to 9999 have
const MOST_DAYS = 2_700_000;

export default {
  name: "WORKDAY",
  syntax: "WORKDAY(start, days, [holidays])",
  description: "The date the given count of working days (Monday to Friday) after the start, leaving out the holidays (dates, a range of them); a negative count goes back.",
  category: "date",
  example: "=WORKDAY([@ordered], 5, holidays![date])",
  minArgs: 2,
  maxArgs: 3,
  call: ([start, days, holidays]) => {
    const a = toDate(start!);
    const n = toWhole(days!);
    const off = holidayDays(holidays);
    if (isError(a)) return a;
    if (isError(n)) return n;
    if (isError(off)) return off;
    if (Math.abs(n) > MOST_DAYS) return new FormulaError("#NUM!", "the date is not in the years 0 to 9999");
    const step = Math.sign(n);
    let day = dayNumber(a);
    for (let left = Math.abs(n); left > 0; ) {
      day += step;
      if (weekdayOf(day) !== 0 && weekdayOf(day) !== 6 && !off.has(day)) left--;
    }
    return dayDate(day);
  },
} satisfies FormulaFunction;
