import { isError, toNumber } from "../values.ts";
import type { FormulaFunction } from "./types.ts";

export default {
  name: "ROUND",
  syntax: "ROUND(number, [digits])",
  description: "Rounds to the given number of decimal places (default 0), halves away from zero.",
  minArgs: 1,
  maxArgs: 2,
  call: ([number, digits = 0]) => {
    const n = toNumber(number!);
    const d = toNumber(digits);
    if (isError(n)) return n;
    if (isError(d)) return d;
    const factor = 10 ** Math.trunc(d);
    // (1 + EPSILON): 1.005 is stored as 1.00499…, and still rounds to 1.01
    return (Math.sign(n) * Math.round(Math.abs(n) * factor * (1 + Number.EPSILON))) / factor;
  },
} satisfies FormulaFunction;
