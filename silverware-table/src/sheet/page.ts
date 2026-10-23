// The sheets of a page, as its markdown has them: a table on a sheet says so
// in its metadata row, the sheet's name and where its header's first cell is
// on it (`<meta name='costs' sheet='Budget' at='B3'>`). A page has as many
// sheets as names its tables give (compared ignoring case, the first spelling
// kept); a sheet's own data (its columns' widths, `sheet.width.E='120'`) is in
// its first table's metadata row, the first in the page's order.
import { columnLetters } from "../formulas/index.ts";
import { findTables, type PageTable, pageTablesOf, parseTable, type Table, type TableRange } from "../markdown.ts";
import { metaName } from "../meta.ts";

/** A cell of a sheet, from 0: row 0 is the sheet's first row (1), column 0 its column A */
export type SheetCell = { readonly row: number; readonly column: number };

/** A table on a sheet: where it is in the page and on the sheet, how many rows (the header first) and columns it has there */
export type SheetTable = {
  readonly range: TableRange;
  readonly table: Table;
  readonly sheet: string;
  readonly at: SheetCell;
  readonly name: string | undefined;
  readonly rows: number;
  readonly columns: number;
};

// The metadata row's attributes the sheet keeps
export const SHEET_ATTRIBUTE = "sheet";
export const AT_ATTRIBUTE = "at";
export const SHEET_WIDTH_PREFIX = "sheet.width.";

// B3: a column's letters, a row's number
const AT_RE = /^([A-Za-z]{1,3})([1-9]\d{0,6})$/;

/** A sheet's cell as `at` writes it (B3), if it is one */
export function parseAt(text: string | undefined): SheetCell | undefined {
  const m = text === undefined ? null : AT_RE.exec(text.trim());
  if (!m) return undefined;
  let column = 0;
  for (const ch of m[1]!.toUpperCase()) column = column * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, column: column - 1 };
}

/** A sheet's cell written as `at` has it */
export function formatAt(cell: SheetCell): string {
  return `${columnLetters(cell.column)}${cell.row + 1}`;
}

/** Whether two sheet names are the same: compared ignoring case and the spaces around them */
export function sameSheet(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Why a text cannot be a sheet's name; undefined when it can */
export function sheetNameProblem(name: string): string | undefined {
  if (name.trim() === "") return "a sheet needs a name";
  if (name.length > 60) return "a sheet's name is at most 60 characters";
  return undefined;
}

/** The tables of a page that are on a sheet (with a sheet's name and a place), in the page's order */
export function sheetTables(text: string): SheetTable[] {
  return sheetTablesOf(pageTablesOf(text));
}

/** As sheetTables, of the page's tables parsed */
export function sheetTablesOf(tables: readonly PageTable[]): SheetTable[] {
  const result: SheetTable[] = [];
  for (const { range, table } of tables) {
    const sheet = table.meta?.[SHEET_ATTRIBUTE]?.trim();
    const at = parseAt(table.meta?.[AT_ATTRIBUTE]);
    if (!sheet || !at) continue;
    result.push({ range, table, sheet, at, name: metaName(table), rows: table.rows.length, columns: table.align.length });
  }
  return result;
}

/** The page's sheets by name, in the order their first tables come, each with its tables */
export function sheetsOf(tables: readonly SheetTable[]): { readonly name: string; readonly tables: readonly SheetTable[] }[] {
  const sheets: { name: string; tables: SheetTable[] }[] = [];
  for (const t of tables) {
    const sheet = sheets.find((s) => sameSheet(s.name, t.sheet));
    if (sheet) sheet.tables.push(t);
    else sheets.push({ name: t.sheet, tables: [t] });
  }
  return sheets;
}

/** The sheet's own data a table keeps in its metadata row (as the sheet's first table): its columns' widths */
export function sheetData(table: Table): [string, string][] {
  return Object.entries(table.meta ?? {}).filter(([name]) => name.startsWith(SHEET_WIDTH_PREFIX));
}

/**
 * The widths a table keeps for its grid's columns (sheet.width.<letters>, in
 * pixels): a sheet's first table for the sheet, a table alone for its own
 * sheet view
 */
export function sheetWidths(table: Table | undefined): ReadonlyMap<number, number> {
  const widths = new Map<number, number>();
  for (const [name, value] of Object.entries(table?.meta ?? {})) {
    if (!name.startsWith(SHEET_WIDTH_PREFIX)) continue;
    const at = parseAt(`${name.slice(SHEET_WIDTH_PREFIX.length)}1`);
    const width = Number(value);
    if (at && Number.isFinite(width) && width > 0) widths.set(at.column, width);
  }
  return widths;
}

/** Where a table added to a sheet goes: in column A, one empty row under the sheet's lowest table (A1 on a new sheet) */
export function placeBelow(tables: readonly SheetTable[]): SheetCell {
  const bottom = Math.max(-1, ...tables.map((t) => t.at.row + t.rows - 1));
  return { row: bottom < 0 ? 0 : bottom + 2, column: 0 };
}

/** A name no table of the page has: table1, table2, … (what a table put on a sheet is offered, a new one gets) */
export function freeName(text: string): string {
  const names = findTables(text).map((range) => metaName(parseTable(range.text))?.toLowerCase());
  let n = 1;
  while (names.includes(`table${n}`)) n++;
  return `table${n}`;
}
