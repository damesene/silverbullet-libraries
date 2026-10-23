// The sheets module's part in a table's ⋯ menu (the sheet module's model
// side; the sheet view itself is the SilverBullet adapter's: core/silverbullet/
// modules/sheet.ts): Add to sheet… puts the table on one of the page's sheets,
// or on a new one, Remove from sheet takes it off. A table on a sheet says so
// in its metadata row (`<meta name='costs' sheet='Budget' at='B3'>`, sheet/page.ts)
// and has a name: the sheet's other tables refer to its cells by it
// (`costs!B2`). Added, it goes in column A, one empty row under the sheet's
// lowest table; removed, its name stays (formulas may refer to it). The
// sheet's own data (its columns' widths) is its first table's in the page:
// any write that makes another table the first (adding one before it,
// removing it) hands it over in the same edit (writeStep, otherTablesWritten).
// A table on a sheet that grows makes room on it in the same edit: the other
// tables' places (`at`) as sheet/layout.ts has them (refusesWrite where it
// cannot).
import type { Feature, ModelHost, TableInfo, ToolbarButton, WriteEdit } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { findTables, locateBySource, type PageTable, parseTable, type Table } from "../markdown.ts";
import { metaName, sameTableName, tableNameProblem, withMeta, withMetaName } from "../meta.ts";
import { type Room, roomFor } from "../sheet/layout.ts";
import {
  AT_ATTRIBUTE,
  formatAt,
  parseAt,
  placeBelow,
  SHEET_ATTRIBUTE,
  sameSheet,
  sheetData,
  sheetNameProblem,
  sheetsOf,
  sheetTables,
  sheetTablesOf,
  freeName,
} from "../sheet/page.ts";

// The choice of a new sheet in the dialog's list
const NEW_SHEET = "";

export class Sheets implements Feature {
  constructor(private readonly host: ModelHost) {}

  toolbarButtons(info: TableInfo): ToolbarButton[] {
    const sheet = parseTable(info.source).meta?.[SHEET_ATTRIBUTE]?.trim();
    if (sheet) {
      return [
        {
          label: "Remove from sheet",
          value: sheet,
          title: `Take the table off the sheet ${sheet}: in the page it stays as it is, its name too`,
          icon: ICONS.sheet,
          run: () => void this.remove(info),
        },
      ];
    }
    return [
      {
        label: "Add to sheet…",
        title: "Show the table on a sheet with other tables of the page (a spreadsheet's sheet); in the page it stays as it is",
        icon: ICONS.sheet,
        run: () => void this.add(info),
      },
    ];
  }

