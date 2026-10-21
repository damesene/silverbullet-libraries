// Help while a formula is typed: the functions a name typed may be, the
// function's syntax (the argument typed marked) and description, where a
// pointed reference goes.
import { CELL_RE } from "../names.ts";
import { functionNamed, functionNames } from "./registry.ts";
import { tokenize } from "./tokens.ts";

/** What a formula's help says: a function's syntax and what it does, with the argument the caret is in (its span in `syntax`) */
export type FormulaHelp = {
  readonly syntax: string;
  readonly description: string;
  readonly argument?: { readonly from: number; readonly to: number };
};

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

/** The functions a name typed right before the caret may be: their names, and where the name is (from..to) */
export type FunctionChoices = { readonly from: number; readonly to: number; readonly names: readonly string[] };

/**
 * The functions whose names start with the name typed right before the caret
 * (the selection empty at `start`..`end`): the one of that whole name first
 * (IF before IFERROR), then the others in order. Undefined in a text in
 * quotes, for a cell (A1), in the middle of a name or before a "(" already
 * there, or when no function starts so.
 */
export function functionChoices(text: string, start: number, end: number): FunctionChoices | undefined {
  if (start !== end || !text.trimStart().startsWith("=")) return undefined;
  const before = text.slice(0, start);
  const typing = /([A-Za-z][A-Za-z0-9_.]*)$/.exec(before)?.[1];
  if (!typing || CELL_RE.test(typing) || text[start] === "(" || /[A-Za-z0-9_.]/.test(text[start] ?? "")) return undefined;
  if (tokenize(before).error) return undefined;
  const prefix = typing.toUpperCase();
  const names = functionNames()
    .filter((name) => name.startsWith(prefix))
    .sort((a, b) => Number(b === prefix) - Number(a === prefix) || a.localeCompare(b));
  return names.length ? { from: start - typing.length, to: start, names } : undefined;
}

/**
 * Help for the formula being typed, with the caret at `caret`: the function
 * whose arguments the caret is in (the one it is in marked), else how
 * references are written. Undefined for a text that is no formula.
 */
export function formulaHelp(text: string, caret: number): FormulaHelp | undefined {
  if (!text.trimStart().startsWith("=")) return undefined;
  // The calls whose parenthesis is still open before the caret, innermost last, with the arguments passed so far
  const { tokens } = tokenize(text.slice(0, caret));
  const open: { name: string | undefined; argument: number }[] = [];
  tokens.forEach((token, i) => {
    if (token.kind !== "op") return;
    if (token.text === "(") {
      const previous = tokens[i - 1];
      open.push({ name: previous?.kind === "name" ? previous.text.toUpperCase() : undefined, argument: 0 });
    } else if (token.text === ")") open.pop();
    else if ((token.text === "," || token.text === ";") && open.length) open[open.length - 1]!.argument++;
  });
  for (let i = open.length - 1; i >= 0; i--) {
    const call = open[i]!;
    const f = call.name ? functionNamed(call.name) : undefined;
    if (!f) continue;
    // Arguments of a call inside this one are not this one's
    const argument = i === open.length - 1 ? argumentSpan(f.syntax, call.argument) : undefined;
    return { syntax: f.syntax, description: f.description, ...(argument ? { argument } : {}) };
  }
  return REFERENCE_HELP;
}

/**
 * Where the `index`th argument is written in a function's syntax
 * (`SUM(number1, [number2], …)`): past the last one written before "…", that
 * one again (it repeats), or "…" itself when it is all the syntax has
 * (`VAT(…)`); undefined past the arguments a function takes
 */
export function argumentSpan(syntax: string, index: number): { from: number; to: number } | undefined {
  const open = syntax.indexOf("(");
  const close = syntax.lastIndexOf(")");
  if (open < 0 || close < open) return undefined;
  const args: { from: number; to: number }[] = [];
  let from = open + 1;
  let depth = 0;
  for (let i = open + 1; i <= close; i++) {
    const ch = syntax[i];
    if (ch === "[" || ch === "(") depth++;
    else if ((ch === "]" || ch === ")") && i < close) depth--;
    if ((ch === "," && depth === 0) || i === close) {
      const part = syntax.slice(from, i);
      const lead = part.length - part.trimStart().length;
      const span = { from: from + lead, to: from + part.trimEnd().length };
      if (span.to > span.from) args.push(span);
      from = i + 1;
    }
  }
  const repeats = args.length > 0 && syntax.slice(args[args.length - 1]!.from, args[args.length - 1]!.to) === "…";
  if (index < args.length && !(repeats && index === args.length - 1)) return args[index];
  return repeats ? args[Math.max(0, args.length - 2)] : undefined;
}
