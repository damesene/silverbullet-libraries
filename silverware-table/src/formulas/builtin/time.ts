import { DAY_SECONDS, FormulaError, isError, TimeValue, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "TIME",
  syntax: "TIME(hour, [minute], [second])",
  description:
    "A time of day, e.g. 14:30; past midnight it starts again (TIME(25, 0) is 01:00). Added to a date it gives the date with that time: DATE(2025, 11, 6) + TIME(14, 30) is 2025-11-06 14:30.",
  category: "date",
  example: "=TIME(14, 30)",
  minArgs: 1,
  maxArgs: 3,
  call: ([hour, minute = 0, second = 0]) => {
    const parts = [toNumber(hour!), toNumber(minute), toNumber(second)];
    const error = parts.find(isError);
    if (error) return error;
    const [h, m, s] = parts as [number, number, number];
    const total = Math.round(h * 3600 + m * 60 + s);
    return total < 0 ? new FormulaError("#NUM!", "a time before midnight") : new TimeValue(total % DAY_SECONDS);
  },
} satisfies FormulaFunction;
