import { isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "PROPER",
  syntax: "PROPER(text)",
  description: "The text with each word's first letter capital and the others small.",
  category: "text",
  example: '=PROPER([@name])',
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text!);
    return isError(t) ? t : t.replace(/\p{L}+/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  },
} satisfies FormulaFunction;
