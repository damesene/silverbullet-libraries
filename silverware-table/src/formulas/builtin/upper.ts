import { isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "UPPER",
  syntax: "UPPER(text)",
  description: "The text in capital letters.",
  category: "text",
  example: '=UPPER([@code])',
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text!);
    return isError(t) ? t : t.toUpperCase();
  },
} satisfies FormulaFunction;
