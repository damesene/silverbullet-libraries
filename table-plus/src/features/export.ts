// The export module: a table copied whole for elsewhere, from the toolbar's
// menu. Copy as CSV: its header and its rows as shown (sorted, filtered),
// cells as Ctrl+C copies them (host.cellValue).
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";

/** Cells as CSV (RFC 4180): commas between, line breaks after rows; a cell with a comma, a quote or a line break in quotes */
export function csvText(values: readonly (readonly string[])[]): string {
  const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return values.map((row) => `${row.map(quote).join(",")}\r\n`).join("");
}

export class Export implements Feature {
  constructor(private readonly host: TableHost) {}

  /** Copy as CSV in the toolbar's menu */
  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    return [
      {
        label: "Copy as CSV",
        title: "Copy the table as CSV: its rows as shown (sorted, filtered), cells as Ctrl+C copies them",
        icon: ICONS.duplicate,
        run: () => void this.copyCsv(widget, info),
      },
    ];
  }

  private async copyCsv(shownWidget: HTMLElement, shownInfo: WidgetInfo): Promise<void> {
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    const rows = this.host.shownRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map((cell) => this.host.cellValue(cell)));
    try {
      await this.host.doc.defaultView!.navigator.clipboard.writeText(csvText(values));
      const body = rows.length - 1;
      void this.host.bridge.flash(`Table Plus: copied ${body} row${body === 1 ? "" : "s"} as CSV`, "info");
    } catch (e) {
      void this.host.bridge.flash(`Table Plus: could not copy (${String(e)})`, "error");
    }
  }
}
