// Inserting rows and columns with a + on a table's border: shown for a mouse
// or a pen hovering in a band left of the table (rows) or above its header
// (columns), in a lane of its own beside the grips, on the border nearest the
// pointer; and quiet + buttons under the last row and right of the last
// column while a cell of it is edited, hovered or selected. A finger does not
// hover: it inserts from the row and column menus.
//
// A press on the + or in the band is taken on mousedown (SilverBullet's table
// widget would move the cursor into the table on a click and show its
// markdown), and the mouseup and click ending a press that inserted are
// swallowed: the table rendered anew puts something else under the pointer (a
// link the click would follow).
import { ICONS } from "../icons.ts";
import { renderedTable } from "../dom.ts";
import { appendColumnAt, appendRowAt } from "../pins.ts";
import type { RowHold, TableHost, WidgetInfo } from "./feature.ts";
import { heldBounds, type Rect } from "./geometry.ts";
import { insertColumnWith, insertRowWith } from "./structure.ts";

// How near the table's end a column border must be to count as in view
export const INSERT_REACH = 6;
// The + inserting a row (column) has a lane of its own beside the grips (which
// sit on the table's left edge and on the header's top edge, 12px thick): its
// centre this far out from the edge, shown while the pointer is past the grip,
// in a band reaching this far out (and this far past the table's last row or
// column), on the border nearest the pointer
const INSERT_LANE_AT = 17;
const INSERT_LANE_FROM = 7;
const INSERT_LANE_BAND = 32;
const INSERT_LANE_PAST = 16;

// The click that ends a press that inserted (the + takes the press, the table
// is rendered anew under the pointer) is swallowed within this time
const INSERT_CLICK_MS = 1000;

type Axis = "row" | "column";

/** Where a + inserts: a row (column) at `at` of the markdown, a new row held beside `beside` while it is edited */
export type InsertTarget = { readonly key: string; readonly axis: Axis; readonly at: number; readonly beside: RowHold };

/** Where a pointer hovering was last */
export type PointerAt = { readonly pointerType: string; readonly clientX: number; readonly clientY: number };

/** What the + controls need of the controller beside the host: the hover state, which is the controller's */
export type InsertContext = {
  readonly host: TableHost;
  /** The table and the cell hovered */
  readonly hovered: () => { readonly widget: HTMLElement | undefined; readonly cell: HTMLTableCellElement | undefined };
  /** The table rendered anew after a + inserted into it is the one hovered */
  readonly hoverTable: (widget: HTMLElement) => void;
  /** As if the pointer were over this cell: the grips go to its row and column */
  readonly hoverAt: (widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement | undefined) => void;
  readonly pointer: () => PointerAt | undefined;
  /** Something holds the pointer (Feature.pointerBusy) */
  readonly busy: () => "drag" | "menu" | undefined;
  /** The toolbar's or a cell's menu is open */
  readonly menuOpen: () => boolean;
  readonly floatingButton: (className: string, title: string, icon: string) => HTMLButtonElement;
};

export class InsertControls {
  // The + the pointer brought up, and the line it inserts at (one for all the +)
  private readonly mark: HTMLButtonElement;
  private readonly line: HTMLElement;
  // Quiet + buttons under the last row and right of the last column, shown
  // while that row (column) is hovered, selected or edited; lit up under the
  // pointer. A + the pointer brings up on the same axis takes their place.
  private readonly quietMarks: Readonly<Record<Axis, HTMLButtonElement>>;
  // The quiet + under the pointer: its line shows
  private quietHovered: Axis | undefined;
  /** Where the + the pointer brought up inserts */
  at: InsertTarget | undefined;
  /** The pointer is over the band around the table where a + inserts: as over the table, its controls stay */
  inBand = false;
  // When a press inserted: the click that ends it is no click on what is under the pointer then
  private pressAt = 0;
  // The table a + inserted into, to show the + again once it is rendered anew
  private insertedIn: string | undefined;

