// Where tables and their cells are on screen: boxes in viewport coordinates,
// what of a table is in view as the page and the table scroll. Functions of
// the DOM only, no state; the controller offers them to features (TableHost).
import { SCROLLER_SELECTOR, WIDGET_SELECTOR } from "../dom.ts";
import type { WidgetInfo } from "./feature.ts";

/** A box in viewport coordinates; sides may be infinite (no limit on that side) */
export type Rect = { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };

/** No limit on any side: what `intersect` starts from */
export const EVERYWHERE: Rect = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };

/** The part all the boxes share (empty when they do not overlap: see `isEmpty`) */
export function intersect(...rects: readonly Rect[]): Rect {
  return rects.reduce(
    (a, b) => ({
      left: Math.max(a.left, b.left),
      right: Math.min(a.right, b.right),
      top: Math.max(a.top, b.top),
      bottom: Math.min(a.bottom, b.bottom),
    }),
    EVERYWHERE,
  );
}

export function isEmpty(rect: Rect): boolean {
  return !(rect.right > rect.left && rect.bottom > rect.top);
}

/** Where the table's box shows its content: without its border and scrollbars */
export function innerBox(widget: HTMLElement): Rect {
  const rect = widget.getBoundingClientRect();
  const left = rect.left + widget.clientLeft;
  const top = rect.top + widget.clientTop;
  // Before layout (and in tests) clientWidth is 0: the whole box then
  const width = widget.clientWidth || rect.width;
  const height = widget.clientHeight || rect.height;
  return { left, right: left + width, top, bottom: top + height };
}

/** Whether a table is taller than its box (the maximum height setting) and scrolls inside it */
export function scrollsInside(widget: HTMLElement): boolean {
  return widget.scrollHeight > widget.clientHeight + 1;
}

