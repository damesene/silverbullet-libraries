// A formula in a cell: its result followed by a hidden <meta f='…'> holding
// the formula, and the formula cells of a table.
import { escapeCell, metaAttribute, type Table, unescapeMetaValue } from "../markdown.ts";
import { cellNameOf, withCellName } from "../names.ts";
import { withoutTags } from "../tags.ts";
import { ERROR_CODES } from "./values.ts";

const FORMULA_TAG_RE = /<meta\s+f\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/?>/gi;

export type StoredFormula = {
  // The formula, starting with "="
  readonly formula: string;
  // The result written with it, as markdown
  readonly value: string;
  // The cell's name (names.ts), kept when the result is written again
  readonly name?: string;
};

/** The formula a cell holds, or undefined for a plain cell */
export function formulaOf(cell: string): StoredFormula | undefined {
  // No tag at all (most cells): asked for every cell of a table on every view
  if (!cell.includes("<")) return undefined;
  // The tag Silverware Table writes is the last one: a result may contain the text of another
  const match = Array.from(cell.matchAll(FORMULA_TAG_RE)).pop();
  if (!match) return undefined;
  const formula = unescapeMetaValue(match[1] ?? match[2] ?? "").trim();
  const rest = cell.slice(0, match.index) + cell.slice(match.index + match[0].length);
  const name = cellNameOf(rest);
  return { formula: formula.startsWith("=") ? formula : `=${formula}`, value: withoutTags(rest), ...(name ? { name } : {}) };
}

/** A cell holding `formula`, showing `value` (plain text), and named `name` if given */
export function formulaCell(value: string, formula: string, name?: string): string {
  const tag = `<meta ${metaAttribute("f", formula)}>`;
  const shown = escapeCell(value);
  return withCellName(shown === "" ? tag : `${shown} ${tag}`, name);
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

export function hasFormulas(table: Table): boolean {
  return table.rows.some((row, r) => r > 0 && row.cells.some((cell) => formulaOf(cell) !== undefined));
}

/** How many cells of the table hold a formula */
export function formulaCount(table: Table): number {
  return table.rows.reduce((n, row, r) => n + (r === 0 ? 0 : row.cells.filter((cell) => formulaOf(cell)).length), 0);
}

export function forFormulas(table: Table, each: (formula: string) => void): void {
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    for (const cell of row.cells) {
      const stored = formulaOf(cell);
      if (stored) each(stored.formula);
    }
  });
}
