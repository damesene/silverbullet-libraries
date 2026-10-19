// What Table Plus stores in tables: naming a table (its metadata row's name,
// by which formulas refer to it), and removing the metadata row (sorting,
// pins, name) and the formulas in cells, which keep their results. For one
// table from its toolbar, for all tables of the page with the "Table Plus:
// Remove table metadata" command.
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { EDITOR_SELECTOR } from "../dom.ts";
import { formulaCount, withoutFormulas } from "../formula/index.ts";
import { findTables, locateBySource, minimalEdit, parseTable, serializeTable, type Table } from "../markdown.ts";
import { metaName, metaSort, sameTableName, tableNameProblem, withMetaName } from "../meta.ts";
import { hasNames, withoutNames } from "../names.ts";

/** A table without its metadata row and without formulas (their cells keep their results) */
export function withoutMetadata(table: Table): Table {
  const { meta: _meta, metaSource: _source, ...rest } = withoutNames(withoutFormulas(table));
  return rest;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export class Metadata implements Feature {
  constructor(private readonly host: TableHost) {}

  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const table = parseTable(info.source);
    const name = metaName(table);
    // A name is metadata: with the setting off, only a table with a metadata row can get one
    const naming: ToolbarButton[] =
      info.metaRow || this.host.metadataEnabled
        ? [
            {
              label: name ? `Name: ${name}` : "Name",
              title: name
                ? `This table is named ${name}: formulas in other tables refer to it as ${name}!A1. Click to rename it`
                : "Name this table, so formulas in other tables can refer to it (name!A1)",
              run: () => void this.rename(widget, info),
            },
          ]
        : [];
    if (!info.metaRow && formulaCount(table) === 0 && !hasNames(table)) return naming;
    return [
      ...naming,
      {
        label: "Remove metadata",
        title: "Remove this table's <meta> tags: its stored settings (sorting, pinning, name), the formulas of its cells, which keep their results, and the names of its columns and cells",
        run: () => void this.removeFromTable(widget, info),
      },
    ];
  }

  /**
   * Names, renames or (with an empty name) unnames a table, asking for the
   * name; refused when it is not a valid name or another table on the page has it
   */
  private async rename(shownWidget: HTMLElement, shownInfo: WidgetInfo): Promise<void> {
    const shown = parseTable(shownInfo.source);
    const answer = await this.host.promptText("Table name (letters, digits and _; empty: no name)", metaName(shown) ?? "");
    if (answer === undefined) return;
    const name = answer.trim();
    // Against the name as stored, so an empty answer also clears a name that is not valid
    if (name === (shown.meta?.name?.trim() ?? "")) return;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    const problem = name === "" ? undefined : tableNameProblem(name);
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    if (name !== "") {
      const text = await this.host.bridge.getText();
      // This table where it is now: its position may have moved since it was rendered
      const self = locateBySource(text, info.hint, info.source);
      const taken = findTables(text).some((range) => {
        if (range.from === self?.from) return false;
        const other = metaName(parseTable(range.text));
        return other !== undefined && sameTableName(other, name);
      });
      if (taken) {
        void this.host.bridge.flash(`Table Plus: another table on this page is named ${name}`, "error");
        return;
      }
    }
    await this.host.write(widget, (t) => withMetaName(t, name === "" ? undefined : name));
    this.host.focusEditor(widget);
  }

  /**
   * Removes a table's metadata, once confirmed: its metadata row (a sorting
   * stored there goes with it: the rows show as written) and the formulas of
   * its cells, which keep their results as plain values
   */
  private async removeFromTable(shownWidget: HTMLElement, shownInfo: WidgetInfo): Promise<void> {
    const shown = parseTable(shownInfo.source);
    const formulas = formulaCount(shown);
    const removed = [
      ...(shownInfo.metaRow ? ["its stored settings (sorting, pinning, name)"] : []),
      ...(formulas ? [`its ${plural(formulas, "formula")}: those cells keep their current results as plain values`] : []),
      ...(hasNames(shown) ? ["the names of its columns and cells"] : []),
    ];
    if (!(await this.host.ask(`Remove this table's metadata, ${removed.join(", and ")}? Ctrl+Z brings it back.`))) return;
    // The table as rendered now: the dialog may have outlived the rendering it was asked from
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    if (metaSort(parseTable(info.source))) this.host.forgetStoredSort(info.key);
    await this.host.write(widget, withoutMetadata);
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.host.focusEditor(widget);
  }

  /** Removes the metadata of all tables on the current page, once confirmed */
  async removeFromPage(): Promise<void> {
    const { bridge } = this.host;
    const text = await bridge.getText();
    // From the last table up, so the earlier ones keep their positions
    const tables = findTables(text)
      .filter((range) => {
        const table = parseTable(range.text);
        return table.meta !== undefined || formulaCount(table) > 0 || hasNames(table);
      })
      .reverse();
    if (tables.length === 0) {
      void bridge.flash("Table Plus: no table on this page has metadata", "info");
      return;
    }
    const formulas = tables.reduce((n, range) => n + formulaCount(parseTable(range.text)), 0);
    const question =
      `Remove the metadata of ${tables.length === 1 ? "the 1 table" : `all ${tables.length} tables`} on this page` +
      (formulas ? `, including ${plural(formulas, "formula")} (those cells keep their current results as plain values)` : "") +
      "? Ctrl+Z brings it back.";
    if (!(await this.host.ask(question))) return;
    // One edit over the span of all those tables, so one Ctrl+Z undoes it
    const from = tables[tables.length - 1]!.from;
    const to = tables[0]!.to;
    let span = text.slice(from, to);
    const page = await bridge.getCurrentPage();
    for (const range of tables) {
      const table = parseTable(range.text);
      if (metaSort(table)) this.host.forgetStoredSort(`${page}#${range.ordinal}`);
      span = span.slice(0, range.from - from) + serializeTable(withoutMetadata(table)) + span.slice(range.to - from);
    }
    const edit = minimalEdit(text.slice(from, to), span);
    await bridge.replaceRange(from + edit.from, from + edit.to, edit.insert);
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.host.doc.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
    void bridge.flash(`Table Plus: removed the metadata of ${tables.length} table(s)`, "info");
  }
}
