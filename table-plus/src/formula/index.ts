// Formulas in table cells. `=SUM(A1:A3)` typed into a cell is stored as its
// result followed by a `<meta f="…">` tag that holds the formula:
//
//   | Total | 19 <meta f="=SUM(B1:B3)"> |
//
// Browsers do not show <meta> and other renderers drop it, so the result is
// what every reader of the markdown sees. Table Plus writes the results again
// whenever it edits the table.
//
// References: A1 is the first body row (the header is not counted), A1:B3 a
// range, [Qty] the column named Qty (without the cells whose formulas refer to
// that whole column, such as a total below it), [@Qty] the Qty cell of the
// formula's own row. Columns are named as columns.ts names them: of several
// columns named Qty, [Qty:2] is the second. Another table of the page, named
// in its metadata row (<meta name="prices">), is referred to by its name and
// "!": prices!B2, prices!A1:B3, prices![Price].
import { type ColumnId, columnIdOf, columnKey, findColumn, followColumn, sameColumnId } from "../columns.ts";
import { dateArithmetic, parseDate } from "./dates.ts";
import { FUNCTIONS } from "./functions/index.ts";
import { escapeCell, escapeMetaValue, type Table, unescapeCell, unescapeMetaValue } from "../markdown.ts";
import { setCell } from "../ops.ts";
import {
  asTime,
  ERROR_CODES,
  FormulaError,
  isError,
  isRange,
  parseClock,
  type Scalar,
  single,
  timeArithmetic,
  TimeValue,
  toNumber,
  toText,
  type Value,
} from "./values.ts";
import { asNumber } from "../view.ts";

// ---- stored in a cell ------------------------------------------------------

const FORMULA_TAG_RE = /<meta\s+f\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/?>/gi;

export type StoredFormula = {
  // The formula, starting with "="
  readonly formula: string;
  // The result written with it, as markdown
  readonly value: string;
};

/** The formula a cell holds, or undefined for a plain cell */
export function formulaOf(cell: string): StoredFormula | undefined {
  // The tag Table Plus writes is the last one: a result may contain the text of another
  const match = Array.from(cell.matchAll(FORMULA_TAG_RE)).pop();
  if (!match) return undefined;
  const formula = unescapeMetaValue(match[1] ?? match[2] ?? "").trim();
  const value = (cell.slice(0, match.index) + cell.slice(match.index + match[0].length)).trim();
  return { formula: formula.startsWith("=") ? formula : `=${formula}`, value };
}

