import { formatDate } from "../dates.ts";
import { FormulaError, isError, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "DATE",
  syntax: "DATE(year, month, day)",
  description: "The date of a year, month and day; a month or day past its end carries over (DATE(2025, 13, 1) is 2026-01-01).",
  minArgs: 3,
  maxArgs: 3,
  call: ([year, month, day]) => {
    const parts = [toNumber(year!), toNumber(month!), toNumber(day!)];
    const error = parts.find(isError);
    if (error) return error;
    const [y, m, d] = parts.map((n) => Math.trunc(n as number)) as [number, number, number];
    if (y < 0 || y > 9999) return new FormulaError("#NUM!", `${y} is not a year from 0 to 9999`);
    const ms = Date.UTC(y, m - 1, d);
    return Number.isNaN(ms) ? new FormulaError("#NUM!", "not a date") : formatDate({ ms, time: false });
  },
} satisfies FormulaFunction;
