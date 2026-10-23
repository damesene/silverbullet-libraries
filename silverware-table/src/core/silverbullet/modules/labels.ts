// The tableLabels module: a named table shows its name in a small tab at its
// top right corner (its toolbar's place, clear of the grips and the + at the
// left), so which table is which reads at a glance, in the page and on the
// sheet. Not while the table is hovered: its toolbar then shows, and its ⋯
// menu has the name. The tab sits above the table's header, held or not, so
// it goes along with the header held at the view's top (on the sheet, for a
// table on its first row, over the columns' letters: rather them than the
// header), or, where the view leaves no room there (a table at the page's
// top), in the header's corner. It takes no presses.
import type { AdapterFeature, TableHost, WidgetInfo } from "../../feature.ts";
import type { Rect } from "../../geometry.ts";
import { underWindow } from "../../overwindow.ts";
import { metaName } from "../../../meta.ts";
import { parseTable } from "../../../markdown.ts";

// A tab's height, kept in step with the CSS (.swt-table-label): measured, a tab not shown yet has none
const TAB_HEIGHT = 18;

export class TableLabels implements AdapterFeature {
  // The tabs shown, by the widget of their table
  private readonly tabs = new Map<HTMLElement, HTMLElement>();
  // The table hovered: its toolbar shows instead
  private underPointer: HTMLElement | undefined;

  constructor(private readonly host: TableHost) {}

  stop(): void {
    for (const tab of this.tabs.values()) tab.remove();
    this.tabs.clear();
  }

  cellHovered(widget: HTMLElement): void {
    if (this.underPointer === widget) return;
    this.underPointer = widget;
    this.layoutChanged();
  }

  hoverEnded(): void {
    if (!this.underPointer) return;
    this.underPointer = undefined;
    this.layoutChanged();
  }

  /** Each named table in view gets its tab, placed by where its top is now; the others' go */
  layoutChanged(): void {
    const kept = new Set<HTMLElement>();
    for (const info of this.host.shownTables()) {
      const widget = this.host.widgetOf(info);
      const name = metaName(parseTable(info.source));
      // (Under what is over the window, a full screen table or the sheet's board: out of sight)
      if (!name || widget === this.underPointer || !widget.isConnected || underWindow(widget)) continue;
      if (this.place(widget, info, name)) kept.add(widget);
    }
    for (const [widget, tab] of this.tabs) {
      if (kept.has(widget)) continue;
      tab.remove();
      this.tabs.delete(widget);
    }
  }

  /** The table's tab at its header's top right corner, if the header's top is in view: above it, else in its corner */
  private place(widget: HTMLElement, info: WidgetInfo, name: string): boolean {
    const box = info.table.getBoundingClientRect();
    const head = (info.table.tHead ?? info.table.rows[0])?.getBoundingClientRect();
    if (!head) return false;
    // (Where the header is held, its top; the table's sides)
    const table = { left: box.left, right: box.right, top: head.top };
    const { view, room } = this.view(widget);
    const left = Math.max(table.left, view.left);
    const right = Math.min(table.right, view.right);
    if (table.top < view.top - 0.5 || table.top >= view.bottom || left >= right) return false;
    let tab = this.tabs.get(widget);
    if (!tab) {
      tab = this.host.floating("div", "swt-table-label");
      tab.setAttribute("aria-hidden", "true");
      this.tabs.set(widget, tab);
    }
    if (tab.textContent !== name) tab.textContent = name;
    tab.style.maxWidth = `${right - left}px`;
    const height = TAB_HEIGHT;
    const above = table.top - height >= room;
    tab.classList.toggle("swt-inside", !above);
    // Its width measured shown, at the window's left edge (further right, a box of no set width is as narrow as the room)
    tab.classList.add("swt-visible");
    tab.style.left = "0px";
    this.host.place(tab, right - tab.offsetWidth, above ? table.top - height : table.top);
    return true;
  }

  /**
   * What of the table's surroundings is in view (`view`): the box it scrolls
   * in (on the sheet, the board's grid), else the page's view; and how high a
   * tab may reach above it (`room`): the box's own top, its border too (the
   * sheet's room for the columns' letters)
   */
  private view(widget: HTMLElement): { view: Rect; room: number } {
    const box = this.host.scrollParentOf(widget);
    const page = this.host.viewBounds(widget);
    if (!box) return { view: page, room: page.top };
    const inner = this.host.innerBox(box);
    const view = { left: Math.max(inner.left, page.left), right: Math.min(inner.right, page.right), top: Math.max(inner.top, page.top), bottom: Math.min(inner.bottom, page.bottom) };
    return { view, room: Math.max(box.getBoundingClientRect().top, page.top) };
  }
}
