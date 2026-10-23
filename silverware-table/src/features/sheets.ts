// The sheets module, the sheet module's model side (the sheet view itself is
// the SilverBullet adapter's: core/silverbullet/modules/sheet.ts): the sheet's
// name in the toolbar's row of names, a click on it its field: typed there,
// the table goes to that sheet (a new one, or one of the page's), left empty,
// off it. A table on a sheet says so in its metadata row
// (`<meta core.table core.name='costs' sheet.name='Budget' sheet.at='B3'>`,
// sheet/page.ts) and has a name: the sheet's other
// tables refer to its cells by it (`costs!B2`). Moved, it keeps its place where
// nothing of the sheet is in its way, else goes in column A, one empty row
// under the sheet's lowest table; off a sheet, its name stays (formulas may
// refer to it). The
// sheet's own data (its columns' widths) is its first table's in the page:
// any write that makes another table the first (adding one before it,
// removing it) hands it over in the same edit (writeStep, otherTablesWritten).
// A table on a sheet that grows makes room on it in the same edit: the other
// tables' places (`at`) as sheet/layout.ts has them (refusesWrite where it
// cannot).
import type { Feature, ModelHost, TableInfo, ToolbarButton, WriteEdit } from "../core/feature.ts";
import { locateBySource, type PageTable, parseTable, type Table } from "../markdown.ts";
import { type Room, roomFor } from "../sheet/layout.ts";
import {
  AT_KEY,
  formatAt,
  parseAt,
  placeBelow,
  SHEET_KEY,
  canPlace,
  sheetDataTable,
  type SheetMeta,
  sheetOfTable,
  sameSheet,
  sheetData,
  sheetNameProblem,
  sheetsOf,
  sheetTables,
  sheetTablesOf,
  freeName,
} from "../sheet/page.ts";

export class Sheets implements Feature {
  constructor(private readonly host: ModelHost) {}

  /** Deleting the sheet's last table: the sheet goes with it */
  tableDeleteWarning(info: TableInfo): string | undefined {
    const sheet = sheetOfTable(this.host, parseTable(info.source));
    if (!sheet) return undefined;
    const others = sheetTables(this.host, this.host.pageText).filter((t) => sameSheet(t.sheet, sheet) && t.range.text !== info.source);
    if (!others.length) return `the sheet ${sheet} goes with it, as it is its only table`;
    // The sheet's own data it holds goes to the next table, where that can take it (the metadata setting off: no)
    const data = sheetData(this.host, parseTable(info.source));
    const next = others[0]!;
    if (data.length && !data.every(([key]) => this.host.canStoreMeta(next.table, key))) {
      return `the sheet ${sheet}'s column widths, kept in it, go with it (the Store table metadata setting is off, so no other table takes them)`;
    }
    return undefined;
  }

  /**
   * The sheet's name in the toolbar's row of names, No sheet (muted) on none: a
   * click on it its field. Typed there, the table goes to that sheet (a new
   * one, or one of the page's joined), the others stay where they are; left
   * empty, it comes off its sheet.
   */
  toolbarButtons(info: TableInfo): ToolbarButton[] {
    const sheet = sheetOfTable(this.host, parseTable(info.source));
    // Shown as a sheet (laid out on a grid: the sheet view) but on none: said so, in the toolbar whatever its setting
    const missing = !sheet && !!this.host.addressFrame(info);
    const title = sheet
      ? `This table is on the sheet ${sheet}: click to move it to another sheet (type its name: a new one, or one of the page's), or off it (empty)`
      : missing
        ? "This table is shown as a sheet but is on none: click to put it on one (type its name: a new one, or one of the page's); then tables can be made, moved and grown beside it"
        : "This table is on no sheet: click to put it on one (type its name: a new one, or one of the page's), to show it with other tables as a spreadsheet's sheet";
    return [
      {
        label: sheet ?? "No sheet",
        title,
        place: "name",
        slot: "container",
        caption: "Sheet",
        ...(sheet ? {} : missing ? { attention: true } : { muted: true }),
        naming: {
          ...(sheet ? { name: sheet } : {}),
          label: sheet ? "Move this table to another sheet (empty: off the sheet)" : "Put this table on a sheet",
          clear: { label: "Remove from sheet", title: "The table off its sheet: its place in the page and its name stay" },
          ...(this.host.canStoreMeta(parseTable(info.source), SHEET_KEY) ? {} : { disabled: "A sheet is kept in the table's metadata: turn on Store table metadata in the settings" }),
          save: (name) => this.moveTo(info, name),
        },
        run: () => {},
      },
    ];
  }

