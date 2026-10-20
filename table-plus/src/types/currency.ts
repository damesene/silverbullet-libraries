import { lineIcon } from "../icons.ts";
import { notANumber, numberFormat, numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

/**
 * The language a currency is written in at home, for where its sign goes: a
 * currency code starts with its country's (USD: US, CZK: CZ). The euro has no
 * country, and most of the euro area writes the sign after the amount.
 */
const homes = new Map<string, string>();

function homeOf(code: string): string {
  if (code === "EUR") return "de";
  let home = homes.get(code);
  if (home === undefined) {
    try {
      home = new Intl.Locale("und", { region: code.slice(0, 2) }).maximize().baseName;
    } catch {
      home = "en";
    }
    homes.set(code, home);
  }
  return home;
}

/**
 * An amount with the currency's sign where its home puts it ($12.99, 12.99 Kč),
 * the number itself written as `locale` writes numbers
 */
function formatMoney(n: number, code: string, locale: string | undefined): string {
  const options = { style: "currency", currency: code, currencyDisplay: "narrowSymbol" } as const;
  const own = numberFormat(locale, options).formatToParts(n);
  const home = numberFormat(homeOf(code), options).formatToParts(n);
  const symbol = own.find((p) => p.type === "currency")?.value ?? code;
  const sign = own.filter((p) => p.type === "minusSign" || p.type === "plusSign").map((p) => p.value).join("");
  const digits = own
    .filter((p) => !["currency", "minusSign", "plusSign", "literal"].includes(p.type))
    .map((p) => p.value)
    .join("");
  const symbolFirst = home.findIndex((p) => p.type === "currency") < home.findIndex((p) => p.type === "integer");
  // The space between them, as at home (a no-break space: they stay on one line)
  const gap = home.find((p) => p.type === "literal" && /^\s+$/.test(p.value))?.value ?? "";
  return symbolFirst ? `${sign}${symbol}${gap}${digits}` : `${sign}${digits}${gap}${symbol}`;
}

export default {
  name: "currency",
  syntax: "#currency, #currency-usd",
  description:
    "An amount of money: the currency's three-letter code after the dash (default EUR). Its sign goes where the currency's country writes it: $12.99, 12.99 €, 12.99 Kč.",
  icon: lineIcon('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  param: /^[a-z]{3}$/i,
  aliases: { euro: "eur", eur: "eur", usd: "usd", czk: "czk", gbp: "gbp" },
  check: notANumber,
  format: (text, param, locale) => formatMoney(numberOf(text)!, (param ?? "eur").toUpperCase(), locale),
} satisfies ColumnType;
