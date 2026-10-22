import { toWhole } from "../arguments.ts";
import { FormulaError, isError, toText } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "SUBSTITUTE",
  syntax: "SUBSTITUTE(text, old_text, new_text, [instance])",
  description: "The text with old_text (matching case) replaced by new_text: everywhere, or only its instance-th occurrence.",
  category: "text",
  example: '=SUBSTITUTE([@phone], " ", "")',
  minArgs: 3,
  maxArgs: 4,
  call: ([text, oldText, newText, instance]) => {
    const t = toText(text!);
    const from = toText(oldText!);
    const to = toText(newText!);
    if (isError(t)) return t;
    if (isError(from)) return from;
    if (isError(to)) return to;
    if (instance === undefined || instance === null) return from === "" ? t : t.split(from).join(to);
    const n = toWhole(instance);
    if (isError(n)) return n;
    if (n < 1) return new FormulaError("#VALUE!", `the instance is ${n}: the first is 1`);
    if (from === "") return t;
    let at = -1;
    for (let i = 0; i < n; i++) {
      at = t.indexOf(from, at + (i ? from.length : 1));
      if (at < 0) return t;
    }
    return t.slice(0, at) + to + t.slice(at + from.length);
  },
} satisfies FormulaFunction;
