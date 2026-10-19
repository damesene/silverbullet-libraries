// Pasting cells copied from a spreadsheet (Excel, Google Sheets, LibreOffice).
// Their text on the clipboard has a tab between cells and a line break between
// rows; a cell holding a tab, a line break or a quote is quoted as in CSV.
import { escapeCell, type Table } from "./markdown.ts";
import { insertColumn, insertRow, setCell } from "./ops.ts";
import { insertRowAt } from "./pins.ts";
import type { Pins } from "./view.ts";

/** The cells in a clipboard text, row by row; undefined for a single value (no tab, no line break) */
export function parseClipboardCells(text: string): string[][] | undefined {
  const s = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  // At the start of a cell, where a quote opens a quoted cell
  let start = true;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (start && ch === '"') {
      let j = i + 1;
      let value = "";
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] !== '"') break;
          value += '"';
          j += 2;
        } else value += s[j++];
      }
      // Quoted only if the closing quote ends the cell; else the quote is text
      if (j < s.length && (j + 1 === s.length || s[j + 1] === "\t" || s[j + 1] === "\n")) {
        cell = value;
        i = j;
        start = false;
        continue;
      }
    }
    start = false;
    if (ch === "\t") {
      row.push(cell);
      cell = "";
      start = true;
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      start = true;
    } else cell += ch;
  }
  // A line break at the end (spreadsheets add one) is not an empty last row
  if (!start || cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length === 0 || (rows.length === 1 && rows[0]!.length === 1)) return undefined;
  return rows;
}

export type PastePlan = {
  // Rows (of the markdown, header 0) and columns the pasted rows and cells go to
  readonly rows: readonly number[];
  readonly columns: readonly number[];
  // New rows inserted at `at` (a block), and new columns
  readonly newRows: { readonly at: number; readonly count: number };
  readonly newColumns: { readonly at: number; readonly count: number };
  // The pins after the paste
  readonly pins: Pins;
};

/**
 * Where `count` pasted items go along one axis, starting at `start`: the
 * existing ones up to the trailing pinned zone (or to the end, when the paste
 * starts inside that zone), then new ones inserted there, so pinned rows and
 * columns stay at the edge. Undefined when new ones would be needed but there
 * is no place for them (a paste starting among the pinned ones).
 */
function along(start: number, count: number, length: number, pinnedAtEnd: number) {
  const tail = length - pinnedAtEnd;
  const inTail = pinnedAtEnd > 0 && start >= tail;
  const end = inTail ? length : tail;
  const existing: number[] = [];
  for (let i = start; i < end && existing.length < count; i++) existing.push(i);
  const missing = count - existing.length;
  if (missing > 0 && inTail) return undefined;
  const added = Array.from({ length: missing }, (_, k) => tail + k);
  return { targets: [...existing, ...added], at: tail, count: missing };
}

/**
 * Where a paste goes. Overwriting (insert false): from the cell `at` to the
 * right and down, over the cells there, adding rows and columns where the
 * table ends (before those pinned to the bottom or right). Inserting: new rows
 * at the cell's row (under the header when pasted there), nothing overwritten.
 * Undefined, with why, when there is no room.
 */
export function planPaste(
  table: Table,
  pins: Pins,
  at: { row: number; column: number },
  data: readonly (readonly string[])[],
  insert: boolean,
): PastePlan | { error: string } {
  const width = Math.max(...data.map((r) => r.length));
  const columns = along(at.column, width, table.align.length, pins.right);
  if (!columns) return { error: "there are no columns after the columns pinned to the right to paste into" };
  if (insert) {
    const first = Math.max(1, at.row);
    let p = pins;
    let rows = table.rows.length;
    let index = first;
    const targets: number[] = [];
    for (let k = 0; k < data.length; k++) {
      const placed = insertRowAt(p, rows, index);
      targets.push(placed.at);
      p = placed.pins;
      rows++;
      index = placed.at + 1;
    }
    return {
      rows: targets,
      columns: columns.targets,
      newRows: { at: targets[0]!, count: data.length },
      newColumns: { at: columns.at, count: columns.count },
      pins: p,
    };
  }
  // From the header: its first pasted row names the columns, the others go below it
  const header = at.row === 0 ? [0] : [];
  const body = along(Math.max(1, at.row), data.length - header.length, table.rows.length, pins.bottom);
  if (!body) return { error: "there are no rows below the rows pinned to the bottom to paste into" };
  return {
    rows: [...header, ...body.targets],
    columns: columns.targets,
    newRows: { at: body.at, count: body.count },
    newColumns: { at: columns.at, count: columns.count },
    pins,
  };
}

export type Pasted = {
  readonly table: Table;
  // Values not pasted because a feature computes their cells, by why ("formula cell")
  readonly skipped: ReadonlyMap<string, number>;
};

/** How pasting treats the cells already there (the features' rules, TableHost) */
export type PasteRules = {
  // Why a cell's value is a feature's, so it is left as it is; undefined: pasted over
  readonly keptBy: (cell: string) => string | undefined;
  // The pasted value with the hidden tags the cell had (names, formulas …), as when it is edited
  readonly keepTags: (value: string, from: string) => string;
};

/**
 * The table with `data` pasted as planned. A cell a feature computes (a
 * formula's) is left; a header keeps its name where the pasted one is empty.
 * New rows get what features give new rows (calculated columns) in the write.
 */
export function pasteCells(table: Table, plan: PastePlan, data: readonly (readonly string[])[], rules: PasteRules): Pasted {
  let result = table;
  for (let k = 0; k < plan.newColumns.count; k++) result = insertColumn(result, plan.newColumns.at + k);
  for (let k = 0; k < plan.newRows.count; k++) result = insertRow(result, plan.newRows.at + k);
  const skipped = new Map<string, number>();
  data.forEach((values, i) => {
    const row = plan.rows[i]!;
    values.forEach((value, j) => {
      const column = plan.columns[j]!;
      const current = result.rows[row]?.cells[column] ?? "";
      const cell = escapeCell(value);
      const kept = rules.keptBy(current);
      if (kept) {
        if (cell !== "") skipped.set(kept, (skipped.get(kept) ?? 0) + 1);
        return;
      }
      if (row === 0 && cell === "") return;
      result = setCell(result, row, column, rules.keepTags(cell, current));
    });
  });
  return { table: result, skipped };
}
