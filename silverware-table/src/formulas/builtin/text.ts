import { parseDate } from "../dates.ts";
import { tidy } from "../arguments.ts";
import { asTime, DAY_SECONDS, FormulaError, isError, single, toNumber, toText, type Scalar } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

// A part of a format: text as it is, or a code for a part of the value
type Part = { readonly text: string } | { readonly code: "y" | "m" | "d" | "h" | "min" | "s" | "[h]" | "[m]" | "[s]"; readonly length: number };

/**
 * A format's parts. Codes: yyyy / yy, m / mm (month), d / dd, h / hh, m / mm
 * (minutes, right after an hour or before seconds), s / ss, and [h] [m] [s]
 * for all the hours (minutes, seconds) of a length of time. Text in double
 * quotes, and a character after \, is written as it is; so is any other
 * character.
 */
function parseFormat(format: string): Part[] | FormulaError {
  const parts: Part[] = [];
  let i = 0;
  while (i < format.length) {
    const c = format[i]!;
    if (c === '"') {
      const close = format.indexOf('"', i + 1);
      if (close < 0) return new FormulaError("#VALUE!", "a text in the format is missing its closing quote");
      parts.push({ text: format.slice(i + 1, close) });
      i = close + 1;
    } else if (c === "\\") {
      parts.push({ text: format[i + 1] ?? "" });
      i += 2;
    } else if (c === "[") {
      const close = format.indexOf("]", i);
      const inner = close < 0 ? "" : format.slice(i + 1, close).toLowerCase();
      const unit = /^(h+|m+|s+)$/.exec(inner)?.[1]?.[0];
      if (!unit) return new FormulaError("#VALUE!", `"${format.slice(i, close + 1 || undefined)}" is not a code of TEXT: [h], [m] or [s]`);
      parts.push({ code: `[${unit}]` as "[h]" | "[m]" | "[s]", length: inner.length });
      i = close + 1;
    } else if (/[ymdhs]/i.test(c)) {
      let j = i;
      while (j < format.length && format[j]!.toLowerCase() === c.toLowerCase()) j++;
      parts.push({ code: c.toLowerCase() as "y" | "m" | "d" | "h" | "s", length: j - i });
      i = j;
    } else {
      parts.push({ text: c });
      i++;
    }
  }
  // m is minutes right after an hour code or right before a seconds code, else the month
  const codes = parts.filter((p): p is Extract<Part, { code: string }> => "code" in p);
  return parts.map((part) => {
    if (!("code" in part) || part.code !== "m") return part;
    const at = codes.indexOf(part);
    const before = codes[at - 1]?.code;
    const after = codes[at + 1]?.code;
    return before === "h" || before === "[h]" || after === "s" || after === "[s]" ? { code: "min", length: part.length } : part;
  });
}

type Piece = { readonly text?: string; readonly code?: string };

/** A format's characters: those of its text (in double quotes, after \) as text, the others as codes */
function piecesOf(format: string): Piece[] | undefined {
  const pieces: Piece[] = [];
  for (let i = 0; i < format.length; i++) {
    const c = format[i]!;
    if (c === '"') {
      const close = format.indexOf('"', i + 1);
      if (close < 0) return undefined;
      pieces.push({ text: format.slice(i + 1, close) });
      i = close;
    } else if (c === "\\") pieces.push({ text: format[++i] ?? "" });
    else pieces.push({ code: c });
  }
  return pieces;
}

const isDigit = (p: Piece | undefined) => p?.code === "0" || p?.code === "#";