  constructor(private readonly context: InsertContext) {
    this.mark = context.floatingButton("swt-insert", "Insert here", ICONS.plus);
    this.quietMarks = {
      row: context.floatingButton("swt-insert swt-quiet", "Add a row", ICONS.plus),
      column: context.floatingButton("swt-insert swt-quiet", "Add a column", ICONS.plus),
    };
    this.line = context.host.floating("div", "swt-insert-line");
    // A click without a press (the keyboard); a press is taken in mouseDown
    this.mark.addEventListener("click", () => this.insertHere());
    for (const axis of ["row", "column"] as const) {
      const mark = this.quietMarks[axis];
      mark.addEventListener("click", () => this.insertAtEnd(axis));
      // Lit up under the pointer (the CSS), with the line where it adds
      mark.addEventListener("pointerenter", () => {
        this.quietHovered = axis;
        this.lineAtEnd(axis);
      });
      mark.addEventListener("pointerleave", () => {
        if (this.quietHovered === axis) this.quietHovered = undefined;
        if (!this.at) this.line.classList.remove("swt-visible");
      });
    }
  }

  remove(): void {
    for (const el of [this.mark, this.line, ...Object.values(this.quietMarks)]) el.remove();
  }

  owns(node: Node): boolean {
    return [this.mark, this.line, ...Object.values(this.quietMarks)].some((el) => el.contains(node));
  }

  // ---- presses -------------------------------------------------------------

  /** Any press, first: only the press that inserted has its end swallowed */
  pressStarted(): void {
    this.pressAt = 0;
  }

  /**
   * A press (after the features'): on a +, or in the band beside the table that
   * misses it (or where none shows), it is the +'s: it inserts at once. True: taken.
   */
  mouseDown(e: MouseEvent): boolean {
    if (e.button !== 0) return false;
    const quietAxis = (["row", "column"] as const).find((axis) => e.target instanceof Node && this.quietMarks[axis].contains(e.target));
    if (quietAxis) {
      e.preventDefault();
      e.stopPropagation();
      this.pressAt = Date.now();
      this.insertAtEnd(quietAxis);
      return true;
    }
    const onMark = e.target instanceof Node && this.mark.contains(e.target);
    if (onMark || (this.inBand && !(e.target instanceof Node && this.context.host.isFloating(e.target)))) {
      e.preventDefault();
      e.stopPropagation();
      if (this.at) {
        this.pressAt = Date.now();
        this.insertHere();
      }
      return true;
    }
    return false;
  }

  /** Whether a mouseup or click (not from the keyboard) ends a press that inserted: it reaches nothing */
  endsInsertingPress(e: MouseEvent): boolean {
    if (e.button !== 0 || !this.pressAt || Date.now() - this.pressAt > INSERT_CLICK_MS) return false;
    // The click is the press's last event
    if (e.type === "click") this.pressAt = 0;
    return true;
  }

  // ---- the pointer ---------------------------------------------------------

  /** The pointer moved: the + where it is (none while a menu is open or something is dragged) */
  pointerMoved(e: PointerEvent): void {
    const busy = this.context.busy();
    this.inBand = !this.context.menuOpen() && busy !== "drag" ? this.show(e, !busy) : this.hide();
  }

  /** The pointer left the window: the + goes (no move tells it so) */
  pointerLeft(): void {
    this.inBand = this.hide();
  }

  /** The table moved under a pointer that did not: the + where the pointer is now */
  followPointer(): void {
    if (this.at || this.inBand) this.showUnderPointer();
  }

  /** A table rendered anew after a + inserted into it: the + where the pointer still is */
  tableEnhanced(widget: HTMLElement, info: WidgetInfo): void {
    if (this.insertedIn !== info.key || !this.context.pointer()) return;
    this.insertedIn = undefined;
    this.context.hoverTable(widget);
    this.showUnderPointer();
  }

  /** The table's controls are hidden: the pointer's + too (a selected cell's quiet + stays) */
  hidePointers(): void {
    this.mark.classList.remove("swt-visible");
    this.line.classList.remove("swt-visible");
    this.at = undefined;
  }

  /** The + where the pointer is now, as a move there would show it */
  private showUnderPointer(): void {
    const pointer = this.context.pointer();
    const busy = this.context.busy();
    if (!pointer || this.context.menuOpen() || busy === "drag") {
      this.inBand = this.hide();
      return;
    }
    const target = this.context.host.doc.elementFromPoint?.(pointer.clientX, pointer.clientY) ?? null;
    this.inBand = this.show({ ...pointer, buttons: 0, target }, !busy);
  }

