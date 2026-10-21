import { firstError, flatten, isError, toBoolean, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "TEXTJOIN",
  syntax: "TEXTJOIN(delimiter, ignore_empty, text1, [text2], …)",
  description: 'Joins the values (ranges too) into one text with the delimiter between them; with ignore_empty TRUE, empty ones are left out: TEXTJOIN(", ", TRUE, [name]).',
  category: "text",
  example: '=TEXTJOIN(", ", TRUE, [tag])',
  minArgs: 3,
  call: ([delimiter, ignoreEmpty, ...texts]) => {
    const error = firstError(texts);
    if (error) return error;
    const d = toText(delimiter!);
    const ignore = toBoolean(ignoreEmpty!);
    if (isError(d)) return d;
    if (isError(ignore)) return ignore;
    return flatten(texts)
      .map((v) => toText(v) as string)
      .filter((t) => !ignore || t !== "")
      .join(d);
  },
} satisfies FormulaFunction;