/** One section of a number format, writing a number without its sign; a section without digits is its text */
function numberSection(pieces: readonly Piece[], format: string): ((n: number) => string) | FormulaError {
  const text = (from: number, to: number) => pieces.slice(from, to).map((p) => p.text ?? p.code).join("");
  const first = pieces.findIndex(isDigit);
  if (first < 0) return () => text(0, pieces.length);
  // The number: the digits, commas and points around the first digit
  const inNumber = (p: Piece | undefined) => isDigit(p) || p?.code === "," || p?.code === ".";
  let start = first;
  while (inNumber(pieces[start - 1])) start--;
  let end = first;
  while (inNumber(pieces[end + 1])) end++;
  if (pieces.some((p, at) => isDigit(p) && (at < start || at > end))) {
    return new FormulaError("#VALUE!", `"${format}" has more than one number: TEXT writes one`);
  }
  // Commas after the last digit (of the whole part or the decimals) divide by a thousand each ("0," writes 1234567 as 1235)
  const fullSpec = pieces.slice(start, end + 1).map((p) => p.code).join("");
  const spec = fullSpec.replace(/,+$/, "");
  const [wholeSpec = "", decimals, extra] = spec.split(".");
  if (extra !== undefined) return new FormulaError("#VALUE!", `"${format}" has more than one decimal point`);
  const whole = wholeSpec.replace(/,+$/, "");
  const thousands = fullSpec.length - spec.length + wholeSpec.length - whole.length;
  const minWhole = whole.split("0").length - 1;
  const grouped = whole.includes(",");
  const minDecimals = (decimals ?? "").split("0").length - 1;
  const maxDecimals = (decimals ?? "").replace(/,/g, "").length;
  const percent = pieces.filter((p) => p.code === "%").length;
  const before = text(0, start);
  const after = text(end + 1, pieces.length);
  return (n) => {
    const value = (Math.abs(n) * 100 ** percent) / 1000 ** thousands;
    const scale = 10 ** maxDecimals;
    const rounded = Math.round(tidy(value * scale)) / scale;
    let [int = "", dec = ""] = rounded.toFixed(maxDecimals).split(".");
    dec = dec.replace(/0+$/, "").padEnd(minDecimals, "0");
    if (int === "0" && minWhole === 0) int = "";
    int = int.padStart(minWhole, "0");
    if (grouped) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${before}${decimals === undefined ? int : `${int}.${dec}`}${after}`;
  };
}

/**
 * A number format: one number of 0 (a digit always written) and # (a digit
 * written where it counts), with , in its whole part for thousands separators
 * (after its last digit: divided by a thousand) and . before its decimals; %
 * shows the number as a percentage. Text around it (in double quotes, after
 * \, or any other character) is written as it is. Sections apart by ; are for
 * positive numbers;negative ones (without their minus);zero. Undefined for a
 * format with no 0 or # outside its text: a date's or a time's.
 */
function numberFormat(format: string): ((n: number) => string) | FormulaError | undefined {
  const pieces = piecesOf(format);
  if (!pieces?.some(isDigit)) return undefined;
  const sections: Piece[][] = [[]];
  for (const piece of pieces) {
    if (piece.code === ";") sections.push([]);
    else sections.at(-1)!.push(piece);
  }
  if (sections.length > 3) return new FormulaError("#VALUE!", `"${format}" has more than three sections`);
  const writers: ((n: number) => string)[] = [];
  for (const section of sections) {
    const writer = numberSection(section, format);
    if (isError(writer)) return writer;
    writers.push(writer);
  }
  const [positive, negative, zero] = writers as [(n: number) => string, ((n: number) => string)?, ((n: number) => string)?];
  return (n) => {
    if (n < 0 && negative) return negative(n);
    if (n === 0 && zero) return zero(n);
    const written = positive(n);
    // One section: a minus before a negative number, unless it is written as 0
    return n < 0 && /[1-9]/.test(written) ? `-${written}` : written;
  };
}

const pad = (n: number, length: number) => String(n).padStart(Math.min(length, 2), "0");

export default {
  name: "TEXT",
  syntax: "TEXT(value, format)",
  description:
    'A number, a date or a time as text in a format: TEXT(A1, "#,##0.00"), TEXT(A1, "0%"), TEXT(A1, "dd.mm.yyyy hh:mm"), TEXT(A1, "[h]:mm") for all the hours of a length of time. Number codes: 0 (a digit), # (a digit where it counts), , (thousands), . (decimals), %, and ; between formats of positive;negative;zero numbers ("0.00;(0.00)"); date codes: yyyy, yy, m, mm, d, dd, h, hh, m, mm (minutes), s, ss, [h], [m], [s]; text in quotes as it is.',
  category: "text",
  example: '=TEXT([@due], "dd.mm.yyyy")',
  minArgs: 2,
  maxArgs: 2,
  call: ([value, format]) => {
    const v: Scalar = single(value!);
    const f = toText(format!);
    if (isError(v)) return v;
    if (isError(f)) return f;
    const number = numberFormat(f);
    if (number !== undefined) {
      if (isError(number)) return number;
      const n = toNumber(v);
      return isError(n) ? n : number(n);
    }
    const parts = parseFormat(f);
    if (isError(parts)) return parts;
    // Without a code, TEXT(A1, "abc") would give the format for any value
    if (!parts.some((part) => "code" in part)) {
      return new FormulaError("#VALUE!", `"${f}" has no number, date or time code: 0, #, yyyy, mm, dd, hh, mm, ss, [h], [m] or [s]`);
    }
    // A date (with its time of day), or a length of time in seconds
    const date = typeof v === "string" ? parseDate(v) : undefined;
    const time = date ? undefined : asTime(v);
    const seconds = time ? time.seconds : typeof v === "number" && !date ? Math.round(v * DAY_SECONDS) : undefined;
    if (!date && seconds === undefined) return new FormulaError("#VALUE!", `"${toText(v)}" is not a date or a time`);
    const d = date && new Date(date.ms);
    // Of a length of time, h m s are the time of day it reaches (34:00: 10 h), as in spreadsheets
    const ofDay = d
      ? d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()
      : ((seconds! % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
    let out = "";
    for (const part of parts) {
      if ("text" in part) {
        out += part.text;
        continue;
      }
      const { code, length } = part;
      if ((code === "y" || code === "m" || code === "d") && !d) {
        return new FormulaError("#VALUE!", "a time has no year, month or day: INT gives its whole days");
      }
      if ((code === "[h]" || code === "[m]" || code === "[s]") && d) {
        return new FormulaError("#VALUE!", `${code} is for a length of time, not a date: use hh, mm or ss`);
      }
      if ((code === "m" || code === "d") && length > 2) return new FormulaError("#VALUE!", "names of months and days are not supported");
      switch (code) {
        case "y":
          out += length <= 2 ? pad(d!.getUTCFullYear() % 100, 2) : String(d!.getUTCFullYear());
          break;
        case "m":
          out += pad(d!.getUTCMonth() + 1, length);
          break;
        case "d":
          out += pad(d!.getUTCDate(), length);
          break;
        case "h":
          out += pad(Math.floor(ofDay / 3600), length);
          break;
        case "min":
          out += pad(Math.floor(ofDay / 60) % 60, length);
          break;
        case "s":
          out += pad(ofDay % 60, length);
          break;
        case "[h]":
          out += pad(Math.trunc(seconds! / 3600), length);
          break;
        case "[m]":
          out += pad(Math.trunc(seconds! / 60), length);
          break;
        case "[s]":
          out += pad(seconds!, length);
          break;
      }
    }
    return out;
  },
} satisfies FormulaFunction;

