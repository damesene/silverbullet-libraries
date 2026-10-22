import { asTime, DAY_SECONDS, isError, single, TimeValue, toNumber } from "../values.ts";
import { tidy } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "CEILING",
  syntax: "CEILING(number, [significance])",
  description: "Rounds up to a multiple of the significance (default 1). Of a time, a time: CEILING(\"9:07\", \"0:15\") is 09:15.",
  category: "math",
  example: '=CEILING([@price], 0.05)',
  minArgs: 1,
  maxArgs: 2,
  call: ([number, significance = 1]) => {
    const n = toNumber(number!);
    const s = toNumber(significance);
    if (isError(n)) return n;
    if (isError(s)) return s;
    const step = Math.abs(s);
    const result = step === 0 ? 0 : tidy(Math.ceil(tidy(n / step)) * step);
    return asTime(single(number!)) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
  },
} satisfies FormulaFunction;
