// Formulas through table edits: references following inserted, deleted and
// moved rows and columns, renamed columns and tables; calculated columns
// filling new rows; formulas removed.
import { followColumn, sameColumnId } from "../columns.ts";
import type { Table } from "../markdown.ts";
import { type IndexMap, setCell } from "../ops.ts";
import { type FormulaCells, hasFormulas } from "./cell.ts";
import { recalculate, type TableSource } from "./evaluate.ts";
import { parse, wholeColumnNames } from "./parser.ts";
import { cellName, columnRangeText, columnRefText, type Reference, referencedColumnId, references } from "./references.ts";
import { REF_ERROR, tokenize } from "./tokens.ts";
import { isError } from "./values.ts";

/**
 * The formula a column computes row by row, as a spreadsheet's calculated
 * column: every body cell of the column (but those of the rows `except`, of
 * the markdown: new ones) holds the same formula. Total rows (rows with a
 * formula that refers to a whole column) do not count. Undefined when the
 * column holds anything else.
 */
export function calculatedFormula(cells: FormulaCells, table: Table, column: number, except: ReadonlySet<number> = new Set()): string | undefined {
  let formula: string | undefined;
  for (let r = 1; r < table.rows.length; r++) {
    if (except.has(r) || isTotalRow(cells, table.rows[r]!.cells)) continue;
    const stored = cells.formulaOf(table.rows[r]!.cells[column] ?? "");
    if (!stored || (formula !== undefined && formula !== stored.formula)) return undefined;
    formula = stored.formula;
  }
  return formula;
}

/** Whether a row holds a formula that refers to a whole column, such as =SUM([Qty]) */
function isTotalRow(cells: FormulaCells, row: readonly string[]): boolean {
  return row.some((cell) => {
    const stored = cells.formulaOf(cell);
    const tree = stored && parse(stored.formula);
    return !!tree && !isError(tree) && wholeColumnNames(tree, new Set()).size > 0;
  });
}

/**
 * The table with the empty cells of row `row` (of the markdown) filled with
 * their columns' calculated formulas, as the rows but `added` (new ones, `row`
 * among them) have them
 */
export function withCalculatedCells(cells: FormulaCells, table: Table, row: number, added: ReadonlySet<number> = new Set([row])): Table {
  let result = table;
  table.rows[row]?.cells.forEach((cell, column) => {
    if (cell.trim() !== "") return;
    const formula = calculatedFormula(cells, table, column, added);
    if (formula) result = setCell(result, row, column, cells.formulaCell("", formula));
  });
  return result;
}

/** The table with every formula removed: its cells keep their results as plain values */
export function withoutFormulas(cells: FormulaCells, table: Table): Table {
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      if (cells.formulaOf(cell)) result = setCell(result, r, c, cells.withoutFormula(cell));
    });
  });
  return result;
}

/**
 * The step every table edit goes through for formulas: rows the edit added
 * (those no row before maps to) get their calculated columns' formulas,
 * references follow the rows and columns the edit moved (see
 * shiftReferences), then every formula cell shows its result for the table
 * as edited
 */
export function formulasAfterEdit(
  before: Table,
  after: Table,
  edit: Following & { readonly tables?: TableSource },
): Table {
  const { cells } = edit;
  let table = after;
  if (edit.rowMap) {
    const kept = new Set<number>();
    for (let r = 0; r < before.rows.length; r++) {
      const moved = edit.rowMap(r);
      if (moved !== undefined) kept.add(moved);
    }
    const added = new Set<number>();
    for (let r = 1; r < after.rows.length; r++) if (!kept.has(r)) added.add(r);
    for (const r of added) table = withCalculatedCells(cells, table, r, added);
  }
  return recalculate(shiftReferences(before, table, edit), { cells, tables: edit.tables, name: edit.names?.after });
}

/**
 * Where a span of rows (columns) a..b ends up. A map that keeps order (insert,
 * delete) maps its ends, so a row inserted inside widens the span; a span whose
 * rows are only reordered among themselves (sorting) keeps its extent; else
 * (a row moved out of it) it is the longest run of its rows still next to each
 * other, so it never stretches over rows in between. Undefined: all deleted.
 */
