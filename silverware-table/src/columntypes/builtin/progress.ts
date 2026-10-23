import { lineIcon } from "../../icons.ts";
import { formatNumber, numberOf } from "../format.ts";
import { columnType } from "../type.ts";

export default columnType({
  name: "progress",
  syntax: "#progress, #progress-10",
  description: "Progress as a bar: a number from 0 to the maximum after the dash (default 100).",
  icon: lineIcon('<rect x="2" y="8" width="20" height="8" rx="4"/><path d="M6 12h5"/>'),
  params: { max: { kind: "number", integer: true, min: 1, default: 100 } },
  aliases: { gauge: "100" },
  check: (text, { max }) => {
    const n = numberOf(text);
    return n !== undefined && n >= 0 && n <= max ? undefined : `"${text}" is not a number from 0 to ${max}`;
  },
  format: (text, { max }, locale) => {
    const share = numberOf(text)! / max;
    const filled = Math.round(share * 10);
    return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${formatNumber(share, locale, { style: "percent" })}`;
  },
});
