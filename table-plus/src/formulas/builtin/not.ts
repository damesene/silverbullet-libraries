import { isError, toBoolean } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "NOT",
  syntax: "NOT(logical)",
  description: "TRUE if the value is false, FALSE if it is true.",
  category: "logic",
  example: "=NOT([@done])",
  minArgs: 1,
  maxArgs: 1,
  call: ([value]) => {
    const b = toBoolean(value!);
    return isError(b) ? b : !b;
  },
} satisfies FormulaFunction;
