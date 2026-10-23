// Calculating formulas: a table's cells as a sheet, the other tables they
// refer to as a book, results and the reasons of errors.
import { escapeCell, type Table, unescapeCell } from "../markdown.ts";
import { setCell } from "../ops.ts";
import { withoutTags } from "../tags.ts";
import { asNumber } from "../view.ts";
import { cellsByName, type FormulaCells, hasFormulas, rowsByName } from "./cell.ts";
import { dateArithmetic, parseDate } from "./dates.ts";
import { type Node, parse, wholeColumnNames } from "./parser.ts";
import { type Area, areaText, cellName, formulaPages, referencedColumn, type TableRef } from "./references.ts";
import { functionNamed } from "./registry.ts";
import { asTime, ERROR_CODES, FormulaError, isError, isRange, parseClock, type Scalar, single, timeArithmetic, TimeValue, toNumber, toText, type Value } from "./values.ts";

const DECIMAL_COMMA_RE = /\d,\d/;

/**
 * Where formulas find the other tables they refer to: the table with a name
 * (compared ignoring case) on the formula's page, or with `page` on another;
 * undefined when there is none
 */
export type TableSource = ((name: string, page?: string) => Table | undefined) & {
  /** The first cell named so (compared ignoring case) on the page or on `page`, its row of the markdown (header 0); a source without cellsNamed gives this one */
  readonly cell?: (name: string, page?: string) => NamedCell | undefined;
  /** Every cell named so on the page or on `page` (a name is unique in a table only), in the order of the tables */
  readonly cellsNamed?: (name: string, page?: string) => readonly NamedCell[];
  /** Whether formulas may not read `page` (links to other pages are off): those referring to it keep their results */
  readonly unread?: (page: string) => boolean;
};

/** Where a named cell is: its table (and the table's name, if it has one), and its row (of the markdown, header 0) and column */
export type NamedCell = { readonly table: Table; readonly tableName?: string; readonly row: number; readonly column: number };

/** The sheets of the tables formulas refer to, each made once: their results are computed once too */
class Book {
  private readonly sheets = new Map<string, Sheet>();
  // The sheets by table, whether reached by the table's name or a named cell's
  private readonly tableSheets = new Map<Table, Sheet>();
  constructor(
    readonly cells: FormulaCells,
    private readonly source: TableSource | undefined,
  ) {}

  /** Whether a formula refers to a page formulas may not read: it keeps its stored result */
  keepsResult(formula: string): boolean {
    const unread = this.source?.unread;
    return !!unread && formulaPages(formula).some(unread);
  }

  /** The cells named so on `page` (undefined: the formulas' page), in every table: what a bare name not in its own table may have meant */
  cellsNamed(name: string, page: string | undefined): readonly NamedCell[] {
    const found = this.source?.cellsNamed?.(name, page);
    if (found) return found;
    const first = this.source?.cell?.(name, page);
    return first ? [first] : [];
  }

  /** The table's sheet, made on its first use (by its name or by a named cell's) */
  private sheetOf(table: Table, page: string | undefined, name: string): Sheet {
    let sheet = this.tableSheets.get(table);
    if (!sheet) {
      sheet = new Sheet(table, this, page, name);
      this.tableSheets.set(table, sheet);
    }
    return sheet;
  }

  /** The sheet a reference from `from` is to: the other table, or `from` itself when it is named so */
  sheet(ref: TableRef, from: Sheet): Sheet | FormulaError {
    const page = ref.page ?? from.page;
    if (page === from.page && from.name !== undefined && from.name.toLowerCase() === ref.name.toLowerCase()) return from;
    const key = `${page ?? ""}\u0000${ref.name.toLowerCase()}`;
    let sheet = this.sheets.get(key);
    if (!sheet) {
      const table = this.source?.(ref.name, page);
      if (!table) return new FormulaError("#REF!", `there is no table named ${ref.name}${page === undefined ? " on this page" : ` on ${page}`}`);
      sheet = this.sheetOf(table, page, ref.name);
      this.sheets.set(key, sheet);
    }
    return sheet;
  }
}

/**
 * A table's total rows (body rows from 0): those with a cell that refers to
 * its own whole column, as =SUM([qty]) under Qty. A cell that refers to
 * another column ([@qty] / SUM([qty]) in a Share column) does not make its row
 * one. [qty] leaves them out.
 */