  /**
   * The table to the sheet named (a new one, or one of the page's joined): at
   * its place where none of that sheet's tables is in its way, else in column
   * A one empty row under its lowest one; named if it has no name (the
   * sheet's other tables refer to its cells by it). Empty: off its sheet.
   * Refused, with why, for a name that cannot be a sheet's.
   */
  private async moveTo(shown: TableInfo, typed: string): Promise<string | undefined> {
    const info = this.host.tableFor(shown.key) ?? shown;
    const current = sheetOfTable(this.host, parseTable(info.source));
    const name = typed.trim();
    if (name === "") {
      if (current) await this.remove(info);
      else this.host.focusPage();
      return undefined;
    }
    if (current && sameSheet(current, name)) {
      this.host.focusPage();
      return undefined;
    }
    const problem = sheetNameProblem(name);
    if (problem) return problem;
    // (Taken off it above: that removes, which the setting off allows)
    if (!canPlace(this.host, parseTable(info.source))) return "a table's sheet, place and name are kept in its metadata: turn on Store table metadata in the settings";
    const text = await this.host.bridge.getText();
    const self = locateBySource(text, info.hint, info.source);
    const tables = sheetTables(this.host, text);
    const target = sheetsOf(tables).find((s) => sameSheet(s.name, name));
    const others = (target?.tables ?? []).filter((t) => t.range.from !== self?.from);
    const mine = tables.find((t) => t.range.from === self?.from);
    const table = parseTable(info.source);
    const rows = table.rows.length;
    const columns = table.align.length;
    const free = (at: { row: number; column: number }) =>
      others.every((o) => at.column + columns - 1 < o.at.column || o.at.column + o.columns - 1 < at.column || at.row + rows - 1 < o.at.row || o.at.row + o.rows - 1 < at.row);
    const at = mine && free(mine.at) ? mine.at : placeBelow(others);
    const own = this.host.tableName(table);
    const tableName = own ?? freeName(this.host, text);
    const result = await this.host.writeTable(info, (t: Table) =>
      this.host.setMeta(this.host.setMeta(this.host.withTableName(t, tableName), SHEET_KEY, target?.name ?? name), AT_KEY, formatAt(at)),
    );
    if (result === "written" && !own) void this.host.bridge.flash(`Silverware Table: the table is named ${tableName}, as the sheet's other tables refer to its cells by it (${tableName}!B2)`, "info");
    return undefined;
  }

  /** Off the sheet: its `sheet` and `at` go, its name stays (the sheet's own data, if it kept it, goes on: writeStep) */
  private async remove(shown: TableInfo): Promise<void> {
    await this.host.writeTable(this.host.tableFor(shown.key) ?? shown, (t: Table) => this.host.setMeta(this.host.setMeta(t, SHEET_KEY, undefined), AT_KEY, undefined));
  }

  /** The table written: the sheet's own data taken, or handed on, where the write makes it the sheet's first table, or no longer */
  writeStep(before: Table, after: Table, edit: WriteEdit): Table {
    let out = after;
    for (const move of handovers(this.host, before, after, edit)) {
      if (move.from === edit.page.from) out = move.data.reduce((t, [name]) => this.host.setMeta(t, name, undefined), out);
      if (move.to === edit.page.from) out = move.data.reduce((t, [name, value]) => this.host.setMeta(t, name, value), out);
    }
    return out;
  }

  /** A table of a sheet that would grow into another it overlaps already (sheet/layout.ts): not written */
  refusesWrite(before: Table, after: Table, edit: WriteEdit): string | undefined {
    const room = roomOnSheet(this.host, before, after, edit);
    return room && "refused" in room ? `the table cannot grow into ${room.refused}, which overlaps it on the sheet already: check their places (at)` : undefined;
  }

