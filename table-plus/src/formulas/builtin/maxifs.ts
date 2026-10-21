import { matchingCells } from "../criteria.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";
import max from "./max.ts";

export default {
  name: "MAXIFS",
  syntax: "MAXIFS(max_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)",
  description:
    'The largest of the cells of max_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: 0.',
  category: "math",
  example: '=MAXIFS([score], [team], "red")',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values!, conditions);
    return isError(cells) ? cells : max.call([cells]);
  },
} satisfies FormulaFunction;
