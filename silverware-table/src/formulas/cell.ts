// A formula in a cell, and what the formulas read of a table besides its
// values: the formulas of its cells and the names of its rows and cells. The
// domain reads none of it from the markdown itself: the formulas module gives
// the functions that do (FormulaCells, made of its host), so the domain names
// no attribute and reads no metadata.
import type { Table } from "../markdown.ts";
import { ERROR_CODES } from "./values.ts";

export type StoredFormula = {
  // The formula, starting with "="
  readonly formula: string;
  // The result written with it, as markdown
  readonly value: string;
};

/** A named row: its name as written, its row of the markdown (header 0) */
export type RowName = { readonly name: string; readonly row: number };

/** A named body cell: its name as written, its row of the markdown (header 0) and column */
export type CellNameAt = { readonly name: string; readonly row: number; readonly column: number };

/** How the formulas read and write what a table keeps for them (given by the formulas module) */
export type FormulaCells = {
  /** The formula a cell holds, or undefined for a plain cell */
  readonly formulaOf: (cell: string) => StoredFormula | undefined;
  /** A cell holding `formula`, showing `value` (plain text); the other hidden tags of `from` (the cell as it was) kept */
  readonly formulaCell: (value: string, formula: string, from?: string) => string;
  /** A formula cell as a plain one: its result as its text, its other hidden tags kept */
  readonly withoutFormula: (cell: string) => string;
  /** A table's named rows, in their order (a name may be written twice: the first counts) */
  readonly rowNames: (table: Table) => readonly RowName[];
  /** A table's named body cells, in their order (the first of a name counts) */
  readonly cellNames: (table: Table) => readonly CellNameAt[];
};

/** A table's named rows by their names (lowercase), the first row of each name; rows of the markdown (header 0) */
export function rowsByName(cells: FormulaCells, table: Table): Map<string, number> {
  const rows = new Map<string, number>();
  for (const { name, row } of cells.rowNames(table)) if (!rows.has(name.toLowerCase())) rows.set(name.toLowerCase(), row);
  return rows;
}

/** A table's named body cells by their names (lowercase), the first cell of each name; rows of the markdown (header 0) */
export function cellsByName(cells: FormulaCells, table: Table): Map<string, { readonly row: number; readonly column: number }> {
  const found = new Map<string, { readonly row: number; readonly column: number }>();
  for (const { name, row, column } of cells.cellNames(table)) if (!found.has(name.toLowerCase())) found.set(name.toLowerCase(), { row, column });
  return found;
}

/** Whether text typed into a cell is a formula: "=" and something after it */
export function isFormulaInput(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("=") && trimmed.length > 1;
}

/** Whether a cell shows a formula error such as #REF! */
export function isErrorText(text: string): boolean {
  return (ERROR_CODES as readonly string[]).includes(text.trim());
}

export function hasFormulas(cells: FormulaCells, table: Table): boolean {
  return table.rows.some((row, r) => r > 0 && row.cells.some((cell) => cells.formulaOf(cell) !== undefined));
}

/** How many cells of the table hold a formula */
export function formulaCount(cells: FormulaCells, table: Table): number {
  return table.rows.reduce((n, row, r) => n + (r === 0 ? 0 : row.cells.filter((cell) => cells.formulaOf(cell)).length), 0);
}

export function forFormulas(cells: FormulaCells, table: Table, each: (formula: string) => void): void {
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    for (const cell of row.cells) {
      const stored = cells.formulaOf(cell);
      if (stored) each(stored.formula);
    }
  });
}
