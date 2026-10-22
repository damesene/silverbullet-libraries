// What formulas refer to and how references are written: cells (A1),
// ranges, [columns], [@columns] of the row, named cells and rows, other
// tables and pages; what a table's formulas refer to.
import { type ColumnId, columnIdOf, columnKey, findColumn } from "../columns.ts";
import type { Table } from "../markdown.ts";
import { namedCells } from "../names.ts";
import { forFormulas } from "./cell.ts";
import { isBuiltInFunction, isCustomFunction } from "./registry.ts";
import { type Token, tokenize } from "./tokens.ts";

export function columnLetters(column: number): string {
  let s = "";
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** A cell's A1 name: body row 0 is row 1; with `fixed`, its column or row written with $ ($A$1, A$1, $A1) */
export function cellName(row: number, column: number, fixed?: { readonly column: boolean; readonly row: boolean }): string {
  return `${fixed?.column ? "$" : ""}${columnLetters(column)}${fixed?.row ? "$" : ""}${row + 1}`;
}

export type Area = { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number };

/**
 * Which edges of a reference are written with $ ($A$1:B$3): kept where they
 * are when a formula is filled into other cells, as in a spreadsheet. Edits of
 * the table (rows and columns inserted, deleted, moved) move them all the same.
 */
export type Fixed = { readonly left: boolean; readonly top: boolean; readonly right: boolean; readonly bottom: boolean };

/** An area and its fixed edges from the cells written at its two ends (the same cell for one) */
export function areaOf(start: CellAddress, end: CellAddress = start): { area: Area; fixed?: Fixed } {
  const area = {
    top: Math.min(start.row, end.row),
    left: Math.min(start.column, end.column),
    bottom: Math.max(start.row, end.row),
    right: Math.max(start.column, end.column),
  };
  // Each edge fixed as the end that gives it is written (B3:$A$1 is $A$1:B3)
  const fixed = {
    left: (start.column <= end.column ? start : end).fixedColumn,
    top: (start.row <= end.row ? start : end).fixedRow,
    right: (start.column <= end.column ? end : start).fixedColumn,
    bottom: (start.row <= end.row ? end : start).fixedRow,
  };
  return Object.values(fixed).some(Boolean) ? { area, fixed } : { area };
}

/** The table a reference is to, when it is not the formula's own: by its name, on a page (none: this one) */
export type TableRef = { readonly name: string; readonly page?: string };

/** A1 or A1:B3 for an area of body rows and columns, its fixed edges with $ */
export function areaText(area: Area, fixed?: Fixed): string {
  const start = cellName(area.top, area.left, fixed && { column: fixed.left, row: fixed.top });
  const end = cellName(area.bottom, area.right, fixed && { column: fixed.right, row: fixed.bottom });
  return start === end ? start : `${start}:${end}`;
}

/**
 * [name], [name:2] or [@name] for a column, by its key as SilverBullet's index
 * writes it (columns.ts). Undefined for a column without a name.
 */
export function columnRefText(id: ColumnId | undefined, thisRow: boolean): string | undefined {
  const name = id && columnKey(id.name);
  if (!id || !name) return undefined;
  return `[${thisRow ? "@" : ""}${name}${id.nth > 1 ? `:${id.nth}` : ""}]`;
}

/**
 * The formula with its column references written by the columns' keys, as
 * Silverware Table writes them ([Unit price] becomes [unit_price]); references to
 * columns the table does not have stay as written
 */
export function withColumnKeys(formula: string, headers: readonly string[]): string {
  let result = formula;
  for (const ref of references(formula).reverse()) {
    // Another table's columns are not among these headers
    if (ref.kind !== "column" || ref.table) continue;
    const column = referencedColumn(headers, ref.name);
    const text = column === undefined ? undefined : columnRefText(columnIdOf(headers, column), ref.thisRow);
    if (text) result = result.slice(0, ref.from) + text + result.slice(ref.to);
  }
  return result;
}

/** The column a [Name] or [Name:2] reference names; a column named exactly "Name:2" comes first */
export function referencedColumnId(headers: readonly string[], written: string): ColumnId {
  const exact = { name: written, nth: 1 };
  if (findColumn(headers, exact) !== undefined) return exact;
  const match = /^(.*\S)\s*:\s*([1-9]\d*)$/.exec(written);
  return match ? { name: match[1]!, nth: Number(match[2]) } : exact;
}

/** The index of the column a [Name] reference names, or undefined */
export function referencedColumn(headers: readonly string[], written: string): number | undefined {
  return findColumn(headers, referencedColumnId(headers, written));
}

/** A cell as a reference writes it: where it is, and whether its column or row is fixed with $ */
export type CellAddress = { readonly row: number; readonly column: number; readonly fixedColumn: boolean; readonly fixedRow: boolean };

// A1, $A$1, A$1 or $A1 (names.ts' CELL_RE without the $, which names cannot have)
const CELL_REFERENCE_RE = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9]\d*)$/;

export function parseCellName(text: string): CellAddress | undefined {
  const m = CELL_REFERENCE_RE.exec(text);
  return m ? { row: Number(m[4]) - 1, column: columnIndex(m[2]!), fixedColumn: m[1] === "$", fixedRow: m[3] === "$" } : undefined;
}

