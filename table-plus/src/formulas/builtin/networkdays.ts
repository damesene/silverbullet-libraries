import { dayNumber, holidayDays, toDate, weekdayOf } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

const isWorkday = (day: number) => weekdayOf(day) !== 0 && weekdayOf(day) !== 6;

export default {
  name: "NETWORKDAYS",
  syntax: "NETWORKDAYS(start, end, [holidays])",
  description: "How many working days (Monday to Friday) there are from the start to the end, both counted, without the holidays (dates, a range of them); negative when the end is earlier.",
  category: "date",
  example: "=NETWORKDAYS([@start], [@end], holidays![date])",
  minArgs: 2,
  maxArgs: 3,
  call: ([start, end, holidays]) => {
    const a = toDate(start!);
    const b = toDate(end!);
    const off = holidayDays(holidays);
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (isError(off)) return off;
    const from = Math.min(dayNumber(a), dayNumber(b));
    const to = Math.max(dayNumber(a), dayNumber(b));
    // Whole weeks have five working days each; the days left are counted
    const weeks = Math.floor((to - from + 1) / 7);
    let count = weeks * 5;
    for (let day = from + weeks * 7; day <= to; day++) if (isWorkday(day)) count++;
    for (const day of off) if (day >= from && day <= to && isWorkday(day)) count--;
    return dayNumber(a) <= dayNumber(b) ? count : -count;
  },
} satisfies FormulaFunction;