  /**
   * A pointer that hovers (a mouse, a pen) near a border of the table shown:
   * on a border between rows (or under the last), left of the table, or between
   * columns (or right of the last), above the header, a + inserts one there.
   * Whether the pointer is in that band around the table. `mark` false (a menu
   * open): the grips follow the pointer along the edges, no + is shown.
   */
  private show(e: Pick<PointerEvent, "pointerType" | "buttons" | "target" | "clientX" | "clientY">, mark = true): boolean {
    const { host } = this.context;
    const { widget, cell: hoverCell } = this.context.hovered();
    const info = widget && host.infoOf(widget);
    if (e.pointerType === "touch" || e.buttons !== 0 || !widget || !info || renderedTable(widget) !== info.table) return this.hide();
    if (e.target instanceof Node && this.mark.contains(e.target)) return true;
    if (e.target instanceof Node && host.isFloating(e.target)) return this.hide();
    const shown = host.shownRect(widget, info);
    const header = info.table.rows[0]!.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    // Left of the table: the borders under the header and under each row shown;
    // over the row grip (on the edge) the band, but no +; left of it, the +
    // on the border nearest the pointer, so it needs no aiming
    if (x >= shown.left - INSERT_LANE_BAND && x <= shown.left + 2 && y >= header.top && y <= shown.bottom + INSERT_LANE_PAST) {
      // Body rows as far as they show between the rows held over them (the
      // header held at the top, rows pinned there or to the bottom): one that
      // scrolled under them gets no grip, its border no +
      const held = heldBounds(info);
      const body = (tr: HTMLTableRowElement) => tr.parentElement?.tagName === "TBODY";
      const span = (tr: HTMLTableRowElement) => {
        const r = tr.getBoundingClientRect();
        // (A DOMRect's fields are getters: spreading it copies none)
        return body(tr) ? { top: Math.max(r.top, held.top), bottom: Math.min(r.bottom, held.bottom), edge: r.bottom } : { top: r.top, bottom: r.bottom, edge: r.bottom };
      };
      const rows = host.shownRows(info).filter((tr) => span(tr).bottom > span(tr).top + 1);
      // The row grip goes to the row beside the pointer
      const besideRow = rows.find((tr, i) => i > 0 && y >= span(tr).top && y < span(tr).bottom);
      if (besideRow) this.context.hoverAt(widget, info, besideRow.cells[hoverCell?.cellIndex ?? 0] ?? besideRow.cells[0]);
      // The borders under the rows shown, where they show
      const edges = rows
        .map((tr, i) => ({ edge: span(tr).edge, i }))
        .filter(({ edge, i }) => !body(rows[i]!) || (edge >= held.top - 1 && edge <= held.bottom + 1));
      if (mark && x <= shown.left - INSERT_LANE_FROM && edges.length) {
        const { edge, i } = edges.reduce((best, e) => (Math.abs(y - e.edge) < Math.abs(y - best.edge) ? e : best));
        const next = rows[i + 1];
        const below = next && host.rowOf(info, next);
        const above = i > 0 ? host.rowOf(info, rows[i]!) : undefined;
        // Above the row shown below the border; under the last one, at the end (above rows pinned to the bottom)
        const at = below !== undefined && below > 0 ? below : appendRowAt(info.pins, info.rows);
        const beside: RowHold = below !== undefined && below > 0 ? { before: below } : above !== undefined ? { after: above } : {};
        this.markAt(info, { key: info.key, axis: "row", at, beside }, edge, shown);
        return true;
      }
      return this.hide(true);
    }
    // Above the header: the borders between columns, and right of the last; over
    // the column grip (on the header's top edge) the band, but no +; above it,
    // the + on the border nearest the pointer, as for rows
    if (y >= header.top - INSERT_LANE_BAND && y <= header.top + 2 && x >= shown.left - INSERT_REACH && x <= shown.right + INSERT_LANE_PAST) {
      const cells = Array.from(info.table.rows[0]!.cells);
      const pinned = (c: HTMLTableCellElement) => c.classList.contains("swt-pin-left") || c.classList.contains("swt-pin-right");
      // The column grip goes to the column under the pointer (in the row hovered last): a pinned
      // column over one the table scrolled sideways under it
      const under = cells.filter((c) => x >= c.getBoundingClientRect().left && x < c.getBoundingClientRect().right);
      const column = (under.find(pinned) ?? under[0])?.cellIndex ?? -1;
      const row = (hoverCell?.parentElement as HTMLTableRowElement | undefined) ?? info.table.rows[0]!;
      if (column >= 0 && row.closest("table") === info.table) this.context.hoverAt(widget, info, row.cells[column]);
      // The borders in view (a wide table scrolls sideways, under its pinned
      // columns), by the column they insert at: a pinned column's, and the
      // others' between the pinned ones
      const held = heldBounds(info);
      const edges = cells
        .flatMap((c, i) => {
          const r = c.getBoundingClientRect();
          return [
            { edge: r.left, i, pinned: pinned(c) },
            { edge: r.right, i: i + 1, pinned: pinned(c) },
          ];
        })
        .filter(({ edge, pinned }) => (pinned || (edge >= held.left - 1 && edge <= held.right + 1)) && edge >= shown.left - INSERT_REACH && edge <= shown.right + INSERT_REACH);
      if (mark && y <= header.top - INSERT_LANE_FROM && edges.length) {
        const { edge, i } = edges.reduce((best, e) => (Math.abs(x - e.edge) < Math.abs(x - best.edge) ? e : best));
        const at = i < cells.length ? i : appendColumnAt(info.pins, info.columns);
        this.markAt(info, { key: info.key, axis: "column", at, beside: {} }, edge, shown);
        return true;
      }
      return this.hide(true);
    }
    return this.hide();
  }

