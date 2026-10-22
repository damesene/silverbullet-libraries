import { isError } from "../values.ts";
import { booleans } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "OR",
  syntax: "OR(logical1, [logical2], …)",
  description: "TRUE if any of the values is true.",
  category: "logic",
  example: "=OR([@qty] = 0, [@price] = 0)",
  minArgs: 1,
  call: (args) => {
    const bs = booleans(args);
    return isError(bs) ? bs : bs.some(Boolean);
  },
} satisfies FormulaFunction;
