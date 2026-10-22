// Fixing a formula typed with a common slip (a missing ")"), saying what was
// fixed; and names of cells written as before they were their table's.
import type { Table } from "../markdown.ts";
import { namedCells } from "../names.ts";
import type { TableSource } from "./evaluate.ts";
import { parse } from "./parser.ts";
import { namedReferences } from "./references.ts";
import { isError } from "./values.ts";

export type FormulaFix = {
  readonly formula: string;
  // What was changed, e.g. "added )"; empty when nothing was
  readonly fixes: readonly string[];
};

/**
 * A typed formula with the mistakes fixed that have only one possible fix, as
 * spreadsheets do on Enter: parentheses left open at the end are closed, a
 * text in quotes or a [column] left open at the end is closed, and unmatched
 * ) at the very end are dropped. The fix is used only if the formula then
 * reads; a formula that reads already, or cannot be fixed this way, is
 * returned as it is.
 */
export function autofixFormula(formula: string): FormulaFix {
  const unchanged = { formula, fixes: [] };
  if (!isError(parse(formula))) return unchanged;
  let depth = 0;
  let quote = false;
  let bracket = false;
  const extra: number[] = [];
  for (let i = formula.startsWith("=") ? 1 : 0; i < formula.length; i++) {
    const ch = formula[i];
    if (quote) {
      if (ch === '"') {
        if (formula[i + 1] === '"') i++;
        else quote = false;
      }
    } else if (bracket) {
      if (ch === "]") bracket = false;
    } else if (ch === '"') quote = true;
    else if (ch === "[") bracket = true;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth > 0) depth--;
      else extra.push(i);
    }
  }
  let fixed = formula;
  const fixes: string[] = [];
  if (extra.length) {
    // Only unmatched ) at the very end: anywhere else it is not clear which ( is missing
    const end = formula.trimEnd();
    if (!end.endsWith(")".repeat(extra.length)) || extra[0] !== end.length - extra.length) return unchanged;
    fixed = end.slice(0, extra[0]);
    fixes.push(`removed ${")".repeat(extra.length)}`);
  }
  if (quote) {
    fixed += '"';
    fixes.push('closed the text with "');
  }
  if (bracket) {
    fixed = `${fixed.trimEnd()}]`;
    fixes.push("closed the column name with ]");
  }
  if (depth > 0) {
    fixed = `${quote ? fixed : fixed.trimEnd()}${")".repeat(depth)}`;
    fixes.push(`added ${")".repeat(depth)}`);
  }
  if (fixes.length === 0 || isError(parse(fixed))) return unchanged;
  return { formula: fixed, fixes };
}

/**
 * A formula's bare names of cells that are not its own table's (`own`), and
 * [[Page]]name, written as another table's: prices!vat, [[Page]]prices!vat.
 * A name is unique in its table only, so a bare one is the formula's own
 * table's; formulas written while names were the page's refer to other
 * tables so. Each is fixed only where one table of the page (of [[Page]]) has
 * the name and that table has a name; others stay as written (their error
 * says why).
 */
export function qualifyCellNames(formula: string, own: Table, tables: TableSource): FormulaFix {
  const ownNames = namedCells(own);
  const ownName = own.meta?.name?.trim().toLowerCase();
  let fixed = formula;
  const fixes: string[] = [];
  for (const ref of namedReferences(formula).reverse()) {
    if (ref.table || (ref.page === undefined && ownNames.has(ref.name.toLowerCase()))) continue;
    // Other tables' cells (the page's copy of the table edited is its own, maybe as it was)
    const found = (tables.cellsNamed?.(ref.name, ref.page) ?? []).filter(
      (cell) => cell.row > 0 && cell.table !== own && !(ref.page === undefined && ownName && cell.table.meta?.name?.trim().toLowerCase() === ownName),
    );
    const table = found.length === 1 ? found[0]!.table.meta?.name?.trim() : undefined;
    // A name a formula can write (not one typed by hand into the metadata row), which reaches that very table
    if (!table || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || tables(table, ref.page) !== found[0]!.table) continue;
    const text = `${ref.page === undefined ? "" : `[[${ref.page}]]`}${table}!${ref.name}`;
    fixes.unshift(`${formula.slice(ref.from, ref.to)} → ${text}`);
    fixed = fixed.slice(0, ref.from) + text + fixed.slice(ref.to);
  }
  return { formula: fixes.length ? fixed : formula, fixes };
}
