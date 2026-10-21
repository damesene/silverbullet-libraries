// The row and column grips: shown next to the hovered cell's row and above its
// column, quiet bars of a bounded length (a tall row or a wide column does not
// stretch them); hovering one tints its row or column, a click opens the row or
// column menu, a drag moves the row or column. Select rows (columns) in a menu
// selects from that row to the one under the pointer, until a click in the table.
import type { Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import {
  columnBlockTo,
  deleteColumnsAt,
  deleteRowsAt,
  duplicateRowAt,
  insertColumnWith,
  insertRowWith,
  MOVE_BLOCKED,
  moveColumnsTo,
  moveRowsTo,
  pinColumnAt,
  pinRowAt,
  rowBlockTo,
} from "../core/structure.ts";
import { cellText } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { type Align, parseTable, type Table } from "../markdown.ts";
import { focusMenu, type MenuEntry, renderMenu } from "../menu.ts";
import { setAlign } from "../ops.ts";
import { columnZone, insertColumnAt, insertRowAt, rowZone } from "../pins.ts";
import { type ViewState, withoutSort, withSort } from "../view.ts";

type Axis = "row" | "column";

// What the grips currently belong to
type HandleTarget = {
  readonly widget: HTMLElement;
  readonly info: WidgetInfo;
  readonly row?: number;
  readonly column: number;
};

// Pointer travel that turns a press on a grip into a drag instead of a click
const DRAG_THRESHOLD = 4;

// A grip's thickness, and its length at most (centred on its row or column)
const GRIP_THICKNESS = 12;
const ROW_GRIP_LENGTH = 32;
const COLUMN_GRIP_LENGTH = 44;

// While a row is dragged near the top or bottom of the view, the page scrolls by this much a move
const AUTOSCROLL_EDGE = 40;
const AUTOSCROLL_STEP = 12;

const PIN_NEEDS_METADATA = "Pinning is stored in the table: turn on the Store table metadata setting (unpinning always works)";

export class Grips implements Feature {
  private readonly rowGrip: HTMLButtonElement;
  private readonly columnGrip: HTMLButtonElement;
  private target: HandleTarget | undefined;
  /**
   * The open menu, for the row (column) `line`. It stays where its grip was,
   * kept beside that row's first cell (the column's header) by `anchor`, while
   * the grips go on following the pointer: a click on another opens its menu instead.
   */
  private menu:
    | {
        element: HTMLElement;
        axis: Axis;
        widget: HTMLElement;
        line: number;
        anchor: { readonly cell: HTMLElement; readonly dx: number; readonly dy: number; readonly width: number; readonly height: number };
      }
    | undefined;
  private dragging = false;
  // Select rows (columns): from the row (column) `from` to the one under the pointer, in the table `key`
  private picking: { readonly key: string; readonly axis: Axis; readonly from: number } | undefined;
  // The grips select lines themselves (their menu stays for them)
  private selectingLines = false;

  constructor(private readonly host: TableHost) {
    this.rowGrip = this.gripButton("tp-handle tp-grip", "Row: click for actions, drag to move");
    this.columnGrip = this.gripButton("tp-handle tp-grip tp-grip-column", "Column: click for actions, drag to move");
  }

  start(): void {
    this.rowGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "column"));
    // Hovering a grip tints what it acts on
    for (const [grip, axis] of [[this.rowGrip, "row"], [this.columnGrip, "column"]] as const) {
      grip.addEventListener("pointerenter", () => this.tint(axis));
      grip.addEventListener("pointerleave", () => this.tint(undefined));
    }
  }

  /** The cells of the hovered grip's row or column tinted; undefined: none */
  private tint(axis: Axis | undefined): void {
    for (const cell of Array.from(this.host.doc.querySelectorAll(".tp-handle-hover"))) cell.classList.remove("tp-handle-hover");
    const target = this.target;
    if (!axis || !target || this.dragging) return;
    for (const cell of this.cellsOf(target, axis)) cell.classList.add("tp-handle-hover");
  }

  /** The cells of the target's row, or of its column (the header's included) */
  private cellsOf(target: HandleTarget, axis: Axis): HTMLTableCellElement[] {
    const { info } = target;
    if (axis === "row") {
      const tr = target.row === undefined ? undefined : this.host.bodyRows(info)[target.row - 1];
      return tr ? Array.from(tr.cells) : [];
    }
    return [info.table.rows[0]!, ...this.host.bodyRows(info)].flatMap((tr) => tr.cells[target.column] ?? []);
  }

  stop(): void {
    this.endPicking();
    this.closeMenu(false);
    this.rowGrip.remove();
    this.columnGrip.remove();
  }

  owns(node: Node): boolean {
    return this.rowGrip.contains(node) || this.columnGrip.contains(node) || !!this.menu?.element.contains(node);
  }

  // While a grip is dragged the hover controls stay; with a menu open, or rows being selected, the grips stay in its table
  pointerBusy(): "drag" | "menu" | undefined {
    return this.dragging ? "drag" : this.menu || this.picking ? "menu" : undefined;
  }

  // A press outside an open menu closes it
  mouseDown(e: MouseEvent): boolean {
    if (this.picking && this.pickedBy(e)) return true;
    if (this.menu && e.target instanceof Node && !this.host.isFloating(e.target)) this.closeMenu(false);
    return false;
  }

  keyDown(e: KeyboardEvent): boolean {
    const picking = this.picking;
    // Esc while selecting rows (columns): just the one it started from
    if (e.key === "Escape" && picking) {
      e.preventDefault();
      e.stopPropagation();
      const widget = this.host.widgetForKey(picking.key);
      const info = widget && this.host.infoOf(widget);
      if (info) this.selectLines(info, picking.axis, picking.from, picking.from);
      this.endPicking();
      return true;
    }
    if (e.key !== "Escape" || !this.menu) return false;
    e.preventDefault();
    e.stopPropagation();
    this.closeMenu(true);
    return true;
  }

  /** The pointer is over a cell (or the page moved under it): the grips go to its row and column */
  cellHovered(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    const ref = this.host.cellRef(info, cell);
    if (!ref) return;
    this.target = { widget, info, column: ref.column, ...(ref.row > 0 ? { row: ref.row } : {}) };
    const picking = this.picking;
    // Selecting rows: the header is not one of them
    if (picking?.key === info.key && (picking.axis === "column" || ref.row > 0)) {
      this.selectLines(info, picking.axis, picking.from, picking.axis === "row" ? ref.row : ref.column);
    }
    const tr = cell.parentElement as HTMLTableRowElement;
    // The part of a wide table in view: the table itself may be scrolled sideways
    const shown = this.host.shownRect(widget, info);
    const rearranged = this.host.rearranged(info);

    if (ref.row > 0) {
      const rowRect = tr.getBoundingClientRect();
      this.rowGrip.classList.toggle("tp-no-drag", rearranged);
      this.rowGrip.title = rearranged ? `Row: click for actions (${MOVE_BLOCKED.toLowerCase()})` : "Row: click for actions, drag to move";
      const length = Math.max(GRIP_THICKNESS, Math.min(rowRect.height - 8, ROW_GRIP_LENGTH));
      Object.assign(this.rowGrip.style, { width: `${GRIP_THICKNESS}px`, height: `${length}px` });
      // Half on the table's left edge, half in the cell
      this.host.place(this.rowGrip, shown.left - GRIP_THICKNESS / 2, rowRect.top + (rowRect.height - length) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0]!.cells[ref.column];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      const length = Math.max(GRIP_THICKNESS, Math.min(h.width - 8, COLUMN_GRIP_LENGTH));
      Object.assign(this.columnGrip.style, { width: `${length}px`, height: `${GRIP_THICKNESS}px` });
      // Centered on the column, as far as the column is in view
      const center = Math.max(shown.left + length / 2, Math.min(h.left + h.width / 2, shown.right - length / 2));
      // Half on the header's top edge, half in the header cell
      this.host.place(this.columnGrip, center - length / 2, h.top - GRIP_THICKNESS / 2);
    }
    // A grip shows it has the menu open only on the menu's row (column)
    const menu = this.menu;
    this.rowGrip.classList.toggle("tp-active", menu?.axis === "row" && menu.line === ref.row);
    this.columnGrip.classList.toggle("tp-active", menu?.axis === "column" && menu.line === ref.column);
    this.positionMenu();
  }

  /** No cell is hovered (editing, or the table left the view): the grips go, and with `closeMenus` an open menu */
  hoverEnded(closeMenus: boolean): void {
    if (closeMenus) this.closeMenu(false);
    this.hideGrips();
  }

  private gripButton(className: string, title: string): HTMLButtonElement {
    const button = this.host.floating("button", className);
    button.type = "button";
    button.tabIndex = -1;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = ICONS.grip;
    return button;
  }

  private hideGrips(): void {
    for (const el of [this.rowGrip, this.columnGrip]) el.classList.remove("tp-visible");
    this.tint(undefined);
    this.target = undefined;
  }

  // ---- a press on a grip: a click opens its menu, a drag moves -------------

  private onGripPointerDown(e: PointerEvent, axis: Axis): void {
    const target = this.target;
    if (e.button !== 0 || !target || (axis === "row" && target.row === undefined)) return;
    e.preventDefault();
    const grip = axis === "row" ? this.rowGrip : this.columnGrip;
    const canDrag = axis === "column" || !this.host.rearranged(target.info);
    const win = this.host.doc.defaultView!;
    const startX = e.clientX;
    const startY = e.clientY;
    let drag: ReturnType<Grips["beginDrag"]> | undefined;

    const move = (ev: PointerEvent) => {
      if (!drag) {
        if (!canDrag || Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
        this.closeMenu(false);
        drag = this.beginDrag(target, axis, axis === "row" ? startY : startX);
      }
      drag.move(ev);
    };
    const cleanup = () => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      win.removeEventListener("pointercancel", cancel);
      win.removeEventListener("keydown", escape, true);
    };
    // The browser took the touch over (e.g. for scrolling): nothing is moved
    const cancel = () => {
      cleanup();
      drag?.finish(false);
    };
    const extend = e.shiftKey;
    const up = () => {
      cleanup();
      if (drag) drag.finish(true);
      else if (extend) {
        // Shift+click: rows (columns) selected as with Select rows, on from those selected
        this.closeMenu(false, false);
        this.pickFrom(target, axis);
      } else {
        // A click selects the row (column) and opens its menu
        this.select(target, axis);
        this.toggleMenu(axis, target, grip);
      }
    };
    const escape = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || !drag) return;
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
      drag.finish(false);
    };
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
    win.addEventListener("pointercancel", cancel);
    win.addEventListener("keydown", escape, true);
  }

  /**
   * A drag of a grip: a copy of the row (column) follows the pointer, the
   * others move aside to show where it goes (within its pin zone), and the
   * page scrolls near its edges. Dropped, the row (column) moves there.
   */
  /** The whole row (column) selected, as shown: the header and the rows a filter leaves */
  private select(target: HandleTarget, axis: Axis): void {
    const { info } = target;
    const line = axis === "row" ? target.row! : target.column;
    // A row of the whole rows selected: they stay selected, for its menu (Delete 3 rows)
    const lines = this.wholeLinesSelected(info, axis);
    if (lines.length > 1 && lines.includes(line)) return;
    this.selectLines(info, axis, line, line);
  }

  /** The rows (columns) selected whole, as shown; none when the selection is not whole rows (columns) */
  private wholeLinesSelected(info: WidgetInfo, axis: Axis): number[] {
    const cells = this.host.selectedCells(info);
    const lines = [...new Set(cells.map((ref) => (axis === "row" ? ref.row : ref.column)))];
    const whole = axis === "row" ? info.columns : this.host.shownRows(info).length;
    return lines.length > 0 && cells.length === lines.length * whole && (axis === "column" || !lines.includes(0)) ? lines : [];
  }

  /** Shift+click on a grip: selecting rows (columns) from the far end of those selected whole, else from this one */
  private pickFrom(target: HandleTarget, axis: Axis): void {
    const line = axis === "row" ? target.row! : target.column;
    const lines = this.wholeLinesSelected(target.info, axis);
    const from = lines.length === 0 ? line : lines[0] === line ? lines[lines.length - 1]! : lines[0]!;
    this.startPicking(target.info, axis, from);
    this.selectLines(target.info, axis, from, line);
  }

  /** Selects the rows (columns) from `from` to `to`, as shown; a column with its header and every row shown */
  private selectLines(info: WidgetInfo, axis: Axis, from: number, to: number): void {
    this.selectingLines = true;
    try {
      if (axis === "row") {
        this.host.selectCells(info, { row: from, column: 0 }, { row: to, column: info.columns - 1 });
        return;
      }
      const shown = this.host.shownRows(info);
      const last = Number(shown[shown.length - 1]?.dataset.tpRow ?? 0);
      this.host.selectCells(info, { row: 0, column: from }, { row: last, column: to });
    } finally {
      this.selectingLines = false;
    }
  }

  cellMenuOpened(): void {
    this.closeMenu(false, false);
  }

  // The cells selected otherwise (a touch's handles, keys): the menu was for the lines selected before
  selectionChanged(): void {
    if (!this.selectingLines && this.menu) this.closeMenu(false, false);
  }

  // ---- Select rows (columns): the pointer picks the other end, a click ends it ----------

  private startPicking(info: WidgetInfo, axis: Axis, line: number): void {
    // A cell being edited is saved first: the pointer selects now
    void this.host.saveEditing();
    this.picking = { key: info.key, axis, from: line };
    this.host.doc.body.classList.add(axis === "row" ? "tp-picking-rows" : "tp-picking-columns");
    this.selectLines(info, axis, line, line);
    void this.host.bridge.flash(
      `Table Plus: move to the last ${axis} to select and click in the table; Esc keeps just this one`,
      "info",
    );
  }

  /**
   * A press while selecting rows (columns): in the table, the selection ends at
   * the row (column) pressed (taken: no cell editor opens); elsewhere it just ends
   */
  private pickedBy(e: MouseEvent): boolean {
    const picking = this.picking!;
    this.endPicking();
    const widget = this.host.widgetForKey(picking.key);
    const info = widget && this.host.infoOf(widget);
    if (!info || e.button !== 0 || !(e.target instanceof Element)) return false;
    const cell = this.host.tableCellOf(info, e.target);
    const ref = cell && this.host.cellRef(info, cell);
    if (!ref) return false;
    e.preventDefault();
    e.stopPropagation();
    const to = picking.axis === "row" ? (ref.row > 0 ? ref.row : undefined) : ref.column;
    if (to !== undefined) this.selectLines(info, picking.axis, picking.from, to);
    return true;
  }

  private endPicking(): void {
    if (!this.picking) return;
    this.picking = undefined;
    this.host.doc.body.classList.remove("tp-picking-rows", "tp-picking-columns");
  }

  private selectEntry(info: WidgetInfo, axis: Axis, line: number): MenuEntry {
    return {
      kind: "item",
      label: axis === "row" ? "Select rows" : "Select columns",
      icon: axis === "row" ? ICONS.selectRows : ICONS.selectColumns,
      hint: `Select from this ${axis} to the one you click next`,
      run: this.runAndClose(() => this.startPicking(info, axis, line)),
    };
  }

  /**
   * The lines a grip moves: the rows (columns) selected whole, when they hold
   * its line and follow each other in the markdown; else just its line
   */
  private blockOf(info: WidgetInfo, axis: Axis, line: number): { first: number; last: number } {
    const lines = this.wholeLinesSelected(info, axis);
    const first = Math.min(...lines);
    const last = Math.max(...lines);
    // Pinned and unpinned lines do not move together: across a zone's edge, the grip's line alone
    const zone = (l: number) => (axis === "row" ? rowZone(info.pins, info.rows, l) : columnZone(info.pins, info.columns, l));
    const block = lines.length > 1 && lines.includes(line) && last - first + 1 === lines.length && zone(first) === zone(last);
    return block ? { first, last } : { first: line, last: line };
  }

  /** Where a block asked to start at `asked` goes (its first line's place; `first`: it stays) */
  private blockTo(info: WidgetInfo, axis: Axis, block: { first: number; last: number }, asked: number): number {
    return axis === "row" ? rowBlockTo(info, block.first, block.last, asked) : columnBlockTo(info, block.first, block.last, asked);
  }

  /** Moves a block of rows (columns) to start at `asked`, as one edit; several stay selected where they go */
  private moveBlock(widget: HTMLElement, info: WidgetInfo, axis: Axis, block: { first: number; last: number }, asked: number): void {
    const to = this.blockTo(info, axis, block, asked);
    if (to === block.first) return;
    void (axis === "row" ? moveRowsTo : moveColumnsTo)(this.host, widget, info, block.first, block.last, to).then((result) => {
      // Selected where they went, once written: the table rendered anew shows the selection
      if (result !== "written" || block.last === block.first) return;
      const now = this.host.widgetForKey(info.key);
      const nowInfo = now && this.host.infoOf(now);
      this.selectLines(nowInfo ?? info, axis, to, to + block.last - block.first);
    });
  }

  /** The rows (columns) selected, when the selection holds this one; else just it */
  private selectedLines(info: WidgetInfo, axis: Axis, line: number): number[] {
    const cells = this.host.selectedCells(info);
    const lines = [...new Set(cells.map((ref) => (axis === "row" ? ref.row : ref.column)))].filter((l) => axis === "column" || l > 0);
    return lines.includes(line) ? lines : [line];
  }

  private beginDrag(target: HandleTarget, axis: Axis, pressedAt: number): { move: (e: PointerEvent) => void; finish: (commit: boolean) => void } {
    const { widget, info } = target;
    const { doc } = this.host;
    // The rows (columns) selected whole move together when the grip is on one of them
    const block = this.blockOf(info, axis, axis === "row" ? target.row! : target.column);
    const from = block.first;
    const count = block.last - block.first + 1;
    const table = info.table;
    const header = table.rows[0]!;
    const rows = [header, ...this.host.bodyRows(info)];
    // The cells of each row (column), by its row of the markdown (its column), and its size
    const items =
      axis === "row"
        ? rows.slice(1).map((tr) => Array.from(tr.cells))
        : Array.from(header.cells).map((_, c) => rows.flatMap((tr) => tr.cells[c] ?? []));
    const index = axis === "row" ? from - 1 : from;
    const lines = items.slice(index, index + count);
    const carried = lines.flat();
    // The block's first row stays in the document while the table scrolls (a large table keeps only the rows in view
    // there, and moves its window to each row asked for: only this one is; the others' places are estimated)
    const carriedRow = axis === "row" ? (lines[0]?.[0]?.parentElement as HTMLTableRowElement | undefined) : undefined;
    if (carriedRow) {
      this.host.rowNeeded(info, carriedRow);
      this.host.holdInDocument(info, carriedRow);
    }
    // Where each row (column) was, in the table's own coordinates: the page or
    // the table's box may scroll while dragging. Rows out of the document (a
    // large table's) are where rows of their size would be, after those in it.
    const tableAt = () => {
      const r = table.getBoundingClientRect();
      return axis === "row" ? r.top : r.left;
    };
    const origin = tableAt();
    const measured = items.map((cells) => {
      const cell = cells[0];
      if (!cell?.isConnected) return undefined;
      const r = cell.getBoundingClientRect();
      return axis === "row" ? { start: r.top - origin, size: r.height } : { start: r.left - origin, size: r.width };
    });
    const known = measured.filter((m): m is { start: number; size: number } => !!m);
    const typical = known.length ? known.reduce((sum, m) => sum + m.size, 0) / known.length : 0;
    const firstKnown = measured.findIndex((m) => m);
    const lastKnown = measured.findLastIndex((m) => m);
    const places = measured.map((m, i) => {
      if (m) return m;
      if (firstKnown < 0) return { start: i * typical, size: typical };
      if (i < firstKnown) return { start: measured[firstKnown]!.start - (firstKnown - i) * typical, size: typical };
      const last = measured[lastKnown]!;
      return { start: last.start + last.size + (i - lastKnown - 1) * typical, size: typical };
    });
    const carriedSize = places.slice(index, index + count).reduce((sum, p) => sum + p.size, 0);
    const ghost = this.ghostOf(axis, lines);
    const start = carried[0]!.getBoundingClientRect();
    carried.forEach((el) => el.classList.add("tp-dragged"));
    doc.body.classList.add("tp-dragging");
    this.tint(undefined);
    this.dragging = true;
    let to = from;
    // Where the press was on the block: the copy keeps that point under the pointer (taken at the press, not after the drag's threshold)
    const grab = pressedAt - (axis === "row" ? start.top : start.left);

    const move = (ev: PointerEvent) => {
      const pointer = axis === "row" ? ev.clientY : ev.clientX;
      if (axis === "row") this.host.place(ghost, start.left, pointer - grab);
      else this.host.place(ghost, pointer - grab, start.top);
      // The lines the copy has passed, in the places they had (in the table, as it is scrolled now): going down (right),
      // those after the block whose middle its end is past; going up (left), those before it whose middle its start is past
      const top = pointer - grab - tableAt();
      const bottom = top + carriedSize;
      const end = index + count - 1;
      const middleOf = (i: number) => places[i]!.start + places[i]!.size / 2;
      let passed = 0;
      for (let i = end + 1; i < places.length && middleOf(i) < bottom; i++) passed++;
      if (passed === 0) for (let i = index - 1; i >= 0 && middleOf(i) > top; i--) passed--;
      to = this.blockTo(info, axis, block, from + passed);
      const target = axis === "row" ? to - 1 : to;
      items.forEach((cells, i) => {
        // Those the block passes over make room for it: up (left) when it goes down (right), else down
        const shift = i > end && i <= target + count - 1 ? -carriedSize : i < index && i >= target ? carriedSize : 0;
        for (const cell of cells) cell.style.transform = shift ? (axis === "row" ? `translateY(${shift}px)` : `translateX(${shift}px)`) : "";
      });
      this.autoscroll(widget, ev);
    };
    const finish = (commit: boolean) => {
      for (const cells of items) for (const cell of cells) cell.style.transform = "";
      carried.forEach((el) => el.classList.remove("tp-dragged"));
      ghost.remove();
      doc.body.classList.remove("tp-dragging");
      this.dragging = false;
      if (carriedRow) this.host.holdInDocument(info, undefined);
      this.hideGrips();
      if (!commit || to === from) return;
      this.moveBlock(widget, info, axis, block, to);
    };
    return { move, finish };
  }

  /**
   * The copy that follows the pointer: the rows' (columns') cells cloned with
   * their sizes and looks, as it is outside the table that styles them
   */
  private ghostOf(axis: Axis, lines: readonly (readonly HTMLTableCellElement[])[]): HTMLElement {
    const { doc } = this.host;
    const ghost = this.host.floating("div", "tp-drag-ghost tp-visible");
    const table = doc.createElement("table");
    const look = (cell: HTMLTableCellElement) => {
      const copy = cell.cloneNode(true) as HTMLTableCellElement;
      copy.classList.remove("tp-dragged", "tp-selected", "tp-handle-hover");
      const style = doc.defaultView!.getComputedStyle(cell);
      const r = cell.getBoundingClientRect();
      for (const name of ["font", "color", "background-color", "padding", "border", "text-align", "vertical-align", "white-space"]) {
        copy.style.setProperty(name, style.getPropertyValue(name));
      }
      Object.assign(copy.style, { boxSizing: "border-box", width: `${r.width}px`, height: `${r.height}px`, transform: "" });
      return copy;
    };
    if (axis === "row") {
      for (const cells of lines) {
        const tr = doc.createElement("tr");
        tr.append(...cells.map(look));
        table.append(tr);
      }
    } else {
      // A column's cells run down: each row of the copy takes one from each column
      const height = Math.max(...lines.map((cells) => cells.length));
      for (let r = 0; r < height; r++) {
        const tr = doc.createElement("tr");
        tr.append(...lines.flatMap((cells) => (cells[r] ? [look(cells[r]!)] : [])));
        table.append(tr);
      }
    }
    ghost.append(table);
    return ghost;
  }

  /** Near the top or bottom edge of the box the page scrolls in, it scrolls on */
  private autoscroll(widget: HTMLElement, ev: PointerEvent): void {
    const scroller = this.host.scrollParentOf(widget);
    if (!scroller) return;
    const view = scroller.getBoundingClientRect();
    if (ev.clientY < view.top + AUTOSCROLL_EDGE) scroller.scrollTop -= AUTOSCROLL_STEP;
    else if (ev.clientY > view.bottom - AUTOSCROLL_EDGE) scroller.scrollTop += AUTOSCROLL_STEP;
  }

  // ---- menus ----------------------------------------------------------------------

  // A click on the grip whose menu is open closes it; on another grip, that grip's menu opens instead
  private toggleMenu(axis: Axis, target: HandleTarget, grip: HTMLElement): void {
    const line = axis === "row" ? target.row! : target.column;
    if (this.menu?.axis === axis && this.menu.line === line) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu(false, false);
    const { doc } = this.host;
    const { widget, info } = target;
    const element =
      axis === "row"
        ? renderMenu(doc, `Row ${target.row}`, this.rowMenu(widget, info, target.row!, target.column))
        : renderMenu(
            doc,
            `Column: ${cellText(info.table.rows[0]!.cells[target.column]!) || target.column + 1}`,
            this.columnMenu(widget, info, target.column),
          );
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    doc.body.append(element);
    const g = grip.getBoundingClientRect();
    const cell = this.cellsOf(target, axis)[0] ?? grip;
    const c = cell.getBoundingClientRect();
    this.menu = { element, axis, widget, line, anchor: { cell, dx: g.left - c.left, dy: g.top - c.top, width: g.width, height: g.height } };
    this.positionMenu();
    grip.classList.add("tp-active");
    focusMenu(element);
  }

  /**
   * Shows other entries in the open menu's place, in the same dropdown: they
   * close it when run, and the arrow before the title (Back) shows the menu they replaced
   */
  private replaceMenu(title: string, entries: readonly MenuEntry[]): void {
    const menu = this.menu;
    if (!menu) return;
    const previous = menu.element;
    const closing = entries.map((entry): MenuEntry => (entry.kind === "item" ? { ...entry, run: this.runAndClose(entry.run) } : entry));
    const element = renderMenu(this.host.doc, title, closing, { icon: ICONS.arrowLeft, run: () => this.swapMenu(previous) });
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    this.swapMenu(element);
  }

  /** Puts `element` in the open menu's place */
  private swapMenu(element: HTMLElement): void {
    const menu = this.menu;
    if (!menu) return;
    menu.element.replaceWith(element);
    this.menu = { ...menu, element };
    this.positionMenu();
    focusMenu(element);
  }

  /** Rows: to the right of the grip; columns: below it; always inside the window */
  private positionMenu(): void {
    if (!this.menu) return;
    const { element, axis, anchor } = this.menu;
    // The table rendered anew: the menu stays where it is
    if (!anchor.cell.isConnected) return;
    const win = this.host.doc.defaultView!;
    const c = anchor.cell.getBoundingClientRect();
    const left0 = c.left + anchor.dx;
    const top0 = c.top + anchor.dy;
    const a = { left: left0, top: top0, right: left0 + anchor.width, bottom: top0 + anchor.height, width: anchor.width };
    const m = element.getBoundingClientRect();
    let left = axis === "row" ? a.right + 4 : a.left + a.width / 2 - m.width / 2;
    let top = axis === "row" ? a.top - 6 : a.bottom + 4;
    left = Math.max(4, Math.min(left, win.innerWidth - m.width - 4));
    if (top + m.height > win.innerHeight - 4) top = Math.max(4, win.innerHeight - m.height - 4);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  // `hide`: the grips go too (not when another grip's menu opens in its place)
  private closeMenu(refocus: boolean, hide = true): void {
    const menu = this.menu;
    if (!menu) return;
    this.menu = undefined;
    const hadFocus = menu.element.contains(this.host.doc.activeElement);
    menu.element.remove();
    this.rowGrip.classList.remove("tp-active");
    this.columnGrip.classList.remove("tp-active");
    if (hide) this.hideGrips();
    if (refocus && hadFocus) this.host.focusEditor(menu.widget);
  }

  private runAndClose(run: () => void): () => void {
    return () => {
      this.closeMenu(false);
      run();
    };
  }

  // `column`: the hovered column, where editing a new row starts
  private rowMenu(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[] {
    const host = this.host;
    const rearranged = host.rearranged(info);
    const zone = rowZone(info.pins, info.rows, row);
    const act = (run: () => unknown) => this.runAndClose(() => void run());
    // The rows selected whole move together when they hold this one
    const block = this.blockOf(info, "row", row);
    const rows = block.last - block.first + 1;
    const moveBlocked = (asked: number) =>
      rearranged
        ? MOVE_BLOCKED
        : this.blockTo(info, "row", block, asked) === block.first
          ? zone
            ? "Pinned rows stay with the other pinned rows"
            : "Already at the edge"
          : undefined;
    // Pinning more needs the metadata setting; unpinning (a checked item) always works
    const pinBlocked = (to: string) => (host.metadataEnabled || zone === to ? undefined : PIN_NEEDS_METADATA);
    // Nothing goes above the first row pinned to the top, nor below the last one pinned to the bottom
    const insertBlocked = (at: number) =>
      insertRowAt(info.pins, info.rows, at).at === at
        ? undefined
        : zone === "top"
          ? "Rows pinned to the top stay at the top"
          : "Rows pinned to the bottom stay at the bottom";
    return [
      ...this.topEntries(this.host.rowMenuEntries(widget, info, row, column)),
      {
        kind: "item",
        label: "Insert row above",
        icon: ICONS.rowAbove,
        run: act(() => insertRowWith(host, widget, info, row, column, undefined, { before: row })),
        disabled: insertBlocked(row),
      },
      {
        kind: "item",
        label: "Insert row below",
        icon: ICONS.rowBelow,
        run: act(() => insertRowWith(host, widget, info, row + 1, column, undefined, { after: row })),
        disabled: insertBlocked(row + 1),
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: act(() => duplicateRowAt(host, widget, info, row)) },
      { kind: "separator" },
      {
        kind: "item",
        label: rows > 1 ? `Move ${rows} rows up` : "Move up",
        icon: ICONS.arrowUp,
        run: act(() => this.moveBlock(widget, info, "row", block, block.first - 1)),
        disabled: moveBlocked(block.first - 1),
      },
      {
        kind: "item",
        label: rows > 1 ? `Move ${rows} rows down` : "Move down",
        icon: ICONS.arrowDown,
        run: act(() => this.moveBlock(widget, info, "row", block, block.first + 1)),
        disabled: moveBlocked(block.first + 1),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin to top",
        icon: ICONS.pinTop,
        checked: zone === "top",
        run: act(() => pinRowAt(host, widget, info, row, zone === "top" ? undefined : "top")),
        disabled: pinBlocked("top"),
      },
      {
        kind: "item",
        label: "Pin to bottom",
        icon: ICONS.pinBottom,
        checked: zone === "bottom",
        run: act(() => pinRowAt(host, widget, info, row, zone === "bottom" ? undefined : "bottom")),
        disabled: pinBlocked("bottom"),
      },
      { kind: "separator" },
      this.selectEntry(info, "row", row),
      this.deleteEntry(widget, info, "row", row),
    ];
  }

  /** Delete row (column), or the rows (columns) selected when they hold it */
  private deleteEntry(widget: HTMLElement, info: WidgetInfo, axis: Axis, line: number): MenuEntry {
    const lines = this.selectedLines(info, axis, line);
    const many = lines.length > 1;
    const run = this.runAndClose(() => {
      void (axis === "row" ? deleteRowsAt(this.host, widget, info, lines) : deleteColumnsAt(this.host, widget, info, lines));
    });
    return {
      kind: "item",
      label: axis === "row" ? (many ? `Delete ${lines.length} rows` : "Delete row") : many ? `Delete ${lines.length} columns` : "Delete column",
      icon: ICONS.trash,
      danger: true,
      run,
      ...(axis === "column" && lines.length >= info.columns ? { disabled: "A table needs at least one column" } : {}),
    };
  }

  /** Entries features add at the top of a menu (naming), before a separator, closing the menu when run */
  private topEntries(entries: readonly MenuEntry[]): MenuEntry[] {
    if (entries.length === 0) return [];
    return [
      ...entries.map((entry): MenuEntry => (entry.kind === "item" ? { ...entry, run: this.runAndClose(entry.run) } : entry)),
      { kind: "separator" },
    ];
  }

  /**
   * The entries features add to a column's menu: run, they close the menu,
   * but one that showed other entries in its place (a list to pick from)
   */
  private featureColumnEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    const entries = this.host.columnMenuEntries(widget, info, column, (title, list) => this.replaceMenu(title, list));
    return entries.map((entry): MenuEntry =>
      entry.kind === "item"
        ? {
            ...entry,
            run: () => {
              const shown = this.menu?.element;
              entry.run();
              if (this.menu && this.menu.element === shown) this.closeMenu(false);
            },
          }
        : entry,
    );
  }

  private columnMenu(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    const host = this.host;
    const view = host.viewOf(info);
    const sorted = view.sort?.column === column ? view.sort.direction : undefined;
    const align = parseTable(info.source).align[column] ?? "";
    const edit = (change: (t: Table) => Table | undefined) => this.runAndClose(() => void host.write(widget, change));
    const sortBy = (next: ViewState) => this.runAndClose(() => host.setSort(widget, info, next));
    const alignTo = (target: Align) => edit((t) => setAlign(t, column, align === target ? "" : target));
    const act = (run: () => unknown) => this.runAndClose(() => void run());
    const zone = columnZone(info.pins, info.columns, column);
    // The columns selected whole move together when they hold this one
    const block = this.blockOf(info, "column", column);
    const columns = block.last - block.first + 1;
    const columnMoveBlocked = (asked: number) =>
      this.blockTo(info, "column", block, asked) === block.first
        ? zone
          ? "Pinned columns stay with the other pinned columns"
          : "Already at the edge"
        : undefined;
    // Pinning more needs the metadata setting; unpinning (a checked item) always works
    const pinBlocked = (to: string) => (host.metadataEnabled || zone === to ? undefined : PIN_NEEDS_METADATA);
    const insertBlocked = (at: number) =>
      insertColumnAt(info.pins, info.columns, at).at === at
        ? undefined
        : zone === "left"
          ? "Columns pinned to the left stay at the left"
          : "Columns pinned to the right stay at the right";
    const entries: MenuEntry[] = [
      ...this.topEntries(host.columnMenuTopEntries(widget, info, column)),
      {
        kind: "item",
        label: "Sort ascending",
        icon: ICONS.sortAsc,
        checked: sorted === "asc",
        run: sortBy(withSort(view, column, "asc")),
      },
      {
        kind: "item",
        label: "Sort descending",
        icon: ICONS.sortDesc,
        checked: sorted === "desc",
        run: sortBy(withSort(view, column, "desc")),
      },
    ];
    if (view.sort) {
      entries.push({ kind: "item", label: "Clear sorting", icon: ICONS.clear, run: sortBy(withoutSort(view)) });
    }
    entries.push(
      ...this.featureColumnEntries(widget, info, column),
      { kind: "separator" },
      {
        kind: "segmented",
        label: "Align",
        options: [
          { icon: ICONS.alignLeft, title: "Align left", active: align === "left", run: alignTo("left") },
          { icon: ICONS.alignCenter, title: "Align center", active: align === "center", run: alignTo("center") },
          { icon: ICONS.alignRight, title: "Align right", active: align === "right", run: alignTo("right") },
        ],
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Insert column left",
        icon: ICONS.columnLeft,
        run: act(() => insertColumnWith(host, widget, info, column)),
        disabled: insertBlocked(column),
      },
      {
        kind: "item",
        label: "Insert column right",
        icon: ICONS.columnRight,
        run: act(() => insertColumnWith(host, widget, info, column + 1)),
        disabled: insertBlocked(column + 1),
      },
      {
        kind: "item",
        label: columns > 1 ? `Move ${columns} columns left` : "Move left",
        icon: ICONS.arrowLeft,
        run: act(() => this.moveBlock(widget, info, "column", block, block.first - 1)),
        disabled: columnMoveBlocked(block.first - 1),
      },
      {
        kind: "item",
        label: columns > 1 ? `Move ${columns} columns right` : "Move right",
        icon: ICONS.arrowRight,
        run: act(() => this.moveBlock(widget, info, "column", block, block.first + 1)),
        disabled: columnMoveBlocked(block.first + 1),
      },
      // The features' (a numbered column), closing the menu when run
      ...host.columnMenuInsertEntries(widget, info, column).map((entry): MenuEntry => (entry.kind === "item" ? { ...entry, run: this.runAndClose(entry.run) } : entry)),
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin left",
        icon: ICONS.pinLeft,
        checked: zone === "left",
        run: act(() => pinColumnAt(host, widget, info, column, zone === "left" ? undefined : "left")),
        disabled: pinBlocked("left"),
      },
      {
        kind: "item",
        label: "Pin right",
        icon: ICONS.pinRight,
        checked: zone === "right",
        run: act(() => pinColumnAt(host, widget, info, column, zone === "right" ? undefined : "right")),
        disabled: pinBlocked("right"),
      },
      { kind: "separator" },
      this.selectEntry(info, "column", column),
      this.deleteEntry(widget, info, "column", column),
    );
    return entries;
  }
}
