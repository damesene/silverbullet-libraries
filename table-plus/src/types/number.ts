import { lineIcon } from "../icons.ts";
import { formatNumber, notANumber, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

export default {
  name: "number",
  syntax: "#number, #number-2",
  description: "A number with thousands separators: the decimal places after the dash (default: as written).",
  icon: lineIcon('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>'),
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