/** The element the page scrolls in, around an element */
export function scrollParentOf(element: HTMLElement): HTMLElement | undefined {
  const win = element.ownerDocument.defaultView!;
  for (let el = element.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll)/.test(win.getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return undefined;
}

/**
 * Where the page is in view around an element: its scroller (below the
 * editor's top bar, also while the page is too short to scroll), or the
 * window, cut to what an on-screen keyboard leaves visible
 */
export function viewBounds(element: HTMLElement): Rect {
  const win = element.ownerDocument.defaultView!;
  // A table whose box is laid over the window (position: fixed, e.g. shown full screen) is in view across the window
  const widget = element.closest<HTMLElement>(WIDGET_SELECTOR);
  const overWindow = !!widget && win.getComputedStyle(widget).position === "fixed";
  // A page too short to scroll has no scroll parent, but its view still starts below the top bar
  const scroller = overWindow ? undefined : (scrollParentOf(element) ?? element.closest<HTMLElement>(SCROLLER_SELECTOR) ?? undefined);
  const rect = scroller?.getBoundingClientRect();
  // Not laid out (in tests): the window
  const view = rect && rect.height > 0 ? rect : { left: 0, right: win.innerWidth, top: 0, bottom: win.innerHeight };
  // An on-screen keyboard that only shrinks the visual viewport covers the page's bottom
  const visual = win.visualViewport;
  const visibleBottom = visual && visual.height > 0 ? visual.offsetTop + visual.height : Infinity;
  const visibleTop = visual && visual.height > 0 ? visual.offsetTop : -Infinity;
  return { left: view.left, right: view.right, top: Math.max(view.top, visibleTop), bottom: Math.min(view.bottom, visibleBottom) };
}

/** Where a table is in view: the table, cut to the box that scrolls it sideways */
export function shownRect(widget: HTMLElement, info: WidgetInfo): Rect {
  return intersect(innerBox(widget), info.table.getBoundingClientRect());
}

/**
 * Where the body shows between what is held over it as the page and the
 * table scroll: below the header (with the rows pinned to the top), above
 * the rows pinned to the bottom, between the columns pinned left and right.
 * What scrolls under those is out of view.
 */
export function heldBounds(info: WidgetInfo): Rect {
  const { tHead: head, tFoot: foot } = info.table;
  const header = Array.from(info.table.rows[0]!.cells);
  const lefts = header.filter((c) => c.classList.contains("swt-pin-left")).map((c) => c.getBoundingClientRect().right);
  const rights = header.filter((c) => c.classList.contains("swt-pin-right")).map((c) => c.getBoundingClientRect().left);
  return {
    top: head ? head.getBoundingClientRect().bottom : -Infinity,
    bottom: foot?.rows.length ? foot.getBoundingClientRect().top : Infinity,
    left: lefts.length ? Math.max(...lefts) : -Infinity,
    right: rights.length ? Math.min(...rights) : Infinity,
  };
}

/**
 * The part of a cell in view: cut to the table's box, the page in view and,
 * for a body cell, what is held over the body (the header, pinned rows and
 * columns); undefined when none of it is
 */
export function shownPart(widget: HTMLElement, info: WidgetInfo, cell: HTMLElement): Rect | undefined {
  if (!cell.isConnected) return undefined;
  // A body cell scrolls under what is held over the body; a pinned column's cell is itself held
  const held = cell.closest("tbody") ? heldBounds(info) : EVERYWHERE;
  const pinned = cell.classList.contains("swt-pin-left") || cell.classList.contains("swt-pin-right");
  const part = intersect(
    cell.getBoundingClientRect(),
    shownRect(widget, info),
    viewBounds(widget),
    pinned ? { ...held, left: -Infinity, right: Infinity } : held,
  );
  return isEmpty(part) ? undefined : part;
}

/** Whether any of an element of a table is in view: inside the page's scroll view and the table's sideways view */
export function isShown(widget: HTMLElement, info: WidgetInfo, element: Element): boolean {
  // Out of the document while its table is in it (a large table's row out of view)
  if (!element.isConnected && info.table.isConnected) return false;
  const rect = element.getBoundingClientRect();
  const box = innerBox(widget);
  // A body cell under the header held at the top, or under the rows held at the bottom, is out of view
  const held = element.closest("tbody") ? heldBounds(info) : EVERYWHERE;
  const view = intersect(viewBounds(widget), box, { ...EVERYWHERE, top: held.top, bottom: held.bottom });
  return rect.bottom > view.top && rect.top < view.bottom && rect.right > box.left && rect.left < box.right;
}

/** Whether the pointer is over the scrollbar of the element under it */
export function overScrollbar(e: MouseEvent): boolean {
  const el = e.target;
  if (!(el instanceof Element)) return false;
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left - el.clientLeft;
  const y = e.clientY - rect.top - el.clientTop;
  return (el.clientWidth > 0 && x >= el.clientWidth) || (el.clientHeight > 0 && y >= el.clientHeight);
}

// A drag this near an edge of what scrolls a table scrolls it, by this much a move
const AUTOSCROLL_EDGE = 40;
const AUTOSCROLL_STEP = 12;

/**
 * A drag at a point near an edge scrolls what shows the table there: up and
 * down its own box (a table taller than its box) or else the page; sideways
 * the table's box, when the table is wider, unless `sideways` is false (a
 * row dragged by its grip on the table's left edge, which is near that edge
 * from the start)
 */
export function scrollNearEdge(widget: HTMLElement, x: number, y: number, sideways = true): void {
  const scroller = scrollsInside(widget) ? widget : scrollParentOf(widget);
  if (scroller) {
    const view = scroller.getBoundingClientRect();
    if (y < view.top + AUTOSCROLL_EDGE) scroller.scrollTop -= AUTOSCROLL_STEP;
    else if (y > view.bottom - AUTOSCROLL_EDGE) scroller.scrollTop += AUTOSCROLL_STEP;
  }
  if (sideways && widget.scrollWidth > widget.clientWidth) {
    const box = widget.getBoundingClientRect();
    if (x < box.left + AUTOSCROLL_EDGE) widget.scrollLeft -= AUTOSCROLL_STEP;
    else if (x > box.right - AUTOSCROLL_EDGE) widget.scrollLeft += AUTOSCROLL_STEP;
  }
}
