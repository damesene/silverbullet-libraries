import { parseDate } from "../formulas/dates.ts";
import { lineIcon } from "../icons.ts";
import { dateTimeFormat } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

export default {
  name: "date",
  syntax: "#date, #date-long",
  description: "A date written as 2025-11-06 (with a time: 2025-11-06 14:30), shown as the locale writes it: short, medium (default) or long after the dash.",
  icon: lineIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  param: /^(short|medium|long)$/i,
  // Read as formulas read dates
  check: (text) => (parseDate(text) ? undefined : `"${text}" is not a date written as 2025-11-06`),
  format: (text, param, locale) => {
    const { ms, time } = parseDate(text)!;
    const dateStyle = (param?.toLowerCase() ?? "medium") as "short" | "medium" | "long";
    // A time with seconds shows them (NOW() writes them)
    const timeStyle = ms % 60_000 !== 0 ? ("medium" as const) : ("short" as const);
    // Without a time zone, as formulas take dates: shown in UTC, it shows as written
    return dateTimeFormat(locale, { dateStyle, ...(time ? { timeStyle } : {}), timeZone: "UTC" }).format(new Date(ms));
  },
} satisfies ColumnType;
