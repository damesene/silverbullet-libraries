// Fixing a formula typed with a common slip (a missing ")"), saying what was fixed.
import { parse } from "./parser.ts";
import { isError } from "./values.ts";

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
