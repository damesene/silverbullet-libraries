// What the SilverBullet adapter draws over the cells it was asked to, in
// SilverBullet's rendered tables: outlines of areas (pieces in the edge cells,
// core/outline.ts), handles in cells (on a corner, or in the middle of the
// part of a whole row or column in view), and what a pointer is on among
// them. Pieces and handles are Silverware Table's own elements in the cells
// (UI_CLASS, OUT_OF_LINE_CLASS), so they scroll, stick and are cut with them.
import { OUT_OF_LINE_CLASS, UI_CLASS, WIDGET_SELECTOR } from "../../dom.ts";
import type { HandlePlace, PointerTarget, Side, WidgetInfo } from "../feature.ts";
import { intersect, isEmpty, shownRect, viewBounds } from "../geometry.ts";
import { Outline } from "../outline.ts";
import type { TableRows } from "../rows.ts";

type PieceOf = { readonly layer: string; readonly key: string; readonly row: number; readonly column: number };
type HandleOf = { readonly layer: string; readonly key: string; readonly className: string; readonly row: number; readonly column: number };

export class Overlays {
  private readonly outlines = new Map<string, Outline>();
  private readonly pieces = new WeakMap<Element, PieceOf>();
  // Each layer's handles, by class: made once, put into the cells they are placed in
  private readonly handles = new Map<string, Map<string, HTMLElement>>();
  private readonly handleOf = new WeakMap<Element, HandleOf>();

  constructor(
    private readonly doc: Document,
    private readonly rows: TableRows,
  ) {}

  showOutline(name: string, info: WidgetInfo, rows: readonly number[], columns: readonly [number, number], pieces: (sides: readonly Side[]) => readonly string[]): void {
    let outline = this.outlines.get(name);
    if (!outline) this.outlines.set(name, (outline = new Outline(this.doc, pieces)));
    const [from, to] = columns;
    outline.show(
      rows.length,
      to - from + 1,
      (i, j) => this.rows.cellAt(info, { row: rows[i]!, column: from + j }, true),
      (piece, i, j) => this.pieces.set(piece, { layer: name, key: info.key, row: rows[i]!, column: from + j }),
    );
  }

  hideOutline(name: string): void {
    this.outlines.get(name)?.clear();
  }

  /** Whether a layer's outline is in the tables shown (not rendered anew since) */
  outlineShown(name: string): boolean {
    const outline = this.outlines.get(name);
    return !!outline && outline.shown;
  }

  placeHandles(name: string, info: WidgetInfo, places: readonly HandlePlace[]): void {
    let made = this.handles.get(name);
    if (!made) this.handles.set(name, (made = new Map()));
    const placed = new Set<string>();
    const shown = this.rows.shownRows(info);
    const firstRow = shown[0] && this.rows.rowOf(info, shown[0]);
    const lastRow = shown.length ? this.rows.rowOf(info, shown[shown.length - 1]!) : undefined;
    for (const place of places) {
      let handle = made.get(place.className);
      if (!handle) {
        handle = this.doc.createElement("div");
        handle.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} ${place.className}`;
        made.set(place.className, handle);
      }
      placed.add(place.className);
      if (place.title !== undefined) handle.title = place.title;
      handle.classList.remove("swt-at-mid", "swt-at-top", "swt-at-bottom", "swt-at-left", "swt-at-right");
      handle.style.left = handle.style.top = handle.style.right = handle.style.bottom = "";
      this.handleOf.set(handle, { layer: name, key: info.key, className: place.className, row: place.row, column: place.column });
      if (place.mid && this.placeMid(info, handle, place)) continue;
      const cell = this.rows.cellAt(info, place, true);
      if (!cell) {
        handle.remove();
        continue;
      }
      // On the table's edges: inside the cell, where the table's box would cut what is past it
      handle.classList.toggle("swt-at-top", place.row === firstRow);
      handle.classList.toggle("swt-at-bottom", place.row === lastRow);
      handle.classList.toggle("swt-at-left", place.column === 0);
      handle.classList.toggle("swt-at-right", place.column === info.columns - 1);
      cell.append(handle);
    }
    for (const [className, handle] of made) if (!placed.has(className)) handle.remove();
  }

  hideHandles(name: string): void {
    for (const handle of this.handles.get(name)?.values() ?? []) handle.remove();
  }

  /**
   * A handle on a whole row (column) in the middle of what is in view of the
   * table, at the cell of the line the middle is in: in reach however far the
   * page or the table scrolled. False when no cell of the line is in view there.
   */
  private placeMid(info: WidgetInfo, handle: HTMLElement, place: HandlePlace): boolean {
    const widget = info.table.closest<HTMLElement>(WIDGET_SELECTOR);
    if (!widget) return false;
    const shown = intersect(shownRect(widget, info), viewBounds(widget));
    if (isEmpty(shown)) return false;
    const axis = place.mid!;
    const middle = axis === "row" ? (shown.left + shown.right) / 2 : (shown.top + shown.bottom) / 2;
    const line =
      axis === "row"
        ? Array.from({ length: info.columns }, (_, column) => this.rows.cellAt(info, { row: place.row, column }, true))
        : this.rows.shownRows(info).map((tr) => tr.cells[place.column]);
    for (const cell of line) {
      if (!cell?.isConnected) continue;
      const r = cell.getBoundingClientRect();
      const [from, to] = axis === "row" ? [r.left, r.right] : [r.top, r.bottom];
      if (middle < from || middle >= to) continue;
      const half = handle.offsetWidth / 2 || 14;
      handle.classList.add("swt-at-mid");
      if (axis === "row") {
        handle.style.left = `${middle - from - half}px`;
        handle.style.right = "auto";
      } else {
        handle.style.top = `${middle - from - half}px`;
        handle.style.bottom = "auto";
      }
      cell.append(handle);
      return true;
    }
    return false;
  }

  /** What an element is among the pieces and handles, if it is (in) one */
  targetOf(element: Element): PointerTarget | undefined {
    for (let el: Element | null = element; el; el = el.parentElement) {
      const piece = this.pieces.get(el);
      if (piece && el.isConnected) return { kind: "outline", ...piece };
      const handle = this.handleOf.get(el);
      if (handle && el.isConnected) return { kind: "handle", ...handle };
      if (el.matches("td, th")) return undefined;
    }
    return undefined;
  }

  /** Whether a node is in one of the pieces or handles */
  owns(node: Node): boolean {
    for (const outline of this.outlines.values()) if (outline.contains(node)) return true;
    for (const made of this.handles.values()) for (const handle of made.values()) if (handle.contains(node)) return true;
    return false;
  }

  stop(): void {
    for (const outline of this.outlines.values()) outline.clear();
    for (const made of this.handles.values()) for (const handle of made.values()) handle.remove();
  }
}
