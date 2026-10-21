import { cellsOf } from "../criteria.ts";
import { firstError, FormulaError, numbers } from "../values.ts";
import type { FormulaFunction } from "../function.ts";

export default {
  name: "SUMPRODUCT",
  syntax: "SUMPRODUCT(array1, [array2], …)",
  description: "Multiplies the ranges' cells in the same places and adds the products; a cell that is not a number counts as 0.",
  category: "math",
  example: "=SUMPRODUCT([qty], [price])",
  minArgs: 1,
  call: (args) => {
    const error = firstError(args);
    if (error) return error;
    const arrays = args.map(cellsOf);
    const size = arrays[0]!.length;
    const other = arrays.find((cells) => cells.length !== size);
    if (other) return new FormulaError("#VALUE!", `the ranges are not the same size (${size} and ${other.length} cells)`);
    let total = 0;
    for (let at = 0; at < size; at++) {
      total += arrays.reduce((product, cells) => product * ((numbers([[cells[at]!]]) as number[])[0] ?? 0), 1);
    }
    return total;
  },
} satisfies FormulaFunction;
