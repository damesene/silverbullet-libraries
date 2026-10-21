import { addUnits, type DateTime, toDate, toUnit, unitsBetween } from "../dates.ts";
import { FormulaError, isError, single } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

const DAY = 86_400_000;

/**
 * Spreadsheets' units that leave out the larger ones: "md" the days past the
 * whole months, "ym" the months past the whole years, "yd" the days past the
 * whole years. Counted by the calendar as DATEADD adds months.
 */
function partial(a: DateTime, b: DateTime, unit: "md" | "ym" | "yd"): number {
  if (unit === "ym") return unitsBetween(a, b, "m") % 12;
  const months = unit === "md" ? unitsBetween(a, b, "m") : unitsBetween(a, b, "y") * 12;
  return Math.floor((b.ms - addUnits(a, months, "m").ms) / DAY);
}

export default {
  name: "DATEDIF",
  syntax: "DATEDIF(start, end, unit)",
  description:
    'How many whole units lie from one date to another, in "s", "min", "h", "d", "w", "m" (months) or "y"; negative when the end is earlier. "md", "ym" and "yd" leave out the larger units: the days past the whole months, the months past the whole years, the days past the whole years. For days with a fraction, subtract the dates: end - start.',
  category: "date",
  example: '=DATEDIF([@born], TODAY(), "y")',
  minArgs: 3,
  maxArgs: 3,
  call: ([start, end, unit]) => {
    const a = toDate(start!);
    const b = toDate(end!);
    if (isError(a)) return a;
    if (isError(b)) return b;
    const u = single(unit!);
    const name = typeof u === "string" ? u.trim().toLowerCase() : undefined;
    if (name === "md" || name === "ym" || name === "yd") {
      return b.ms < a.ms ? new FormulaError("#NUM!", `"${name}" needs the end after the start`) : partial(a, b, name);
    }
    const whole = toUnit(unit!);
    return isError(whole) ? whole : unitsBetween(a, b, whole);
  },
} satisfies FormulaFunction;
