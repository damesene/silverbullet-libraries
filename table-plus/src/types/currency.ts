import { formatNumber, notANumber, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

export default {
  name: "currency",
  syntax: "#currency, #currency-usd",
  description: "An amount of money: the currency's three-letter code after the dash (default EUR).",
  param: /^[a-z]{3}$/i,
  aliases: { euro: "eur", eur: "eur", usd: "usd", czk: "czk", gbp: "gbp" },
  check: notANumber,
  format: (text, param, locale) =>
    formatNumber(numberOf(text)!, locale, { style: "currency", currency: (param ?? "eur").toUpperCase() }),
} satisfies ColumnType;
