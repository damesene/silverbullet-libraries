import { partOf, toDate } from "../dates.ts";
import { FormulaError, isError, toNumber } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "WEEKDAY",
  syntax: "WEEKDAY(date, [type])",
  description: "The day of the week as a number: Sunday 1 to Saturday 7 (type 1, the default), or Monday 1 to Sunday 7 (type 2).",
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
    return new FormulaError("#NUM!", `${t} is not a type of WEEKDAY: 1 or 2`);
  },
} satisfies FormulaFunction;
