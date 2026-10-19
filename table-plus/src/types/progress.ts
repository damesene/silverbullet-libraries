import { formatNumber, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

const most = (param: string | undefined) => Number(param ?? 100);

export default {
  name: "progress",
  syntax: "#progress, #progress-10",
  description: "Progress as a bar: a number from 0 to the maximum after the dash (default 100).",
  param: /^[1-9]\d*$/,
  aliases: { gauge: "100" },
  check: (text, param) => {
    const n = numberOf(text);
    return n !== undefined && n >= 0 && n <= most(param) ? undefined : `"${text}" is not a number from 0 to ${most(param)}`;
  },
  format: (text, param, locale) => {
    const share = numberOf(text)! / most(param);
    const filled = Math.round(share * 10);
    return `${"▰".repeat(filled)}${"▱".repeat(10 - filled)} ${formatNumber(share, locale, { style: "percent" })}`;
  },
} satisfies ColumnType;
