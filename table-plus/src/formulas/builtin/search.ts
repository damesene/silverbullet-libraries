import { wildcardRegExp } from "../criteria.ts";
import { toWhole } from "../arguments.ts";
import { FormulaError, isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "SEARCH",
  syntax: "SEARCH(find_text, within_text, [start])",
  description: "Where find_text first is in within_text, from the start (default 1, the first character), ignoring case; * any text, ? one character, ~ before either for itself. Not found: #VALUE!.",
  category: "text",
  example: '=SEARCH("-", [@code])',
  minArgs: 2,
  maxArgs: 3,
  call: ([find, within, start = 1]) => {
    const f = toText(find!);
    const w = toText(within!);
    const s = toWhole(start);
    if (isError(f)) return f;
    if (isError(w)) return w;
    if (isError(s)) return s;
    if (s < 1 || s > w.length + 1) return new FormulaError("#VALUE!", `the start is ${s}: the text has ${w.length} characters`);
    const m = wildcardRegExp(f, false).exec(w.slice(s - 1));
    return m ? s + m.index : new FormulaError("#VALUE!", `"${f}" is not in "${w}"`);
  },
} satisfies FormulaFunction;
