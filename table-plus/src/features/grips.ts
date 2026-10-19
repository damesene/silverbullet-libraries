// The row and column grips: shown next to the hovered cell's row and above its
// column, quiet bars of a bounded length (a tall row or a wide column does not
// stretch them); hovering one tints its row or column, a click opens the row or
// column menu, a drag moves the row or column.
import type { Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import {
  deleteColumnAt,
  deleteRowAt,
  duplicateRowAt,
  insertColumnWith,
  insertRowWith,
  MOVE_BLOCKED,
  moveColumnTo,
  moveRowTo,
  pinColumnAt,
  pinRowAt,
} from "../core/structure.ts";
import { cellText } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { type Align, parseTable, type Table } from "../markdown.ts";
import { focusMenu, type MenuEntry, renderMenu } from "../menu.ts";
import { setAlign } from "../ops.ts";
import { clampColumnMove, clampRowMove, columnZone, insertColumnAt, insertRowAt, rowZone } from "../pins.ts";
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
  private menu: { element: HTMLElement; axis: Axis; widget: HTMLElement; anchor: HTMLElement } | undefined;
  private dragging = false;

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
      const tr = target.row === undefined ? undefined : info.table.querySelector<HTMLTableRowElement>(`tr[data-tp-row="${target.row}"]`);
      return tr ? Array.from(tr.cells) : [];
    }
    return [info.table.rows[0]!, ...this.host.bodyRows(info)].flatMap((tr) => tr.cells[target.column] ?? []);
  }

  stop(): void {
    this.closeMenu(false);
    this.rowGrip.remove();
    this.columnGrip.remove();
  }

  owns(node: Node): boolean {
    return this.rowGrip.contains(node) || this.columnGrip.contains(node) || !!this.menu?.element.contains(node);
  }

  // While a grip is dragged the hover controls stay; a menu keeps them too
  pointerBusy(): "drag" | "menu" | undefined {
    return this.dragging ? "drag" : this.menu ? "menu" : undefined;
  }

  // A press outside an open menu closes it
  mouseDown(e: MouseEvent): boolean {
    if (this.menu && e.target instanceof Node && !this.host.isFloating(e.target)) this.closeMenu(false);
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
  cellHovered(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    const ref = this.host.cellRef(info, cell);
    if (!ref) return;
    this.target = { widget, info, column: ref.column, ...(ref.row > 0 ? { row: ref.row } : {}) };
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
        drag = this.beginDrag(target, axis);
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
    const up = () => {
      cleanup();
      if (drag) drag.finish(true);
      else {
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
    if (axis === "row") {
      this.host.selectCells(info, { row: target.row!, column: 0 }, { row: target.row!, column: info.columns - 1 });
      return;
    }
    const shown = this.host.shownRows(info);
    const last = Number(shown[shown.length - 1]?.dataset.tpRow ?? 0);
    this.host.selectCells(info, { row: 0, column: target.column }, { row: last, column: target.column });
  }

  private beginDrag(target: HandleTarget, axis: Axis): { move: (e: PointerEvent) => void; finish: (commit: boolean) => void } {
    const { widget, info } = target;
    const { doc } = this.host;
    const from = axis === "row" ? target.row! : target.column;
    const table = info.table;
    const header = table.rows[0]!;
    const rows = [header, ...this.host.bodyRows(info)];
    // The cells of each row (column), by its row of the markdown (its column), and its size
    const items =
      axis === "row"
        ? rows.slice(1).map((tr) => Array.from(tr.cells))
        : Array.from(header.cells).map((_, c) => rows.flatMap((tr) => tr.cells[c] ?? []));
    const index = axis === "row" ? from - 1 : from;
    const carried = items[index] ?? [];
    const size = (cells: readonly HTMLTableCellElement[]) => {
      const r = cells[0]?.getBoundingClientRect();
      return r ? (axis === "row" ? r.height : r.width) : 0;
    };
    const carriedSize = size(carried);
    const starts = items.map((cells) => {
      const r = cells[0]?.getBoundingClientRect();
      return r ? (axis === "row" ? r.top : r.left) : 0;
    });
    const ghost = this.ghostOf(axis, carried);
    const start = carried[0]!.getBoundingClientRect();
    carried.forEach((el) => el.classList.add("tp-dragged"));
    doc.body.classList.add("tp-dragging");
    this.tint(undefined);
    this.dragging = true;
    let to = from;
    let grab: number | undefined;

    const move = (ev: PointerEvent) => {
      const pointer = axis === "row" ? ev.clientY : ev.clientX;
      grab ??= pointer - (axis === "row" ? start.top : start.left);
      if (axis === "row") this.host.place(ghost, start.left, pointer - grab);
      else this.host.place(ghost, pointer - grab, start.top);
      // The slot the copy's middle is over, in the places the rows (columns) had
      const middle = pointer - grab + carriedSize / 2;
      let slot = 0;
      for (let i = 0; i < items.length; i++) if (middle >= starts[i]! + size(items[i]!) / 2) slot = i;
      const asked = axis === "row" ? slot + 1 : slot;
      to = axis === "row" ? clampRowMove(info.pins, info.rows, from, asked) : clampColumnMove(info.pins, info.columns, from, asked);
      const target = axis === "row" ? to - 1 : to;
      items.forEach((cells, i) => {
        const shift = i > index && i <= target ? -carriedSize : i < index && i >= target ? carriedSize : 0;
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
      this.hideGrips();
      if (!commit || to === from) return;
      if (axis === "row") void moveRowTo(this.host, widget, info, from, to);
      else void moveColumnTo(this.host, widget, info, from, to);
    };
    return { move, finish };
  }

  /**
   * The copy that follows the pointer: the row's (column's) cells cloned with
   * their sizes and looks, as it is outside the table that styles them
   */
  private ghostOf(axis: Axis, cells: readonly HTMLTableCellElement[]): HTMLElement {
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
      const tr = doc.createElement("tr");
      tr.append(...cells.map(look));
      table.append(tr);
    } else {
      for (const cell of cells) {
        const tr = doc.createElement("tr");
        tr.append(look(cell));
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

  private toggleMenu(axis: Axis, target: HandleTarget, anchor: HTMLElement): void {
    if (this.menu?.axis === axis) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu(false);
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
    this.menu = { element, axis, widget, anchor };
    this.positionMenu();
    anchor.classList.add("tp-active");
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
    const win = this.host.doc.defaultView!;
    const a = anchor.getBoundingClientRect();
    const m = element.getBoundingClientRect();
    let left = axis === "row" ? a.right + 4 : a.left + a.width / 2 - m.width / 2;
    let top = axis === "row" ? a.top - 6 : a.bottom + 4;
    left = Math.max(4, Math.min(left, win.innerWidth - m.width - 4));
    if (top + m.height > win.innerHeight - 4) top = Math.max(4, win.innerHeight - m.height - 4);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  private closeMenu(refocus: boolean): void {
    const menu = this.menu;
    if (!menu) return;
    this.menu = undefined;
    const hadFocus = menu.element.contains(this.host.doc.activeElement);
    menu.element.remove();
    this.rowGrip.classList.remove("tp-active");
    this.columnGrip.classList.remove("tp-active");
    this.hideGrips();
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
    const moveBlocked = (to: number) =>
      rearranged
        ? MOVE_BLOCKED
        : clampRowMove(info.pins, info.rows, row, to) === row
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
        label: "Move up",
        icon: ICONS.arrowUp,
        run: act(() => moveRowTo(host, widget, info, row, row - 1)),
        disabled: moveBlocked(row - 1),
      },
      {
        kind: "item",
        label: "Move down",
        icon: ICONS.arrowDown,
        run: act(() => moveRowTo(host, widget, info, row, row + 1)),
        disabled: moveBlocked(row + 1),
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
      { kind: "item", label: "Delete row", icon: ICONS.trash, danger: true, run: act(() => deleteRowAt(host, widget, info, row)) },
    ];
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
    const columnMoveBlocked = (to: number) =>
      clampColumnMove(info.pins, info.columns, column, to) === column
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
        label: "Move left",
        icon: ICONS.arrowLeft,
        run: act(() => moveColumnTo(host, widget, info, column, column - 1)),
        disabled: columnMoveBlocked(column - 1),
      },
      {
        kind: "item",
        label: "Move right",
        icon: ICONS.arrowRight,
        run: act(() => moveColumnTo(host, widget, info, column, column + 1)),
        disabled: columnMoveBlocked(column + 1),
      },
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
      {
        kind: "item",
        label: "Delete column",
        icon: ICONS.trash,
        danger: true,
        run: act(() => deleteColumnAt(host, widget, info, column)),
        disabled: info.columns <= 1 ? "A table needs at least one column" : undefined,
      },
    );
    return entries;
  }
}
