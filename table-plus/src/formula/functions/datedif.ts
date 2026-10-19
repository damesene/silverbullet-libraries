import { toDate, toUnit, unitsBetween } from "../dates.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "DATEDIF",
  syntax: "DATEDIF(start, end, unit)",
  description:
    'How many whole units lie from one date to another, in "s", "min", "h", "d", "w", "m" (months) or "y"; negative when the end is earlier. For days with a fraction, subtract the dates: end - start.',
  minArgs: 3,
  maxArgs: 3,
  call: ([start, end, unit]) => {
    const a = toDate(start!);
    const b = toDate(end!);
    const u = toUnit(unit!);
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (isError(u)) return u;
    return unitsBetween(a, b, u);
  },
} satisfies FormulaFunction;