  /** The dialog: a sheet of the page (or a new one's name) and the table's name */
  private async add(info: TableInfo): Promise<void> {
    if (!info.metaRow && !this.host.metadataEnabled) {
      void this.host.bridge.flash("Silverware Table: a sheet is kept in the table's metadata: turn on Store table metadata in the settings first", "info");
      return;
    }
    const text = await this.host.bridge.getText();
    const sheets = sheetsOf(sheetTables(text));
    const own = metaName(parseTable(info.source));
    const { doc } = this.host;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, label?: string) => {
      const e = doc.createElement(tag);
      e.className = className;
      if (label !== undefined) e.textContent = label;
      return e;
    };
    const sheetSelect = el("select", "swt-sheet-add-select");
    for (const sheet of sheets) sheetSelect.append(new Option(`${sheet.name} (${sheet.tables.length} ${sheet.tables.length === 1 ? "table" : "tables"})`, sheet.name));
    sheetSelect.append(new Option("New sheet…", NEW_SHEET));
    const newName = el("input", "swt-sheet-add-input");
    newName.placeholder = "The new sheet's name";
    newName.value = sheets.length ? "" : "Sheet1";
    const tableName = el("input", "swt-sheet-add-input");
    tableName.value = own ?? freeName(text);
    const problem = el("p", "swt-sheet-add-problem");
    const field = (label: string, input: HTMLElement, hint?: string) => {
      const row = el("label", "swt-sheet-add-field");
      row.append(el("span", "swt-sheet-add-label", label), input);
      if (hint) row.append(el("span", "swt-sheet-add-hint", hint));
      return row;
    };
    const newField = field("New sheet", newName);
    const content = el("div", "swt-sheet-add");
    content.append(field("Sheet", sheetSelect), newField, field("Table's name", tableName, "The sheet's other tables refer to its cells by it: name!B2"), problem);
    const showNew = () => {
      newField.hidden = sheetSelect.value !== NEW_SHEET;
    };
    sheetSelect.addEventListener("change", showNew);
    showNew();
    const add = el("button", "swt-dialog-primary", "Add to sheet");
    add.type = "button";
    const cancel = el("button", "swt-dialog-button", "Cancel");
    cancel.type = "button";
    const footer = el("div", "swt-sheet-add-foot");
    footer.append(cancel, add);
    const dialog = this.host.openDialog({
      title: "Add to sheet",
      subtitle: "The table shows on the sheet with the sheet's other tables; in the page it stays as it is",
      content,
      footer,
      focus: sheets.length ? sheetSelect : newName,
    });
    cancel.addEventListener("click", () => dialog.close());
    // One submit at a time: Enter twice does not write twice
    let submitting = false;
    const submit = async () => {
      if (submitting) return;
      submitting = true;
      try {
        const sheet = sheetSelect.value === NEW_SHEET ? newName.value.trim() : sheetSelect.value;
        const name = tableName.value.trim();
        const now = await this.host.bridge.getText();
        const why =
          sheetNameProblem(sheet) ??
          (sheetSelect.value === NEW_SHEET && sheets.some((s) => sameSheet(s.name, sheet)) ? `the page has a sheet ${sheet} already: pick it` : undefined) ??
          tableNameProblem(name) ??
          nameTaken(now, info, name);
        if (why) {
          problem.textContent = why;
          return;
        }
        const target = sheetsOf(sheetTables(now)).find((s) => sameSheet(s.name, sheet));
        const at = formatAt(placeBelow(target?.tables ?? []));
        dialog.close();
        await this.host.writeTable(this.host.tableFor(info.key) ?? info, (t: Table) =>
          withMeta(withMeta(withMetaName(t, name), SHEET_ATTRIBUTE, target?.name ?? sheet), AT_ATTRIBUTE, at),
        );
      } finally {
        submitting = false;
      }
    };
    add.addEventListener("click", () => void submit());
    content.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        void submit();
      }
    });
  }

  /** Off the sheet: its `sheet` and `at` go, its name stays (the sheet's own data, if it kept it, goes on: writeStep) */
  private async remove(shown: TableInfo): Promise<void> {
    await this.host.writeTable(this.host.tableFor(shown.key) ?? shown, (t: Table) => withMeta(withMeta(t, SHEET_ATTRIBUTE, undefined), AT_ATTRIBUTE, undefined));
  }

  /** The table written: the sheet's own data taken, or handed on, where the write makes it the sheet's first table, or no longer */
  writeStep(before: Table, after: Table, edit: WriteEdit): Table {
    let out = after;
    for (const move of handovers(before, after, edit)) {
      if (move.from === edit.page.from) out = move.data.reduce((t, [name]) => withMeta(t, name, undefined), out);
      if (move.to === edit.page.from) out = move.data.reduce((t, [name, value]) => withMeta(t, name, value), out);
    }
    return out;
  }

  /** A table of a sheet that would grow into another it overlaps already (sheet/layout.ts): not written */
  refusesWrite(before: Table, after: Table, edit: WriteEdit): string | undefined {
    const room = roomOnSheet(before, after, edit);
    return room && "refused" in room ? `the table cannot grow into ${room.refused}, which overlaps it on the sheet already: check their places (at)` : undefined;
  }

  /** The page's other tables the write changes: those giving or taking the sheet's own data, those moved to make room */
  otherTablesWritten(before: Table, after: Table, edit: WriteEdit): readonly PageTable[] {
    const page = new Map(edit.page.tables.map((t) => [t.range.from, t]));
    const written = new Map<number, PageTable>();
    const change = (from: number | undefined, f: (table: Table) => Table) => {
      const other = from === undefined || from === edit.page.from ? undefined : (written.get(from) ?? page.get(from));
      if (other) written.set(from!, { range: other.range, table: f(other.table) });
    };
    for (const move of handovers(before, after, edit)) {
      change(move.from, (t) => move.data.reduce((out, [name]) => withMeta(out, name, undefined), t));
      change(move.to, (t) => move.data.reduce((out, [name, value]) => withMeta(out, name, value), t));
    }
    const room = roomOnSheet(before, after, edit);
    if (room && "moved" in room) for (const [from, at] of room.moved) change(from, (t) => withMeta(t, AT_ATTRIBUTE, formatAt(at)));
    return [...written.values()];
  }
}

/**
 * The room a table of a sheet that grows in the write makes on it (it stays
 * on its sheet, at its place); undefined: it is on none, or does not grow there
 */
function roomOnSheet(before: Table, after: Table, edit: WriteEdit): Room | undefined {
  const at = edit.page.from;
  const tables = sheetTablesOf(edit.page.tables.map((t) => (t.range.from === at ? { range: t.range, table: before } : t)));
  const mine = tables.find((t) => t.range.from === at);
  // After the write still on its sheet, at its place
  const sheetAfter = after.meta?.[SHEET_ATTRIBUTE]?.trim();
  const atAfter = parseAt(after.meta?.[AT_ATTRIBUTE]);
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
 * after it): from the sheet's first table before the write to its first
 * after it, where they differ (by where they are in the page); none to go
 * to: the sheet is gone with its data
 */
function handovers(before: Table, after: Table, edit: WriteEdit): { data: [string, string][]; from: number; to: number | undefined }[] {
  const at = edit.page.from;
  const withEdited = (table: Table) => edit.page.tables.map((t) => (t.range.from === at ? { range: t.range, table } : t));
  const sheetsBefore = sheetsOf(sheetTablesOf(withEdited(before)));
  const sheetsAfter = sheetsOf(sheetTablesOf(withEdited(after)));
  const moves: { data: [string, string][]; from: number; to: number | undefined }[] = [];
  for (const sheet of sheetsBefore) {
    const first = sheet.tables[0]!;
    const data = sheetData(first.table);
    const next = sheetsAfter.find((s) => sameSheet(s.name, sheet.name))?.tables[0];
    if (data.length && next?.range.from !== first.range.from) moves.push({ data, from: first.range.from, to: next?.range.from });
  }
  return moves;
}

/** Why another table of the page has the name already, if it does */
function nameTaken(text: string, info: TableInfo, name: string): string | undefined {
  const self = locateBySource(text, info.hint, info.source);
  const taken = findTables(text).some((range) => {
    if (range.from === self?.from) return false;
    const other = metaName(parseTable(range.text));
    return other !== undefined && sameTableName(other, name);
  });
  return taken ? `another table on this page is named ${name}` : undefined;
}

