// A formula's syntax tree, parsed once per formula text.
import { type Area, isRowName, parseCellName, type TableRef, tableRefOf } from "./references.ts";
import { type Token, tokenize } from "./tokens.ts";
import { FormulaError, type Scalar } from "./values.ts";

export type Node =
  | { readonly kind: "literal"; readonly value: Scalar }
  | { readonly kind: "area"; readonly area: Area; readonly range: boolean; readonly table?: TableRef }
  | { readonly kind: "column"; readonly name: string; readonly thisRow: boolean; readonly table?: TableRef }
  | { readonly kind: "call"; readonly name: string; readonly args: readonly Node[] }
  // A named cell (names.ts): vat, or [[Page]]vat on another page
  | { readonly kind: "named"; readonly name: string; readonly page?: string }
  // A named row's cell: pear[price], prices!pear[price]
  | { readonly kind: "rowCell"; readonly row: string; readonly column: string; readonly table?: TableRef }
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
      case "named":
        return { kind: "named", name: token.name, page: token.page };
      case "table": {
        // prices!B2, prices!A1:B3, prices![Price]
        const next = this.tokens[this.at];
        const prefix = this.text(token);
        // A reference to deleted cells of the other table, as references following it write it
        if (next?.kind === "ref-error") {
          this.at++;
          return { kind: "literal", value: new FormulaError("#REF!", `a reference to deleted cells of ${token.name}`) };
        }
        if (next?.kind === "column") {
          this.at++;
          if (next.thisRow) {
            throw new FormulaError("#ERROR!", `[@${next.name}] is a cell of the formula's own row: ${prefix}[${next.name}] is the other table's column`);
          }
          return { kind: "column", name: next.name, thisRow: false, table: tableRefOf(token) };
        }
        if (next?.kind === "name" && isRowName(this.tokens, this.at)) {
          this.at++;
          return { ...this.rowCell(next.text), table: tableRefOf(token) };
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

  /** The named row `row`'s cell in the [column] that follows (the token at `at`) */
  private rowCell(row: string): Extract<Node, { kind: "rowCell" }> {
    const column = this.tokens[this.at++] as Extract<Token, { kind: "column" }>;
    if (column.thisRow) throw new FormulaError("#ERROR!", `${row}[@${column.name}]: a row's cell is written ${row}[${column.name}]`);
    return { kind: "rowCell", row, column: column.name };
  }

  private name(text: string): Node {
    if (this.peekOp("(")) {
      this.at++;
      const args: Node[] = [];
      if (this.peekOp(")")) this.at++;
      else {
        for (;;) {
          // An argument left out between others (XLOOKUP(a, b, c, , 1)) is null, which a function takes as not given
          args.push(this.peekOp(",", ";") ? { kind: "literal", value: null } : this.comparison());
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
    // A name before a [column] is a row's (pear[price]); any other a named cell's
    if (isRowName(this.tokens, this.at - 1)) return this.rowCell(text);
    if (!start) return { kind: "named", name: text };
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
export function parse(formula: string): Node | FormulaError {
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

export function wholeColumnNames(node: Node, names: Set<string>): Set<string> {
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
