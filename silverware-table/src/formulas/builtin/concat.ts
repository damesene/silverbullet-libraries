import { firstError, flatten, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "CONCAT",
  syntax: "CONCAT(text1, [text2], …)",
  description: "Joins the values into one text.",
  category: "text",
  example: '=CONCAT([@first], " ", [@last])',
  minArgs: 1,
  call: (args) => {
    const error = firstError(args);
    if (error) return error;
    return flatten(args)
      .map((v) => toText(v) as string)
      .join("");
  },
} satisfies FormulaFunction;
