// How a sheet's tables make room for one that grows: the one place the rule
// is kept (docs/silverware-table-sheet-plan.md, phase 3). Everything that
// starts below the grown table's bottom moves down, whatever its columns, and
// everything that starts right of its right edge moves right, all by the same
// amount, so the layout a user made (tables side by side, columns under each
// other) stays whole; a table beside it (across that line) stays where it is,
// and if the growth would reach into it, the growth is refused. Rows and
// columns inserted move what is beyond by as many; rows and columns that take
// the empty cells past the table (`claims`: a value typed or pasted there)
// move it only as far as they would reach into it. A table that shrinks moves
// nothing back. Pure: places in, places out.
import { formatAt, type SheetCell } from "./page.ts";

/** A table as the layout sees it: an id (where it is in the page), its top left on the sheet, its rows (the header too) and columns */
export type LaidOut = { readonly id: number; readonly at: SheetCell; readonly rows: number; readonly columns: number; readonly name?: string };

/** A table that grows: its rows and columns after the edit; `claims`: they take the empty cells past it rather than being inserted */
export type Growth = { readonly id: number; readonly rows: number; readonly columns: number; readonly claims: boolean };

/** The tables moved (their new top left, by id), or why the growth is refused (the table it would reach into) */
export type Room = { readonly moved: ReadonlyMap<number, SheetCell> } | { readonly refused: string };

type Box = { top: number; left: number; bottom: number; right: number };

const box = (at: SheetCell, rows: number, columns: number): Box => ({ top: at.row, left: at.column, bottom: at.row + rows - 1, right: at.column + columns - 1 });
const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 <= b1 && b0 <= a1;

/** The room a growth makes on its sheet (`tables`: the sheet's, as they are before it) */
export function roomFor(tables: readonly LaidOut[], growth: Growth): Room {
  const grown = tables.find((t) => t.id === growth.id);
  if (!grown) return { moved: new Map() };
  const at = new Map(tables.map((t) => [t.id, t.at]));
  const others = tables.filter((t) => t.id !== grown.id);
  const boxOf = (t: LaidOut) => box(at.get(t.id)!, t.rows, t.columns);
  const name = (t: LaidOut) => t.name ?? `the table at ${formatAt(t.at)}`;
  const before = box(grown.at, grown.rows, grown.columns);
  const rows = Math.max(grown.rows, growth.rows);
  const columns = Math.max(grown.columns, growth.columns);

  // Down: rows added past the bottom, in the table's columns as they were (new columns are the next step's)
  if (rows > grown.rows) {
    const bottom = before.top + rows - 1;
    for (const t of others) {
      const b = boxOf(t);
      if (b.top <= before.bottom && b.bottom > before.bottom && overlap(b.left, b.right, before.left, before.right)) return { refused: name(t) };
    }
    const below = others.filter((t) => boxOf(t).top > before.bottom);
    const reach = Math.max(0, ...below.filter((t) => overlap(boxOf(t).left, boxOf(t).right, before.left, before.right)).map((t) => bottom - boxOf(t).top + 1));
    const by = growth.claims ? reach : rows - grown.rows;
    for (const t of below) at.set(t.id, { row: at.get(t.id)!.row + by, column: at.get(t.id)!.column });
  }
  // Right: columns added past the right edge, in the table's rows as they are now
  if (columns > grown.columns) {
    const right = before.left + columns - 1;
    const bottom = before.top + rows - 1;
    for (const t of others) {
      const b = boxOf(t);
      if (b.left <= before.right && b.right > before.right && overlap(b.top, b.bottom, before.top, bottom)) return { refused: name(t) };
    }
    const beyond = others.filter((t) => boxOf(t).left > before.right);
    const reach = Math.max(0, ...beyond.filter((t) => overlap(boxOf(t).top, boxOf(t).bottom, before.top, bottom)).map((t) => right - boxOf(t).left + 1));
    const by = growth.claims ? reach : columns - grown.columns;
    for (const t of beyond) at.set(t.id, { row: at.get(t.id)!.row, column: at.get(t.id)!.column + by });
  }
  const moved = new Map<number, SheetCell>();
  for (const t of others) {
    const now = at.get(t.id)!;
    if (now.row !== t.at.row || now.column !== t.at.column) moved.set(t.id, now);
  }
  return { moved };
}

/**
 * Why a table moved to lie with its top left at `at` cannot be there: the
 * table it would overlap (a table is never put over another, nor pushes one
 * aside); undefined: it can
 */
export function placeProblem(tables: readonly LaidOut[], id: number, at: SheetCell): string | undefined {
  const moved = tables.find((t) => t.id === id);
  if (!moved) return undefined;
  const there = box(at, moved.rows, moved.columns);
  for (const t of tables) {
    if (t.id === id) continue;
    const b = box(t.at, t.rows, t.columns);
    if (overlap(there.top, there.bottom, b.top, b.bottom) && overlap(there.left, there.right, b.left, b.right)) return t.name ?? `the table at ${formatAt(t.at)}`;
  }
  return undefined;
}
