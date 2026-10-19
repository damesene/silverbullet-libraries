// Removing what Table Plus stores in tables: the metadata row (sorting,
// filters, pins, name) and the hidden tags in cells (tags.ts: formulas, whose
// cells keep their results, names), whatever module keeps them. The modules
// say what they keep, for the question asked first (Feature.metadataPart).
// For one table from its toolbar, for all tables of the page with the "Table
// Plus: Remove table metadata" command.
import type { Feature, MetadataPart, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { EDITOR_SELECTOR } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { findTables, minimalEdit, parseTable, serializeTable, type Table } from "../markdown.ts";
import { attributesOf, cellTags, withoutTags } from "../tags.ts";

/** A table without its metadata row and without the hidden tags in its cells (formula cells keep their results) */
export function withoutMetadata(table: Table): Table {
  const { meta: _meta, metaSource: _source, ...rest } = table;
  return { ...rest, rows: table.rows.map((row) => (row.cells.some(hasTags) ? { ...row, cells: row.cells.map(withoutTags) } : row)) };
}

const hasTags = (cell: string) => cellTags(cell).length > 0;

/** Whether a table holds metadata: a metadata row, or hidden tags in cells */
function hasMetadata(table: Table): boolean {
  return table.meta !== undefined || table.rows.some((row) => row.cells.some(hasTags));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * What the modules say is kept in cells ("its 2 formulas: those cells …"),
 * and that more is where cells have tags none of them says it keeps (a
 * module turned off)
 */
function described(parts: readonly MetadataPart[], tables: readonly Table[], form: (part: MetadataPart) => string): string[] {
  const told = new Set(parts.flatMap((part) => part.tags));
  const untold = tables.some((table) =>
    table.rows.some((row) => row.cells.some((cell) => cellTags(cell).some((tag) => attributesOf(tag).some((name) => !told.has(name))))),
  );
  return [...parts.map(form), ...(untold ? [`${parts.length ? "other " : ""}hidden data in cells`] : [])];
}

export class Metadata implements Feature {
  constructor(private readonly host: TableHost) {}

  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    if (!hasMetadata(parseTable(info.source))) return [];
    return [
      {
        label: "Remove metadata",
        icon: ICONS.trash,
        danger: true,
        title: "Remove this table's <meta> tags: its stored settings (sorting, filters, pinning, name) and what its cells keep (formulas, which keep their results, names)",
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
    const removed = [
      ...(shownInfo.metaRow ? ["its stored settings (sorting, filters, pinning, name)"] : []),
      ...described(this.host.metadataParts([shown]), [shown], (p) => `its ${plural(p.count, p.what)}${p.note ? `: ${p.note}` : ""}`),
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
        return hasMetadata(parseTable(range.text));
      })
      .reverse();
    if (tables.length === 0) {
      void bridge.flash("Table Plus: no table on this page has metadata", "info");
      return;
    }
    const models = tables.map((range) => parseTable(range.text));
    const parts = described(this.host.metadataParts(models), models, (p) => `${plural(p.count, p.what)}${p.note ? ` (${p.note})` : ""}`);
    const question =
      `Remove the metadata of ${tables.length === 1 ? "the 1 table" : `all ${tables.length} tables`} on this page` +
      (parts.length ? `, including ${parts.join(" and ")}` : "") +
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
