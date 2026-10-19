import { formatNumber, notANumber, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

export default {
  name: "number",
  syntax: "#number, #number-2",
  description: "A number with thousands separators: the decimal places after the dash (default: as written).",
  param: /^\d$/,
  aliases: { int: "0", float: "2" },
  check: notANumber,
  format: (text, param, locale) => {
    const digits = param === undefined ? undefined : Number(param);
    return formatNumber(numberOf(text)!, locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits ?? 10,
    });
  },
} satisfies ColumnType;
