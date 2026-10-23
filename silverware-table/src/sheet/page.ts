// The sheets of a page, as its markdown has them: a table on a sheet says so
// in its metadata row, the sheet's name and where its header's first cell is
// on it (`<meta core.table core.name='costs' sheet.name='Budget' sheet.at='B3'>`). A page has as many
// sheets as names its tables give (compared ignoring case, the first spelling
// kept); a sheet's own data (its columns' widths, `sheet.width.E='120'`) is in
// its first table's metadata row, the first in the page's order. What the
// metadata says is read through the sheet modules' host (SheetMeta), by the
// sheet's keys: the core makes the attributes' names.
import type { ModelHost } from "../core/feature.ts";
import { columnLetters } from "../formulas/index.ts";
import { findTables, type PageTable, pageTablesOf, parseTable, type Table, type TableRange } from "../markdown.ts";

/** How the sheet modules read what tables keep for the sheet (their host) */
export type SheetMeta = Pick<ModelHost, "getMeta" | "metaOf" | "canStoreMeta" | "tableName" | "canName">;

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

// The keys of what a table keeps for the sheet: its sheet's name, its place,
// and (the sheet's first table) the sheet's columns' widths, width.<letters>
export const SHEET_KEY = "name";
export const AT_KEY = "at";
export const WIDTH_PREFIX = "width.";

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

/**
 * Whether a table may be put on a sheet, or moved to another: its sheet, its
 * place and its name stored (the metadata setting off, only where it has them:
 * a table on a sheet already, named)
 */
export function canPlace(meta: SheetMeta, table: Table): boolean {
  return meta.canStoreMeta(table, SHEET_KEY) && meta.canStoreMeta(table, AT_KEY) && (meta.tableName(table) !== undefined || meta.canName(table, { kind: "table" }));
}

/** The tables of a page that are on a sheet (with a sheet's name and a place), in the page's order */
export function sheetTables(meta: SheetMeta, text: string): SheetTable[] {
  return sheetTablesOf(meta, pageTablesOf(text));
}

/** The sheet a table is on: its sheet's name, with a place on it; none: it is on no sheet */
export function sheetOfTable(meta: SheetMeta, table: Table): string | undefined {
  const sheet = meta.getMeta(table, SHEET_KEY)?.trim();
  return sheet && parseAt(meta.getMeta(table, AT_KEY)) ? sheet : undefined;
}

/** As sheetTables, of the page's tables parsed */
export function sheetTablesOf(meta: SheetMeta, tables: readonly PageTable[]): SheetTable[] {
  const result: SheetTable[] = [];
  for (const { range, table } of tables) {
    const sheet = meta.getMeta(table, SHEET_KEY)?.trim();
    const at = parseAt(meta.getMeta(table, AT_KEY));
    if (!sheet || !at) continue;
    result.push({ range, table, sheet, at, name: meta.tableName(table), rows: table.rows.length, columns: table.align.length });
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

/** The sheet's own data a table keeps in its metadata row (as the sheet's first table), by key: its columns' widths */
export function sheetData(meta: SheetMeta, table: Table): [string, string][] {
  return [...meta.metaOf(table)].filter(([key]) => key.startsWith(WIDTH_PREFIX));
}

/**
 * The table of a sheet that holds the sheet's own data: its first table, where
 * the data is handed on as the first changes; else the first that has any (the
 * metadata setting off, the data stays where it is: nothing new is stored)
 */
export function sheetDataTable(meta: SheetMeta, tables: readonly SheetTable[]): SheetTable | undefined {
  return tables.find((t) => sheetData(meta, t.table).length > 0) ?? tables[0];
}

/**
 * The widths a table keeps for its grid's columns (sheet.width.<letters>, in
 * pixels): a sheet's first table for the sheet, a table alone for its own
 * sheet view
 */
export function sheetWidths(meta: SheetMeta, table: Table | undefined): ReadonlyMap<number, number> {
  const widths = new Map<number, number>();
  for (const [key, value] of table ? sheetData(meta, table) : []) {
    const at = parseAt(`${key.slice(WIDTH_PREFIX.length)}1`);
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

/** A name no table of the page has (nor one of `taken`): table1, table2, … (what a table put on a sheet is offered, a new one gets) */
export function freeName(meta: SheetMeta, text: string, taken: readonly string[] = []): string {
  const names = [...findTables(text).map((range) => meta.tableName(parseTable(range.text))?.toLowerCase()), ...taken.map((name) => name.toLowerCase())];
  let n = 1;
  while (names.includes(`table${n}`)) n++;
  return `table${n}`;
}

/** A name no sheet of the page has: Sheet1, Sheet2, … (a table alone's sheet view made a sheet) */
export function freeSheetName(meta: SheetMeta, text: string, taken: readonly string[] = []): string {
  const names = [...sheetsOf(sheetTables(meta, text)).map((sheet) => sheet.name), ...taken];
  let n = 1;
  while (names.some((name) => sameSheet(name, `Sheet${n}`))) n++;
  return `Sheet${n}`;
}