/** A cell holding `formula`, showing `value` (plain text) */
export function formulaCell(value: string, formula: string): string {
  const tag = `<meta f="${escapeMetaValue(formula)}">`;
  const shown = escapeCell(value);
  return shown === "" ? tag : `${shown} ${tag}`;
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

// ---- references --------------------------------------------------------------

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

/** A cell's A1 name: body row 0 is row 1 */
export function cellName(row: number, column: number): string {
  return `${columnLetters(column)}${row + 1}`;
}

export type Area = { readonly top: number; readonly left: number; readonly bottom: number; readonly right: number };

/** The table a reference is to, when it is not the formula's own: by its name, on a page (none: this one) */
export type TableRef = { readonly name: string; readonly page?: string };

/** A1 or A1:B3 for an area of body rows and columns */
export function areaText(area: Area): string {
  const start = cellName(area.top, area.left);
  return area.top === area.bottom && area.left === area.right ? start : `${start}:${cellName(area.bottom, area.right)}`;
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
 * Table Plus writes them ([Unit price] becomes [unit_price]); references to
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

const CELL_RE = /^([A-Za-z]{1,3})([1-9]\d*)$/;

/** Whether a name reads as a cell reference in formulas (A1, AB12) */
export function isCellName(text: string): boolean {
  return CELL_RE.test(text);
}

function parseCellName(text: string): { row: number; column: number } | undefined {
  const m = CELL_RE.exec(text);
  return m ? { row: Number(m[2]) - 1, column: columnIndex(m[1]!) } : undefined;
}

// ---- tokens ------------------------------------------------------------------

type Token =
  | { readonly kind: "number"; readonly value: number; readonly from: number; readonly to: number }
  | { readonly kind: "string"; readonly value: string; readonly from: number; readonly to: number }
  | { readonly kind: "name"; readonly text: string; readonly from: number; readonly to: number }
  | { readonly kind: "column"; readonly name: string; readonly thisRow: boolean; readonly from: number; readonly to: number }
  | { readonly kind: "op"; readonly text: string; readonly from: number; readonly to: number }
  // "prices!" or "[[Page]]prices!": the table the next reference is to
  | { readonly kind: "table"; readonly name: string; readonly page?: string; readonly from: number; readonly to: number }
  // A reference to cells that were deleted, as written by shiftReferences
  | { readonly kind: "ref-error"; readonly from: number; readonly to: number };

const REF_ERROR = "#REF!";

const OPERATORS = ["<=", ">=", "<>", "+", "-", "*", "/", "^", "&", "=", "<", ">", "(", ")", ",", ";", ":", "%"];

/**
 * The formula's tokens (positions are offsets in `formula`). Stops at the first
 * thing that is not a token: `error` then says what, and `tokens` holds those
 * before it, which is enough to find references while a formula is typed.
 */
function tokenize(formula: string): { tokens: Token[]; error?: FormulaError } {
  const tokens: Token[] = [];
  let i = formula.startsWith("=") ? 1 : 0;
  const fail = (detail: string) => ({ tokens, error: new FormulaError("#ERROR!", detail) });
  while (i < formula.length) {
    const ch = formula[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(formula.slice(i));
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]), from: i, to: i + number[0].length });
      i += number[0].length;
      continue;
    }
    if (formula.startsWith("[[", i)) {
      const close = formula.indexOf("]]", i + 2);
      const table = close < 0 ? null : /^([A-Za-z_][A-Za-z0-9_]*)!/.exec(formula.slice(close + 2));
      if (close < 0) return fail("a page name is missing its closing ]]");
      if (!table) return fail("[[Page]] is followed by a table's name and !, as in [[Page]]prices!A1");
      const page = formula.slice(i + 2, close).trim();
      tokens.push({ kind: "table", name: table[1]!, page, from: i, to: close + 2 + table[0].length });
      i = close + 2 + table[0].length;
      continue;
    }
    const table = /^([A-Za-z_][A-Za-z0-9_]*)!/.exec(formula.slice(i));
    if (table) {
      tokens.push({ kind: "table", name: table[1]!, from: i, to: i + table[0].length });
      i += table[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(formula.slice(i));
    if (name) {
      tokens.push({ kind: "name", text: name[0], from: i, to: i + name[0].length });
      i += name[0].length;
      continue;
    }
    if (ch === '"') {
      let value = "";
      let j = i + 1;
      for (;;) {
        if (j >= formula.length) return fail("a text is missing its closing quote");
        if (formula[j] === '"') {
          if (formula[j + 1] !== '"') break;
          value += '"';
          j += 2;
        } else value += formula[j++];
      }
      tokens.push({ kind: "string", value, from: i, to: j + 1 });
      i = j + 1;
      continue;
    }
    if (formula.startsWith(REF_ERROR, i)) {
      tokens.push({ kind: "ref-error", from: i, to: i + REF_ERROR.length });
      i += REF_ERROR.length;
      continue;
    }
    if (ch === "[") {
      const end = formula.indexOf("]", i);
      if (end < 0) return fail("a column name is missing its closing ]");
      const inner = formula.slice(i + 1, end);
      const thisRow = inner.startsWith("@");
      tokens.push({ kind: "column", name: (thisRow ? inner.slice(1) : inner).trim(), thisRow, from: i, to: end + 1 });
      i = end + 1;
      continue;
    }
    const op = OPERATORS.find((o) => formula.startsWith(o, i));
    if (!op) return fail(`unexpected "${ch}"`);
    tokens.push({ kind: "op", text: op, from: i, to: i + op.length });
    i += op.length;
  }
  return { tokens };
}

