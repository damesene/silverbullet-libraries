import type { FormulaFunction } from "../function.ts";

export default {
  name: "ROW",
  syntax: "ROW()",
  description: "The row of the cell the formula is in, counted in the table as written: 1 is the first row under the header. =ROW() in every row of a column numbers the rows.",
  minArgs: 0,
  maxArgs: 0,
  call: (_args, { row }) => row,
} satisfies FormulaFunction;
