// Dates in formulas. A date is text, written as cells write it, `2025-11-06`
// or with a time `2025-11-06 14:30` (`14:30:15` with seconds): formulas read
// it and write their results the same way, so the markdown stays readable and
// the #date column type shows them. A date and time is taken as written, with
// no time zone (as spreadsheets do): adding an hour is an hour on the clock.
import { asTime, DAY_SECONDS, FormulaError, isError, single, type Scalar, toText, type Value } from "./values.ts";

const DAY = 86_400_000;

/** The time of day of a count of milliseconds, before 1970 too */
function timeOfDay(ms: number): number {
  return ((ms % DAY) + DAY) % DAY;
}

/** Milliseconds of a date and time in UTC; unlike Date.UTC, years 0 to 99 are not taken as 1900 to 1999 */
function utc(year: number, month: number, day: number, ms = 0): number {
  const date = new Date(Date.UTC(2000, month, day) + ms);
  date.setUTCFullYear(date.getUTCFullYear() - 2000 + year);
  return date.getTime();
}

/** A date and time as a count of milliseconds on a clock without time zone, and whether it has a time */
export type DateTime = { readonly ms: number; readonly time: boolean };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** The date a text is, or undefined (2025-02-30 is none) */
export function parseDate(text: string): DateTime | undefined {
  const m = DATE_RE.exec(text.trim());
  if (!m) return undefined;
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map((part) => (part === undefined ? undefined : Number(part)));
  if (h! > 23 || mi! > 59 || s! > 59) return undefined;
  const ms = utc(y!, mo! - 1, d!, ((h * 60 + mi) * 60 + s) * 1000);
  const date = new Date(ms);
  if (date.getUTCMonth() !== mo! - 1 || date.getUTCDate() !== d) return undefined;
  return { ms, time: m[4] !== undefined };
}

/**
 * A date as cells write it: with its time when it has one, seconds only when
 * they are not 0. A date outside the years 0 to 9999 cannot be written so.
 */
export function formatDate({ ms, time }: DateTime): string | FormulaError {
  const year = new Date(ms).getUTCFullYear();
  if (!(year >= 0 && year <= 9999)) return new FormulaError("#NUM!", "the date is not in the years 0 to 9999");
  const iso = new Date(ms).toISOString();
  const date = iso.slice(0, 10);
  if (!time && timeOfDay(ms) === 0) return date;
  const seconds = iso.slice(17, 19);
  return `${date} ${iso.slice(11, 16)}${seconds === "00" ? "" : `:${seconds}`}`;
}

/** An argument as a time of day for HOUR, MINUTE and SECOND: a date with its time, or a time */
export function toClock(value: Value): DateTime | FormulaError {
  const v = single(value);
  const time = asTime(v);
  if (time) return { ms: time.seconds * 1000, time: true };
  // A fraction of a day, as spreadsheets keep times (0.5 is 12:00)
  return typeof v === "number" ? { ms: Math.round(v * DAY_SECONDS) * 1000, time: true } : toDate(value);
}

/** The current date (and time) on this computer's clock */
export function now(time: boolean): DateTime {
  const d = new Date();
  const ms = time
    ? Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())
    : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return { ms, time };
}

/** An argument as a date; text that is not one is #VALUE! */
export function toDate(value: Value): DateTime | FormulaError {
  const v = single(value);
  if (isError(v)) return v;
  const date = typeof v === "string" ? parseDate(v) : undefined;
  return date ?? new FormulaError("#VALUE!", `${v === null ? "an empty cell" : `"${toText(v) as string}"`} is not a date written as 2025-11-06`);
}

export type Unit = "s" | "min" | "h" | "d" | "w" | "m" | "y";

// The names a unit can be written with, in any case
const UNIT_NAMES: Readonly<Record<string, Unit>> = {
  s: "s", sec: "s", second: "s", seconds: "s",
  min: "min", minute: "min", minutes: "min",
  h: "h", hour: "h", hours: "h",
  d: "d", day: "d", days: "d",
  w: "w", week: "w", weeks: "w",
  m: "m", month: "m", months: "m",
  y: "y", year: "y", years: "y",
};

