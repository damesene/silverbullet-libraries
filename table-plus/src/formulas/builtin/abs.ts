import { isError, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "ABS",
  syntax: "ABS(number)",
  description: "The number without its sign.",
  minArgs: 1,
  maxArgs: 1,
  call: ([number]) => {
    const n = toNumber(number!);
    return isError(n) ? n : Math.abs(n);
  },
} satisfies FormulaFunction;
