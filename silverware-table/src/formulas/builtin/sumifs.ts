import { matchingCells } from "../criteria.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";
import sum from "./sum.ts";

export default {
  name: "SUMIFS",
  syntax: "SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)",
  description:
    'Adds the cells of sum_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty).',
  category: "math",
  example: '=SUMIFS([amount], [status], "open", [due], "<"&TODAY())',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values!, conditions);
    return isError(cells) ? cells : sum.call([cells]);
  },
} satisfies FormulaFunction;
