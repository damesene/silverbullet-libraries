// The longText module: text longer than a column's maximum width wraps (up
// to a maximum cell height) or is cut with an ellipsis, and the cells whose
// text does not fit are marked (swt-cut), for the expand button of the cell's
// popup (features/popup.ts) to show it whole. Settings
// silverware.table.modules.longText.{overflow, maxWidth, maxHeight}.
//
// The core puts each body cell's content in a box of its own (.swt-cell-content,
// controller layOutCells); this module only sets how the CSS limits it: the
// classes swt-long-text (all its CSS applies only to the tables so marked),
// swt-cells-wrap / swt-cells-ellipsis and the variables
// --swt-cell-max-width / --swt-cell-max-height on the table. Off: cells show as
// SilverBullet renders them, on one line, as wide as their text.
import { SETTINGS } from "../../../bridge.ts";
import type { Feature, TableHost } from "../../feature.ts";
import { oncePerFrame } from "../../frame.ts";
import { renderedTable, WIDGET_SELECTOR } from "../../../dom.ts";

type Limits = { readonly overflow: "wrap" | "ellipsis"; readonly maxWidth: number; readonly maxHeight: number };

export class LongText implements Feature {
  private limits: Limits | undefined;
  private reading: Promise<void> | undefined;
  // Marking the cells cut, once in the next frame
  private readonly queueCheck: () => void;
  // Tables resized (a sidebar, a column's width, fonts loaded): cells that are cut may change
  private resizeObserver: ResizeObserver | undefined;
  private stopped = false;

  constructor(private readonly host: TableHost) {
    this.queueCheck = oncePerFrame(host.doc, () => this.markCutCells());
  }

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

  // Rows put back into the document (a large table scrolled): their cells are checked
  rowsAttached(): void {
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
      for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.swt-table`))) {
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
    widget.classList.add("swt-long-text");
    widget.classList.toggle("swt-cells-wrap", overflow === "wrap");
    widget.classList.toggle("swt-cells-ellipsis", overflow === "ellipsis");
    widget.style.setProperty("--swt-cell-max-width", maxWidth > 0 ? `${maxWidth}px` : "none");
    widget.style.setProperty("--swt-cell-max-height", maxHeight > 0 ? `${maxHeight}px` : "none");
  }

  private clear(widget: HTMLElement): void {
    widget.classList.remove("swt-long-text", "swt-cells-wrap", "swt-cells-ellipsis");
    widget.style.removeProperty("--swt-cell-max-width");
    widget.style.removeProperty("--swt-cell-max-height");
    for (const cell of Array.from(widget.querySelectorAll(".swt-cut"))) cell.classList.remove("swt-cut");
  }

  /** Once laid out: the cells whose content does not fit (cut) are marked */
  private markCutCells(): void {
    if (this.stopped) return;
    // All measured first, then marked: a mark changes the style, which a measure after it would lay out again
    const boxes = Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.swt-table .swt-cell-content`));
    const cut = boxes.map((box) => box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1);
    boxes.forEach((box, i) => box.parentElement?.classList.toggle("swt-cut", cut[i]));
  }
}