export const UNITS_HELP = `"s", "min", "h", "d", "w", "m" (months) or "y"`;

/** An argument as a unit of time */
export function toUnit(value: Value): Unit | FormulaError {
  const v = single(value);
  if (isError(v)) return v;
  const unit = typeof v === "string" ? UNIT_NAMES[v.trim().toLowerCase()] : undefined;
  return unit ?? new FormulaError("#VALUE!", `"${toText(v) as string}" is not a unit of time: ${UNITS_HELP}`);
}

const UNIT_MS: Readonly<Partial<Record<Unit, number>>> = { s: 1000, min: 60_000, h: 3_600_000, d: DAY, w: 7 * DAY };

/**
 * The date plus an amount of a unit (minus, for a negative amount). Months and
 * years go by the calendar and keep the day, or take the month's last one
 * (January 31 and a month is February 28). Seconds, minutes and hours give a
 * date with a time.
 */
export function addUnits(date: DateTime, amount: number, unit: Unit): DateTime {
  const ms = UNIT_MS[unit];
  if (ms !== undefined) {
    const added = date.ms + Math.round(amount * ms);
    return { ms: added, time: date.time || timeOfDay(added) !== 0 };
  }
  const months = Math.trunc(amount) * (unit === "y" ? 12 : 1);
  const d = new Date(date.ms);
  const target = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  const lastDay = new Date(utc(year, month + 1, 1) - DAY).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return { ms: utc(year, month, day, timeOfDay(date.ms)), time: date.time };
}

/**
 * How many whole units lie from one date to another; negative when the second
 * is earlier. Months and years count by the calendar, as addUnits adds them:
 * from January 31 to February 28 is a month, to February 27 none.
 */
export function unitsBetween(from: DateTime, to: DateTime, unit: Unit): number {
  const ms = UNIT_MS[unit];
  if (ms !== undefined) return Math.trunc((to.ms - from.ms) / ms);
  const a = new Date(from.ms);
  const b = new Date(to.ms);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  // A month not yet complete does not count
  if (months > 0 && addUnits(from, months, "m").ms > to.ms) months--;
  if (months < 0 && addUnits(from, months, "m").ms < to.ms) months++;
  return unit === "y" ? Math.trunc(months / 12) : months;
}

/**
 * `date + days`, `days + date`, `date - days` and `date - date` (the days
 * between them), as spreadsheets count: a fraction of a day is a time, an
 * empty cell 0 days. A time of day (`14:30`, as TIME gives) adds as that much
 * of a day: `DATE(2025, 11, 6) + TIME(14, 30, 0)`. Without a date among the
 * operands: undefined, for the numbers to handle.
 */
export function dateArithmetic(op: "+" | "-", left: Scalar, right: Scalar): Scalar | undefined {
  const a = typeof left === "string" ? parseDate(left) : undefined;
  const b = typeof right === "string" ? parseDate(right) : undefined;
  if (!a && !b) return undefined;
  if (a && b) {
    return op === "-" ? (a.ms - b.ms) / DAY : new FormulaError("#VALUE!", "two dates cannot be added: subtract them for the days between");
  }
  if (b && op === "-") return new FormulaError("#VALUE!", "a date cannot be subtracted from a number");
  const other = a ? right : left;
  const time = asTime(other);
  const days = other === null ? 0 : typeof other === "number" ? other : time ? time.seconds / DAY_SECONDS : undefined;
  if (days === undefined) return new FormulaError("#VALUE!", `"${typeof other === "string" ? other : String(other)}" is not a number of days or a time to add to a date`);
  return formatDate(addUnits((a ?? b)!, op === "-" ? -days : days, "d"));
}

/** A date's part in the calendar */
export function partOf(date: DateTime, part: "year" | "month" | "day" | "hour" | "minute" | "second" | "weekday"): number {
  const d = new Date(date.ms);
  switch (part) {
    case "year":
      return d.getUTCFullYear();
    case "month":
      return d.getUTCMonth() + 1;
    case "day":
      return d.getUTCDate();
    case "hour":
      return d.getUTCHours();
    case "minute":
      return d.getUTCMinutes();
    case "second":
      return d.getUTCSeconds();
    case "weekday":
      return d.getUTCDay();
  }
}
