// What AutoFill writes: the cells dragged over, from the cells selected, line
// by line (a column filled down or up, a row filled right or left).
import { escapeCell, type Table, unescapeCell } from "../markdown.ts";
import { setCell } from "../ops.ts";
import { withoutTags } from "../tags.ts";
import { seriesFor } from "./registry.ts";

/** A cell of the markdown's table: its row (the header 0) and column */
export type Cell = { readonly row: number; readonly column: number };

/**
 * A line filled: the cells selected in it in order, and the cells dragged
 * over, nearest first (`backward`: before the selected ones, dragged up or left)
 */
export type FillLine = { readonly sources: readonly Cell[]; readonly targets: readonly Cell[]; readonly backward: boolean };

export type FillCells = {
  /** A copy of a cell another part makes (a formula, its references moved), or undefined: the cell is a value */
  readonly claim: (cell: string, from: Cell, to: Cell) => string | undefined;
  /** A cell's new markdown with the hidden tags the cell written over keeps (names) */
  readonly keepTags: (value: string, from: string) => string;
};

/** A cell's text as AutoFill reads it: without its hidden tags, unescaped */
export function cellValue(cell: string): string {
  return unescapeCell(withoutTags(cell)).trim();
}

/**
 * The cells a line's targets get, in their order. Where a selected cell is a
 * copy another part makes (a formula), the selected cells repeat as copies;
 * else their values go on with the first series that fits them (numbers,
 * dates, days…), or repeat.
 */
export function fillLine(table: Table, line: FillLine, cells: FillCells): string[] {
  const raw = (cell: Cell) => table.rows[cell.row]?.cells[cell.column] ?? "";
  const { sources, targets, backward } = line;
  const k = sources.length;
  if (k === 0) return targets.map(() => "");
  // The selected cell a target takes, as the selection repeats: nearest first, going away from it
  const sourceOf = (j: number) => (backward ? sources[k - 1 - (j % k)]! : sources[j % k]!);
  if (sources.some((s) => cells.claim(raw(s), s, s) !== undefined)) {
    return targets.map((target, j) => {
      const source = sourceOf(j);
      const copy = cells.claim(raw(source), source, target) ?? escapeCell(cellValue(raw(source)));
      return cells.keepTags(copy, raw(target));
    });
  }
  const { next } = seriesFor(sources.map((s) => cellValue(raw(s))));
  return targets.map((target, j) => cells.keepTags(escapeCell(next(backward ? -1 - j : k + j)), raw(target)));
}

/** The table with every line filled */
export function filled(table: Table, lines: readonly FillLine[], cells: FillCells): Table {
  let result = table;
  for (const line of lines) {
    fillLine(table, line, cells).forEach((cell, j) => {
      const target = line.targets[j]!;
      result = setCell(result, target.row, target.column, cell);
    });
  }
  return result;
}
