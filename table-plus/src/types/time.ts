import { DAY_SECONDS, formatClock, parseClock } from "../formula/values.ts";
import { lineIcon } from "../icons.ts";
import { numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

/**
 * The seconds since midnight of a time of day, read as formulas read times
 * (14:30, 14:30:15), or of a fraction of a day as spreadsheets keep times (0.5
 * is 12:00); undefined for anything else, a length of time (40:00) included
 */
function secondsOf(text: string): number | undefined {
  const seconds = parseClock(text)?.seconds ?? fractionSeconds(text);
  return seconds !== undefined && seconds >= 0 && seconds < DAY_SECONDS ? seconds : undefined;
}

function fractionSeconds(text: string): number | undefined {
  const fraction = numberOf(text);
  return fraction === undefined ? undefined : Math.round(fraction * DAY_SECONDS);
}

export default {
  name: "time",
  syntax: "#time",
  description: "A time of day written as 14:30 or 14:30:15 (or as a fraction of a day, 0.5 is 12:00), shown as the locale writes times.",
  icon: lineIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  check: (text) => (secondsOf(text) !== undefined ? undefined : `"${text}" is not a time written as 14:30`),
  format: (text, _param, locale) => {
    const seconds = secondsOf(text)!;
    // The time on a clock without time zone: formatted as UTC, it is shown as written
    return new Intl.DateTimeFormat(locale, { timeStyle: seconds % 60 ? "medium" : "short", timeZone: "UTC" }).format(
      new Date(seconds * 1000),
    );
  },
  // The time written in full (09:05, 12:00 for 0.5): sorts by the time, and filters and copies still find 9:05
  sortValue: (text) => formatClock(secondsOf(text)!),
} satisfies ColumnType;
