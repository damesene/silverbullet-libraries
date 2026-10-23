// Formulas in table cells. `=SUM(A1:A3)` typed into a cell is stored as its
// result followed by a `<meta formulas.f='…'>` tag that holds the formula:
//
//   | Total | 19 <meta formulas.f='=SUM(B1:B3)'> |
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
// in its metadata row (<meta core.table core.name='prices'>), is referred to
// by its name and "!": prices!B2, prices!A1:B3, prices![Price].
//
// This is the formulas' API for the rest of Silverware Table; the parts are the
// files beside it, the functions in builtin/ (only functions: what a formula
// can call), custom functions in custom.ts, which exist in registry.ts.
export { type CellNameAt, cellsByName, type FormulaCells, formulaCount, forFormulas, hasFormulas, isErrorText, isFormulaInput, type RowName, rowsByName, type StoredFormula } from "./cell.ts";

/** What the formulas module offers other modules (ModelHost.offered("formulas")): its cells as the formulas read them */
export type FormulasOffer = { readonly cells: import("./cell.ts").FormulaCells };
export { type Area, areaText, callsCustomFunctions, type Fixed, cellName, cellNamesOf, columnLetters, columnRangeText, columnRefText, type NamedReference, namedReferences, type Reference, referencedColumn, referencedColumnId, references, referredPages, referredTableNames, type TableRef, withColumnKeys } from "./references.ts";
export { autofixFormula, type FormulaFix, qualifyCellNames } from "./autofix.ts";
export { type Calculation, formulaErrors, type NamedCell, recalculate, type TableSource, totalRows } from "./evaluate.ts";
export { type Node as FormulaNode, parse as parseFormula } from "./parser.ts";
export { parseDate, toUnit, type Unit } from "./dates.ts";
export { ERROR_CODES, FormulaError, parseClock, type Scalar } from "./values.ts";
export { withAreasWritten, type WrittenArea, writtenArea } from "./frame.ts";
export { REF_ERROR } from "./tokens.ts";
export { calculatedFormula, filledFormula, followTable, type Following, formulasAfterEdit, shiftReferences, withCalculatedCells, withoutFormulas } from "./edits.ts";
export { argumentSpan, type FormulaChoice, type FormulaChoices, choiceText, cycleFixed, findFunctions, type FormulaHelp, formulaChoices, formulaHelp, nameTyped, needsOperator, type PointedSpan, REFERENCE_HELP, referenceSlot } from "./help.ts";
export { FUNCTION_CATEGORIES, type FormulaFunction, type FunctionCategory } from "./function.ts";
export { functionNamed, isCustomFunction } from "./registry.ts";
export type { IndexMap } from "../ops.ts";
