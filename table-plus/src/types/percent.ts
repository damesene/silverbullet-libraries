import { lineIcon } from "../icons.ts";
import { formatNumber, notANumber, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

/** A fraction (0.15) or, written with %, a percentage (15 %) */
function fraction(text: string): number {
  const n = numberOf(text)!;
  return text.includes("%") ? n / 100 : n;
}

export default {
  name: "percent",
  syntax: "#percent, #percent-1",
  description: "A fraction as a percentage, 0.15 is 15 % (15 % stays 15 %): the decimal places after the dash (default 0).",
  icon: lineIcon('<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>'),
  param: /^\d$/,
  check: notANumber,
  format: (text, param, locale) => {
    const digits = Number(param ?? 0);
    return formatNumber(fraction(text), locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits });
  },
  sortValue: (text) => String(fraction(text)),
} satisfies ColumnType;
