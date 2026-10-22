// The row and column grips: shown next to the hovered cell's row and above its
// column, quiet bars of a bounded length (a tall row or a wide column does not
// stretch them); hovering one tints its row or column, a click opens the row or
// column menu, a drag moves the row or column. Shift+click on another grip
// selects the rows (columns) between.
import type { CellRef, Feature, LineDrag, MarkLayer, ModelHost, TableInfo } from "../core/feature.ts";
import { LONG_PRESS_MS } from "../core/press.ts";
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
import { ICONS } from "../icons.ts";
import { type Align, parseTable, type Table } from "../markdown.ts";
import { floatingMenu, focusMenu, type MenuEntry, namingThatCloses, wrapRuns } from "../menu.ts";
import { setAlign } from "../ops.ts";
import { columnZone, insertColumnAt, insertRowAt, rowZone } from "../pins.ts";
import { type ViewState, withoutSort, withSort } from "../view.ts";

type Axis = "row" | "column";

// What the grips currently belong to
type HandleTarget = {
  readonly info: TableInfo;
  readonly row?: number;
  readonly column: number;
};

// Pointer travel that turns a press on a grip into a drag instead of a click
const DRAG_THRESHOLD = 4;
// A finger moves a little while it holds still: a touch starts a drag (and ends a long press) only past this
const TOUCH_DRAG_THRESHOLD = 10;

