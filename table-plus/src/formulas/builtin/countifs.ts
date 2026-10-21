import { matchingPlaces } from "../criteria.ts";
import { isError } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "COUNTIFS",
  syntax: "COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], …)",
  description:
    'How many places of the ranges have cells that meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty).',
  category: "math",
  example: '=COUNTIFS([status], "open", [qty], ">10")',
  minArgs: 2,
  call: (conditions) => {
    const places = matchingPlaces(conditions, undefined);
    return isError(places) ? places : places.length;
  },
} satisfies FormulaFunction;
