import { asTime, DAY_SECONDS, FormulaError, isError, single, TimeValue, toNumber } from "../values.ts";
import { tidy } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "MOD",
  syntax: "MOD(number, divisor)",
  description: "The remainder after dividing the number by the divisor, with the divisor's sign. Of a time, a time: MOD([@end] - [@start], 1) is the length of a shift past midnight.",
  category: "math",
  example: "=MOD(ROW(), 2)",
  minArgs: 2,
  maxArgs: 2,
  call: ([number, divisor]) => {
    const n = toNumber(number!);
    const d = toNumber(divisor!);
    if (isError(n)) return n;
    if (isError(d)) return d;
    if (d === 0) return new FormulaError("#DIV/0!", "division by zero");
    // Past 2^53 a quotient has no whole digits left to tell the remainder by
    if (Math.abs(n / d) >= 2 ** 53) return new FormulaError("#NUM!", "the number is too large for the divisor");
    const result = tidy(n - d * Math.floor(tidy(n / d)), n);
    return asTime(single(number!)) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
  },
} satisfies FormulaFunction;
