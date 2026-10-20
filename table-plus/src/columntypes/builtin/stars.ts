import { lineIcon } from "../../icons.ts";
import { numberOf } from "../format.ts";
import { columnType } from "../type.ts";

export default columnType({
  name: "stars",
  syntax: "#stars, #stars-10",
  description: "A rating as stars: a whole number from 0 to the most stars after the dash (default 5).",
  icon: lineIcon('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'),
  params: { max: { kind: "number", integer: true, min: 1, max: 99, default: 5 } },
  aliases: { evaluation: "5" },
  check: (text, { max }) => {
    const n = numberOf(text);
    return n !== undefined && Number.isInteger(n) && n >= 0 && n <= max ? undefined : `"${text}" is not a whole number from 0 to ${max}`;
  },
  format: (text, { max }) => {
    const n = numberOf(text)!;
    return "★".repeat(n) + "☆".repeat(max - n);
  },
  choices: ({ max }) =>
    Array.from({ length: max + 1 }, (_, n) => ({
      value: String(n),
      label: `${n} ${"★".repeat(n)}${"☆".repeat(max - n)}`,
    })),
});
