// The row and column grips: shown next to the hovered cell's row and above its
// column; a click opens the row or column menu, a drag moves the row or column.
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
      this.host.place(this.rowGrip, shown.left - 22, rowRect.top + (rowRect.height - 18) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0]!.cells[ref.column];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      // Centered on the column, as far as the column is in view
      const center = Math.max(shown.left + 9, Math.min(h.left + h.width / 2, shown.right - 9));
      this.host.place(this.columnGrip, center - 9, h.top - 9);
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
      else this.toggleMenu(axis, target, grip);
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

  private beginDrag(target: HandleTarget, axis: Axis): { move: (e: PointerEvent) => void; finish: (commit: boolean) => void } {
    const { widget, info } = target;
    const { doc } = this.host;
    const from = axis === "row" ? target.row! : target.column;
    const table = info.table;
    const header = table.rows[0]!;
    const bodyRows = this.host.bodyRows(info);
    const carried =
      axis === "row"
        ? bodyRows.filter((tr) => Number(tr.dataset.tpRow) === from)
        : [header, ...bodyRows].map((tr) => tr.cells[from]).filter((c): c is HTMLTableCellElement => !!c);
    carried.forEach((el) => el.classList.add("tp-dragged"));
    const line = this.host.floating("div", "tp-drop tp-visible");
    doc.body.classList.add("tp-dragging");
    this.dragging = true;
    let slot = from;

    // A slot is "before item i"; one past the last item means "at the end"
    const move = (ev: PointerEvent) => {
      const tableRect = table.getBoundingClientRect();
      const shown = this.host.shownRect(widget, info);
      if (axis === "row") {
        slot = bodyRows.length + 1;
        for (let i = 0; i < bodyRows.length; i++) {
          const r = bodyRows[i]!.getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) {
            slot = i + 1;
            break;
          }
        }
        const y = slot <= bodyRows.length ? bodyRows[slot - 1]!.getBoundingClientRect().top : tableRect.bottom;
        Object.assign(line.style, {
          left: `${shown.left}px`,
          top: `${y - 1}px`,
          width: `${shown.right - shown.left}px`,
          height: "2px",
        });
      } else {
        const cells = Array.from(header.cells);
        slot = cells.length;
        for (let i = 0; i < cells.length; i++) {
          const r = cells[i]!.getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) {
            slot = i;
            break;
          }
        }
        const x = slot < cells.length ? cells[slot]!.getBoundingClientRect().left : tableRect.right;
        Object.assign(line.style, {
          left: `${x - 1}px`,
          top: `${tableRect.top}px`,
          width: "2px",
          height: `${tableRect.height}px`,
        });
      }
    };
    const finish = (commit: boolean) => {
      carried.forEach((el) => el.classList.remove("tp-dragged"));
      line.remove();
      doc.body.classList.remove("tp-dragging");
      this.dragging = false;
      this.hideGrips();
      const to = slot > from ? slot - 1 : slot;
      if (!commit || to === from) return;
      if (axis === "row") void moveRowTo(this.host, widget, info, from, to);
      else void moveColumnTo(this.host, widget, info, from, to);
    };
    return { move, finish };
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
      {
        kind: "item",
        label: "Filter",
        icon: ICONS.filter,
        run: this.runAndClose(() => {
          host.setView(widget, info, { ...host.viewOf(info), showFilters: true });
          info.table.querySelector<HTMLInputElement>(`.tp-filter[data-tp-column="${column}"]`)?.focus();
        }),
      },
      ...host.columnMenuEntries(widget, info, column, (title, entries) => this.replaceMenu(title, entries)),
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