export type Reference = {
  // Where the reference is written in the formula, after its table's name if it has one
  readonly from: number;
  readonly to: number;
  // Another table's: prices!B2 (from..to is B2)
  readonly table?: TableRef;
} & (
  | { readonly kind: "area"; readonly area: Area }
  | { readonly kind: "column"; readonly name: string; readonly thisRow: boolean }
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
      result.push({ kind: "column", name: token.name, thisRow: token.thisRow, from: token.from, to: token.to, ...table });
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
    const area = end
      ? {
          top: Math.min(start.row, end.row),
          left: Math.min(start.column, end.column),
          bottom: Math.max(start.row, end.row),
          right: Math.max(start.column, end.column),
        }
      : { top: start.row, left: start.column, bottom: start.row, right: start.column };
    result.push({ kind: "area", area, from: token.from, to: end ? endToken!.to : token.to, ...table });
    if (end) i += 2;
  }
  return result;
}

function tableRefOf(token: { readonly name: string; readonly page?: string }): TableRef {
  return token.page === undefined ? { name: token.name } : { name: token.name, page: token.page };
}

// ---- syntax tree -------------------------------------------------------------

type Node =
  | { readonly kind: "literal"; readonly value: Scalar }
  | { readonly kind: "area"; readonly area: Area; readonly range: boolean; readonly table?: TableRef }
  | { readonly kind: "column"; readonly name: string; readonly thisRow: boolean; readonly table?: TableRef }
  | { readonly kind: "call"; readonly name: string; readonly args: readonly Node[] }
  | { readonly kind: "unary"; readonly op: string; readonly arg: Node }
  | { readonly kind: "binary"; readonly op: string; readonly left: Node; readonly right: Node };

class Parser {
  private at = 0;
  constructor(
    private readonly formula: string,
    private readonly tokens: readonly Token[],
  ) {}

  parse(): Node {
    const node = this.comparison();
    const rest = this.tokens[this.at];
    if (rest) throw new FormulaError("#ERROR!", `unexpected "${this.text(rest)}"`);
    return node;
  }

  private text(token: Token): string {
    return this.formula.slice(token.from, token.to);
  }

  private peekOp(...ops: string[]): string | undefined {
    const token = this.tokens[this.at];
    return token?.kind === "op" && ops.includes(token.text) ? token.text : undefined;
  }

  private binary(next: () => Node, ...ops: string[]): Node {
    let left = next();
    for (let op = this.peekOp(...ops); op; op = this.peekOp(...ops)) {
      this.at++;
      left = { kind: "binary", op, left, right: next() };
    }
    return left;
  }

  private comparison = (): Node => this.binary(this.concat, "=", "<>", "<", ">", "<=", ">=");
  private concat = (): Node => this.binary(this.additive, "&");
  private additive = (): Node => this.binary(this.multiplicative, "+", "-");
  private multiplicative = (): Node => this.binary(this.power, "*", "/");
  private power = (): Node => this.binary(this.unary, "^");

  private unary = (): Node => {
    const op = this.peekOp("-", "+");
    if (op) {
      this.at++;
      return { kind: "unary", op, arg: this.unary() };
    }
    let node = this.primary();
    while (this.peekOp("%")) {
      this.at++;
      node = { kind: "unary", op: "%", arg: node };
    }
    return node;
  };