// A grip's thickness, and its length at most (centred on its row or column)
const GRIP_THICKNESS = 12;
const ROW_GRIP_LENGTH = 32;
const COLUMN_GRIP_LENGTH = 44;

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
        // The table as it was when the menu opened (rendered anew: another info)
        info: TableInfo;
        line: number;
        // Kept by the cell `at` (a row's first cell, a column's header, the cell pressed), `dx`, `dy` from its corner
        anchor: { readonly at: CellRef; readonly dx: number; readonly dy: number; readonly width: number; readonly height: number };
        // Opened at a point in a cell, not by the grip: the grip is not marked as the menu's
        byPoint?: boolean;
        // Asked for on a cell (cellMenu): opened again there when its table is rendered anew (an edit saved by the press)
        again?: { readonly key: string; readonly at: CellRef; readonly point: { x: number; y: number } };
        // The cells selected as it opened (selectionOf): it closes when they change, not when they are shown again
        selected: string;
      }
    | undefined;
  private dragging = false;
  // The grips select lines themselves (their menu stays for them)
  private selectingLines = false;
  // The line a grip's click selected last: Shift+click on another grip selects from it, as a spreadsheet's anchor
  private lineAnchor: { readonly key: string; readonly axis: Axis; readonly line: number } | undefined;
  // The press on a grip going on opened its menu otherwise (a right click: macOS's Ctrl+click, Android's long press): its end does nothing
  private pressOpenedMenu = false;
  // The lines selected whole, by table and axis, worked out once per selection (a grip is marked on every hover)
  private linesSelected: { readonly key: string; readonly row: ReadonlySet<number>; readonly column: ReadonlySet<number> } | undefined;
  // The cells of the row (column) a grip hovered acts on, tinted
  private readonly hoverTint: MarkLayer;

  constructor(private readonly host: ModelHost) {
    this.rowGrip = this.gripButton("swt-handle swt-grip", "Row: click for actions, drag to move");
    this.columnGrip = this.gripButton("swt-handle swt-grip swt-grip-column", "Column: click for actions, drag to move");
    this.hoverTint = host.markLayer("handle-hover");
  }

  /**
   * A grip of a line selected (whole) is marked: its click opens the menu
   * (CSS: the context-menu pointer); in select mode a grip's first click only
   * selects, and its title says so
   */
  private markGrips(): void {
    const target = this.target;
    if (!target) return;
    const selects = this.host.clickSelects();
    const rearranged = this.host.rearranged(target.info);
    if (this.linesSelected?.key !== target.info.key) {
      this.linesSelected = {
        key: target.info.key,
        row: new Set(this.wholeLinesSelected(target.info, "row")),
        column: new Set(this.wholeLinesSelected(target.info, "column")),
      };
    }
    for (const axis of ["row", "column"] as const) {
      const grip = axis === "row" ? this.rowGrip : this.columnGrip;
      const line = axis === "row" ? target.row : target.column;
      const selected = line !== undefined && this.linesSelected[axis].has(line);
      // The menu pointer where a click opens the menu instead of selecting: in select mode (in edit mode every click does, the hand stays)
      grip.classList.toggle("swt-line-selected", selects && selected);
      const name = axis === "row" ? "Row" : "Column";
      const click = selects && !selected ? "click to select, again (or right-click) for actions" : "click for actions";
      const drag = axis === "row" && rearranged ? ` (${MOVE_BLOCKED.toLowerCase()})` : ", drag to move";
      grip.title = `${name}: ${click}${drag}`;
      grip.setAttribute("aria-label", grip.title);
    }
  }

  start(): void {
    this.rowGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "column"));
    // A right click (Android's long press too) opens the menu at once, the line selected
    this.rowGrip.addEventListener("contextmenu", (e) => this.onGripMenu(e, "row"));
    this.columnGrip.addEventListener("contextmenu", (e) => this.onGripMenu(e, "column"));
    // Hovering a grip tints what it acts on
    for (const [grip, axis] of [[this.rowGrip, "row"], [this.columnGrip, "column"]] as const) {
      grip.addEventListener("pointerenter", () => this.tint(axis));
      grip.addEventListener("pointerleave", () => this.tint(undefined));
    }
  }

  /** The cells of the hovered grip's row or column tinted; undefined: none */
  private tint(axis: Axis | undefined): void {
    this.hoverTint.clear();
    const target = this.target;
    if (!axis || !target || this.dragging) return;
    this.hoverTint.set(target.info.key, this.cellsOf(target, axis));
  }

  /** The cells of the target's row, or of its column (the header's included) */
  private cellsOf(target: HandleTarget, axis: Axis): CellRef[] {
    const { info } = target;
    if (axis === "row") return target.row === undefined ? [] : Array.from({ length: info.columns }, (_, column) => ({ row: target.row!, column }));
    return Array.from({ length: info.rows }, (_, row) => ({ row, column: target.column }));
  }

  stop(): void {
    this.closeMenu(false);
    this.rowGrip.remove();
    this.columnGrip.remove();
  }

  // While a grip is dragged the hover controls stay; with a menu open the grips stay in its table
  pointerBusy(): "drag" | "menu" | undefined {
    return this.dragging ? "drag" : this.menu ? "menu" : undefined;
  }

  // A press outside an open menu (and Silverware Table's other controls) closes it
  mouseDown(e: MouseEvent): boolean {
    const on = this.host.targetOf(e.target).kind;
    if (this.menu && (on === "cell" || on === "none")) this.closeMenu(false);
    return false;
  }

  keyDown(e: KeyboardEvent): boolean {
    if (e.key !== "Escape" || !this.menu) return false;
    e.preventDefault();
    e.stopPropagation();
    this.closeMenu(true);
    return true;
  }

  /** The pointer is over a cell (or the page moved under it): the grips go to its row and column */
  hovered(info: TableInfo, ref: CellRef): void {
    this.target = { info, column: ref.column, ...(ref.row > 0 ? { row: ref.row } : {}) };
    // The part of a wide table in view: the table itself may be scrolled sideways
    const shown = this.host.rectOf(info, "table");
    if (!shown) return;
    const rearranged = this.host.rearranged(info);

    const rowRect = ref.row > 0 ? this.host.rectOf(info, { row: ref.row }) : undefined;
    if (rowRect) {
      this.rowGrip.classList.toggle("swt-no-drag", rearranged);
      const height = rowRect.bottom - rowRect.top;
      const length = Math.max(GRIP_THICKNESS, Math.min(height - 8, ROW_GRIP_LENGTH));
      Object.assign(this.rowGrip.style, { width: `${GRIP_THICKNESS}px`, height: `${length}px` });
      // Half on the table's left edge, half in the cell
      this.host.place(this.rowGrip, shown.left - GRIP_THICKNESS / 2, rowRect.top + (height - length) / 2);
    } else {
      this.rowGrip.classList.remove("swt-visible");
    }
    const h = this.host.rectOf(info, { column: ref.column });
    if (h) {
      const width = h.right - h.left;
      const length = Math.max(GRIP_THICKNESS, Math.min(width - 8, COLUMN_GRIP_LENGTH));
      Object.assign(this.columnGrip.style, { width: `${length}px`, height: `${GRIP_THICKNESS}px` });
      // Centered on the column, as far as the column is in view
      const center = Math.max(shown.left + length / 2, Math.min(h.left + width / 2, shown.right - length / 2));
      // Half on the header's top edge, half in the header cell
      this.host.place(this.columnGrip, center - length / 2, h.top - GRIP_THICKNESS / 2);
    }
    // A grip shows it has the menu open only on the menu's row (column)
    const menu = this.menu;
    this.rowGrip.classList.toggle("swt-active", !menu?.byPoint && menu?.axis === "row" && menu.line === ref.row);
    this.columnGrip.classList.toggle("swt-active", !menu?.byPoint && menu?.axis === "column" && menu.line === ref.column);
    this.markGrips();
    this.positionMenu();
  }

  // A menu asked for on a table rendered anew since: opened again there (not only once the selection is shown again: the selection module may be off)
  enhanced(info: TableInfo): void {
    if (this.menu?.again?.key === info.key) this.menuAgain();
  }

  /** No cell is hovered (editing, or the table left the view): the grips go, and with `closeMenus` an open menu */
  hoverEnded(closeMenus: boolean): void {
    if (closeMenus && !this.menuAgain()) this.closeMenu(false);
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
    for (const el of [this.rowGrip, this.columnGrip]) el.classList.remove("swt-visible");
    this.tint(undefined);
    this.target = undefined;
  }

  // ---- a press on a grip: a click opens its menu, a drag moves -------------

  /** A right click on a grip: the line selected (unless it is among the lines selected) and its menu open */
  private onGripMenu(e: MouseEvent, axis: Axis): void {
    const target = this.target;
    e.preventDefault();
    e.stopPropagation();
    if (!target || (axis === "row" && target.row === undefined)) return;
    this.pressOpenedMenu = true;
    this.openMenu(target, axis);
  }

  /** The line selected (the lines selected stay when they hold it) and its menu open, not closed when it is already */
  private openMenu(target: HandleTarget, axis: Axis): void {
    const line = axis === "row" ? target.row! : target.column;
    this.select(target, axis);
    if (this.menu?.axis === axis && this.menu.line === line) return;
    this.toggleMenu(axis, target, axis === "row" ? this.rowGrip : this.columnGrip);
  }

  private onGripPointerDown(e: PointerEvent, axis: Axis): void {
    const target = this.target;
    if (e.button !== 0 || !target || (axis === "row" && target.row === undefined)) return;
    e.preventDefault();
    const grip = axis === "row" ? this.rowGrip : this.columnGrip;
    const line = axis === "row" ? target.row! : target.column;
    this.pressOpenedMenu = false;
    const threshold = e.pointerType === "touch" ? TOUCH_DRAG_THRESHOLD : DRAG_THRESHOLD;
    // Selected before this press: in select mode its click opens the menu (else it selects only)
    const wasSelected = this.wholeLinesSelected(target.info, axis).includes(line);
    // A long press on a touch screen: the menu at once, as on a cell (iOS fires no contextmenu)
    let pressedLong = false;
    const longPress =
      e.pointerType === "touch"
        ? setTimeout(() => {
            if (drag) return;
            pressedLong = true;
            this.openMenu(target, axis);
          }, LONG_PRESS_MS)
        : undefined;
    const canDrag = axis === "column" || !this.host.rearranged(target.info);
    const win = this.host.doc.defaultView!;
    const startX = e.clientX;
    const startY = e.clientY;
    let drag: ReturnType<Grips["beginDrag"]> | undefined;

    const move = (ev: PointerEvent) => {
      if (!drag) {
        // A menu opened by holding still: the finger lifting moves it a little, no drag
        if (pressedLong || this.pressOpenedMenu) return;
        if (!canDrag || Math.hypot(ev.clientX - startX, ev.clientY - startY) < threshold) return;
        clearTimeout(longPress);
        this.closeMenu(false);
        drag = this.beginDrag(target, axis, axis === "row" ? startY : startX);
        if (!drag) return;
      }
      drag.move(ev);
    };
    const cleanup = () => {
      clearTimeout(longPress);
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
      else if (pressedLong || this.pressOpenedMenu) return;
      else if (extend) {
        // Shift+click: the rows (columns) from those selected to this one, at once
        this.closeMenu(false, false);
        this.extendTo(target, axis);
        this.markGrips();
      } else if (this.host.clickSelects() && !wasSelected) {
        // Select mode: a first click selects the row (column), as a click selects a cell; a second opens its menu
        this.closeMenu(false, false);
        this.select(target, axis);
        this.markGrips();
      } else {
        // A click on a line selected (in edit mode any click) opens its menu, or closes it
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
    this.lineAnchor = { key: info.key, axis, line };
    this.selectLines(info, axis, line, line);
  }

  /** The rows (columns) selected whole, as shown; none when the selection is not whole rows (columns) */
  private wholeLinesSelected(info: TableInfo, axis: Axis): number[] {
    const cells = this.host.selectedCells(info);
    const lines = [...new Set(cells.map((ref) => (axis === "row" ? ref.row : ref.column)))];
    const whole = axis === "row" ? info.columns : this.host.shownOrder(info).length;
    return lines.length > 0 && cells.length === lines.length * whole && (axis === "column" || !lines.includes(0)) ? lines : [];
  }

  /**
   * Shift+click on a grip: the rows (columns) from the one a click selected
   * (the anchor, while still selected), else from the end of those selected
   * (whole, else the cells' lines) farther from this one, to this one
   */
  private extendTo(target: HandleTarget, axis: Axis): void {
    const { info } = target;
    const line = axis === "row" ? target.row! : target.column;
    const lines = this.wholeLinesSelected(info, axis);
    const anchor = this.lineAnchor;
    const cells = this.host.selectedCells(info);
    const cellLines = cells.map((ref) => (axis === "row" ? ref.row : ref.column)).filter((l) => axis === "column" || l > 0);
    const ends = lines.length > 0 ? lines : cellLines;
    // Rows by where they show (sorted), columns by their place
    const shown = axis === "row" ? this.host.shownOrder(info) : [];
    const place = (l: number) => (axis === "row" ? shown.indexOf(l) : l);
    const first = ends[0];
    const last = ends[ends.length - 1];
    const farther = first === undefined || last === undefined ? line : Math.abs(place(first) - place(line)) >= Math.abs(place(last) - place(line)) ? first : last;
    const from = anchor && anchor.key === info.key && anchor.axis === axis && lines.includes(anchor.line) ? anchor.line : farther;
    this.selectLines(info, axis, from, line);
    this.lineAnchor = { key: info.key, axis, line: from };
  }

  /** Selects the rows (columns) from `from` to `to`, as shown; a column with its header and every row shown */
  private selectLines(info: TableInfo, axis: Axis, from: number, to: number): void {
    this.selectingLines = true;
    try {
      if (axis === "row") {
        this.host.selectCells(info, { row: from, column: 0 }, { row: to, column: info.columns - 1 });
        return;
      }
      const shown = this.host.shownOrder(info);
      this.host.selectCells(info, { row: 0, column: from }, { row: shown[shown.length - 1]!, column: to });
    } finally {
      this.selectingLines = false;
    }
  }

  cellMenuOpened(): void {
    this.closeMenu(false, false);
  }

  /**
   * The cell menu asked for on a cell of rows (columns) selected whole: their
   * menu instead, by the point (the same as their grip's), as a spreadsheet
   * gives a row's commands for a row selected. On a header: its column's menu,
   * the column selected as its grip selects it (the header names the column;
   * a selection of several cells holding it keeps the selection's menu)
   */
  cellMenu(info: TableInfo, at: CellRef, point: { x: number; y: number }): boolean {
    const selected = this.host.selectedCells(info);
    const inSelection = selected.length > 1 && selected.some((ref) => ref.row === at.row && ref.column === at.column);
    for (const axis of ["row", "column"] as const) {
      const line = axis === "row" ? at.row : at.column;
      if (axis === "row" && at.row === 0) continue;
      const whole = this.wholeLinesSelected(info, axis).includes(line);
      const header = axis === "column" && at.row === 0 && !inSelection;
      if (!whole && !header) continue;
      // A cell being edited is saved first, and the table rendered anew (its selection shown again, which
      // would close a menu opened before): the menu opens then, asked for again (its header's name shown, not its field)
      // A cell being edited is saved first (its name shown in the title, not its field)
      if (this.host.editing) void this.host.saveEditing();
      if (!this.host.rectOf(info, at)) return false;
      const target: HandleTarget = { info, column: at.column, ...(at.row > 0 ? { row: at.row } : {}) };
      this.target = target;
      this.closeMenu(false, false);
      if (!whole) this.select(target, axis);
      this.toggleMenu(axis, target, axis === "row" ? this.rowGrip : this.columnGrip, { at, ...point });
      if (this.menu) this.menu.again = { key: info.key, at, point };
      return true;
    }
    return false;
  }

  /**
   * A menu asked for on a cell whose table was rendered anew (an edit the press
   * saved): opened again there, its entries for the table as it is now; true
   * when it was (else it closes as the selection changed)
   */
  private menuAgain(): boolean {
    const menu = this.menu;
    if (!menu?.again || this.host.tableFor(menu.again.key) === menu.info) return false;
    const { key, at, point } = menu.again;
    const info = this.host.tableFor(key);
    // Not enhanced yet: the menu waits for it (its selection shown again then calls this again)
    if (!info) return true;
    this.closeMenu(false, false);
    return this.cellMenu(info, at, point);
  }

  /** The cells selected in a table, as a menu remembers them */
  private selectionOf(info: TableInfo): string {
    return `${info.key}|${this.host
      .selectedCells(info)
      .map((ref) => `${ref.row},${ref.column}`)
      .join(";")}`;
  }

  /** Whether the cells selected are those the open menu was opened with (shown again with its table rendered anew) */
  private selectionKept(): boolean {
    const menu = this.menu;
    const info = menu && this.host.tableFor(menu.info.key);
    return !!menu && !!info && this.selectionOf(info) === menu.selected;
  }

  // The cells selected otherwise (a touch's handles, keys): the menu was for the lines selected before
  selectionChanged(): void {
    this.linesSelected = undefined;
    // Selected otherwise (keys, a drag, a move): a grip's anchor is no longer where it was
    if (!this.selectingLines) this.lineAnchor = undefined;
    if (!this.selectingLines && this.menu && !this.menuAgain() && !this.selectionKept()) this.closeMenu(false, false);
    this.markGrips();
  }

  /**
   * The lines a grip moves: the rows (columns) selected whole, when they hold
   * its line and follow each other in the markdown; else just its line
   */
  private blockOf(info: TableInfo, axis: Axis, line: number): { first: number; last: number } {
    const lines = this.wholeLinesSelected(info, axis);
    const first = Math.min(...lines);
    const last = Math.max(...lines);
    // Pinned and unpinned lines do not move together: across a zone's edge, the grip's line alone
    const zone = (l: number) => (axis === "row" ? rowZone(info.pins, info.rows, l) : columnZone(info.pins, info.columns, l));
    const block = lines.length > 1 && lines.includes(line) && last - first + 1 === lines.length && zone(first) === zone(last);
    return block ? { first, last } : { first: line, last: line };
  }

  /** Where a block asked to start at `asked` goes (its first line's place; `first`: it stays) */
  private blockTo(info: TableInfo, axis: Axis, block: { first: number; last: number }, asked: number): number {
    return axis === "row" ? rowBlockTo(info, block.first, block.last, asked) : columnBlockTo(info, block.first, block.last, asked);
  }

  /** Moves a block of rows (columns) to start at `asked`, as one edit; several stay selected where they go */
  private moveBlock(info: TableInfo, axis: Axis, block: { first: number; last: number }, asked: number): void {
    const to = this.blockTo(info, axis, block, asked);
    if (to === block.first) return;
    void (axis === "row" ? moveRowsTo : moveColumnsTo)(this.host, info, block.first, block.last, to).then((result) => {
      // Selected where they went, once written: the table rendered anew shows the selection
      if (result !== "written" || block.last === block.first) return;
      this.selectLines(this.host.tableFor(info.key) ?? info, axis, to, to + block.last - block.first);
    });
  }

  /** The rows (columns) selected, when the selection holds this one; else just it */
  private selectedLines(info: TableInfo, axis: Axis, line: number): number[] {
    const cells = this.host.selectedCells(info);
    const lines = [...new Set(cells.map((ref) => (axis === "row" ? ref.row : ref.column)))].filter((l) => axis === "column" || l > 0);
    return lines.includes(line) ? lines : [line];
  }

  /**
   * A drag of a grip: a copy of the row (column) follows the pointer, the
   * others move aside to show where it goes (within its pin zone), and the
   * page scrolls near its edges (the core's). Dropped, the row (column) moves there.
   */
  private beginDrag(target: HandleTarget, axis: Axis, pressedAt: number): { move: (e: PointerEvent) => void; finish: (commit: boolean) => void } | undefined {
    const { info } = target;
    // The rows (columns) selected whole move together when the grip is on one of them
    const block = this.blockOf(info, axis, axis === "row" ? target.row! : target.column);
    this.tint(undefined);
    const drag: LineDrag | undefined = this.host.dragLines(info, axis, block, pressedAt, (asked) => this.blockTo(info, axis, block, asked));
    if (!drag) return undefined;
    this.dragging = true;
    return {
      move: (ev) => drag.move(ev.clientX, ev.clientY),
      finish: (commit) => {
        const to = drag.finish(commit);
        this.dragging = false;
        this.hideGrips();
        if (to !== undefined && to !== block.first) this.moveBlock(info, axis, block, to);
      },
    };
  }

  // ---- menus ----------------------------------------------------------------------

  // A click on the grip whose menu is open closes it; on another grip, that grip's menu opens instead
  /** The menu of a line, by its grip, or by a point in a cell (`at`: opened on a cell selected) */
  private toggleMenu(axis: Axis, target: HandleTarget, grip: HTMLElement, at?: { at: CellRef; x: number; y: number }): void {
    const line = axis === "row" ? target.row! : target.column;
    if (this.menu?.axis === axis && this.menu.line === line) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu(false, false);
    // Opened by a tap (a long press): that press is the grip's. The click a touch screen fires after the finger lifts
    // would land on the item that opened under it (Copy, under a column's grip); a mouse's click stays on the grip
    if (this.host.pressedWith === "touch") this.host.takePress();
    const { doc } = this.host;
    const { info } = target;
    // The line's name in the title, a pencil to change it (the names module's); saved, the menu closes
    const named = this.host.menuNaming(info, axis === "row" ? { kind: "row", row: line } : { kind: "column", column: line });
    const naming = namingThatCloses(named, () => this.closeMenu(false));
    const header = this.host.shownText(info, { row: 0, column: target.column }) || String(target.column + 1);
    const title = axis === "row" ? (naming?.name ? `Row: ${naming.name}` : `Row ${target.row}`) : `Column: ${naming?.name ?? header}`;
    const entries = axis === "row" ? this.rowMenu(info, target.row!, target.column) : this.columnMenu(info, target.column);
    const element = floatingMenu(doc, title, entries, { naming, close: () => this.closeMenu(true) });
    doc.body.append(element);
    const selected = this.selectionOf(info);
    if (at) {
      // By the point pressed, following its cell as the page scrolls
      const c = this.host.rectOf(info, at.at);
      this.menu = { element, axis, info, line, anchor: { at: at.at, dx: at.x - (c?.left ?? at.x), dy: at.y - (c?.top ?? at.y), width: 0, height: 0 }, byPoint: true, selected };
    } else {
      const g = grip.getBoundingClientRect();
      const cell = this.cellsOf(target, axis)[0] ?? { row: 0, column: target.column };
      const c = this.host.rectOf(info, cell) ?? g;
      this.menu = { element, axis, info, line, anchor: { at: cell, dx: g.left - c.left, dy: g.top - c.top, width: g.width, height: g.height }, selected };
      grip.classList.add("swt-active");
    }
    this.positionMenu();
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
    const back = { icon: ICONS.arrowLeft, run: () => this.swapMenu(previous) };
    this.swapMenu(floatingMenu(this.host.doc, title, closing, { back, close: () => this.closeMenu(true) }));
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
    const { element, axis, anchor, info } = this.menu;
    // The table rendered anew: the menu stays where it is
    const c = this.host.tableFor(info.key) === info ? this.host.rectOf(info, anchor.at) : undefined;
    if (!c) return;
    const win = this.host.doc.defaultView!;
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
    this.rowGrip.classList.remove("swt-active");
    this.columnGrip.classList.remove("swt-active");
    if (hide) this.hideGrips();
    if (refocus && hadFocus) this.host.focusPage();
  }

  private runAndClose(run: () => void): () => void {
    return () => {
      this.closeMenu(false);
      run();
    };
  }

  // `column`: the hovered column, where editing a new row starts
  private rowMenu(info: TableInfo, row: number, column: number): MenuEntry[] {
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
    // In the order every menu keeps (cell, row, column): the clipboard and clearing, inserting, moving and pinning, naming, deleting
    return [
      ...this.lineSections(info, "row", row),
      {
        kind: "segmented",
        label: "Insert",
        options: [
          {
            icon: ICONS.rowAbove,
            title: "Insert row above",
            run: act(() => insertRowWith(host, info, row, column, undefined, { before: row })),
            disabled: insertBlocked(row),
          },
          {
            icon: ICONS.rowBelow,
            title: "Insert row below",
            run: act(() => insertRowWith(host, info, row + 1, column, undefined, { after: row })),
            disabled: insertBlocked(row + 1),
          },
        ],
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: act(() => duplicateRowAt(host, info, row)) },
      { kind: "separator" },
      {
        kind: "segmented",
        label: rows > 1 ? `Move ${rows} rows` : "Move",
        options: [
          {
            icon: ICONS.arrowUp,
            title: rows > 1 ? `Move ${rows} rows up` : "Move up",
            run: act(() => this.moveBlock(info, "row", block, block.first - 1)),
            disabled: moveBlocked(block.first - 1),
          },
          {
            icon: ICONS.arrowDown,
            title: rows > 1 ? `Move ${rows} rows down` : "Move down",
            run: act(() => this.moveBlock(info, "row", block, block.first + 1)),
            disabled: moveBlocked(block.first + 1),
          },
        ],
      },
      {
        kind: "segmented",
        label: "Pin",
        options: [
          {
            icon: ICONS.pinTop,
            title: zone === "top" ? "Unpin from the top" : "Pin to top",
            active: zone === "top",
            run: act(() => pinRowAt(host, info, row, zone === "top" ? undefined : "top")),
            disabled: pinBlocked("top"),
          },
          {
            icon: ICONS.pinBottom,
            title: zone === "bottom" ? "Unpin from the bottom" : "Pin to bottom",
            active: zone === "bottom",
            run: act(() => pinRowAt(host, info, row, zone === "bottom" ? undefined : "bottom")),
            disabled: pinBlocked("bottom"),
          },
        ],
      },
      { kind: "separator" },
      ...this.section(this.host.rowMenuEntries(info, row, column)),
      this.deleteEntry(info, "row", row),
    ];
  }

  /** Delete row (column), or the rows (columns) selected when they hold it */
  private deleteEntry(info: TableInfo, axis: Axis, line: number): MenuEntry {
    const lines = this.selectedLines(info, axis, line);
    const many = lines.length > 1;
    const run = this.runAndClose(() => {
      void (axis === "row" ? deleteRowsAt(this.host, info, lines) : deleteColumnsAt(this.host, info, lines));
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

  /** The features' entries for the lines a grip acts on: the clipboard's bar, then the others (Clear), each a section as in the cell menu */
  private lineSections(info: TableInfo, axis: Axis, line: number): MenuEntry[] {
    const entries = this.host.lineMenuEntries(info, axis, this.selectedLines(info, axis, line));
    return [...this.section(entries.filter((e) => e.kind === "actions")), ...this.section(entries.filter((e) => e.kind !== "actions"))];
  }

  /** The features' entries as a section of the menu: run, they close it; a separator after them */
  private section(entries: readonly MenuEntry[]): MenuEntry[] {
    if (entries.length === 0) return [];
    return [...wrapRuns(entries, (run) => this.runAndClose(run)), { kind: "separator" }];
  }

  /**
   * The entries features add to a column's menu: run, they close the menu,
   * but one that showed other entries in its place (a list to pick from)
   */
  private featureColumnEntries(info: TableInfo, column: number, lead = false): MenuEntry[] {
    const open = (title: string, list: readonly MenuEntry[]) => this.replaceMenu(title, list);
    const entries = lead ? this.host.columnMenuLeadEntries(info, column, open) : this.host.columnMenuEntries(info, column, open);
    return wrapRuns(entries, (run) => () => {
      const shown = this.menu?.element;
      run();
      if (this.menu && this.menu.element === shown) this.closeMenu(false);
    });
  }

  private columnMenu(info: TableInfo, column: number): MenuEntry[] {
    const host = this.host;
    const view = host.viewOf(info);
    const sorted = view.sort?.column === column ? view.sort.direction : undefined;
    const align = parseTable(info.source).align[column] ?? "";
    const edit = (change: (t: Table) => Table | undefined) => this.runAndClose(() => void host.writeTable(host.tableFor(info.key) ?? info, change));
    const sortBy = (next: ViewState) => this.runAndClose(() => host.setSort(host.tableFor(info.key) ?? info, next));
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
    // In the order every menu keeps (cell, row, column): the clipboard and clearing, inserting, moving and pinning, viewing, naming, deleting
    const entries: MenuEntry[] = [
      ...this.lineSections(info, "column", column),
      {
        kind: "segmented",
        label: "Insert",
        options: [
          { icon: ICONS.columnLeft, title: "Insert column left", run: act(() => insertColumnWith(host, info, column)), disabled: insertBlocked(column) },
          { icon: ICONS.columnRight, title: "Insert column right", run: act(() => insertColumnWith(host, info, column + 1)), disabled: insertBlocked(column + 1) },
        ],
      },
      // The features' (a numbered column), closing the menu when run
      ...wrapRuns(host.columnMenuInsertEntries(info, column), (run) => this.runAndClose(run)),
      { kind: "separator" },
      {
        kind: "segmented",
        label: columns > 1 ? `Move ${columns} columns` : "Move",
        options: [
          {
            icon: ICONS.arrowLeft,
            title: columns > 1 ? `Move ${columns} columns left` : "Move left",
            run: act(() => this.moveBlock(info, "column", block, block.first - 1)),
            disabled: columnMoveBlocked(block.first - 1),
          },
          {
            icon: ICONS.arrowRight,
            title: columns > 1 ? `Move ${columns} columns right` : "Move right",
            run: act(() => this.moveBlock(info, "column", block, block.first + 1)),
            disabled: columnMoveBlocked(block.first + 1),
          },
        ],
      },
      {
        kind: "segmented",
        label: "Pin",
        options: [
          {
            icon: ICONS.pinLeft,
            title: zone === "left" ? "Unpin from the left" : "Pin left",
            active: zone === "left",
            run: act(() => pinColumnAt(host, info, column, zone === "left" ? undefined : "left")),
            disabled: pinBlocked("left"),
          },
          {
            icon: ICONS.pinRight,
            title: zone === "right" ? "Unpin from the right" : "Pin right",
            active: zone === "right",
            run: act(() => pinColumnAt(host, info, column, zone === "right" ? undefined : "right")),
            disabled: pinBlocked("right"),
          },
        ],
      },
      { kind: "separator" },
      ...this.featureColumnEntries(info, column, true),
      {
        kind: "segmented",
        label: "Sort",
        options: [
          { icon: ICONS.sortAsc, title: "Sort ascending", active: sorted === "asc", run: sortBy(withSort(view, column, "asc")) },
          { icon: ICONS.sortDesc, title: "Sort descending", active: sorted === "desc", run: sortBy(withSort(view, column, "desc")) },
          {
            icon: ICONS.clear,
            title: "Clear sorting",
            run: sortBy(withoutSort(view)),
            ...(view.sort ? {} : { disabled: "Not sorted" }),
          },
        ],
      },
      ...this.featureColumnEntries(info, column),
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
      ...this.section(host.columnMenuTopEntries(info, column)),
      this.deleteEntry(info, "column", column),
    ];
    return entries;
  }
}