export type Reference = {
  // Where the reference is written in the formula, after its table's name if it has one
  readonly from: number;
  readonly to: number;
  // Another table's: prices!B2 (from..to is B2)
  readonly table?: TableRef;
} & (
  | { readonly kind: "area"; readonly area: Area; readonly fixed?: Fixed }
  // With `row`, the named row's cell in that column: pear[price]
  | { readonly kind: "column"; readonly name: string; readonly thisRow: boolean; readonly row?: string }
);

/** The cell, range and column references written in a formula, in order */
export function references(formula: string): Reference[] {
  const { tokens } = tokenize(formula);
  const result: Reference[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const previous = tokens[i - 1];
    const table = previous?.kind === "table" ? { table: tableRefOf(previous) } : {};
    if (token.kind === "column") {
      // pear[price]: the row named pear (of prices! before it, if written)
      const row = previous?.kind === "name" && isRowName(tokens, i - 1) ? previous.text : undefined;
      const rowTable = row && tokens[i - 2]?.kind === "table" ? { table: tableRefOf(tokens[i - 2] as { name: string; page?: string }) } : {};
      result.push({ kind: "column", name: token.name, thisRow: token.thisRow, from: token.from, to: token.to, ...(row ? { row, ...rowTable } : table) });
      continue;
    }
    if (token.kind !== "name") continue;
    const next = tokens[i + 1];
    if (next?.kind === "op" && next.text === "(") continue;
    const start = parseCellName(token.text);
    if (!start) continue;
    const colon = tokens[i + 1];
    const endToken = tokens[i + 2];
    const end = colon?.kind === "op" && colon.text === ":" && endToken?.kind === "name" ? parseCellName(endToken.text) : undefined;
    result.push({ kind: "area", ...areaOf(start, end), from: token.from, to: end ? endToken!.to : token.to, ...table });
    if (end) i += 2;
  }
  return result;
}

/** Whether the name token at `i` is a row's name: followed by a [column], and not a cell or a function's */
export function isRowName(tokens: readonly Token[], i: number): boolean {
  const token = tokens[i];
  return token?.kind === "name" && tokens[i + 1]?.kind === "column" && !parseCellName(token.text) && !/^(true|false)$/i.test(token.text);
}

export function tableRefOf(token: { readonly name: string; readonly page?: string }): TableRef {
  return token.page === undefined ? { name: token.name } : { name: token.name, page: token.page };
}

/** A named cell a formula refers to, where it is written (from..to: the name, with its table or page before it) */
export type NamedReference = { readonly name: string; readonly page?: string; readonly table?: TableRef; readonly from: number; readonly to: number };

/**
 * The named cells a formula refers to: vat (its own table's), prices!vat,
 * [[Page]]prices!vat, or [[Page]]vat (as written before names were the
 * table's). A bare name that is a function's (before "("), a cell's (A1), a
 * row's (before [column]), TRUE or FALSE is not one.
 */
export function namedReferences(formula: string): NamedReference[] {
  const { tokens } = tokenize(formula);
  const result: NamedReference[] = [];
  tokens.forEach((token, i) => {
    if (token.kind === "named") {
      result.push({ name: token.name, page: token.page, from: token.from, to: token.to });
      return;
    }
    if (token.kind !== "name" || parseCellName(token.text) || /^(true|false)$/i.test(token.text)) return;
    const next = tokens[i + 1];
    if ((next?.kind === "op" && next.text === "(") || next?.kind === "column") return;
    const previous = tokens[i - 1];
    // The end of a range (A1:B2) is a cell
    if (previous?.kind === "op" && previous.text === ":") return;
    if (previous?.kind === "table") {
      result.push({ name: token.text, table: tableRefOf(previous), from: previous.from, to: token.to });
      return;
    }
    result.push({ name: token.text, from: token.from, to: token.to });
  });
  return result;
}

/** The names (lowercase) of a table's named body cells */
export function cellNamesOf(table: Table): Set<string> {
  return new Set(namedCells(table).keys());
}

/** The other pages whose tables a table's formulas refer to ([[Page]]prices!B2) */
export function referredPages(table: Table): Set<string> {
  const pages = new Set<string>();
  forFormulas(table, (formula) => {
    for (const page of formulaPages(formula)) pages.add(page);
  });
  return pages;
}

/** The other pages a formula refers to */
export function formulaPages(formula: string): string[] {
  return [
    ...references(formula).flatMap((ref) => (ref.table?.page ? [ref.table.page] : [])),
    ...namedReferences(formula).flatMap((ref) => (ref.page ? [ref.page] : ref.table?.page ? [ref.table.page] : [])),
  ];
}

/**
 * Whether a table's formulas call a custom function, or one that is not
 * built in (it may be defined later): their results change when the custom
 * functions are defined anew
 */
export function callsCustomFunctions(table: Table): boolean {
  let calls = false;
  forFormulas(table, (formula) => {
    const { tokens } = tokenize(formula);
    tokens.forEach((token, i) => {
      const next = tokens[i + 1];
      if (token.kind !== "name" || next?.kind !== "op" || next.text !== "(") return;
      const name = token.text.toUpperCase();
      if (isCustomFunction(name) || !isBuiltInFunction(name)) calls = true;
    });
  });
  return calls;
}

/** The names (lowercase) of the tables on the page that a table's formulas refer to, so they change when those do */
export function referredTableNames(table: Table): Set<string> {
  const names = new Set<string>();
  forFormulas(table, (formula) => {
    // Table tokens, not references: prices!#REF! is to prices too
    for (const token of tokenize(formula).tokens) {
      if (token.kind === "table" && token.page === undefined) names.add(token.name.toLowerCase());
    }
  });
  return names;
}