function mapSpan(a: number, b: number, map: IndexMap): [number, number] | undefined {
  const mapped: number[] = [];
  for (let i = a; i <= b; i++) {
    const m = map(i);
    if (m !== undefined) mapped.push(m);
  }
  if (mapped.length === 0) return undefined;
  const lo = Math.min(...mapped);
  const hi = Math.max(...mapped);
  const ordered = mapped.every((m, i) => i === 0 || m > mapped[i - 1]!);
  if (ordered || hi - lo + 1 === mapped.length) return [lo, hi];
  const sorted = [...mapped].sort((x, y) => x - y);
  let best: [number, number] = [sorted[0]!, sorted[0]!];
  let start = sorted[0]!;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1]! + 1) continue;
    const end = sorted[i - 1]!;
    if (end - start > best[1] - best[0]) best = [start, end];
    if (i < sorted.length) start = sorted[i]!;
  }
  return best;
}

/** How a table's rows and columns moved in an edit, for the references to it */
/**
 * What formulas follow through an edit of a table: where its rows (of the
 * markdown, header 0) and columns went (both default to "unchanged"), and its
 * name before and after the edit (the formulas module gives it), with the
 * cells as the formulas read them
 */
export type Following = {
  readonly cells: FormulaCells;
  readonly rowMap?: IndexMap;
  readonly columnMap?: IndexMap;
  readonly names?: { readonly before?: string; readonly after?: string };
};

type TableEdit = Following & { readonly before: Table; readonly after: Table };

/**
 * What a reference to an edited table is written as after the edit: undefined
 * when it stays as written. A1 references follow moved, inserted and deleted
 * rows and columns (to deleted cells: #REF!), [Name] references a renamed or
 * moved column.
 */
function followedReference(formula: string, ref: Reference, edit: TableEdit): string | undefined {
  const { rowMap, columnMap } = edit;
  if (ref.kind === "area") {
    if (!rowMap && !columnMap) return undefined;
    const bodyMap: IndexMap = (b) => {
      const r = rowMap ? rowMap(b + 1) : b + 1;
      return r === undefined || r < 1 ? undefined : r - 1;
    };
    const rows = mapSpan(ref.area.top, ref.area.bottom, bodyMap);
    const cols = mapSpan(ref.area.left, ref.area.right, columnMap ?? ((c) => c));
    const written = formula.slice(ref.from, ref.to);
    // Its $ kept: an edit moves fixed references with their cells too, as in a spreadsheet
    const start = rows && cols && cellName(rows[0], cols[0], ref.fixed && { column: ref.fixed.left, row: ref.fixed.top });
    const end = rows && cols && cellName(rows[1], cols[1], ref.fixed && { column: ref.fixed.right, row: ref.fixed.bottom });
    const text = start && end ? (written.includes(":") ? `${start}:${end}` : start) : REF_ERROR;
    return text === written.toUpperCase() ? undefined : text;
  }
  const headersBefore = edit.before.rows[0]?.cells ?? [];
  const follow = (written: string) => {
    const id = referencedColumnId(headersBefore, written);
    return { id, followed: followColumn(headersBefore, edit.after.rows[0]?.cells ?? [], id, columnMap ?? ((c) => c)) };
  };
  const first = follow(ref.name);
  if (ref.last !== undefined) {
    // [@[a]:[b]]: both ends follow their columns; one deleted, #REF!
    const last = follow(ref.last);
    if (first.followed === null || last.followed === null) return REF_ERROR;
    if (first.followed === undefined && last.followed === undefined) return undefined;
    const a = first.followed ?? first.id;
    const b = last.followed ?? last.id;
    return sameColumnId(a, first.id) && sameColumnId(b, last.id) ? undefined : columnRangeText(a, b);
  }
  const { id, followed } = first;
  if (followed === undefined) return undefined;
  if (followed === null) return REF_ERROR;
  return sameColumnId(followed, id) ? undefined : columnRefText(followed, ref.thisRow);
}

/**
 * The table with each formula rewritten by `rewrite`, which gives the
 * formula's new text (or the same text when it stays)
 */
function withFormulas(cells: FormulaCells, table: Table, rewrite: (formula: string) => string): Table {
  let result = table;
  table.rows.forEach((row, r) => {
    if (r === 0) return;
    row.cells.forEach((cell, c) => {
      const stored = cells.formulaOf(cell);
      if (!stored) return;
      const formula = rewrite(stored.formula);
      if (formula !== stored.formula) result = setCell(result, r, c, cells.formulaCell(stored.value, formula, cell));
    });
  });
  return result;
}

