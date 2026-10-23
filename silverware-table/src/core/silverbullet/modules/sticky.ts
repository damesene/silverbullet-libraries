// Sticky header and footer: a table's header (with the rows pinned to the top)
// stays in view while the page scrolls past the table, and the rows pinned to
// the bottom stay at the bottom of the view.
//
// A table that needs no box of its own to scroll in (it fits the width, no
// maximum height) has that box clipped instead (`swt-sticky-native`, the CSS),
// which then captures no sticky positioning: its header and footer are
// `position: sticky` against the page, moved by the browser as it scrolls,
// smooth also on a phone, where scroll events come late and a header moved by
// script lags and shakes. Here they only get `swt-stuck` (their look while
// held). Other tables sit in a box that scrolls (sideways, or inside a maximum
// height), which captures sticky positioning: their header and footer are
// moved with a transform after each scroll, never past each other. A table
// whose box is laid over the window (position: fixed: full screen) scrolls in
// that box only, the page never moves it: its header and footer are sticky
// against the box (`swt-sticky-box`), moved by the browser too.
import type { AdapterFeature, TableHost } from "../../feature.ts";
import { STICKY_GAP } from "../../layout.ts";
import { renderedTable, WIDGET_SELECTOR } from "../../../dom.ts";

export class Sticky implements AdapterFeature {
  constructor(private readonly host: TableHost) {}

  layoutChanged(): void {
    const { doc } = this.host;
    for (const widget of Array.from(doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.swt-table`))) {
      const info = this.host.infoOf(widget);
      const head = info?.table.tHead;
      if (!info || !head || renderedTable(widget) !== info.table) continue;
      // Held below the top of the page's view (with room for the toolbar), or,
      // in a table scrolled inside its own box, at the top of that box. The
      // view (viewBounds) is the window for a table laid over it (full screen).
      const scroller = this.host.viewBounds(widget);
      const inside = this.host.scrollsInside(widget);
      const foot = info.table.tFoot;
      const overWindow = doc.defaultView!.getComputedStyle(widget).position === "fixed";
      // Not laid out (in tests): by script
      const native = !overWindow && !inside && widget.clientWidth > 0 && info.table.offsetWidth <= widget.clientWidth + 1;
      widget.classList.toggle("swt-sticky-native", native);
      widget.classList.toggle("swt-sticky-box", overWindow);
      // Held below the view's top by the room for the toolbar (STICKY_GAP), but never lower than the table lies in the
      // page: a table nearer the page's top had its header pushed down over its first rows, the page not even scrolled
      const gap = overWindow ? STICKY_GAP : this.gapFor(widget, info.table, scroller.top);
      if (native) {
        const top = `${gap}px`;
        if (widget.style.getPropertyValue("--swt-sticky-top") !== top) widget.style.setProperty("--swt-sticky-top", top);
        // The rows pinned to the bottom held at the view's bottom: a sticky element keeps within its scrolling box
        // less the box's padding, and SilverBullet's scroller has one at its bottom (to scroll past the page's end):
        // `bottom: 0` was that far above the view's bottom, and a table wholly in view had them pushed to its top
        const bottom = `${-this.paddingBottom(widget)}px`;
        if (widget.style.getPropertyValue("--swt-sticky-bottom") !== bottom) widget.style.setProperty("--swt-sticky-bottom", bottom);
      }
      if (native || overWindow) {
        const table = info.table.getBoundingClientRect();
        head.style.transform = "";
        head.classList.toggle("swt-stuck", head.getBoundingClientRect().top > table.top + 0.5);
        if (foot) {
          foot.style.transform = "";
          foot.classList.toggle("swt-stuck", foot.rows.length > 0 && foot.getBoundingClientRect().bottom < table.bottom - 0.5);
        }
        continue;
      }
      const box = this.host.innerBox(widget);
      const pageTop = scroller.top + gap;
      const boxTop = inside ? box.top : -Infinity;
      const table = info.table.getBoundingClientRect();
      // Rows pinned to the bottom first: held at the bottom of the view (the
      // page, or the table's box), never above the header's own place
      const footHeight = foot?.offsetHeight ?? 0;
      let footTop = table.bottom - footHeight;
      if (foot && footHeight > 0) {
        const pageBottom = scroller.bottom;
        const boxBottom = inside ? box.bottom : Infinity;
        const lift = Math.min(
          0,
          Math.max(Math.min(pageBottom, boxBottom) - table.bottom, -(table.height - head.offsetHeight - footHeight)),
        );
        foot.style.transform = lift < 0 ? `translateY(${lift}px)` : "";
        foot.classList.toggle("swt-stuck", lift < 0);
        footTop += lift;
      }
      // The header (with the rows pinned to the top): never past the bottom rows
      const offset = Math.max(0, Math.min(Math.max(pageTop, boxTop), footTop - head.offsetHeight) - table.top);
      head.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
      head.classList.toggle("swt-stuck", offset > 0);
    }
  }

  /** The bottom padding of the box the table's sticky rows keep within: its nearest scrolling ancestor */
  private paddingBottom(widget: HTMLElement): number {
    const win = this.host.doc.defaultView!;
    for (let e = widget.parentElement; e; e = e.parentElement) {
      const style = win.getComputedStyle(e);
      if (/(auto|scroll|overlay)/.test(style.overflowY)) return parseFloat(style.paddingBottom) || 0;
    }
    return 0;
  }

  /**
   * STICKY_GAP, or how far below its page's top the table lies, where that is
   * less: from the view's top (`viewTop`), the page's scroll added (none while
   * it is too short to scroll: no scrolling element then, the case it shows in)
   */
  private gapFor(widget: HTMLElement, table: HTMLTableElement, viewTop: number): number {
    const scrolled = this.host.scrollParentOf(widget)?.scrollTop ?? 0;
    const lies = table.getBoundingClientRect().top - viewTop + scrolled;
    return Math.max(0, Math.min(STICKY_GAP, Math.floor(lies)));
  }
}
