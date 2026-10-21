import { toWhole } from "../arguments.ts";
import { FormulaError, isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "MID",
  syntax: "MID(text, start, count)",
  description: "The given count of characters of the text, from the start (1 is the first character).",
  category: "text",
  example: "=MID([@code], 4, 2)",
  minArgs: 3,
  maxArgs: 3,
  call: ([text, start, count]) => {
    const t = toText(text!);
    const s = toWhole(start!);
    const c = toWhole(count!);
    if (isError(t)) return t;
    if (isError(s)) return s;
    if (isError(c)) return c;
    if (s < 1) return new FormulaError("#VALUE!", `the start is ${s}: the first character is 1`);
    if (c < 0) return new FormulaError("#VALUE!", "the count is less than 0");
    return t.substr(s - 1, c);
  },
} satisfies FormulaFunction;
