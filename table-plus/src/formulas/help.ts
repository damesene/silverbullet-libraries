// Help while a formula is typed: function names completed, the function's
// syntax and description, where a pointed reference goes.
import { CELL_RE } from "../names.ts";
import { functionNamed, functionNames } from "./registry.ts";
import { tokenize } from "./tokens.ts";

export type FormulaHelp = { readonly syntax: string; readonly description: string };

export const REFERENCE_HELP: FormulaHelp = {
  syntax: "A1 · A1:B3 · [Column] · [@Column] · table!A1 · table![Column] · cell_name",
  description:
    "A cell (A1 is the first row under the header), a range, a whole column by its name, that column in this row, a cell, range or column of another table on the page by its name, or a named cell. Click or drag in the table to insert one, click a header for its column.",
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
  if (!typing || CELL_RE.test(typing) || text[start] === "(" || /[A-Za-z0-9_.]/.test(text[start] ?? "")) return undefined;
  if (tokenize(before).error) return undefined;
  const prefix = typing.toUpperCase();
  const names = functionNames().filter((name) => name.startsWith(prefix));
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
  if (typing && !CELL_RE.test(typing) && text[caret] !== "(") {
    const prefix = typing.toUpperCase();
    const matches = functionNames().filter((name) => name.startsWith(prefix)).map((name) => functionNamed(name)!);
    if (matches.length) return matches.map((f) => ({ syntax: f.syntax, description: f.description }));
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
    const f = open[i] && functionNamed(open[i]!);
    if (f) return [{ syntax: f.syntax, description: f.description }];
  }
  return [REFERENCE_HELP];
}
