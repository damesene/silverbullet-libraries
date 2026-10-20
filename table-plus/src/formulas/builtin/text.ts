import { parseDate } from "../dates.ts";
import { asTime, DAY_SECONDS, FormulaError, isError, single, toText, type Scalar } from "../values.ts";
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

const pad = (n: number, length: number) => String(n).padStart(Math.min(length, 2), "0");

export default {
  name: "TEXT",
  syntax: "TEXT(value, format)",
  description:
    'A date or a time as text in a format: TEXT(A1, "dd.mm.yyyy hh:mm"), TEXT(A1, "[h]:mm") for all the hours of a length of time. Codes: yyyy, yy, m, mm, d, dd, h, hh, m, mm (minutes), s, ss, [h], [m], [s]; text in quotes as it is.',
  minArgs: 2,
  maxArgs: 2,
  call: ([value, format]) => {
    const v: Scalar = single(value!);
    const f = toText(format!);
    if (isError(v)) return v;
    if (isError(f)) return f;
    const parts = parseFormat(f);
    if (isError(parts)) return parts;
    // TEXT(A1, "0.00") would give "0.00" for any value: number formats are not supported
    if (!parts.some((part) => "code" in part)) {
      return new FormulaError("#VALUE!", `"${f}" has no date or time code: yyyy, mm, dd, hh, mm, ss, [h], [m] or [s]`);
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

