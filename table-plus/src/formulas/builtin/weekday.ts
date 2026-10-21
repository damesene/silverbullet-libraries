import { partOf, toDate } from "../dates.ts";
import { FormulaError, isError, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "WEEKDAY",
  syntax: "WEEKDAY(date, [type])",
  description:
    "The day of the week as a number: Sunday 1 to Saturday 7 (type 1, the default, and 17), Monday 1 to Sunday 7 (type 2 and 11), Monday 0 to Sunday 6 (type 3), or 1 from Tuesday (12), Wednesday (13), Thursday (14), Friday (15) or Saturday (16).",
  category: "date",
  example: "=WEEKDAY([@date], 2)",
  minArgs: 1,
  maxArgs: 2,
  call: ([date, type = 1]) => {
    const d = toDate(date!);
    const t = toNumber(type);
    if (isError(d)) return d;
    if (isError(t)) return t;
    // 0 is Sunday
    const day = partOf(d, "weekday");
    if (t === 1) return day + 1;
    if (t === 2) return day === 0 ? 7 : day;
    if (t === 3) return (day + 6) % 7;
    // 11 to 17: 1 is Monday (11) to Sunday (17)
    if (Number.isInteger(t) && t >= 11 && t <= 17) return ((day - (t - 10) + 7) % 7) + 1;
    return new FormulaError("#NUM!", `${t} is not a type of WEEKDAY: 1, 2, 3 or 11 to 17`);
  },
} satisfies FormulaFunction;
