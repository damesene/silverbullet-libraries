import { lineIcon } from "../icons.ts";
import type { ColumnType } from "./types.ts";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** The date (and time) written, in local time, or undefined */
function dateOf(text: string): { date: Date; time: boolean } | undefined {
  const m = DATE_RE.exec(text.trim());
  if (!m) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map((part) => (part === undefined ? undefined : Number(part)));
  const date = new Date(y!, mo! - 1, d!, h ?? 0, mi ?? 0);
  // Not 2025-02-30
  return date.getMonth() === mo! - 1 && date.getDate() === d ? { date, time: h !== undefined } : undefined;
}

export default {
  name: "date",
  syntax: "#date, #date-long",
  description: "A date written as 2025-11-06 (with a time: 2025-11-06 14:30), shown as the locale writes it: short, medium (default) or long after the dash.",
  icon: lineIcon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  param: /^(short|medium|long)$/i,
  check: (text) => (dateOf(text) ? undefined : `"${text}" is not a date written as 2025-11-06`),
  format: (text, param, locale) => {
    const { date, time } = dateOf(text)!;
    const dateStyle = (param?.toLowerCase() ?? "medium") as "short" | "medium" | "long";
    return new Intl.DateTimeFormat(locale, { dateStyle, ...(time ? { timeStyle: "short" as const } : {}) }).format(date);
  },
} satisfies ColumnType;
