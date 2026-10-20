import { addUnits, formatDate, toDate, toUnit } from "../dates.ts";
import { isError, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "DATEADD",
  syntax: 'DATEADD(date, amount, unit)',
  description:
    'The date plus an amount of a unit: "s", "min", "h", "d", "w", "m" (months) or "y" (or their names, "hours"). A negative amount goes back. Months and years keep the day or take the month\'s last.',
  minArgs: 3,
  maxArgs: 3,
  call: ([date, amount, unit]) => {
    const d = toDate(date!);
    const n = toNumber(amount!);
    const u = toUnit(unit!);
    if (isError(d)) return d;
    if (isError(n)) return n;
    if (isError(u)) return u;
    return formatDate(addUnits(d, n, u));
  },
} satisfies FormulaFunction;
