import { lineIcon } from "../../icons.ts";
import { formatNumber, notANumber, numberOf } from "../format.ts";
import { columnType } from "../type.ts";

export default columnType({
  name: "unit",
  syntax: "#unit-kg",
  description: "A number with a unit: the unit after the dash.",
  icon: lineIcon('<path d="M3 16 16 3l5 5L8 21z"/><path d="M7 12l2 2M10 9l2 2M13 6l2 2"/>'),
  params: { unit: { kind: "text" } },
  aliases: { kg: "kg", km: "km", watt: "W" },
  check: (text, { unit }) => (unit === undefined ? "#unit needs a unit, e.g. #unit-kg" : notANumber(text)),
  format: (text, { unit }, locale) => `${formatNumber(numberOf(text)!, locale, { maximumFractionDigits: 10 })} ${unit}`,
});
