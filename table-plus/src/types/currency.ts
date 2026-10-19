import { lineIcon } from "../icons.ts";
import { formatNumber, notANumber, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

export default {
  name: "currency",
  syntax: "#currency, #currency-usd",
  description: "An amount of money: the currency's three-letter code after the dash (default EUR).",
  icon: lineIcon('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  param: /^[a-z]{3}$/i,
  aliases: { euro: "eur", eur: "eur", usd: "usd", czk: "czk", gbp: "gbp" },
  check: notANumber,
  format: (text, param, locale) =>
    formatNumber(numberOf(text)!, locale, { style: "currency", currency: (param ?? "eur").toUpperCase() }),
} satisfies ColumnType;
