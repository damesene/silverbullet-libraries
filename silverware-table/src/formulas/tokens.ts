// A formula's tokens: numbers, text, names, [columns], operators, tables.
import { CELL_RE } from "../names.ts";
import { FormulaError } from "./values.ts";

export type Token =
  | { readonly kind: "number"; readonly value: number; readonly from: number; readonly to: number }
  | { readonly kind: "string"; readonly value: string; readonly from: number; readonly to: number }
  | { readonly kind: "name"; readonly text: string; readonly from: number; readonly to: number }
  | { readonly kind: "column"; readonly name: string; readonly thisRow: boolean; readonly from: number; readonly to: number }
  | { readonly kind: "op"; readonly text: string; readonly from: number; readonly to: number }
  // "prices!" or "[[Page]]prices!": the table the next reference is to
  | { readonly kind: "table"; readonly name: string; readonly page?: string; readonly from: number; readonly to: number }
  // "[[Page]]vat": the cell named vat on another page (a bare name is a "name" token)
  | { readonly kind: "named"; readonly name: string; readonly page: string; readonly from: number; readonly to: number }
  // A reference to cells that were deleted, as written by shiftReferences
  | { readonly kind: "ref-error"; readonly from: number; readonly to: number };

export const REF_ERROR = "#REF!";

const OPERATORS = ["<=", ">=", "<>", "+", "-", "*", "/", "^", "&", "=", "<", ">", "(", ")", ",", ";", ":", "%"];

/**
 * The formula's tokens (positions are offsets in `formula`). Stops at the first
 * thing that is not a token: `error` then says what, and `tokens` holds those
 * before it, which is enough to find references while a formula is typed.
 */
export function tokenize(formula: string): { tokens: Token[]; error?: FormulaError } {
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
      const after = close < 0 ? null : /^([A-Za-z_][A-Za-z0-9_]*)(!?)/.exec(formula.slice(close + 2));
      if (close < 0) return fail("a page name is missing its closing ]]");
      // A1, TRUE or FALSE right after [[Page]] is not a cell's name (names.ts refuses those)
      if (!after || (!after[2] && (CELL_RE.test(after[1]!) || /^(true|false)$/i.test(after[1]!)))) {
        return fail("[[Page]] is followed by a table's name and !, as in [[Page]]prices!A1, or a cell's name");
      }
      const page = formula.slice(i + 2, close).trim();
      const to = close + 2 + after[0].length;
      tokens.push(after[2] ? { kind: "table", name: after[1]!, page, from: i, to } : { kind: "named", name: after[1]!, page, from: i, to });
      i = to;
      continue;
    }
    // A cell with $ ($A$1, A$1, $A1: one token, as A1 is); a name cannot have a $
    const fixedCell = /^\$?[A-Za-z]{1,3}\$?[1-9]\d*(?![A-Za-z0-9_.$])/.exec(formula.slice(i));
    if (fixedCell && fixedCell[0].includes("$")) {
      tokens.push({ kind: "name", text: fixedCell[0], from: i, to: i + fixedCell[0].length });
      i += fixedCell[0].length;
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
