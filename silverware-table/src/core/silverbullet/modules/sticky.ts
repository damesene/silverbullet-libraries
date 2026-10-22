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
      const pageTop = scroller.top + STICKY_GAP;
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
}
