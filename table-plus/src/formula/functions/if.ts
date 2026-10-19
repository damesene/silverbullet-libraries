import { isError, single, toBoolean } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "IF",
  syntax: "IF(condition, value_if_true, [value_if_false])",
  description: "One value if the condition is true, another if it is false (default FALSE).",
  minArgs: 2,
  maxArgs: 3,
  call: ([condition, ifTrue, ifFalse = false]) => {
    const c = toBoolean(condition!);
    if (isError(c)) return c;
    return single(c ? ifTrue! : ifFalse);
  },
} satisfies FormulaFunction;
