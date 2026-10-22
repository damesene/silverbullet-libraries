import { formatNumber, FormulaError, isError, numbers, toNumber } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "RANK",
  syntax: "RANK(number, ref, [order])",
  description: "The number's place among the numbers of ref: 1 for the largest (order 0, the default), or for the smallest (order 1); equal numbers share a place.",
  category: "math",
  example: "=RANK([@score], [score])",
  minArgs: 2,
  maxArgs: 3,
  call: ([number, ref, order = 0]) => {
    const n = toNumber(number!);
    const ns = numbers([ref!]);
    const ascending = toNumber(order);
    if (isError(n)) return n;
    if (isError(ns)) return ns;
    if (isError(ascending)) return ascending;
    if (!ns.includes(n)) return new FormulaError("#N/A", `${formatNumber(n)} is not among the numbers ranked`);
    return 1 + ns.filter((x) => (ascending ? x < n : x > n)).length;
  },
} satisfies FormulaFunction;
