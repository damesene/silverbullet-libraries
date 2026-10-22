import { isError, single } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "IFERROR",
  syntax: "IFERROR(value, value_if_error)",
  description: "The value, or the second value if the first is an error.",
  category: "logic",
  example: "=IFERROR([@price] / [@qty], 0)",
  minArgs: 2,
  maxArgs: 2,
  call: ([value, ifError]) => {
    const v = single(value!);
    return isError(v) ? single(ifError!) : v;
  },
} satisfies FormulaFunction;