  private markAt(info: WidgetInfo, at: InsertTarget, edge: number, shown: Rect): void {
    this.at = at;
    const mark = this.mark;
    mark.title = at.axis === "row" ? "Insert a row here" : "Insert a column here";
    mark.setAttribute("aria-label", mark.title);
    mark.classList.add("swt-visible");
    this.place(mark, info, at.axis, edge, shown);
    // The quiet + on its axis gives way
    this.showQuiet();
  }

  /**
   * A + and the line it inserts at: a row's left of the row grips, the line
   * across the table; a column's above the column grips, the line down the
   * table
   */
  private place(
    mark: HTMLElement,
    info: WidgetInfo,
    axis: Axis,
    edge: number,
    shown: Rect,
    // The line is one for all the +: drawn for the one it belongs to (the pointer's, or the quiet one under the pointer)
    withLine = true,
  ): void {
    const { host } = this.context;
    const line = this.line;
    if (withLine) line.classList.add("swt-visible");
    if (axis === "row") {
      const center = shown.left - INSERT_LANE_AT;
      if (withLine) Object.assign(line.style, { left: `${center}px`, top: `${edge - 1}px`, width: `${shown.right - center}px`, height: "2px" });
      host.place(mark, center - mark.offsetWidth / 2, edge - mark.offsetHeight / 2);
    } else {
      const center = info.table.rows[0]!.getBoundingClientRect().top - INSERT_LANE_AT;
      if (withLine) Object.assign(line.style, { left: `${edge - 1}px`, top: `${center}px`, width: "2px", height: `${shown.bottom - center}px` });
      host.place(mark, edge - mark.offsetWidth / 2, center - mark.offsetHeight / 2);
    }
  }

  /**
   * The + the pointer brought up goes (the quiet ones come back); `inBand`:
   * the pointer is still in the band around the table (the table's controls
   * stay)
   */
  private hide(inBand = false): boolean {
    this.at = undefined;
    this.mark.classList.remove("swt-visible");
    this.line.classList.remove("swt-visible");
    this.showQuiet();
    return inBand;
  }

  // ---- the quiet + of the last row and column --------------------------------

  /**
   * The table whose last row or column has the cell edited, the cell hovered
   * or a selected cell (in this order), and which of the two
   */
  private quietTarget(): { widget: HTMLElement; info: WidgetInfo; row: boolean; column: boolean } | undefined {
    const { host } = this.context;
    const editing = host.editing?.cell;
    const hoverCell = this.context.hovered().cell;
    const hovered = hoverCell?.isConnected ? hoverCell : undefined;
    const selected = Array.from(host.doc.querySelectorAll<HTMLTableCellElement>(".swt-selected"));
    const first = editing ?? hovered ?? selected[0];
    const hit = first && host.enhancedWidgetOf(first);
    if (!hit) return undefined;
    const [widget, info] = hit;
    const rows = host.shownRows(info);
    const lastRow = rows.length > 1 ? rows[rows.length - 1] : undefined;
    const lastColumn = info.table.rows[0]!.cells.length - 1;
    const cells = [editing, hovered, ...selected].filter((cell) => cell?.closest("table") === info.table);
    const row = cells.some((cell) => cell!.parentElement === lastRow);
    const column = cells.some((cell) => cell!.cellIndex === lastColumn);
    return row || column ? { widget, info, row, column } : undefined;
  }