  private primary(): Node {
    const token = this.tokens[this.at++];
    if (!token) throw new FormulaError("#ERROR!", "the formula ends too early");
    switch (token.kind) {
      case "number":
        return { kind: "literal", value: token.value };
      case "string":
        return { kind: "literal", value: token.value };
      case "column":
        return { kind: "column", name: token.name, thisRow: token.thisRow };
      case "ref-error":
        return { kind: "literal", value: new FormulaError("#REF!", "a reference to deleted cells") };
      case "table": {
        // prices!B2, prices!A1:B3, prices![Price]
        const next = this.tokens[this.at];
        const prefix = this.text(token);
        if (next?.kind === "column") {
          this.at++;
          if (next.thisRow) {
            throw new FormulaError("#ERROR!", `[@${next.name}] is a cell of the formula's own row: ${prefix}[${next.name}] is the other table's column`);
          }
          return { kind: "column", name: next.name, thisRow: false, table: tableRefOf(token) };
        }
        if (next?.kind === "name" && parseCellName(next.text) && !(this.tokens[this.at + 1]?.kind === "op" && this.text(this.tokens[this.at + 1]!) === "(")) {
          this.at++;
          const area = this.name(next.text);
          if (area.kind === "area") return { ...area, table: tableRefOf(token) };
        }
        throw new FormulaError("#ERROR!", `${prefix} is followed by a cell, a range or a [column], as in ${prefix}A1`);
      }
      case "op":
        if (token.text === "(") {
          const inner = this.comparison();
          if (!this.peekOp(")")) throw new FormulaError("#ERROR!", "a ( is missing its )");
          this.at++;
          return inner;
        }
        throw new FormulaError("#ERROR!", `unexpected "${this.text(token)}"`);
      case "name":
        return this.name(token.text);
    }
  }

  private name(text: string): Node {
    if (this.peekOp("(")) {
      this.at++;
      const args: Node[] = [];
      if (this.peekOp(")")) this.at++;
      else {
        for (;;) {
          args.push(this.comparison());
          if (this.peekOp(",", ";")) {
            this.at++;
            continue;
          }
          if (!this.peekOp(")")) throw new FormulaError("#ERROR!", `${text}( is missing its )`);
          this.at++;
          break;
        }
      }
      return { kind: "call", name: text.toUpperCase(), args };
    }
    const upper = text.toUpperCase();
    if (upper === "TRUE" || upper === "FALSE") return { kind: "literal", value: upper === "TRUE" };
    const start = parseCellName(text);
    if (!start) throw new FormulaError("#NAME?", `unknown name "${text}"`);
    if (!this.peekOp(":")) {
      return { kind: "area", area: { top: start.row, left: start.column, bottom: start.row, right: start.column }, range: false };
    }
    this.at++;
    const endToken = this.tokens[this.at++];
    const end = endToken?.kind === "name" ? parseCellName(endToken.text) : undefined;
    if (!end) throw new FormulaError("#ERROR!", `${text}: must be followed by a cell, as in ${text}:B3`);
    return {
      kind: "area",
      area: {
        top: Math.min(start.row, end.row),
        left: Math.min(start.column, end.column),
        bottom: Math.max(start.row, end.row),
        right: Math.max(start.column, end.column),
      },
      range: true,
    };
  }
}

const parsed = new Map<string, Node | FormulaError>();

/** The formula's syntax tree, or the error that keeps it from being one */
function parse(formula: string): Node | FormulaError {
  let result = parsed.get(formula);
  if (result) return result;
  const { tokens, error } = tokenize(formula);
  if (error) result = error;
  else if (tokens.length === 0) result = new FormulaError("#ERROR!", "the formula is empty");
  else {
    try {
      result = new Parser(formula, tokens).parse();
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e;
      result = e;
    }
  }
  // Formulas are few and short: the cache only has to avoid parsing them for every cell
  if (parsed.size > 500) parsed.clear();
  parsed.set(formula, result);
  return result;
}

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

function wholeColumnNames(node: Node, names: Set<string>): Set<string> {
  switch (node.kind) {
    case "column":
      // Another table's column is not a total of this one's
      if (!node.thisRow && !node.table) names.add(node.name);
      break;
    case "call":
      for (const arg of node.args) wholeColumnNames(arg, names);
      break;
    case "unary":
      wholeColumnNames(node.arg, names);
      break;
    case "binary":
      wholeColumnNames(node.left, names);
      wholeColumnNames(node.right, names);
      break;
  }
  return names;
}

// ---- evaluation ----------------------------------------------------------------

const DECIMAL_COMMA_RE = /\d,\d/;

/**
 * Where formulas find the other tables they refer to: the table with a name
 * (compared ignoring case) on the formula's page, or with `page` on another;
 * undefined when there is none
 */
export type TableSource = (name: string, page?: string) => Table | undefined;

/** The sheets of the tables formulas refer to, each made once: their results are computed once too */
class Book {
  private readonly sheets = new Map<string, Sheet>();
  constructor(private readonly source: TableSource | undefined) {}

