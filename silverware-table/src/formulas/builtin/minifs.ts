import { matchingCells } from "../criteria.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";
import min from "./min.ts";

export default {
  name: "MINIFS",
  syntax: "MINIFS(min_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)",
  description:
    'The smallest of the cells of min_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: 0.',
  category: "math",
  example: '=MINIFS([price], [stock], ">0")',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values!, conditions);
    return isError(cells) ? cells : min.call([cells]);
  },
} satisfies FormulaFunction;
