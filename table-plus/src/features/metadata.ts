// Removing what Table Plus stores in tables: the metadata row (sorting, pins,
// name), the names in cells and the formulas, which keep their results. For one
// table from its toolbar, for all tables of the page with the "Table Plus:
// Remove table metadata" command.
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { EDITOR_SELECTOR } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { formulaCount, withoutFormulas } from "../formula/index.ts";
import { findTables, minimalEdit, parseTable, serializeTable, type Table } from "../markdown.ts";
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
    if (!info.metaRow && formulaCount(table) === 0 && !hasNames(table)) return [];
    return [
      {
        label: "Remove metadata",
        icon: ICONS.trash,
        danger: true,
        title: "Remove this table's <meta> tags: its stored settings (sorting, pinning, name), the formulas of its cells, which keep their results, and the names of its columns and cells",
        run: () => void this.removeFromTable(widget, info),
      },
    ];
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
    if (parseTable(info.source).meta) this.host.forgetStoredView(info.key);
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
      if (table.meta) this.host.forgetStoredView(`${page}#${range.ordinal}`);
      span = span.slice(0, range.from - from) + serializeTable(withoutMetadata(table)) + span.slice(range.to - from);
    }
    const edit = minimalEdit(text.slice(from, to), span);
    await bridge.replaceRange(from + edit.from, from + edit.to, edit.insert);
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.host.doc.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
    void bridge.flash(`Table Plus: removed the metadata of ${tables.length} table(s)`, "info");
  }
}
