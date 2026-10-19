// Sticky header and footer: a table's header (with the rows pinned to the top)
// stays in view while the page scrolls past the table, and the rows pinned to
// the bottom stay at the bottom of the view. CSS `position: sticky` cannot do
// it: the table sits in a sideways scrolling box, which captures sticky
// positioning. So they are moved with a transform, never past each other.
import type { Feature, TableHost } from "../core/feature.ts";
import { renderedTable, WIDGET_SELECTOR } from "../dom.ts";

// Space between the top of the view and a header held there, room for the
// toolbar (25px) above the header. The CSS covers it with the page color, so no
// row shows above the header; keep both in step.
export const STICKY_GAP = 38;

export class Sticky implements Feature {
  constructor(private readonly host: TableHost) {}

  layoutChanged(): void {
    const { doc } = this.host;
    for (const widget of Array.from(doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      const head = info?.table.tHead;
      if (!info || !head || renderedTable(widget) !== info.table) continue;
      // Held below the page top (with room for the toolbar), or, in a table
      // scrolled inside its own box, at the top of that box
      const scroller = this.host.scrollParentOf(widget)?.getBoundingClientRect();
      const inside = this.host.scrollsInside(widget);
      const box = this.host.innerBox(widget);
      const pageTop = (scroller?.top ?? 0) + STICKY_GAP;
      const boxTop = inside ? box.top : -Infinity;
      const table = info.table.getBoundingClientRect();
      // Rows pinned to the bottom first: held at the bottom of the view (the
      // page, or the table's box), never above the header's own place
      const foot = info.table.tFoot;
      const footHeight = foot?.offsetHeight ?? 0;
      let footTop = table.bottom - footHeight;
      if (foot && footHeight > 0) {
        const pageBottom = scroller?.bottom ?? doc.defaultView!.innerHeight;
        const boxBottom = inside ? box.bottom : Infinity;
        const lift = Math.min(
          0,
          Math.max(Math.min(pageBottom, boxBottom) - table.bottom, -(table.height - head.offsetHeight - footHeight)),
        );
        foot.style.transform = lift < 0 ? `translateY(${lift}px)` : "";
        foot.classList.toggle("tp-stuck", lift < 0);
        footTop += lift;
      }
      // The header (with the rows pinned to the top): never past the bottom rows
      const offset = Math.max(0, Math.min(Math.max(pageTop, boxTop), footTop - head.offsetHeight) - table.top);
      head.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
      head.classList.toggle("tp-stuck", offset > 0);
    }
  }
}