  /**
   * The page's other tables the write changes: those giving or taking the
   * sheet's own data, those moved to make room; the table deleted (no `after`):
   * its sheet's next table takes the data
   */
  otherTablesWritten(before: Table, after: Table | undefined, edit: WriteEdit): readonly PageTable[] {
    const page = new Map(edit.page.tables.map((t) => [t.range.from, t]));
    const written = new Map<number, PageTable>();
    const change = (from: number | undefined, f: (table: Table) => Table) => {
      const other = from === undefined || from === edit.page.from ? undefined : (written.get(from) ?? page.get(from));
      if (other) written.set(from!, { range: other.range, table: f(other.table) });
    };
    for (const move of handovers(this.host, before, after, edit)) {
      change(move.from, (t) => move.data.reduce((out, [name]) => this.host.setMeta(out, name, undefined), t));
      change(move.to, (t) => move.data.reduce((out, [name, value]) => this.host.setMeta(out, name, value), t));
    }
    const room = after && roomOnSheet(this.host, before, after, edit);
    if (room && "moved" in room) for (const [from, at] of room.moved) change(from, (t) => this.host.setMeta(t, AT_KEY, formatAt(at)));
    return [...written.values()];
  }
}

/**
 * The room a table of a sheet that grows in the write makes on it (it stays
 * on its sheet, at its place); undefined: it is on none, or does not grow there
 */
function roomOnSheet(meta: SheetMeta, before: Table, after: Table, edit: WriteEdit): Room | undefined {
  const at = edit.page.from;
  const tables = sheetTablesOf(meta, edit.page.tables.map((t) => (t.range.from === at ? { range: t.range, table: before } : t)));
  const mine = tables.find((t) => t.range.from === at);
  // After the write still on its sheet, at its place
  const sheetAfter = meta.getMeta(after, SHEET_KEY)?.trim();
  const atAfter = parseAt(meta.getMeta(after, AT_KEY));
  if (!mine || !sheetAfter || !sameSheet(sheetAfter, mine.sheet) || atAfter?.row !== mine.at.row || atAfter.column !== mine.at.column) return undefined;
  const rows = after.rows.length;
  const columns = after.align.length;
  if (rows <= mine.rows && columns <= mine.columns) return undefined;
  const sheet = tables.filter((t) => sameSheet(t.sheet, mine.sheet));
  return roomFor(
    sheet.map((t) => ({ id: t.range.from, at: t.at, rows: t.rows, columns: t.columns, ...(t.name ? { name: t.name } : {}) })),
    { id: at, rows, columns, claims: !!edit.claims },
  );
}

/**
 * Where the sheet's own data goes in a write of a table (its sheet before or
 * after it): from the table holding it before the write (sheetDataTable) to
 * the sheet's first after it, where they differ (by where they are in the
 * page); none to go to: the sheet is gone with its data. One the first
 * cannot take (the metadata setting off) stays where it is, unless its table
 * is gone.
 */
function handovers(meta: SheetMeta, before: Table, after: Table | undefined, edit: WriteEdit): { data: [string, string][]; from: number; to: number | undefined }[] {
  const at = edit.page.from;
  // (No table: it is deleted)
  const withEdited = (table: Table | undefined) =>
    edit.page.tables.flatMap((t) => (t.range.from !== at ? [t] : table ? [{ range: t.range, table }] : []));
  const sheetsBefore = sheetsOf(sheetTablesOf(meta, withEdited(before)));
  const sheetsAfter = sheetsOf(sheetTablesOf(meta, withEdited(after)));
  const moves: { data: [string, string][]; from: number; to: number | undefined }[] = [];
  for (const sheet of sheetsBefore) {
    const first = sheetDataTable(meta, sheet.tables)!;
    const data = sheetData(meta, first.table);
    const next = sheetsAfter.find((s) => sameSheet(s.name, sheet.name))?.tables[0];
    if (!data.length || next?.range.from === first.range.from) continue;
    const stays = !(after === undefined && first.range.from === at);
    if (next && stays && !data.every(([key]) => meta.canStoreMeta(next.table, key))) continue;
    // Its only table gone to a sheet no table was on, which it heads (the sheet renamed): its data goes with it
    const there = !next && first.range.from === at ? sheetsAfter.find((s) => s.tables[0]?.range.from === at) : undefined;
    if (there && !sheetsBefore.some((s) => sameSheet(s.name, there.name))) continue;
    moves.push({ data, from: first.range.from, to: next?.range.from });
  }
  return moves;
}