export function totalRows(cells: FormulaCells, table: Table): ReadonlySet<number> {
  const headers = table.rows[0]?.cells ?? [];
  const totals = new Set<number>();
  table.rows.slice(1).forEach((row, r) => {
    row.cells.forEach((cell, column) => {
      const stored = cells.formulaOf(cell);
      const tree = stored && parse(stored.formula);
      if (!tree || isError(tree)) return;
      if (Array.from(wholeColumnNames(tree, new Set())).some((name) => referencedColumn(headers, name) === column)) totals.add(r);
    });
  });
  return totals;
}

/** A table's cells as a sheet: values of plain cells, results of formula cells */
class Sheet {
  private readonly headers: readonly string[];
  private readonly body: readonly (readonly string[])[];
  private readonly results = new Map<string, Scalar>();
  private readonly evaluating = new Set<string>();
  // Numbers in the table are written with a decimal comma: results are too
  readonly decimalComma: boolean;
  // The table's name, by which formulas refer to it
  readonly name: string | undefined;
  private totals: ReadonlySet<number> | undefined;
  private cellNames: Map<string, { readonly row: number; readonly column: number }> | undefined;
  private rowNames: Map<string, number> | undefined;

  /**
   * `page`: the page the table is on, when it is not the formulas' own (its
   * unnamed references are to tables there); `name`: the table's, by which
   * its own formulas may refer to it too
   */
  constructor(
    private readonly table: Table,
    private readonly book: Book,
    readonly page?: string,
    name?: string,
  ) {
    this.name = name?.trim() || undefined;
    this.headers = table.rows[0]?.cells ?? [];
    this.body = table.rows.slice(1).map((r) => r.cells);
    let comma = 0;
    let point = 0;
    for (const cells of this.body) {
      for (const cell of cells) {
        if (book.cells.formulaOf(cell)) continue;
        const text = unescapeCell(cell).trim();
        if (asNumber(text) === undefined) continue;
        if (DECIMAL_COMMA_RE.test(text)) comma++;
        else if (/\d\.\d/.test(text)) point++;
      }
    }
    this.decimalComma = comma > point;
  }

  get rows(): number {
    return this.body.length;
  }

  get columns(): number {
    return this.headers.length;
  }

  /** A cell's value: a plain cell's text (a number if it reads as one), a formula cell's result */
  value(row: number, column: number): Scalar {
    const cell = this.body[row]?.[column];
    if (cell === undefined || column >= this.columns) {
      return new FormulaError("#REF!", `${cellName(row, column)} is outside the table`);
    }
    const stored = this.book.cells.formulaOf(cell);
    if (!stored) {
      const text = unescapeCell(withoutTags(cell)).trim();
      if (text === "") return null;
      // A number, a time (14:30, 40:00), or text
      return asNumber(text) ?? parseClock(text) ?? text;
    }
    return this.result(row, column, stored.formula);
  }

  /** The result of the formula in a cell */
  result(row: number, column: number, formula: string): Scalar {
    const key = `${row},${column}`;
    const known = this.results.get(key);
    if (known !== undefined) return known;
    if (this.evaluating.has(key)) {
      return new FormulaError("#CYCLE!", `${cellName(row, column)} depends on its own result`);
    }
    // Refers to a page formulas may not read: the result stored, which
    // the formulas using the cell use too
    if (this.book.keepsResult(formula)) {
      const shown = unescapeCell(this.book.cells.formulaOf(this.body[row]?.[column] ?? "")?.value ?? "").trim();
      // None yet, or an error code written: an error, saying why it is not calculated
      const code = shown === "" ? "#REF!" : ERROR_CODES.find((c) => c === shown);
      const kept: Scalar = code ? new FormulaError(code, "the other page is not read (are links to other pages turned off?)") : (asNumber(shown) ?? parseClock(shown) ?? shown);
      this.results.set(key, kept);
      return kept;
    }
    this.evaluating.add(key);
    let result: Scalar;
    try {
      const tree = parse(formula);
      result = isError(tree) ? tree : single(this.evaluate(tree, row, column));
      if ((typeof result === "number" && !Number.isFinite(result)) || (result instanceof TimeValue && !Number.isFinite(result.seconds))) {
        result = new FormulaError("#NUM!", "the result is not a finite number");
      }
    } finally {
      this.evaluating.delete(key);
    }
    this.results.set(key, result);
    return result;
  }

