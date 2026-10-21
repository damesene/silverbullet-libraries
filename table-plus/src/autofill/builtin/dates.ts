import { addUnits, type DateTime, formatDate, parseDate } from "../../formulas/dates.ts";
import type { Series } from "../series.ts";

const DAY = 86_400_000;

/** The month a date is in, counted from year 0 (so months between two dates are a difference) */
function monthOf(date: DateTime): number {
  const d = new Date(date.ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Dates as formulas write them (2025-11-06, 2025-11-06 14:30): one date goes
 * on day by day; several on the same day of the month go on by their months
 * (2025-01-31, 2025-02-28 → 2025-03-31: the first date's day, or the month's
 * last); others by the same step between them (a week, an hour).
 */
export default {
  name: "dates",
  match: (values) => {
    const dates = values.map(parseDate);
    if (dates.length === 0 || !dates.every((d) => d)) return undefined;
    const all = dates as DateTime[];
    const first = all[0]!;
    const text = (date: DateTime) => {
      const written = formatDate(date);
      return typeof written === "string" ? written : "";
    };
    if (all.length === 1) return (i) => text({ ms: first.ms + i * DAY, time: first.time });
    // By months: every date on the first's day (or its month's last, when shorter), the months one step apart
    const months = monthOf(all[1]!) - monthOf(first);
    const byMonths = months !== 0 && all.every((d, i) => d.ms === addUnits(first, i * months, "m").ms);
    if (byMonths) return (i) => text(addUnits(first, i * months, "m"));
    const step = all[1]!.ms - first.ms;
    if (step === 0 || !all.every((d, i) => d.ms === first.ms + i * step)) return undefined;
    return (i) => text({ ms: first.ms + i * step, time: all.some((d) => d.time) });
  },
} satisfies Series;
