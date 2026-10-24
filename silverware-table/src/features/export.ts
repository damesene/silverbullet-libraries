// The export module: a table copied whole for elsewhere, from the toolbar's
// menu. Copy as CSV: its header and its rows as shown (sorted, filtered),
// cells as Ctrl+C copies them (host.shownValue). Copy as Markdown: the same
// rows as plain markdown, each cell's markdown kept (links, formatting, a
// formula's result) without the hidden tags and the metadata row, so the copy
// is the table as any renderer shows it, nothing of Silverware Table's in it.
import { writeClipboard } from "../clipboard.ts";
import type { Feature, ModelHost, ToolbarButton, TableInfo } from "../core/feature.ts";
import { currentTable, exportedTable } from "../export/table.ts";
import { ICONS } from "../icons.ts";
import { serializeTable, type Table } from "../markdown.ts";
import { withoutTags } from "../tags.ts";

/** Cells as CSV (RFC 4180): commas between, line breaks after rows; a cell with a comma, a quote or a line break in quotes */
export function csvText(values: readonly (readonly string[])[]): string {
  const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return values.map((row) => `${row.map(quote).join(",")}\r\n`).join("");
}

/** The table's header and `rows` (markdown rows, in that order) as plain markdown: no hidden tags, no metadata row */
export function plainMarkdown(table: Table, rows: readonly number[]): string {
  const plain = (row: number) => ({ cells: (table.rows[row]?.cells ?? []).map(withoutTags) });
  return serializeTable({ indent: "", align: table.align, padded: table.padded, rows: [plain(0), ...rows.map(plain)] });
}

export class Export implements Feature {
  constructor(private readonly host: ModelHost) {}

  /** Copy as CSV and Copy as Markdown in the toolbar's menu */
  toolbarButtons(info: TableInfo): ToolbarButton[] {
    return [
      {
        label: "Copy as CSV",
        title: "Copy the table as CSV: its rows as shown (sorted, filtered), cells as Ctrl+C copies them",
        icon: ICONS.copy,
        run: () => void this.copyCsv(info),
      },
      {
        label: "Copy as Markdown",
        title: "Copy the table as plain markdown: its rows as shown (sorted, filtered), without formulas and Silverware Table's other hidden data",
        icon: ICONS.copy,
        run: () => void this.copyMarkdown(info),
      },
    ];
  }

  private async copyCsv(shownInfo: TableInfo): Promise<void> {
    const info = currentTable(this.host, shownInfo);
    const table = exportedTable(this.host, info, "shown");
    await this.copy(csvText([table.header, ...table.rows.map((r) => r.values)]), table.rows.length, "CSV");
  }

  private async copyMarkdown(shownInfo: TableInfo): Promise<void> {
    const info = currentTable(this.host, shownInfo);
    const rows = this.host.shownOrder(info).filter((row) => row > 0);
    await this.copy(`${plainMarkdown(this.host.tableOf(info), rows)}\n`, rows.length, "Markdown");
  }

  private async copy(text: string, body: number, format: string): Promise<void> {
    try {
      await writeClipboard(this.host.doc, text);
      void this.host.bridge.flash(`Silverware Table: copied ${body} row${body === 1 ? "" : "s"} as ${format}`, "info");
    } catch (e) {
      void this.host.bridge.flash(`Silverware Table: could not copy (${String(e)})`, "error");
    }
  }
}
