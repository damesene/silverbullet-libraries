// What several column types share
import { asNumber } from "../view.ts";

/** A cell's text as a number, read as for sorting (`12,99`, `1 000`, `15 %`) */
export function numberOf(text: string): number | undefined {
  return asNumber(text);
}

export function notANumber(text: string): string | undefined {
  return numberOf(text) === undefined ? `"${text}" is not a number` : undefined;
}

// Formatters made once per locale and options: making one is slow, and a column formats every cell
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function numberFormat(locale: string | undefined, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) numberFormats.set(key, (format = new Intl.NumberFormat(locale, options)));
  return format;
}

export function dateTimeFormat(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) dateFormats.set(key, (format = new Intl.DateTimeFormat(locale, options)));
  return format;
}

export function formatNumber(n: number, locale: string | undefined, options: Intl.NumberFormatOptions = {}): string {
  return numberFormat(locale, options).format(n);
}
