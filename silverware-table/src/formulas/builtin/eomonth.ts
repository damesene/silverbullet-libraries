import { addUnits, dayNumber, formatDate, toDate } from "../dates.ts";
import { toWhole } from "../arguments.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "EOMONTH",
  syntax: "EOMONTH(start, months)",
  description: "The last day of the month the given count of months after the start's (0: its own month; negative: before).",
  category: "date",
  example: "=EOMONTH([@invoiced], 1)",
  minArgs: 2,
  maxArgs: 2,
  call: ([start, months]) => {
    const d = toDate(start!);
    const n = toWhole(months!);
    if (isError(d)) return d;
    if (isError(n)) return n;
    // The first of the month, moved, then the day before the first of the next
    const first = new Date(dayNumber(d) * 86_400_000);
    first.setUTCDate(1);
    const moved = new Date(addUnits({ ms: first.getTime(), time: false }, n + 1, "m").ms);
    moved.setUTCDate(0);
    return formatDate({ ms: moved.getTime(), time: false });
  },
} satisfies FormulaFunction;