  /** Where a row (column) is added at the end: its edge, and the insert there */
  private endOf(widget: HTMLElement, info: WidgetInfo, axis: Axis): { at: InsertTarget; edge: number; shown: Rect } {
    const { host } = this.context;
    const shown = host.shownRect(widget, info);
    if (axis === "row") {
      const rows = host.shownRows(info);
      const last = rows[rows.length - 1]!;
      const at = { key: info.key, axis, at: appendRowAt(info.pins, info.rows), beside: { after: host.rowOf(info, last) } };
      return { at, edge: last.getBoundingClientRect().bottom, shown };
    }
    const cells = info.table.rows[0]!.cells;
    const at = { key: info.key, axis, at: appendColumnAt(info.pins, info.columns), beside: {} };
    return { at, edge: cells[cells.length - 1]!.getBoundingClientRect().right, shown };
  }

  /** The quiet + of the last row and column (quietTarget), but on an axis where the pointer brought up a +, or out of view */
  showQuiet(): void {
    const target = this.quietTarget();
    for (const axis of ["row", "column"] as const) {
      const mark = this.quietMarks[axis];
      if (!target || !target[axis] || this.at?.axis === axis) {
        mark.classList.remove("swt-visible");
        continue;
      }
      const { widget, info } = target;
      const end = this.endOf(widget, info, axis);
      const view = this.context.host.viewBounds(widget);
      // Where it goes: the border under the last row, the header's top at the last column
      const y = axis === "row" ? end.edge : info.table.rows[0]!.getBoundingClientRect().top - INSERT_LANE_AT;
      // A last body row scrolled under the rows held at the top has its border there too: out of view
      const held = heldBounds(info);
      const inView = y >= view.top && y <= view.bottom && (axis === "row" ? end.edge >= held.top - 1 : end.edge <= end.shown.right + INSERT_REACH);
      if (!inView) {
        mark.classList.remove("swt-visible");
        continue;
      }
      // Shown before it is placed: hidden, it has no size to centre by
      mark.classList.add("swt-visible");
      this.place(mark, info, axis, end.edge, end.shown, false);
    }
    // The line: the pointer's +'s (left as it is), else the quiet + under the pointer's, else none
    if (this.at) return;
    const hovered = this.quietHovered;
    if (hovered && this.quietMarks[hovered].classList.contains("swt-visible")) this.lineAtEnd(hovered);
    else this.line.classList.remove("swt-visible");
  }

  /** The pointer on a quiet +: the line where it adds */
  private lineAtEnd(axis: Axis): void {
    const target = this.quietTarget();
    if (!target || this.at) return;
    const end = this.endOf(target.widget, target.info, axis);
    this.place(this.quietMarks[axis], target.info, axis, end.edge, end.shown);
  }

  // ---- inserting -------------------------------------------------------------

  /** A quiet + pressed: a row (column) added at the end, its first cell (name) edited */
  private insertAtEnd(axis: Axis): void {
    const target = this.quietTarget();
    if (!target) return;
    const { widget, info } = target;
    this.insert(widget, info, this.endOf(widget, info, axis).at);
  }

  /** The + clicked: a row (column) inserted there, its first cell (name) edited */
  private insertHere(): void {
    const at = this.at;
    const widget = at && this.context.host.widgetForKey(at.key);
    const info = widget && this.context.host.infoOf(widget);
    if (at && widget && info) this.insert(widget, info, at);
  }

  private insert(widget: HTMLElement, info: WidgetInfo, at: InsertTarget): void {
    const { host } = this.context;
    // The table rendered anew shows the + again under the pointer (tableEnhanced): another click inserts another
    this.insertedIn = info.key;
    if (at.axis === "row") void insertRowWith(host, info, at.at, firstVisibleColumn(widget, info), undefined, at.beside);
    else void insertColumnWith(host, info, at.at);
  }
}

/** The leftmost column in view, so editing a new row does not scroll a wide table back */
function firstVisibleColumn(widget: HTMLElement, info: WidgetInfo): number {
  const left = widget.getBoundingClientRect().left;
  const cells = Array.from(info.table.rows[0]!.cells);
  const index = cells.findIndex((cell) => cell.getBoundingClientRect().left >= left - 1);
  return Math.max(0, index);
}