  /** The sheet a reference from `from` is to: the other table, or `from` itself when it is named so */
  sheet(ref: TableRef, from: Sheet): Sheet | FormulaError {
    const page = ref.page ?? from.page;
    if (page === from.page && from.name !== undefined && from.name.toLowerCase() === ref.name.toLowerCase()) return from;
    const key = `${page ?? ""}\u0000${ref.name.toLowerCase()}`;
    let sheet = this.sheets.get(key);
    if (!sheet) {
      const table = this.source?.(ref.name, page);
      if (!table) return new FormulaError("#REF!", `there is no table named ${ref.name}${page === undefined ? " on this page" : ` on ${page}`}`);
      sheet = new Sheet(table, this, page);
      this.sheets.set(key, sheet);
    }
    return sheet;
  }
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

  /** `page`: the page the table is on, when it is not the formulas' own (its unnamed references are to tables there) */
  constructor(
    table: Table,
    private readonly book: Book = new Book(undefined),
    readonly page?: string,
  ) {
    this.name = table.meta?.name?.trim() || undefined;
    this.headers = table.rows[0]?.cells ?? [];
    this.body = table.rows.slice(1).map((r) => r.cells);
    let comma = 0;
    let point = 0;
    for (const cells of this.body) {
      for (const cell of cells) {
        if (formulaOf(cell)) continue;
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
    const stored = formulaOf(cell);
    if (!stored) {
      const text = unescapeCell(cell).trim();
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

  /** Whether the cell holds a formula that refers to the whole column `target` */
  private refersToColumn(row: number, column: number, target: number): boolean {
    const stored = formulaOf(this.body[row]?.[column] ?? "");
    const tree = stored && parse(stored.formula);
    if (!tree || isError(tree)) return false;
    return Array.from(wholeColumnNames(tree, new Set())).some((name) => referencedColumn(this.headers, name) === target);
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

  /**
   * The total rows: those with a cell that refers to its own whole column, as
   * =SUM([qty]) under Qty. A cell that refers to another column ([@qty] /
   * SUM([qty]) in a Share column) does not make its row one.
   */
  private totalRows(): ReadonlySet<number> {
    if (this.totals) return this.totals;
    const totals = new Set<number>();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.columns; c++) if (this.refersToColumn(r, c, c)) totals.add(r);
    }
    this.totals = totals;
    return totals;
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
      case "call": {
        const f = FUNCTIONS[node.name];
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
        );
      }
      case "unary": {
        const arg = this.evaluate(node.arg, row, column);
        const time = isRange(arg) ? undefined : asTime(arg);
        if (time && node.op !== "%") return node.op === "-" ? new TimeValue(-time.seconds) : time;
        const n = toNumber(arg);
        if (isError(n)) return n;
        return node.op === "-" ? -n : node.op === "%" ? n / 100 : n;
      }
      case "binary":
        return this.binary(node.op, this.evaluate(node.left, row, column), this.evaluate(node.right, row, column));
    }
  }

  private binary(op: string, leftValue: Value, rightValue: Value): Scalar {
    const left = single(leftValue);
    const right = single(rightValue);
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

function hasFormulas(table: Table): boolean {
  return table.rows.some((row, r) => r > 0 && row.cells.some((cell) => formulaOf(cell) !== undefined));
}

/**
 * The table with every formula cell showing its current result. Returns the
 * same table when all results are up to date. Formulas in the header row are
 * left alone: a header is a column's name.
 */
export function recalculate(table: Table, tables?: TableSource): Table {
  if (!hasFormulas(table)) return table;
  const sheet = new Sheet(table, new Book(tables));
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      if (!stored) return;
      const updated = formulaCell(sheet.text(r - 1, c, stored.formula), stored.formula);
      if (updated !== cell) result = setCell(result, r, c, updated);
    });
  });
  return result;
}

/**
 * The formula a column computes row by row, as a spreadsheet's calculated
 * column: every body cell of the column (but `except`, a row of the markdown)
 * holds the same formula. Total rows (rows with a formula that refers to a
 * whole column) do not count. Undefined when the column holds anything else.
 */
