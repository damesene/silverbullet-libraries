// A cell's value as Excel keeps it: a cell's text (as Silverware Table reads it in
// formulas: 12,50 €, 15 %, 2025-11-06, 14:30, TRUE) as a number with its
// number format, a logical value, an error, or text. Dates and times become
// Excel's serial numbers (days since 1899-12-30), shown in their format, so
// they are dates in Excel whatever its language.
import { ERROR_CODES, parseClock, parseDate } from "../formulas/index.ts";
import { asNumber } from "../view.ts";

// Number formats a value is shown with in Excel (their codes: xlsx.ts)
export type NumberFormat = "date" | "dateTime" | "dateTimeSeconds" | "time" | "timeSeconds" | "percent" | "percent1" | "percent2";

export type ExcelValue =
  | { readonly kind: "empty" }
  | { readonly kind: "number"; readonly value: number; readonly format?: NumberFormat }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "error"; readonly value: string }
  | { readonly kind: "text"; readonly value: string };

const DAY = 86_400_000;
// 1900-03-01 as a count of days from 1970: before it Excel counts a 1900-02-29 that was not
const EXCEL_LEAP_BUG = -25_508;
// Excel's serial number of 1970-01-01
const EPOCH = 25_569;

/** A date (milliseconds on a clock without time zone, as formulas count them) as Excel's serial number; undefined before 1900-03-01 */
export function serialOf(ms: number): number | undefined {
  const days = ms / DAY;
  return days < EXCEL_LEAP_BUG ? undefined : days + EPOCH;
}

// A number as Excel keeps it without losing anything written: no leading zeros, no +, no unit; thousands apart by a
// space, decimals after a point or a comma, a currency sign before or after it, or a % after it
const PLAIN_NUMBER_RE = /^(?:\p{Sc}\s*)?-?(?:0|[1-9]\d{0,2}(?:[  ]\d{3})+|[1-9]\d*)(?:[.,]\d+)?(?:\s*[\p{Sc}%])?$/u;

/** A cell's text as Excel's value */
export function excelValue(text: string): ExcelValue {
  const t = text.trim();
  if (t === "") return { kind: "empty" };
  const upper = t.toUpperCase();
  if (upper === "TRUE" || upper === "FALSE") return { kind: "boolean", value: upper === "TRUE" };
  if ((ERROR_CODES as readonly string[]).includes(t)) return { kind: "error", value: t === "#CYCLE!" || t === "#ERROR!" ? "#VALUE!" : t };
  const date = parseDate(t);
  if (date) {
    const serial = serialOf(date.ms);
    if (serial === undefined) return { kind: "text", value: t };
    const seconds = /:\d{2}:\d{2}$/.test(t);
    return { kind: "number", value: serial, format: date.time ? (seconds ? "dateTimeSeconds" : "dateTime") : "date" };
  }
  const time = parseClock(t);
  // A negative time Excel cannot show (#### in its date system of 1900): its text
  if (time) return time.seconds < 0 ? { kind: "text", value: t } : { kind: "number", value: time.seconds / 86_400, format: /:\d{2}:\d{2}$/.test(t) ? "timeSeconds" : "time" };
  // Only a number written as one: nothing of the text is lost in Excel's number (007, +420 777 123 456, 3 kg, 10115 Berlin stay text)
  const n = PLAIN_NUMBER_RE.test(t) && t.replace(/\D/g, "").replace(/^0+/, "").length <= 15 ? asNumber(t) : undefined;
  if (n === undefined) return { kind: "text", value: t };
  // 15 % is 0.15 shown as a percentage, with as many decimals as written
  if (t.endsWith("%")) {
    const decimals = /[.,](\d+)\s*%$/.exec(t)?.[1]?.length ?? 0;
    return { kind: "number", value: n / 100, format: decimals === 0 ? "percent" : decimals === 1 ? "percent1" : "percent2" };
  }
  return { kind: "number", value: n };
}
