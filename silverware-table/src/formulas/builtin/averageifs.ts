import { matchingCells } from "../criteria.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";
import average from "./average.ts";

export default {
  name: "AVERAGEIFS",
  syntax: "AVERAGEIFS(average_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)",
  description:
    'The arithmetic mean of the cells of average_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: #DIV/0!.',
  category: "math",
  example: '=AVERAGEIFS([price], [fruit], "app*")',
  minArgs: 3,
  call: ([values, ...conditions]) => {
    const cells = matchingCells(values!, conditions);
    return isError(cells) ? cells : average.call([cells]);
  },
} satisfies FormulaFunction;
