import { isError, single } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "IFERROR",
  syntax: "IFERROR(value, value_if_error)",
  description: "The value, or the second value if the first is an error.",
  minArgs: 2,
  maxArgs: 2,
  call: ([value, ifError]) => {
    const v = single(value!);
    return isError(v) ? single(ifError!) : v;
  },
} satisfies FormulaFunction;
