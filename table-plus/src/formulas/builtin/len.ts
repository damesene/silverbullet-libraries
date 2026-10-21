import { isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "LEN",
  syntax: "LEN(text)",
  description: "How many characters the text has.",
  category: "text",
  example: '=LEN([@code])',
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text!);
    return isError(t) ? t : t.length;
  },
} satisfies FormulaFunction;
