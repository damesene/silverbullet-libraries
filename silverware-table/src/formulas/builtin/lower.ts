import { isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "LOWER",
  syntax: "LOWER(text)",
  description: "The text in small letters.",
  category: "text",
  example: '=LOWER([@email])',
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text!);
    return isError(t) ? t : t.toLowerCase();
  },
} satisfies FormulaFunction;
