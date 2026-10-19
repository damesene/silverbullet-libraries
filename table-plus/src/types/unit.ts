import { lineIcon } from "../icons.ts";
import { formatNumber, notANumber, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

export default {
  name: "unit",
  syntax: "#unit-kg",
  description: "A number with a unit: the unit after the dash.",
  icon: lineIcon('<path d="M3 16 16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>'),
  param: /^[^\s#]+$/,
  aliases: { kg: "kg", km: "km", watt: "W" },
  check: (text, param) => (param === undefined ? "#unit needs a unit, e.g. #unit-kg" : notANumber(text)),
  format: (text, param, locale) => `${formatNumber(numberOf(text)!, locale, { maximumFractionDigits: 10 })} ${param}`,
} satisfies ColumnType;
