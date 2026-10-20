// The fullScreen module: a toolbar icon shows the table over the whole window
// (not the browser's full screen); the same icon (Exit full screen) or Esc
// closes it. The table
// stays where SilverBullet rendered it; CSS (tp-fullscreen) lays its box over
// the window, so its scroll, sticky header and Table Plus' controls work as in
// a table with its own box. SilverBullet renders the table anew after every
// edit: the table shown so (by its key) is shown so again, at once when it is
// put into the page (before it is laid out), confirmed once it is enhanced.
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { WIDGET_SELECTOR } from "../dom.ts";
import { ICONS } from "../icons.ts";

const FULL_CLASS = "tp-fullscreen";
const OPEN_CLASS = "tp-fullscreen-open";

export class FullScreen implements Feature {
  // The table shown over the window (its key) and its widget as rendered now
  private key: string | undefined;
  private widget: HTMLElement | undefined;
  // The table rendered anew taken for it before it was enhanced (tableAdded)
  private guessed: HTMLElement | undefined;

  constructor(private readonly host: TableHost) {}

  stop(): void {
    this.end();
  }

  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const on = this.key === info.key;
    return [
      {
        label: on ? "Exit full screen" : "Full screen",
        title: on ? "Show the table in the page again (Esc)" : "Show the table over the whole window",
        place: "icon",
        icon: on ? ICONS.exitFullScreen : ICONS.fullScreen,
        pressed: on,
        run: () => (on ? this.end() : this.begin(widget, info)),
      },
    ];
  }

  private begin(widget: HTMLElement, info: WidgetInfo): void {
    if (this.widget && this.widget !== widget) this.unmark(this.widget);
    this.key = info.key;
    this.mark(widget);
    this.host.toolbarChanged();
    this.host.tableResized(info);
  }

  private end(): void {
    const widget = this.widget;
    this.key = undefined;
    this.widget = undefined;
    if (widget) this.unmark(widget);
    this.host.doc.body.classList.remove(OPEN_CLASS);
    this.host.toolbarChanged();
    const info = widget && this.host.infoOf(widget);
    if (info) this.host.tableResized(info);
  }

  private mark(widget: HTMLElement): void {
    this.widget = widget;
    widget.classList.add(FULL_CLASS);
    this.host.doc.body.classList.add(OPEN_CLASS);
  }

  private unmark(widget: HTMLElement): void {
    widget.classList.remove(FULL_CLASS);
  }

  // Rendered anew (an edit): the replacement of the table shown over the window shows so at once, before it is laid out
  // (the one starting where the table taken out started, data-pos: an edit in a table does not move its start;
  // the page may render every table anew)
  tableAdded(widget: HTMLElement, table: HTMLTableElement): void {
    const old = this.widget;
    if (this.key === undefined || !old || old.isConnected || this.guessed?.isConnected) return;
    if (table.dataset.pos !== old.querySelector("table")?.dataset.pos) return;
    this.guessed = widget;
    widget.classList.add(FULL_CLASS);
  }

  // Enhanced: shown over the window if it is that table, else not (tableAdded may have guessed wrong)
  enhanced(widget: HTMLElement, info: WidgetInfo): void {
    if (info.key === this.key) this.mark(widget);
    else if (widget.classList.contains(FULL_CLASS)) this.unmark(widget);
    // The table shown so is gone from the page (another page opened): it ends
    if (this.key !== undefined && this.widget && !this.widget.isConnected && !this.host.widgetForKey(this.key)) this.end();
  }

  // Esc closes it, unless something else takes the key first (a cell editor, a selection, a field, a menu)
  keyDown(e: KeyboardEvent): boolean {
    if (e.key !== "Escape" || this.key === undefined || this.host.editing) return false;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false;
    e.preventDefault();
    e.stopPropagation();
    this.end();
    return true;
  }

  // Another page shown: no table of it is over the window
  layoutChanged(): void {
    if (this.key === undefined || this.widget?.isConnected) return;
    if (!this.host.doc.querySelector(`${WIDGET_SELECTOR}.${FULL_CLASS}`)) this.end();
  }
}
