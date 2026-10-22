import { asTime, DAY_SECONDS, FormulaError, isError, single, TimeValue, toNumber } from "../values.ts";
import { tidy } from "../arguments.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "MROUND",
  syntax: "MROUND(number, multiple)",
  description: 'Rounds to the nearest multiple, halves away from zero. Of a time, a time: MROUND("9:08", "0:15") is 09:15.',
  category: "math",
  example: "=MROUND([@price], 0.05)",
  minArgs: 2,
  maxArgs: 2,
  call: ([number, multiple]) => {
    const n = toNumber(number!);
    const m = toNumber(multiple!);
    if (isError(n)) return n;
    if (isError(m)) return m;
    if (n * m < 0) return new FormulaError("#NUM!", "the number and the multiple have different signs");
    const q = m === 0 ? 0 : tidy(n / m);
    const result = tidy(Math.sign(q) * Math.round(Math.abs(q)) * m);
    return asTime(single(number!)) ? new TimeValue(Math.round(result * DAY_SECONDS)) : result;
  },
} satisfies FormulaFunction;
