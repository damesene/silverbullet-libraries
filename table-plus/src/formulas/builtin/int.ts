import { asTime, DAY_SECONDS, isError, single, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "INT",
  syntax: "INT(number)",
  description: "The number rounded down to a whole number; for a time, its whole days (INT(SUM(A1:A2)) of 14:00 and 20:00 is 1).",
  minArgs: 1,
  maxArgs: 1,
  call: ([number]) => {
    // A time by its seconds: 24:00 is 1 day exactly, not 0.99999…
    const time = asTime(single(number!));
    if (time) return Math.floor(time.seconds / DAY_SECONDS);
    const n = toNumber(number!);
    return isError(n) ? n : Math.floor(n);
  },
} satisfies FormulaFunction;