/** The formula with the references `follows` picks pointing where they point after `edit` (followedReference) */
function rewriteReferences(formula: string, follows: (ref: Reference) => boolean, edit: TableEdit): string {
  let result = formula;
  for (const ref of references(formula).reverse()) {
    if (!follows(ref)) continue;
    const text = followedReference(formula, ref, edit);
    if (text !== undefined) result = result.slice(0, ref.from) + text + result.slice(ref.to);
  }
  return result;
}

/** The table's name after an edit, if the edit renamed it (not when it removed the name) */
function newName(edit: TableEdit): string | undefined {
  const from = edit.names?.before?.trim();
  const to = edit.names?.after?.trim();
  return from && to && from.toLowerCase() !== to.toLowerCase() ? to : undefined;
}

/** Whether a reference is to the table named `name` on the formula's page */
function isTo(ref: Reference, name: string | undefined): boolean {
  return !!ref.table && ref.table.page === undefined && !!name && ref.table.name.toLowerCase() === name.toLowerCase();
}

/**
 * The edited table with the references of its formulas following the edit
 * (see followedReference), also those that name the table itself
 * (mine!B2 in the table named mine), whose name follows a rename too.
 * `rowMap` maps the rows of the markdown (header 0), `columnMap` the columns;
 * both default to "unchanged". References to other tables stay as they are.
 */
export function shiftReferences(before: Table, after: Table, following: Following): Table {
  if (!hasFormulas(following.cells, after)) return after;
  const edit: TableEdit = { ...following, before, after };
  const own = following.names?.before?.trim();
  const renamed = newName(edit);
  return withFormulas(following.cells, after, (formula) => renameIn(rewriteReferences(formula, (ref) => !ref.table || isTo(ref, own), edit), own, renamed));
}

/**
 * The formula with the table `own` (on the formula's page) named `renamed`
 * instead, also in references to its deleted cells (own!#REF!)
 */
function renameIn(formula: string, own: string | undefined, renamed: string | undefined): string {
  if (!renamed || !own) return formula;
  let result = formula;
  for (const token of tokenize(formula).tokens.reverse()) {
    if (token.kind === "table" && token.page === undefined && token.name.toLowerCase() === own.toLowerCase()) {
      result = `${result.slice(0, token.from)}${renamed}!${result.slice(token.to)}`;
    }
  }
  return result;
}

/**
 * Another table of the page with its references to the edited table (named
 * so before the edit) following the edit: where they point, and the table's
 * new name if it was renamed. Other references stay as they are.
 */
export function followTable(table: Table, before: Table, after: Table, following: Following): Table {
  const name = following.names?.before?.trim();
  if (!name || !hasFormulas(following.cells, table)) return table;
  const edit: TableEdit = { ...following, before, after };
  const renamed = newName(edit);
  return withFormulas(following.cells, table, (formula) => renameIn(rewriteReferences(formula, (ref) => isTo(ref, name), edit), name, renamed));
}

/**
 * A formula copied `rows` rows and `columns` columns away (AutoFill), as a
 * spreadsheet copies it: each cell reference's edges move with it but those
 * fixed with $ ($A$1, A$1, $A1); one moved off the table (`size`: its body
 * rows and columns) becomes #REF!. References to another table move as well,
 * not checked against it. [column], [@column] and names stay: they need no
 * moving.
 */
export function filledFormula(formula: string, rows: number, columns: number, size: { readonly rows: number; readonly columns: number }): string {
  let result = formula;
  for (const ref of references(formula).reverse()) {
    if (ref.kind !== "area") continue;
    const { area, fixed } = ref;
    const moved = {
      top: fixed?.top ? area.top : area.top + rows,
      left: fixed?.left ? area.left : area.left + columns,
      bottom: fixed?.bottom ? area.bottom : area.bottom + rows,
      right: fixed?.right ? area.right : area.right + columns,
    };
    const off = Math.min(moved.top, moved.left) < 0 || (!ref.table && (moved.bottom >= size.rows || moved.right >= size.columns));
    const written = formula.slice(ref.from, ref.to);
    const start = cellName(moved.top, moved.left, fixed && { column: fixed.left, row: fixed.top });
    const end = cellName(moved.bottom, moved.right, fixed && { column: fixed.right, row: fixed.bottom });
    const text = off ? REF_ERROR : written.includes(":") ? `${start}:${end}` : start;
    result = result.slice(0, ref.from) + text + result.slice(ref.to);
  }
  return result;
}
