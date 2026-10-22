// Formulas in table cells. `=SUM(A1:A3)` typed into a cell is stored as its
// result followed by a `<meta f='…'>` tag that holds the formula:
//
//   | Total | 19 <meta f='=SUM(B1:B3)'> |
//
// Browsers do not show <meta> and other renderers drop it, so the result is
// what every reader of the markdown sees. Silverware Table writes the results again
// whenever it edits the table.
//
// References: A1 is the first body row (the header is not counted), A1:B3 a
// range, [Qty] the column named Qty (without the cells whose formulas refer to
// that whole column, such as a total below it), [@Qty] the Qty cell of the
// formula's own row. Columns are named as columns.ts names them: of several
// columns named Qty, [Qty:2] is the second. Another table of the page, named
// in its metadata row (<meta name='prices'>), is referred to by its name and
// "!": prices!B2, prices!A1:B3, prices![Price].
//
// This is the formulas' API for the rest of Silverware Table; the parts are the
// files beside it, the functions in builtin/ (only functions: what a formula
// can call), custom functions in custom.ts, which exist in registry.ts.
export { formulaCell, formulaCount, formulaOf, isErrorText, isFormulaInput, type StoredFormula } from "./cell.ts";
export { type Area, areaText, callsCustomFunctions, cellName, cellNamesOf, columnLetters, columnRefText, namedReferences, type Reference, referencedColumn, referencedColumnId, references, referredCellNames, referredPages, referredTableNames, type TableRef, withColumnKeys } from "./references.ts";
export { autofixFormula, type FormulaFix } from "./autofix.ts";
export { formulaErrors, type NamedCell, recalculate, type TableSource, totalRows } from "./evaluate.ts";
export { type Node as FormulaNode, parse as parseFormula } from "./parser.ts";
export { parseDate, toUnit, type Unit } from "./dates.ts";
export { ERROR_CODES, FormulaError, parseClock, type Scalar } from "./values.ts";
export { calculatedFormula, filledFormula, followTable, formulasAfterEdit, shiftReferences, withCalculatedCells, withoutFormulas } from "./edits.ts";
export { argumentSpan, cycleFixed, findFunctions, type FormulaHelp, formulaHelp, functionChoices, type FunctionChoices, nameTyped, needsOperator, type PointedSpan, REFERENCE_HELP, referenceSlot } from "./help.ts";
export { FUNCTION_CATEGORIES, type FormulaFunction, type FunctionCategory } from "./function.ts";
export { functionNamed, isCustomFunction } from "./registry.ts";
export type { IndexMap } from "../ops.ts";