export function calculatedFormula(table: Table, column: number, except?: number): string | undefined {
  let formula: string | undefined;
  for (let r = 1; r < table.rows.length; r++) {
    if (r === except || isTotalRow(table.rows[r]!.cells)) continue;
    const stored = formulaOf(table.rows[r]!.cells[column] ?? "");
    if (!stored || (formula !== undefined && formula !== stored.formula)) return undefined;
    formula = stored.formula;
  }
  return formula;
}

/** Whether a row holds a formula that refers to a whole column, such as =SUM([Qty]) */
function isTotalRow(cells: readonly string[]): boolean {
  return cells.some((cell) => {
    const stored = formulaOf(cell);
    const tree = stored && parse(stored.formula);
    return !!tree && !isError(tree) && wholeColumnNames(tree, new Set()).size > 0;
  });
}

/** The table with the empty cells of row `row` (of the markdown) filled with their columns' calculated formulas */
export function withCalculatedCells(table: Table, row: number): Table {
  let result = table;
  table.rows[row]?.cells.forEach((cell, column) => {
    if (cell.trim() !== "") return;
    const formula = calculatedFormula(table, column, row);
    if (formula) result = setCell(result, row, column, formulaCell("", formula));
  });
  return result;
}

/** How many cells of the table hold a formula */
export function formulaCount(table: Table): number {
  return table.rows.reduce((n, row, r) => n + (r === 0 ? 0 : row.cells.filter((cell) => formulaOf(cell)).length), 0);
}

/** The table with every formula removed: its cells keep their results as plain values */
export function withoutFormulas(table: Table): Table {
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      if (stored) result = setCell(result, r, c, stored.value);
    });
  });
  return result;
}

/**
 * The step every table edit goes through for formulas: rows the edit added
 * (those no row before maps to) get their calculated columns' formulas,
 * references follow the rows and columns the edit moved (see
 * shiftReferences), then every formula cell shows its result for the table
 * as edited
 */
export function formulasAfterEdit(
  before: Table,
  after: Table,
  edit: { readonly rowMap?: IndexMap; readonly columnMap?: IndexMap; readonly tables?: TableSource },
): Table {
  let table = after;
  if (edit.rowMap) {
    const kept = new Set<number>();
    for (let r = 0; r < before.rows.length; r++) {
      const moved = edit.rowMap(r);
      if (moved !== undefined) kept.add(moved);
    }
    for (let r = 1; r < after.rows.length; r++) if (!kept.has(r)) table = withCalculatedCells(table, r);
  }
  return recalculate(shiftReferences(before, table, edit.rowMap, edit.columnMap), edit.tables);
}

/** The names (lowercase) of the tables on the page that a table's formulas refer to, so they change when those do */
export function referredTableNames(table: Table): Set<string> {
  const names = new Set<string>();
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    for (const cell of row.cells) {
      const stored = formulaOf(cell);
      if (!stored) continue;
      for (const ref of references(stored.formula)) {
        if (ref.table && ref.table.page === undefined) names.add(ref.table.name.toLowerCase());
      }
    }
  });
  return names;
}

/** Why formula cells show errors: "row,column" (rows of the markdown, header 0) → code and detail */
export function formulaErrors(table: Table, tables?: TableSource): Map<string, string> {
  const errors = new Map<string, string>();
  if (!hasFormulas(table)) return errors;
  const sheet = new Sheet(table, new Book(tables));
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      const result = stored && sheet.result(r - 1, c, stored.formula);
      if (isError(result)) errors.set(`${r},${c}`, `${result.code} ${result.detail}`);
    });
  });
  return errors;
}

// ---- references follow edits ---------------------------------------------------

// Where a row or column of the table before an edit is after it; undefined: deleted
export type IndexMap = (index: number) => number | undefined;

/**
 * Where a span of rows (columns) a..b ends up. A map that keeps order (insert,
 * delete) maps its ends, so a row inserted inside widens the span; a span whose
 * rows are only reordered among themselves (sorting) keeps its extent; else
 * (a row moved out of it) it is the longest run of its rows still next to each
 * other, so it never stretches over rows in between. Undefined: all deleted.
 */
