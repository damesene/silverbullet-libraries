// A formula's cell and range references written anew, whole (with their
// table's name): what shows a formula in other addresses than its table's
// (a grid tables are laid out on) and reads it back. Knows nothing of where
// those addresses come from.
import { type Area, areaText, type Fixed, references, type TableRef } from "./references.ts";
import { tokenize } from "./tokens.ts";

/** A cell or range reference as written: its table's (none: the formula's own), its cells, its $ */
export type WrittenArea = { readonly table?: TableRef; readonly area: Area; readonly fixed?: Fixed };

/**
 * The formula with each cell and range reference (A1, B2:C5, prices!B2,
 * [[Page]]t!A1) replaced by what `write` gives for it, its table's name with
 * it; undefined leaves the reference as written
 */
export function withAreasWritten(formula: string, write: (ref: WrittenArea) => string | undefined): string {
  // Where each table's name starts, by where it ends (a reference's own text starts there)
  const tableFrom = new Map<number, number>();
  for (const token of tokenize(formula).tokens) if (token.kind === "table") tableFrom.set(token.to, token.from);
  let result = formula;
  for (const ref of references(formula).reverse()) {
    if (ref.kind !== "area") continue;
    const text = write({ ...(ref.table ? { table: ref.table } : {}), area: ref.area, ...(ref.fixed ? { fixed: ref.fixed } : {}) });
    if (text === undefined) continue;
    const from = ref.table ? (tableFrom.get(ref.from) ?? ref.from) : ref.from;
    result = result.slice(0, from) + text + result.slice(ref.to);
  }
  return result;
}

/** A reference's text: its cells (one cell as A1), its $ kept, after its table's name if it has one */
export function writtenArea(area: Area, fixed?: Fixed, table?: string): string {
  return `${table ? `${table}!` : ""}${areaText(area, fixed)}`;
}
