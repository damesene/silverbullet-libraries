import { isError, toNumber } from "../values.ts";
import { tidy } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "ROUNDDOWN",
  syntax: "ROUNDDOWN(number, [digits])",
  description: "Rounds toward zero to the given number of decimal places (default 0; negative: tens, hundreds…).",
  category: "math",
  example: "=ROUNDDOWN([@price] * 0.85, 2)",
  minArgs: 1,
  maxArgs: 2,
  call: ([number, digits = 0]) => {
    const n = toNumber(number!);
    const d = toNumber(digits);
    if (isError(n)) return n;
    if (isError(d)) return d;
    const factor = 10 ** Math.trunc(d);
    return tidy((Math.sign(n) * Math.floor(tidy(Math.abs(n) * factor))) / factor);
  },
} satisfies FormulaFunction;