function mapSpan(a: number, b: number, map: IndexMap): [number, number] | undefined {
  const mapped: number[] = [];
  for (let i = a; i <= b; i++) {
    const m = map(i);
    if (m !== undefined) mapped.push(m);
  }
  if (mapped.length === 0) return undefined;
  const lo = Math.min(...mapped);
  const hi = Math.max(...mapped);
  const ordered = mapped.every((m, i) => i === 0 || m > mapped[i - 1]!);
  if (ordered || hi - lo + 1 === mapped.length) return [lo, hi];
  const sorted = [...mapped].sort((x, y) => x - y);
  let best: [number, number] = [sorted[0]!, sorted[0]!];
  let start = sorted[0]!;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1]! + 1) continue;
    const end = sorted[i - 1]!;
    if (end - start > best[1] - best[0]) best = [start, end];
    if (i < sorted.length) start = sorted[i]!;
  }
  return best;
}

/**
 * The edited table with the references of its formulas following the edit:
 * A1 references follow moved, inserted and deleted rows and columns (a
 * reference to deleted cells becomes #REF!), [Name] references a renamed or
 * moved column. `rowMap` maps the rows of the markdown (header 0),
 * `columnMap` the columns; both default to "unchanged".
 */
export function shiftReferences(before: Table, after: Table, rowMap?: IndexMap, columnMap?: IndexMap): Table {
  if (!hasFormulas(after)) return after;
  const bodyMap: IndexMap = (b) => {
    const r = rowMap ? rowMap(b + 1) : b + 1;
    return r === undefined || r < 1 ? undefined : r - 1;
  };
  const columns: IndexMap = columnMap ?? ((c) => c);
  const headersBefore = before.rows[0]?.cells ?? [];
  const headersAfter = after.rows[0]?.cells ?? [];
  const rewrite = (formula: string): string => {
    let result = formula;
    for (const ref of references(formula).reverse()) {
      // References to another table do not follow this table's rows and columns
      if (ref.table) continue;
      let text: string | undefined;
      if (ref.kind === "area") {
        if (!rowMap && !columnMap) continue;
        const rows = mapSpan(ref.area.top, ref.area.bottom, bodyMap);
        const cols = mapSpan(ref.area.left, ref.area.right, columns);
        const written = formula.slice(ref.from, ref.to);
        const range = written.includes(":");
        text =
          rows && cols
            ? range
              ? `${cellName(rows[0], cols[0])}:${cellName(rows[1], cols[1])}`
              : cellName(rows[0], cols[0])
            : REF_ERROR;
        if (text === written.toUpperCase()) continue;
      } else {
        const id = referencedColumnId(headersBefore, ref.name);
        const followed = followColumn(headersBefore, headersAfter, id, columns);
        if (followed === undefined) continue;
        if (followed === null) text = REF_ERROR;
        else {
          if (sameColumnId(followed, id)) continue;
          text = columnRefText(followed, ref.thisRow);
          if (!text) continue;
        }
      }
      result = result.slice(0, ref.from) + text + result.slice(ref.to);
    }
    return result;
  };
  let result = after;
  after.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = formulaOf(cell);
      if (!stored) return;
      const formula = rewrite(stored.formula);
      if (formula !== stored.formula) result = setCell(result, r, c, formulaCell(stored.value, formula));
    });
  });
  return result;
}

// ---- help while typing -------------------------------------------------------

export type FormulaHelp = { readonly syntax: string; readonly description: string };

export const REFERENCE_HELP: FormulaHelp = {
  syntax: "A1 · A1:B3 · [Column] · [@Column] · name!A1 · name![Column]",
  description:
    "A cell (A1 is the first row under the header), a range, a whole column by its name, that column in this row, or a cell, range or column of another table on the page by its name. Click or drag in the table to insert one, click a header for its column.",
};

// After these a reference can follow: clicking the table inserts one there
const BEFORE_OPERAND = new Set(["=", "(", ",", ";", "+", "-", "*", "/", "^", "&", "<", ">"]);

