// The longText module: text longer than a column's maximum width wraps (up
// to a maximum cell height) or is cut with an ellipsis, and the cells whose
// text does not fit are marked (tp-cut), for the expand button of the cell's
// popup (features/popup.ts) to show it whole. Settings
// tablePlus.modules.longText.{overflow, maxWidth, maxHeight}.
//
// The core puts each body cell's content in a box of its own (.tp-cell-content,
// controller layOutCells); this module only sets how the CSS limits it: the
// classes tp-long-text (all its CSS applies only to the tables so marked),
// tp-cells-wrap / tp-cells-ellipsis and the variables
// --tp-cell-max-width / --tp-cell-max-height on the table. Off: cells show as
// SilverBullet renders them, on one line, as wide as their text.
import { SETTINGS } from "../bridge.ts";
import type { Feature, TableHost } from "../core/feature.ts";
import { renderedTable, WIDGET_SELECTOR } from "../dom.ts";

type Limits = { readonly overflow: "wrap" | "ellipsis"; readonly maxWidth: number; readonly maxHeight: number };

export class LongText implements Feature {
  private limits: Limits | undefined;
  private reading: Promise<void> | undefined;
  private checkQueued = false;
  // Tables resized (a sidebar, a column's width, fonts loaded): cells that are cut may change
  private resizeObserver: ResizeObserver | undefined;
  private stopped = false;

  constructor(private readonly host: TableHost) {}

  start(): void {
    const win = this.host.doc.defaultView!;
    win.addEventListener("resize", this.queueCheck);
    this.resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.queueCheck()) : undefined;
    void this.host.doc.fonts?.ready.then(() => this.queueCheck());
    void this.readSettings();
  }

  stop(): void {
    this.stopped = true;
    this.host.doc.defaultView!.removeEventListener("resize", this.queueCheck);
    this.resizeObserver?.disconnect();
    for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR))) this.clear(widget);
  }

  // A table rendered (or its view applied): its limits, and a check once laid out
  viewApplied(widget: HTMLElement): void {
    this.apply(widget);
    this.resizeObserver?.observe(widget);
    this.queueCheck();
  }

  enhanced(): void {
    // The settings may have changed since they were read
    void this.readSettings();
  }

  /** Reads the settings; changed, every table gets them */
  private readSettings(): Promise<void> {
    this.reading ??= (async () => {
      const limits: Limits = {
        overflow: await this.host.setting("cellOverflow"),
        maxWidth: await this.host.setting("cellMaxWidth"),
        maxHeight: await this.host.setting("cellMaxHeight"),
      };
      const before = this.limits;
      this.limits = limits;
      if (this.stopped || (before && before.overflow === limits.overflow && before.maxWidth === limits.maxWidth && before.maxHeight === limits.maxHeight)) return;
      for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
        const info = this.host.infoOf(widget);
        if (info && renderedTable(widget) === info.table) this.apply(widget);
      }
      this.queueCheck();
    })().finally(() => (this.reading = undefined));
    return this.reading;
  }

  private apply(widget: HTMLElement): void {
    // Before the settings are read: their defaults
    const { overflow, maxWidth, maxHeight } = this.limits ?? {
      overflow: SETTINGS.cellOverflow.default,
      maxWidth: SETTINGS.cellMaxWidth.default,
      maxHeight: SETTINGS.cellMaxHeight.default,
    };
    // What the module's CSS applies to
    widget.classList.add("tp-long-text");
    widget.classList.toggle("tp-cells-wrap", overflow === "wrap");
    widget.classList.toggle("tp-cells-ellipsis", overflow === "ellipsis");
    widget.style.setProperty("--tp-cell-max-width", maxWidth > 0 ? `${maxWidth}px` : "none");
    widget.style.setProperty("--tp-cell-max-height", maxHeight > 0 ? `${maxHeight}px` : "none");
  }

  private clear(widget: HTMLElement): void {
    widget.classList.remove("tp-long-text", "tp-cells-wrap", "tp-cells-ellipsis");
    widget.style.removeProperty("--tp-cell-max-width");
    widget.style.removeProperty("--tp-cell-max-height");
    for (const cell of Array.from(widget.querySelectorAll(".tp-cut"))) cell.classList.remove("tp-cut");
  }

  /** Once laid out: the cells whose content does not fit (cut) are marked */
  private queueCheck = (): void => {
    if (this.checkQueued) return;
    this.checkQueued = true;
    const run = () => {
      this.checkQueued = false;
      if (this.stopped) return;
      // All measured first, then marked: a mark changes the style, which a measure after it would lay out again
      const boxes = Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table .tp-cell-content`));
      const cut = boxes.map((box) => box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1);
      boxes.forEach((box, i) => box.parentElement?.classList.toggle("tp-cut", cut[i]));
    };
    const win = this.host.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  };
}