  /** The text a formula cell shows for its result */
  text(row: number, column: number, formula: string): string {
    const result = this.result(row, column, formula);
    if (isError(result)) return result.code;
    const text = toText(result) as string;
    return typeof result === "number" && this.decimalComma ? text.replace(".", ",") : text;
  }

  /** The cell of the row named `row` in the column `column` */
  rowCellValue(row: string, column: string, prefix = ""): Value {
    this.rowNames ??= rowsByName(this.book.cells, this.table);
    const r = this.rowNames.get(row.toLowerCase());
    if (r === undefined) return new FormulaError("#REF!", `there is no row named ${row}${prefix ? ` in ${prefix.slice(0, -1)}` : ""}`);
    const c = referencedColumn(this.headers, column);
    if (c === undefined) return new FormulaError("#REF!", `there is no column named "${column}"${prefix ? ` in ${prefix.slice(0, -1)}` : ""}`);
    // rowsByName counts the header as row 0, the body starts at 0 here
    return this.value(r - 1, c);
  }

  /** The values of an area: one cell's value, or a range's (`range`) */
  areaValue(area: Area, range: boolean, prefix = ""): Value {
    const { top, left, bottom, right } = area;
    if (bottom >= this.rows || right >= this.columns) {
      return new FormulaError("#REF!", `${prefix}${areaText(area)} is outside the table`);
    }
    const values: Scalar[] = [];
    for (let r = top; r <= bottom; r++) {
      for (let c = left; c <= right; c++) values.push(this.value(r, c));
    }
    return range ? values : values[0]!;
  }

  /**
   * A column's values, without the table's total rows (see totalRows), so the
   * columns of a table line up: XLOOKUP over one gives the value beside it in another
   */
  columnValue(name: string, prefix = ""): Value {
    const index = referencedColumn(this.headers, name);
    if (index === undefined) return new FormulaError("#REF!", `there is no column named "${name}"${prefix ? ` in ${prefix.slice(0, -1)}` : ""}`);
    const totals = this.totalRows();
    const values: Scalar[] = [];
    for (let r = 0; r < this.rows; r++) {
      if (!totals.has(r)) values.push(this.value(r, index));
    }
    return values;
  }

  /** The total rows (see totalRows), once */
  private totalRows(): ReadonlySet<number> {
    this.totals ??= totalRows(this.book.cells, this.table);
    return this.totals;
  }

  /**
   * A named cell's value: of this table (vat), or of the table named before it
   * (prices!vat). A bare name is this table's only, as a name is unique in its
   * table only: one of another table is an error saying how to write it.
   */
  private named(node: Extract<Node, { kind: "named" }>): Value {
    if (node.table) {
      const sheet = this.sheetOf(node.table);
      if (isError(sheet)) return sheet;
      return sheet.ownNamed(node.name, node.table.name);
    }
    if (node.page === undefined || node.page === this.page) {
      const own = this.cellNamed(node.name);
      if (own) return this.value(own.row, own.column);
    }
    return new FormulaError("#NAME?", this.namedElsewhere(node.name, node.page));
  }

  /** This table's cell named so, for a reference from another table (`table`: this one's name, as written there) */
  ownNamed(name: string, table: string): Value {
    const own = this.cellNamed(name);
    return own ? this.value(own.row, own.column) : new FormulaError("#NAME?", `there is no cell named ${name} in ${table}`);
  }

  /** Why a bare name is not found: no such cell, or how to write the one of another table */
  private namedElsewhere(name: string, page: string | undefined): string {
    const at = page === undefined ? "" : `[[${page}]]`;
    // Another table's (by the table, or its name: the page's copy of this one may be as it was before the edit)
    const own = this.name?.toLowerCase();
    const others = this.book
      .cellsNamed(name, page ?? this.page)
      .filter((cell) => cell.row > 0 && cell.table !== this.table && !(page === undefined && own && cell.tableName?.trim().toLowerCase() === own));
    if (others.length === 0) return `there is no cell named ${name} ${page === undefined ? "in this table" : `on ${page}`}`;
    const names = others.map((cell) => cell.tableName?.trim() || undefined);
    if (others.length > 1) {
      const named = names.filter((n): n is string => !!n);
      return `${name} is a cell of several tables${named.length ? ` (${named.join(", ")})` : ""}: write which, as ${named[0] ?? "table"}!${name}`;
    }
    const table = names[0];
    return table
      ? `${name} is a cell of the table ${table}: write ${at}${table}!${name}`
      : `${name} is a cell of another table, which has no name: name that table (the pencil in its ⋯ menu's title), then write its name!${name}`;
  }