// A reference inserted by pointing at the table, and where it was inserted
export type PointedSpan = { readonly from: number; readonly to: number; readonly text: string };

/**
 * Where a reference pointed at in the table goes, with the field's selection
 * from `start` to `end`: the reference just pointed at while the caret is
 * still after it (pointing again replaces it), else the selection when an
 * operand can go there (after "=", "(", "," or an operator, not in a text in
 * quotes). Undefined: the caret is after an operand, so a click in the table
 * ends editing instead.
 */
export function referenceSlot(
  formula: string,
  start: number,
  end: number,
  pointed?: PointedSpan,
): { from: number; to: number } | undefined {
  if (!formula.trimStart().startsWith("=")) return undefined;
  if (pointed && start === pointed.to && end === pointed.to && formula.slice(pointed.from, pointed.to) === pointed.text) {
    return { from: pointed.from, to: pointed.to };
  }
  // In a text in quotes (or after something that is not a formula) a reference does not belong
  if (tokenize(formula.slice(0, start)).error) return undefined;
  const before = formula.slice(0, start).trimEnd();
  // Right before another operand ("=SUM(|A1"), a reference would run into it
  const after = formula.slice(end).trimStart();
  if (/^[A-Za-z0-9_.["#(]/.test(after)) return undefined;
  return BEFORE_OPERAND.has(before[before.length - 1] ?? "") ? { from: start, to: end } : undefined;
}

// Replacing from..to with `text` completes the function name being typed
export type FunctionCompletion = { readonly from: number; readonly to: number; readonly text: string };

/**
 * The completion of the function name typed right before the caret: its
 * full name and "(", when it can only be one function (or it is one's whole
 * name, as IF next to IFERROR). Undefined in a text in quotes, for a cell
 * name (A1), before a "(" already there, or when it is not clear.
 */
export function completeFunction(text: string, start: number, end: number): FunctionCompletion | undefined {
  if (start !== end || !text.trimStart().startsWith("=")) return undefined;
  const before = text.slice(0, start);
  const typing = /([A-Za-z][A-Za-z0-9_.]*)$/.exec(before)?.[1];
  if (!typing || /[0-9]/.test(typing) || text[start] === "(" || /[A-Za-z0-9_.]/.test(text[start] ?? "")) return undefined;
  if (tokenize(before).error) return undefined;
  const prefix = typing.toUpperCase();
  const names = Object.keys(FUNCTIONS).filter((name) => name.startsWith(prefix));
  const name = names.length === 1 ? names[0] : names.find((n) => n === prefix);
  return name ? { from: start - typing.length, to: start, text: `${name}(` } : undefined;
}

/**
 * Help for the formula being typed, with the cursor at `caret`: the functions
 * whose names start with the name being typed, else the function whose
 * arguments the cursor is in, else how references are written.
 */
export function formulaHelp(text: string, caret: number): FormulaHelp[] {
  if (!text.trimStart().startsWith("=")) return [];
  const before = text.slice(0, caret);
  const typing = /([A-Za-z][A-Za-z0-9_.]*)$/.exec(before)?.[1];
  if (typing && !/[0-9]/.test(typing) && text[caret] !== "(") {
    const prefix = typing.toUpperCase();
    const matches = Object.entries(FUNCTIONS).filter(([name]) => name.startsWith(prefix));
    if (matches.length) return matches.map(([, f]) => ({ syntax: f.syntax, description: f.description }));
  }
  // The innermost call whose parenthesis is still open before the caret
  const { tokens } = tokenize(before);
  const open: (string | undefined)[] = [];
  tokens.forEach((token, i) => {
    if (token.kind !== "op") return;
    if (token.text === "(") {
      const previous = tokens[i - 1];
      open.push(previous?.kind === "name" ? previous.text.toUpperCase() : undefined);
    } else if (token.text === ")") open.pop();
  });
  for (let i = open.length - 1; i >= 0; i--) {
    const f = open[i] && FUNCTIONS[open[i]!];
    if (f) return [{ syntax: f.syntax, description: f.description }];
  }
  return [REFERENCE_HELP];
}

