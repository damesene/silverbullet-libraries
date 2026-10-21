// A formula as Excel writes it, for a table written at A1 of a sheet (its
// header in row 1, so A1 of a formula, the first row under the header, is
// Excel's A2). References to the table's own cells become Excel's: A1, A1:B3,
// [qty] (the column's rows without the table's total rows: one run of them),
// [@qty] (the cell in the formula's row), the table's named cells and rows.
// Anything that cannot be written so (another table or page, a function
// Excel has no form of) makes the formula its cell's value, with the reason.
import { type Table } from "../markdown.ts";
import { namedCells, namedRows } from "../names.ts";
import {
  columnLetters,
  type FormulaNode,
  FormulaError,
  functionNamed,
  isCustomFunction,
  parseFormula,
  referencedColumn,
  totalRows,
} from "../formulas/index.ts";
import { type ExcelTemplates, excelCall, hasTemplate } from "./functions.ts";

// The error values Excel has (ours #CYCLE! and #ERROR! are not among them)
export const EXCEL_ERRORS: ReadonlySet<string> = new Set(["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"]);

export type ExcelFormula =
  // `array`: an operator works on a range cell by cell ([qty] * [price]), which an Excel before 365 calculates only in an array formula
  | { readonly text: string; readonly array: boolean }
  | { readonly reason: string };

class NotInExcel {
  constructor(readonly reason: string) {}
}

/** A body cell (rows from 0) as Excel names it, the header being row 1 */
export function excelCell(row: number, column: number): string {
  return `${columnLetters(column)}${row + 2}`;
}

type Written = { readonly text: string; readonly range: boolean };

/** The formula (with its =) in the body cell `row`, `column` of `table`, as Excel writes it (without =) */
export function excelFormula(formula: string, table: Table, row: number, column: number, templates: ExcelTemplates = {}): ExcelFormula {
  const tree = parseFormula(formula);
  if (tree instanceof FormulaError) return { reason: `it cannot be read: ${tree.detail}` };
  const headers = table.rows[0]?.cells ?? [];
  const bodyRows = table.rows.length - 1;
  let array = false;
  let totals: ReadonlySet<number> | undefined;

  const columnOf = (name: string) => referencedColumn(headers, name);

  const write = (node: FormulaNode): Written => {
    switch (node.kind) {
      case "literal": {
        const v = node.value;
        if (v === null) return { text: "", range: false };
        if (typeof v === "number") return { text: String(v), range: false };
        if (typeof v === "boolean") return { text: v ? "TRUE" : "FALSE", range: false };
        if (v instanceof FormulaError) return { text: EXCEL_ERRORS.has(v.code) ? v.code : "#VALUE!", range: false };
        if (typeof v === "string") return { text: `"${v.replaceAll('"', '""')}"`, range: false };
        throw new NotInExcel("it has a value Excel cannot write");
      }
      case "area": {
        if (node.table) throw new NotInExcel(`it refers to the table ${node.table.name}`);
        const { top, left, bottom, right } = node.area;
        if (bottom >= bodyRows || right >= headers.length) return { text: "#REF!", range: false };
        const one = top === bottom && left === right;
        return { text: one ? excelCell(top, left) : `${excelCell(top, left)}:${excelCell(bottom, right)}`, range: node.range && !one };
      }
      case "column": {
        if (node.table) throw new NotInExcel(`it refers to the table ${node.table.name}`);
        const c = columnOf(node.name);
        if (c === undefined) return { text: "#REF!", range: false };
        if (node.thisRow) return { text: excelCell(row, c), range: false };
        // The column's rows without the total rows, as [qty] takes them: one run in Excel
        totals ??= totalRows(table);
        const rows = Array.from({ length: bodyRows }, (_, r) => r).filter((r) => !totals!.has(r));
        if (rows.length === 0) throw new NotInExcel(`[${node.name}] has no rows`);
        const first = rows[0]!;
        const last = rows[rows.length - 1]!;
        if (last - first + 1 !== rows.length) throw new NotInExcel(`[${node.name}] has total rows between its rows`);
        return first === last ? { text: excelCell(first, c), range: false } : { text: `${excelCell(first, c)}:${excelCell(last, c)}`, range: true };
      }
      case "named": {
        if (node.page !== undefined) throw new NotInExcel(`it refers to ${node.name} on another page`);
        const found = namedCells(table).get(node.name.toLowerCase());
        if (!found) throw new NotInExcel(`${node.name} is not a cell of this table`);
        return { text: excelCell(found.row - 1, found.column), range: false };
      }
      case "rowCell": {
        if (node.table) throw new NotInExcel(`it refers to the table ${node.table.name}`);
        const r = namedRows(table).get(node.row.toLowerCase());
        const c = columnOf(node.column);
        if (r === undefined || c === undefined) return { text: "#REF!", range: false };
        return { text: excelCell(r - 1, c), range: false };
      }
      case "unary": {
        const arg = write(node.arg);
        if (arg.range) array = true;
        const inner = wrapped(node.arg, arg);
        return { text: node.op === "%" ? `${inner}%` : `${node.op}${inner}`, range: arg.range };
      }
      case "binary": {
        const left = write(node.left);
        const right = write(node.right);
        if (left.range || right.range) array = true;
        return { text: `${wrapped(node.left, left)}${node.op}${wrapped(node.right, right)}`, range: left.range || right.range };
      }
      case "call": {
        // A wrong number of arguments: #VALUE! in Table Plus, a formula Excel refuses to open (the whole file)
        const f = functionNamed(node.name);
        const count = node.args.length;
        if (f && !hasTemplate(node.name, templates) && (count < f.minArgs || (f.maxArgs !== undefined && count > f.maxArgs))) {
          throw new NotInExcel(`${node.name} has a wrong number of arguments`);
        }
        const args = node.args.map((arg) => ({
          text: write(arg).text,
          ...(arg.kind === "binary" || arg.kind === "unary" ? { operation: true } : {}),
          ...(arg.kind === "literal" && arg.value !== null && !(arg.value instanceof FormulaError) ? { literal: arg.value } : {}),
        }));
        const written = excelCall(node.name, args, templates, isCustomFunction(node.name));
        if (typeof written !== "string") throw new NotInExcel(written.reason);
        return { text: written, range: false };
      }
    }
  };

  // An operand that is itself an operation, in parentheses: Excel reads it as formulas do whatever the order of operators
  const wrapped = (node: FormulaNode, written: Written) => (node.kind === "binary" || node.kind === "unary" ? `(${written.text})` : written.text);

  try {
    const written = write(tree);
    // A range left as the result (=[qty]*2): #VALUE! in Table Plus, the first cell's in Excel
    if (written.range) return { reason: "its result is a range, not one value" };
    return { text: written.text, array };
  } catch (e) {
    if (e instanceof NotInExcel) return { reason: e.reason };
    throw e;
  }
}
