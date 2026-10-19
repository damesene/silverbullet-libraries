// `${…}` cells re-evaluated once the page index is up to date.
//
// SilverBullet renders a table right after Table Plus writes it, before the
// page is re-indexed, so a `${…}` cell that reads the index (e.g. a formula
// from a spreadsheet library) shows a stale result until the table renders
// again. Once the page is indexed, Table Plus has SilverBullet re-evaluate such
// cells (lua.evalExpression) and shows the new values in place. `page:index` is
// the event the indexers write the index on, not a signal that they are done,
// so the evaluation waits a moment for them.
import type { Feature, TableHost } from "../core/feature.ts";
import { cellText, renderedTable, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";
import { formatLuaNumber } from "../format.ts";
import { parseTable } from "../markdown.ts";

export class Expressions implements Feature {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly host: TableHost) {}

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /** SilverBullet's `page:index` event for a page */
  async pageIndexed(name: string): Promise<void> {
    const { bridge } = this.host;
    if (this.stopped || !bridge.evalExpression) return;
    if (name !== (await bridge.getCurrentPage())) return;
    // The time the indexers get to write the index
    const delay = await this.host.setting("expressionsDelay");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), delay);
  }

  private async refresh(): Promise<void> {
    const { bridge, doc } = this.host;
    for (const widget of Array.from(doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      if (this.stopped || !info || !info.source.includes("${")) continue;
      const rows = parseTable(info.source).rows;
      let changed = false;
      for (let row = 0; row < rows.length; row++) {
        const cells = rows[row]!.cells;
        for (let column = 0; column < cells.length; column++) {
          // Only cells that are one expression: their shown text is its value
          const expression = /^\$\{([\s\S]+)\}$/.exec(cells[column]!.trim())?.[1];
          if (!expression) continue;
          let value: unknown;
          try {
            value = await bridge.evalExpression!(expression.replaceAll("\\|", "|"));
          } catch {
            continue;
          }
          const text =
            value === null || value === undefined
              ? ""
              : typeof value === "number"
                ? formatLuaNumber(value)
                : typeof value === "string" || typeof value === "boolean"
                  ? String(value)
                  : undefined;
          const cell = this.host.cellAt(info, { row, column }, true);
          if (text === undefined || !cell || cell === this.host.editing?.cell || renderedTable(widget) !== info.table) continue;
          if (cellText(cell) === text) continue;
          for (const node of Array.from(cell.childNodes)) {
            if (!(node instanceof Element && node.classList.contains(UI_CLASS))) node.remove();
          }
          cell.prepend(doc.createTextNode(text));
          changed = true;
        }
      }
      // Sorting and filters see the new values
      if (changed && renderedTable(widget) === info.table) this.host.applyView(widget, info);
    }
  }
}
