import type { Scalar, Value } from "../values.ts";

/**
 * A function formulas can call; one per file in this folder, listed in index.ts.
 * `syntax` and `description` are shown while typing a formula and must also be
 * listed in the Formulas section of table-plus.md (a test checks that).
 */
export type FormulaFunction = {
  // The name as written in formulas, in upper case (formulas may use any case)
  readonly name: string;
  readonly syntax: string;
  readonly description: string;
  // How many arguments it takes; no maxArgs: any number
  readonly minArgs: number;
  readonly maxArgs?: number;
  /**
   * Gets the evaluated arguments: a range or a cell reference (A1:B3, [Qty], A1)
   * is the list of its cells' values, an empty cell is null, an error is a
   * FormulaError value. Returns one value. The helpers in values.ts convert
   * arguments the way spreadsheets do and pass errors on.
   *
   * `context` is where the formula is calculated (ROW() needs it); most
   * functions leave it out. A result depends on the arguments and the context
   * only, nothing else.
   */
  readonly call: (args: readonly Value[], context: FunctionContext) => Scalar;
};

/** Where a formula is calculated */
export type FunctionContext = {
  // Its cell's row as A1 counts rows: 1 is the first row under the header
  readonly row: number;
  // Its cell's column: 1 is the first (A)
  readonly column: number;
};