  /** The body cell of this table named so (ignoring case), if any */
  private cellNamed(name: string): { row: number; column: number } | undefined {
    this.cellNames ??= cellsByName(this.book.cells, this.table);
    const found = this.cellNames.get(name.toLowerCase());
    // cellsByName counts the header as row 0, the body starts at 0 here
    return found && { row: found.row - 1, column: found.column };
  }

  /** The sheet a reference's table is: this one, or another the book has */
  private sheetOf(table: TableRef | undefined): Sheet | FormulaError {
    return table ? this.book.sheet(table, this) : this;
  }

  private evaluate(node: Node, row: number, column: number): Value {
    switch (node.kind) {
      case "literal":
        return node.value;
      case "area": {
        const sheet = this.sheetOf(node.table);
        if (isError(sheet)) return sheet;
        return sheet.areaValue(node.area, node.range, node.table ? `${node.table.name}!` : "");
      }
      case "column": {
        const sheet = this.sheetOf(node.table);
        if (isError(sheet)) return sheet;
        if (node.thisRow) {
          const index = referencedColumn(this.headers, node.name);
          return index === undefined ? new FormulaError("#REF!", `there is no column named "${node.name}"`) : this.value(row, index);
        }
        return sheet.columnValue(node.name, node.table ? `${node.table.name}!` : "");
      }
      case "named":
        return this.named(node);
      case "rowCell": {
        const sheet = this.sheetOf(node.table);
        if (isError(sheet)) return sheet;
        return sheet.rowCellValue(node.row, node.column, node.table ? `${node.table.name}!` : "");
      }
      case "call": {
        const f = functionNamed(node.name);
        if (!f) return new FormulaError("#NAME?", `there is no function ${node.name}`);
        if (node.args.length < f.minArgs || (f.maxArgs !== undefined && node.args.length > f.maxArgs)) {
          return new FormulaError("#VALUE!", `wrong number of arguments: ${f.syntax}`);
        }
        // A reference is passed as a range, so number functions skip a text cell as in a range
        return f.call(
          node.args.map((arg) => {
            const value = this.evaluate(arg, row, column);
            const reference = arg.kind === "area" || (arg.kind === "column" && arg.thisRow);
            return reference && !isRange(value) && !isError(value) ? [value] : value;
          }),
          // Where it is calculated, as A1 counts (row: the body's, from 1)
          { row: row + 1, column: column + 1 },
        );
      }
      case "unary":
        return cellByCell([this.evaluate(node.arg, row, column)], ([arg]) => this.unary(node.op, arg!));
      case "binary": {
        const operands = [this.evaluate(node.left, row, column), this.evaluate(node.right, row, column)];
        return cellByCell(operands, ([left, right]) => this.binary(node.op, left!, right!));
      }
    }
  }

  private unary(op: string, arg: Scalar): Scalar {
    const time = asTime(arg);
    if (time && op !== "%") return op === "-" ? new TimeValue(-time.seconds) : time;
    const n = toNumber(arg);
    if (isError(n)) return n;
    return op === "-" ? -n : op === "%" ? n / 100 : n;
  }

  private binary(op: string, left: Scalar, right: Scalar): Scalar {
    if (isError(left)) return left;
    if (isError(right)) return right;
    if (op === "&") return (toText(left) as string) + (toText(right) as string);
    const comparison = COMPARISONS[op];
    if (comparison) return comparison(compare(left, right));
    // A date and days (or two dates) add and subtract as dates
    const dated = op === "+" || op === "-" ? dateArithmetic(op, left, right) : undefined;
    if (dated !== undefined) return dated;
    // A time and a time or a number: a time where one makes sense (17:30 - 9:00 is 08:30)
    const timed = timeArithmetic(op, left, right);
    if (timed !== undefined) return timed;
    const a = toNumber(left);
    const b = toNumber(right);
    if (isError(a)) return a;
    if (isError(b)) return b;
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return b === 0 ? new FormulaError("#DIV/0!", "division by zero") : a / b;
      default:
        return a ** b;
    }
  }
}

