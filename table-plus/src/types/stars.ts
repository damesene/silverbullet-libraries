import { numberOf } from "./helpers.ts";
import type { ColumnType } from "./types.ts";

const most = (param: string | undefined) => Number(param ?? 5);

export default {
  name: "stars",
  syntax: "#stars, #stars-10",
  description: "A rating as stars: a whole number from 0 to the most stars after the dash (default 5).",
  param: /^[1-9]\d?$/,
  aliases: { evaluation: "5" },
  check: (text, param) => {
    const n = numberOf(text);
    return n !== undefined && Number.isInteger(n) && n >= 0 && n <= most(param)
      ? undefined
      : `"${text}" is not a whole number from 0 to ${most(param)}`;
  },
  format: (text, param) => {
    const n = numberOf(text)!;
    return "★".repeat(n) + "☆".repeat(most(param) - n);
  },
  choices: (param) =>
    Array.from({ length: most(param) + 1 }, (_, n) => ({
      value: String(n),
      label: `${n} ${"★".repeat(n)}${"☆".repeat(most(param) - n)}`,
    })),
} satisfies ColumnType;
