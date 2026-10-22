// The fullScreen module: a toolbar icon shows the table over the whole window
// (not the browser's full screen); the same icon (Exit full screen) or Esc
// closes it. The table stays where SilverBullet rendered it, its box laid over
// the window with the columns' letters and the rows' numbers (core/overwindow.ts).
import type { AdapterFeature, TableHost, ToolbarButton, WidgetInfo } from "../../feature.ts";
import { OverWindow } from "../../overwindow.ts";
import { ICONS } from "../../../icons.ts";

export class FullScreen implements AdapterFeature {
  private readonly over: OverWindow;

  constructor(private readonly host: TableHost) {
    this.over = new OverWindow(host, { className: "swt-fullscreen", changed: () => host.toolbarChanged() });
  }

  stop(): void {
    this.over.stop();
  }

  toolbarButtons(info: WidgetInfo): ToolbarButton[] {
    const widget = this.host.widgetOf(info);
    const on = this.over.key === info.key;
    return [
      {
        label: on ? "Exit full screen" : "Full screen",
        title: on ? "Show the table in the page again (Esc)" : "Show the table over the whole window",
        place: "icon",
        icon: on ? ICONS.exitFullScreen : ICONS.fullScreen,
        pressed: on,
        run: () => (on ? this.over.end() : this.over.begin(widget, info)),
      },
    ];
  }

  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    this.over.decorate(info);
  }

  tableAdded(widget: HTMLElement, table: HTMLTableElement): void {
    this.over.tableAdded(widget, table);
  }

  enhanced(info: WidgetInfo): void {
    const widget = this.host.widgetOf(info);
    this.over.enhanced(widget, info);
  }

  viewApplied(info: WidgetInfo): void {
    const widget = this.host.widgetOf(info);
    this.over.viewApplied(widget);
  }

  rowsAttached(info: WidgetInfo): void {
    this.over.rowsAttached(info);
  }

  pageLoaded(): void {
    this.over.pageLoaded();
  }

  keyDown(e: KeyboardEvent): boolean {
    return this.over.keyDown(e);
  }

  layoutChanged(): void {
    this.over.layoutChanged();
  }
}