/**
 * An operator on ranges works cell by cell, as in spreadsheets: a range and a
 * value give a range ("**" & [name]), two ranges of the same size the range of
 * their pairs ([qty] * [price]). A function takes it on (TEXTJOIN, SUM); a
 * cell's result is one value, so a range left there is #VALUE!. A range of one
 * cell (A1) is that cell's value.
 */
function cellByCell(operands: readonly Value[], f: (values: Scalar[]) => Scalar): Value {
  const ranges = operands.filter((v): v is readonly Scalar[] => isRange(v) && v.length !== 1);
  if (ranges.length === 0) return f(operands.map(single));
  const size = ranges[0]!.length;
  const other = ranges.find((r) => r.length !== size);
  if (other) return new FormulaError("#VALUE!", `the ranges are not the same size (${size} and ${other.length} cells)`);
  return Array.from({ length: size }, (_, at) => f(operands.map((v) => (isRange(v) && v.length !== 1 ? v[at]! : single(v)))));
}

const COMPARISONS: Readonly<Record<string, (order: number) => boolean>> = {
  "=": (o) => o === 0,
  "<>": (o) => o !== 0,
  "<": (o) => o < 0,
  ">": (o) => o > 0,
  "<=": (o) => o <= 0,
  ">=": (o) => o >= 0,
};

/** Compares two values: as dates if both are dates, as numbers if both read as numbers, else as text ignoring case */
function compare(a: Scalar, b: Scalar): number {
  // 2025-11-06 is 2025-11-06 00:00, and 2025-11-06T08:00 is before 2025-11-06 09:00
  const da = typeof a === "string" ? parseDate(a) : undefined;
  const db = da && typeof b === "string" ? parseDate(b) : undefined;
  if (da && db) return da.ms - db.ms;
  const na = a === null ? 0 : toNumber(a);
  const nb = b === null ? 0 : toNumber(b);
  if (!isError(na) && !isError(nb) && typeof a !== "boolean" && typeof b !== "boolean") return na - nb;
  const ta = (toText(a) as string).toLowerCase();
  const tb = (toText(b) as string).toLowerCase();
  return ta < tb ? -1 : ta > tb ? 1 : 0;
}

/**
 * The table with every formula cell showing its current result. Returns the
 * same table when all results are up to date. Formulas in the header row are
 * left alone: a header is a column's name.
 */
/** What a table's formulas are calculated with: its cells as the formulas read them, the other tables, its own name */
export type Calculation = { readonly cells: FormulaCells; readonly tables?: TableSource; readonly name?: string };

export function recalculate(table: Table, { cells, tables, name }: Calculation): Table {
  if (!hasFormulas(cells, table)) return table;
  const book = new Book(cells, tables);
  const sheet = new Sheet(table, book, undefined, name);
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = cells.formulaOf(cell);
      // A result kept as it is written (a link to a page not read)
      if (!stored || (book.keepsResult(stored.formula) && stored.value.trim() !== "")) return;
      // Up to date when the result written is the one calculated: the cell's tag as
      // written stays (a table written before tags' values went into apostrophes too)
      const text = sheet.text(r - 1, c, stored.formula);
      if (escapeCell(text) === stored.value) return;
      result = setCell(result, r, c, cells.formulaCell(text, stored.formula, cell));
    });
  });
  return result;
}

/** Why formula cells show errors: "row,column" (rows of the markdown, header 0) → code and detail */
export function formulaErrors(table: Table, { cells, tables, name }: Calculation): Map<string, string> {
  const errors = new Map<string, string>();
  if (!hasFormulas(cells, table)) return errors;
  const sheet = new Sheet(table, new Book(cells, tables), undefined, name);
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = cells.formulaOf(cell);
      const result = stored && sheet.result(r - 1, c, stored.formula);
      if (isError(result)) errors.set(`${r},${c}`, `${result.code} ${result.detail}`);
    });
  });
  return errors;
}
