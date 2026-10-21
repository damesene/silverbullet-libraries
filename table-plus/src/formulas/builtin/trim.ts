import { isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "TRIM",
  syntax: "TRIM(text)",
  description: "The text without spaces at its start and end, and with one space where there were several.",
  category: "text",
  example: '=TRIM([@name])',
  minArgs: 1,
  maxArgs: 1,
  call: ([text]) => {
    const t = toText(text!);
    return isError(t) ? t : t.replace(/^ +| +$/g, "").replace(/ {2,}/g, " ");
  },
} satisfies FormulaFunction;
