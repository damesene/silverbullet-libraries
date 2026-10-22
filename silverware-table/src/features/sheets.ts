// The sheets module's part in a table's ⋯ menu (the sheet module's model
// side; the sheet view itself is the SilverBullet adapter's: core/silverbullet/
// modules/sheet.ts): Add to sheet… puts the table on one of the page's sheets,
// or on a new one, Remove from sheet takes it off. A table on a sheet says so
// in its metadata row (`<meta name='costs' sheet='Budget' at='B3'>`, sheet/page.ts)
// and has a name: the sheet's other tables refer to its cells by it
// (`costs!B2`). Added, it goes in column A, one empty row under the sheet's
// lowest table; removed, its name stays (formulas may refer to it), and the
// sheet's own data it carried as the sheet's first table (its columns'
// widths) goes on to the next one.
import type { Feature, ModelHost, TableInfo, ToolbarButton } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { findTables, locateBySource, parseTable, type Table, type TableRange } from "../markdown.ts";
import { metaName, sameTableName, tableNameProblem, withMeta, withMetaName } from "../meta.ts";
import {
  AT_ATTRIBUTE,
  formatAt,
  placeBelow,
  SHEET_ATTRIBUTE,
  sameSheet,
  SHEET_WIDTH_PREFIX,
  sheetNameProblem,
  sheetsOf,
  sheetTables,
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

  /**
   * Off the sheet: its `sheet` and `at` go, its name stays. The sheet's first
   * table hands the sheet's own data (sheet.width.*) on to the next one, in a
   * second write.
   */
  private async remove(shown: TableInfo): Promise<void> {
    const info = this.host.tableFor(shown.key) ?? shown;
    const text = await this.host.bridge.getText();
    const self = locateBySource(text, info.hint, info.source);
    const tables = sheetTables(text);
    const mine = tables.find((t) => t.range.from === self?.from);
    const sheetData = Object.entries(mine?.table.meta ?? {}).filter(([name]) => name.startsWith(SHEET_WIDTH_PREFIX));
    const next = mine && sheetData.length ? sheetsOf(tables).find((s) => sameSheet(s.name, mine.sheet))?.tables.find((t) => t !== mine) : undefined;
    const result = await this.host.writeTable(info, (t: Table) => {
      let out = withMeta(withMeta(t, SHEET_ATTRIBUTE, undefined), AT_ATTRIBUTE, undefined);
      for (const [name] of sheetData) out = withMeta(out, name, undefined);
      return out;
    });
    if (result === "failed" || !next) return;
    await this.host.writeTable(rangeTarget(this.host.currentPage, next.range), (t: Table) => sheetData.reduce((out, [name, value]) => withMeta(out, name, value), t));
  }
}

/** A table of the page by where it is (written by its key, rendered or not) */
function rangeTarget(page: string, range: TableRange): { key: string; source: string; hint: number } {
  return { key: `${page}#${range.ordinal}`, source: range.text, hint: range.from };
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

/** A name no table of the page has: table1, table2, … */
function freeName(text: string): string {
  const names = findTables(text).map((range) => metaName(parseTable(range.text))?.toLowerCase());
  let n = 1;
  while (names.includes(`table${n}`)) n++;
  return `table${n}`;
}
