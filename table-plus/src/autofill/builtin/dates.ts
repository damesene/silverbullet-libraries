import { addUnits, type DateTime, formatDate, parseDate } from "../../formulas/dates.ts";
import type { Series } from "../series.ts";

const DAY = 86_400_000;

// A date as Czech (and much of Europe) writes it: 6.11.2025, 06. 11. 2025
const DOTTED_RE = /^(\d{1,2})\.(\s?)(\d{1,2})\.(\s?)(\d{4})$/;

/** How a series' dates are written: as formulas write them (2025-11-06), or with dots as typed */
type Written = { readonly read: (text: string) => DateTime | undefined; readonly write: (date: DateTime) => string };

const ISO: Written = {
  read: parseDate,
  // A date past the years 0 to 9999 cannot be written: shown as the error a formula gives
  write: (date) => {
    const written = formatDate(date);
    return typeof written === "string" ? written : written.code;
  },
};

/** Dates written with dots, as the first one is: its days and months padded or not, its spaces */
function dotted(first: string): Written | undefined {
  const m = DOTTED_RE.exec(first.trim());
  if (!m) return undefined;
  const pad = (n: number, as: string) => String(n).padStart(as.length, "0");
  return {
    read: (text) => {
      const d = DOTTED_RE.exec(text.trim());
      return d ? parseDate(`${d[5]}-${d[3]!.padStart(2, "0")}-${d[1]!.padStart(2, "0")}`) : undefined;
    },
    write: (date) => {
      const d = new Date(date.ms);
      return `${pad(d.getUTCDate(), m[1]!)}.${m[2]}${pad(d.getUTCMonth() + 1, m[3]!)}.${m[4]}${d.getUTCFullYear()}`;
    },
  };
}

/** The month a date is in, counted from year 0 (so months between two dates are a difference) */
function monthOf(date: DateTime): number {
  const d = new Date(date.ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Dates as formulas write them (2025-11-06, 2025-11-06 14:30), or with dots
 * (6.11.2025, written as the first one is): one date goes on day by day;
 * several on the same day of the month go on by their months (2025-01-31,
 * 2025-02-28 → 2025-03-31: the first date's day, or the month's last); others
 * by the same step between them (a week, an hour).
 */
export default {
  name: "dates",
  match: (values) => {
    if (values.length === 0) return undefined;
    const written = dotted(values[0]!) ?? ISO;
    const dates = values.map((v) => written.read(v));
    if (!dates.every((d) => d)) return undefined;
    const all = dates as DateTime[];
    const first = all[0]!;
    const text = written.write;
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
