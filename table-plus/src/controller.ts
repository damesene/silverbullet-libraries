// Enhances SilverBullet's rendered markdown tables in place: sorting, filtering,
// inline cell editing and row/column editing. Every change to the markdown is
// one `editor.replaceRange`, so undo works as for any other edit.
import { type Bridge, SETTINGS, type SettingValue } from "./bridge.ts";
import {
  caretTextOffset,
  cellText,
  EDITOR_SELECTOR,
  INTERACTIVE_SELECTOR,
  NATIVE_ACTION_SELECTOR,
  positionHint,
  renderedTable,
  UI_CLASS,
  WIDGET_SELECTOR,
} from "./dom.ts";
import { ICONS } from "./icons.ts";
import {
  type Align,
  cellSourceOffset,
  escapeCell,
  locateBySource,
  locateByShape,
  locateWithEmptyHeaders,
  minimalEdit,
  parseTable,
  serializeTable,
  type Table,
  unescapeCell,
} from "./markdown.ts";
import { focusMenu, type MenuEntry, renderMenu } from "./menu.ts";
import {
  columnAfterMove,
  deleteColumn,
  deleteRow,
  duplicateRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  nameEmptyHeaders,
  setAlign,
  setCell,
} from "./ops.ts";
import {
  cycleSort,
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_VIEW,
  type FilterOptions,
  isRearranged,
  parseFilter,
  remapColumns,
  type ViewState,
  visibleRows,
  withFilter,
  withoutSort,
  withSort,
} from "./view.ts";

type WidgetInfo = {
  readonly table: HTMLTableElement;
  // The table's markdown when it was rendered: the editor only reuses a
  // rendered table while its markdown stays exactly the same
  readonly source: string;
  readonly hint: number;
  readonly key: string;
  readonly columns: number;
};

type ActiveEditor = {
  readonly widget: HTMLElement;
  readonly cell: HTMLTableCellElement;
  readonly row: number;
  readonly column: number;
  readonly original: string;
  readonly field: HTMLInputElement;
  readonly kept: DocumentFragment;
  readonly cellStyle: string | null;
};

type CellRef = { readonly row: number; readonly column: number };

// A cell to edit once the table is rendered again; `select` selects its text
type FocusTarget = CellRef & { readonly select?: boolean };

type Axis = "row" | "column";

// What the row and column grips currently belong to
type HandleTarget = {
  readonly widget: HTMLElement;
  readonly info: WidgetInfo;
  readonly row?: number;
  readonly column: number;
};

type WriteResult = "written" | "unchanged" | "failed";

const STOPPED_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "paste",
  "cut",
  "copy",
  "compositionstart",
  "compositionupdate",
  "compositionend",
] as const;

const SORT_GLYPH = { asc: "▲", desc: "▼", none: "⇅" } as const;

// Pointer travel that turns a press on a grip into a drag instead of a click
const DRAG_THRESHOLD = 4;

// Space between the top of the view and a header held there, room for the
// toolbar (25px) above the header. The CSS covers it with the page color, so no
// row shows above the header; keep both in step.
const STICKY_GAP = 38;
// Toolbar distance above the header: clear of the column grip on the header's top edge
const BAR_GAP = 10;

// Middle-button autoscroll: no movement within this distance of the start point
const AUTOSCROLL_DEAD_ZONE = 12;

// Ctrl+Shift + these keys move the edited cell's row or column
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

// Ctrl + these keys move the cell editor to another cell
const NAVIGATION_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

const FILTER_HINT =
  "Text to find. Also: >10 <10 >=10 <=10 (numbers), /pattern/ (regular expression; /pattern/c is case-sensitive), =text (whole cell), !filter (not)";

const NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";
const MOVE_BLOCKED = "Clear sorting and filters to move rows";

export class Controller {
  private readonly infos = new WeakMap<HTMLElement, WidgetInfo>();
  private readonly enhancing = new WeakSet<HTMLElement>();
  private readonly views = new Map<string, ViewState>();
  private filterOptions: FilterOptions = DEFAULT_FILTER_OPTIONS;
  // The maximum table height setting, in pixels; 0: no limit
  private maxHeight = 0;
  // Sideways scroll of each wide table, carried over to its next rendering
  private readonly scrollLefts = new Map<string, number>();
  // The same for tables taller than the maximum height setting, scrolled inside
  private readonly scrollTops = new Map<string, number>();
  // Editor cursor positions set before table edits (see placeHistoryMarker)
  private readonly historyMarkers = new Set<number>();
  private editor: ActiveEditor | undefined;
  private pendingFocus: (FocusTarget & { key: string; until: number }) | undefined;
  private hoverWidget: HTMLElement | undefined;
  private hoverCell: HTMLTableCellElement | undefined;
  private handleTarget: HandleTarget | undefined;
  private menu: { element: HTMLElement; axis: Axis; widget: HTMLElement; anchor: HTMLElement } | undefined;
  private dragging = false;
  private stopAutoscroll: (() => void) | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private scanQueued = false;
  // Set by stop(): work already scheduled then does nothing
  private stopped = false;
  private settingsTimer: ReturnType<typeof setTimeout> | undefined;
  private settingsReadAt = 0;
  private stickyQueued = false;
  private warnedIncompatible = false;
  private observer: MutationObserver | undefined;
  private readonly bar: HTMLElement;
  private readonly rowGrip: HTMLButtonElement;
  private readonly columnGrip: HTMLButtonElement;
  private readonly addRow: HTMLButtonElement;
  private readonly addColumn: HTMLButtonElement;

  constructor(
    private readonly doc: Document,
    private bridge: Bridge,
  ) {
    this.bar = this.floating("div", "tp-bar");
    this.rowGrip = this.floatingButton("tp-handle tp-grip", "Row: click for actions, drag to move", ICONS.grip);
    this.columnGrip = this.floatingButton(
      "tp-handle tp-grip tp-grip-column",
      "Column: click for actions, drag to move",
      ICONS.grip,
    );
    this.addRow = this.floatingButton("tp-add tp-add-row", "Add a row at the end", ICONS.plus);
    this.addRow.insertAdjacentText("beforeend", "Row");
    this.addColumn = this.floatingButton("tp-add tp-add-column", "Add a column at the end", ICONS.plus);
  }

  setBridge(bridge: Bridge): void {
    this.bridge = bridge;
  }

  start(): void {
    const win = this.doc.defaultView!;
    win.addEventListener("mousedown", this.onMouseDown, true);
    win.addEventListener("click", this.onClick, true);
    win.addEventListener("dblclick", this.onDoubleClick, true);
    win.addEventListener("scroll", this.onScroll, true);
    win.addEventListener("keydown", this.onKeyDown, true);
    win.addEventListener("keyup", this.onKeyUp, true);
    win.addEventListener("blur", this.onBlur);
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });

    this.rowGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.onGripPointerDown(e, "column"));
    this.addRow.addEventListener("click", () => this.appendRow());
    this.addColumn.addEventListener("click", () => this.appendColumn());

    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    void this.scan();
    void this.refreshSettings();
  }

  /** Detaches from the page: listeners, observer and floating controls */
  stop(): void {
    this.stopped = true;
    const win = this.doc.defaultView!;
    win.removeEventListener("mousedown", this.onMouseDown, true);
    win.removeEventListener("click", this.onClick, true);
    win.removeEventListener("dblclick", this.onDoubleClick, true);
    win.removeEventListener("scroll", this.onScroll, true);
    win.removeEventListener("keydown", this.onKeyDown, true);
    win.removeEventListener("keyup", this.onKeyUp, true);
    win.removeEventListener("blur", this.onBlur);
    this.doc.removeEventListener("mousemove", this.onMouseMove);
    this.observer?.disconnect();
    clearTimeout(this.settingsTimer);
    this.stopAutoscroll?.();
    this.closeMenu(false);
    for (const el of [this.bar, this.rowGrip, this.columnGrip, this.addRow, this.addColumn]) el.remove();
  }

  private onBlur = (): void => this.setNavigating(false);

  /** Refreshes the settings at most once a second, the last request always served */
  private queueSettingsRefresh(): void {
    if (this.settingsTimer !== undefined) return;
    const wait = Math.max(0, this.settingsReadAt + 1000 - Date.now());
    this.settingsTimer = setTimeout(() => {
      this.settingsTimer = undefined;
      this.settingsReadAt = Date.now();
      if (!this.stopped) void this.refreshSettings();
    }, wait);
  }

  /** Re-reads settings the view depends on, and re-applies the views if they changed */
  private async refreshSettings(): Promise<void> {
    const smart = (await this.setting("smartFilters")) === true;
    const maxHeight = await this.setting("maxHeight");
    if (this.stopped || (smart === this.filterOptions.smart && maxHeight === this.maxHeight)) return;
    this.filterOptions = { smart };
    this.maxHeight = maxHeight;
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
    this.queueStickyUpdate();
  }

  private rearranged(info: WidgetInfo): boolean {
    return isRearranged(this.viewOf(info), this.filterOptions);
  }

  // ---- discovering rendered tables --------------------------------------

  private queueScan(): void {
    if (this.scanQueued) return;
    this.scanQueued = true;
    const run = () => {
      this.scanQueued = false;
      void this.scan();
      // The page changed (e.g. the Configuration Manager opened or closed): settings may have too
      this.queueSettingsRefresh();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  /** Enhances every rendered table that is not enhanced yet */
  scan(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const pending: Promise<void>[] = [];
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR))) {
      const table = renderedTable(widget);
      if (!table || table.rows.length === 0) continue;
      if (this.infos.get(widget)?.table === table || widget.dataset.tpUnsupported) continue;
      pending.push(this.enhance(widget, table));
    }
    return Promise.all(pending).then(() => undefined);
  }

  private async enhance(widget: HTMLElement, table: HTMLTableElement): Promise<void> {
    if (this.enhancing.has(widget)) return;
    this.enhancing.add(widget);
    try {
      const hint = positionHint(table);
      if (hint === undefined) {
        this.markUnsupported(widget, true);
        return;
      }
      const header = table.rows[0]!;
      const shape = {
        rows: table.rows.length,
        columns: header.cells.length,
        headers: Array.from(header.cells).map(cellText),
      };
      const text = await this.bridge.getText();
      if (this.stopped || renderedTable(widget) !== table) return;
      const range = locateByShape(text, hint, shape);
      if (!range) {
        const broken = locateWithEmptyHeaders(text, hint, shape);
        if (broken) this.offerHeaderFix(widget, broken.text, broken.from);
        // e.g. a table in a block quote: it stays a plain SilverBullet table
        this.markUnsupported(widget, false);
        return;
      }
      const page = await this.bridge.getCurrentPage();
      if (this.stopped || renderedTable(widget) !== table) return;
      const info: WidgetInfo = {
        table,
        source: range.text,
        hint: range.from,
        key: `${page}#${range.ordinal}`,
        columns: shape.columns,
      };
      this.infos.set(widget, info);
      this.decorate(widget, info);
      this.applyView(widget, info);
      const scrollLeft = this.scrollLefts.get(info.key);
      if (scrollLeft) widget.scrollLeft = scrollLeft;
      const scrollTop = this.scrollTops.get(info.key);
      if (scrollTop) widget.scrollTop = scrollTop;
      this.takePendingFocus(widget, info);
      this.queueStickyUpdate();
      void this.refreshSettings();
    } catch (e) {
      console.error("Table Plus: could not enhance a table", e);
    } finally {
      this.enhancing.delete(widget);
    }
  }

  private markUnsupported(widget: HTMLElement, incompatible: boolean): void {
    widget.dataset.tpUnsupported = "true";
    if (!incompatible || this.warnedIncompatible) return;
    this.warnedIncompatible = true;
    const message =
      "Table Plus is inactive: this SilverBullet version renders tables differently than expected";
    console.warn(message);
    void this.bridge.flash(message, "error");
  }

  /**
   * A table with unnamed columns renders with its header shifted against its
   * data, so Table Plus leaves it alone and offers to name those columns
   */
  private offerHeaderFix(widget: HTMLElement, source: string, hint: number): void {
    if (widget.querySelector(".tp-notice")) return;
    const notice = this.doc.createElement("div");
    notice.className = `${UI_CLASS} tp-notice`;
    notice.textContent =
      "Some columns of this table have no name, so SilverBullet shifts the header against the data. ";
    const button = this.doc.createElement("button");
    button.type = "button";
    button.textContent = "Name them";
    // Handled here: the table is not enhanced, so the click must not reach SilverBullet
    for (const type of ["mousedown", "mouseup", "click"]) {
      button.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (type === "click") void this.fixHeaders(source, hint);
      });
    }
    notice.append(button);
    widget.prepend(notice);
  }

  private async fixHeaders(source: string, hint: number): Promise<void> {
    try {
      const range = locateBySource(await this.bridge.getText(), hint, source);
      if (!range) {
        void this.bridge.flash(NOT_SAVED, "error");
        return;
      }
      const edit = minimalEdit(range.text, serializeTable(nameEmptyHeaders(parseTable(range.text))));
      await this.bridge.replaceRange(range.from + edit.from, range.from + edit.to, edit.insert);
    } catch (e) {
      console.error("Table Plus: could not name the columns", e);
      void this.bridge.flash(`Table Plus: could not name the columns (${String(e)})`, "error");
    }
  }

  private decorate(widget: HTMLElement, info: WidgetInfo): void {
    widget.classList.add("tp-table");
    const rows = Array.from(info.table.rows);
    rows.slice(1).forEach((tr, i) => {
      tr.dataset.tpRow = String(i + 1);
    });
    Array.from(rows[0]!.cells).forEach((cell, column) => {
      const button = this.doc.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.className = `${UI_CLASS} tp-sort`;
      button.dataset.tpAction = "sort";
      button.dataset.tpColumn = String(column);
      cell.append(button);
    });
  }

  // ---- view: sort and filter --------------------------------------------

  private viewOf(info: WidgetInfo): ViewState {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }

  private setView(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    this.views.set(info.key, view);
    this.applyView(widget, info);
  }

  private bodyRows(info: WidgetInfo): HTMLTableRowElement[] {
    return Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow),
    );
  }

  private applyView(widget: HTMLElement, info: WidgetInfo): void {
    const view = this.viewOf(info);
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellText));
    const order = visibleRows(values, view, this.filterOptions);
    const shown = new Set(order);
    const parent = rows[0]?.parentElement;
    if (parent) {
      for (const i of order) parent.append(rows[i]!);
      rows.forEach((tr, i) => {
        tr.classList.toggle("tp-hidden", !shown.has(i));
        if (!shown.has(i)) parent.append(tr);
      });
    }

    const header = info.table.rows[0]!;
    Array.from(header.cells).forEach((cell, column) => {
      const direction = view.sort?.column === column ? view.sort.direction : undefined;
      const button = cell.querySelector<HTMLElement>(".tp-sort");
      if (button) {
        button.textContent = SORT_GLYPH[direction ?? "none"];
        button.classList.toggle("tp-active", !!direction);
        button.title =
          direction === "asc" ? "Sorted ascending" : direction === "desc" ? "Sorted descending" : "Sort";
      }
      if (direction) cell.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      else cell.removeAttribute("aria-sort");
    });

    this.applyFilterRow(widget, info, view);
    widget.classList.toggle("tp-rearranged", isRearranged(view, this.filterOptions));
    // A taller table scrolls inside its own box (the table box already has overflow: auto)
    widget.style.maxHeight = this.maxHeight > 0 ? `${this.maxHeight}px` : "";
    if (this.hoverWidget === widget) this.showTableControls(widget, info);
  }

  private applyFilterRow(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    let row = info.table.querySelector<HTMLTableRowElement>("tr.tp-filter-row");
    if (!view.showFilters) {
      row?.remove();
      return;
    }
    if (!row) {
      row = this.doc.createElement("tr");
      row.className = `${UI_CLASS} tp-filter-row`;
      for (let column = 0; column < info.columns; column++) {
        const cell = this.doc.createElement("td");
        const input = this.doc.createElement("input");
        input.type = "search";
        input.className = "tp-filter";
        input.placeholder = "Filter";
        input.dataset.tpColumn = String(column);
        this.isolate(input);
        input.addEventListener("input", () => {
          const current = this.infos.get(widget);
          if (current) this.setView(widget, current, withFilter(this.viewOf(current), column, input.value));
          void this.refreshSettings();
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            input.blur();
          }
        });
        cell.append(input);
        row.append(cell);
      }
      info.table.rows[0]!.after(row);
    }
    for (const input of Array.from(row.querySelectorAll<HTMLInputElement>("input"))) {
      const value = view.filters[Number(input.dataset.tpColumn)] ?? "";
      if (input.value !== value && this.doc.activeElement !== input) input.value = value;
      // A filter that cannot be used filters nothing; the field says why
      const { error } = parseFilter(input.value, this.filterOptions);
      input.classList.toggle("tp-invalid", !!error);
      input.title = error ?? (this.filterOptions.smart ? FILTER_HINT : "Text to find");
    }
  }

  // ---- event routing -----------------------------------------------------

  // Keyboard and input events from Table Plus' own fields must not reach the editor
  private isolate(element: HTMLElement): void {
    for (const type of STOPPED_EVENTS) element.addEventListener(type, (e) => e.stopPropagation());
  }

  private enhancedWidgetOf(target: EventTarget | null): [HTMLElement, WidgetInfo] | undefined {
    if (!(target instanceof Element)) return undefined;
    const widget = target.closest<HTMLElement>(WIDGET_SELECTOR);
    const info = widget && this.infos.get(widget);
    return widget && info && renderedTable(widget) === info.table ? [widget, info] : undefined;
  }

  private tableCellOf(info: WidgetInfo, target: EventTarget | null): HTMLTableCellElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const cell = target.closest<HTMLTableCellElement>("td, th");
    if (!cell || cell.closest("table") !== info.table) return undefined;
    return cell.parentElement?.classList.contains("tp-filter-row") ? undefined : cell;
  }

  private onMouseDown = (e: MouseEvent): void => {
    const target = e.target instanceof Node ? e.target : null;
    if (this.stopAutoscroll) {
      // Any click ends the autoscroll and does nothing else
      e.preventDefault();
      e.stopPropagation();
      this.stopAutoscroll();
      this.swallowNextClick();
      return;
    }
    if (this.menu && target && !this.isFloating(target)) this.closeMenu(false);
    if (e.button === 1) this.onMiddleMouseDown(e);
    if (e.button !== 0) return;
    if (e.altKey) {
      this.onAltMouseDown(e);
      return;
    }
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const element = e.target as Element;
    if (element.closest(NATIVE_ACTION_SELECTOR)) return;
    // Keep SilverBullet from moving the cursor into the table, which shows its markdown
    e.stopPropagation();
    if (element.closest("[data-tp-action]")) {
      e.preventDefault();
      return;
    }
    if (element.closest(".tp-cell-editor, .tp-filter-row") || element.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    e.preventDefault();
    const cell = this.tableCellOf(info, element);
    if (!cell || this.editor?.cell === cell) return;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    if (this.editor) void this.finishEditing(true, { widget, ...ref });
    else this.openEditor(widget, info, cell);
  };

  /**
   * Middle-button autoscroll over a table that scrolls sideways. The browser's
   * own autoscroll locks onto one scrolling box, so it moves either the table
   * sideways or the page up and down; this one moves both. Hold and drag, or
   * click and move; the next click, key or wheel turn ends it.
   */
  private onMiddleMouseDown(e: MouseEvent): void {
    const hit = this.enhancedWidgetOf(e.target);
    const widget = hit?.[0];
    // A middle click on a link opens it in a new tab
    const scrollsSideways = !!widget && widget.scrollWidth > widget.clientWidth;
    if (!widget || (e.target as Element).closest("a") || (!scrollsSideways && !this.scrollsInside(widget))) return;
    e.preventDefault();
    e.stopPropagation();
    const win = this.doc.defaultView!;
    const page = this.scrollParentOf(widget) ?? this.doc.scrollingElement;
    const origin = { x: e.clientX, y: e.clientY };
    const pointer = { ...origin };
    let held = false;
    let carry = { x: 0, y: 0 };
    const marker = this.floating("div", "tp-autoscroll tp-visible");
    marker.style.left = `${origin.x - 12}px`;
    marker.style.top = `${origin.y - 12}px`;
    this.doc.body.classList.add("tp-autoscrolling");

    // Pixels per frame: grows with the distance from the start point
    const speed = (d: number) => {
      const beyond = Math.abs(d) - AUTOSCROLL_DEAD_ZONE;
      return beyond > 0 ? Math.sign(d) * (beyond / 16) ** 1.3 : 0;
    };
    let frame = 0;
    const tick = () => {
      carry = { x: carry.x + speed(pointer.x - origin.x), y: carry.y + speed(pointer.y - origin.y) };
      const dx = Math.trunc(carry.x);
      const dy = Math.trunc(carry.y);
      carry = { x: carry.x - dx, y: carry.y - dy };
      if (dx) widget.scrollLeft += dx;
      if (dy) {
        // A table scrolled inside its box takes the vertical movement first
        const before = widget.scrollTop;
        widget.scrollTop += dy;
        const rest = dy - (widget.scrollTop - before);
        if (rest && page) page.scrollTop += rest;
      }
      frame = win.requestAnimationFrame(tick);
    };
    const move = (ev: MouseEvent) => {
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) > AUTOSCROLL_DEAD_ZONE) held = true;
    };
    const up = (ev: MouseEvent) => {
      // Released after dragging: hold-and-drag ends here; a plain click keeps it going
      if (ev.button === 1 && held) stop();
    };
    const end = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      stop();
    };
    const stop = () => {
      win.cancelAnimationFrame(frame);
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      win.removeEventListener("keydown", end, true);
      win.removeEventListener("wheel", end, true);
      marker.remove();
      this.doc.body.classList.remove("tp-autoscrolling");
      this.stopAutoscroll = undefined;
    };
    this.stopAutoscroll = stop;
    // Listeners start after this press, so it does not end the autoscroll at once
    setTimeout(() => {
      if (this.stopAutoscroll !== stop) return;
      win.addEventListener("mousemove", move, true);
      win.addEventListener("mouseup", up, true);
      win.addEventListener("keydown", end, true);
      win.addEventListener("wheel", end, { capture: true, passive: false });
    }, 0);
    frame = win.requestAnimationFrame(tick);
  }

  private swallowNextClick(): void {
    const win = this.doc.defaultView!;
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      clear();
    };
    const clear = () => {
      win.removeEventListener("click", swallow, true);
      win.removeEventListener("auxclick", swallow, true);
    };
    win.addEventListener("click", swallow, true);
    win.addEventListener("auxclick", swallow, true);
    setTimeout(clear, 500);
  }

  /**
   * Alt+click shows the markdown, as in SilverBullet, but with the cursor in
   * the clicked cell instead of at the start of the table
   */
  private onAltMouseDown(e: MouseEvent): void {
    const hit = this.enhancedWidgetOf(e.target);
    const cell = hit && this.tableCellOf(hit[1], e.target);
    if (!hit || !cell) return;
    e.preventDefault();
    e.stopPropagation();
    const info = hit[1];
    if (this.editor) {
      void this.finishEditing(true, undefined, false);
      return;
    }
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    // Within a plain-text cell, the clicked character; otherwise the cell start
    const source = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    const within = cellText(cell) === source ? caretTextOffset(cell, e.clientX, e.clientY) : undefined;
    void this.showMarkdown(info, { ...ref, within: within ?? 0 });
  }

  private onClick = (e: MouseEvent): void => {
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const target = e.target as Element;
    if (e.altKey) {
      if (this.tableCellOf(info, target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (target.closest(NATIVE_ACTION_SELECTOR)) return;
    e.stopPropagation();
    const action = target.closest<HTMLElement>("[data-tp-action]");
    if (action?.dataset.tpAction === "sort") {
      e.preventDefault();
      this.setView(widget, info, cycleSort(this.viewOf(info), Number(action.dataset.tpColumn)));
    }
  };

  private onDoubleClick = (e: MouseEvent): void => {
    if (e.altKey) return;
    const hit = this.enhancedWidgetOf(e.target);
    if (hit && !(e.target as Element).closest(NATIVE_ACTION_SELECTOR)) e.stopPropagation();
  };

  private onScroll = (e: Event): void => {
    this.queueStickyUpdate();
    // Remember a wide table's sideways scroll: the editor re-renders tables
    // after edits and when they scroll far out of view
    const scrolled = e.target instanceof HTMLElement ? this.infos.get(e.target) : undefined;
    if (scrolled && e.target instanceof HTMLElement) {
      this.scrollLefts.set(scrolled.key, e.target.scrollLeft);
      this.scrollTops.set(scrolled.key, e.target.scrollTop);
    }
  };

  /**
   * Keeps the toolbar, grips and an open menu on what they belong to while the
   * page or the table scrolls; hides them only once that is out of view
   */
  private followScroll(): void {
    if (this.dragging) return;
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info || renderedTable(widget) !== info.table || !this.isShown(widget, info, info.table)) {
      this.closeMenu(false);
      this.hideFloating();
      return;
    }
    this.showTableControls(widget, info);
    const cell = this.hoverCell;
    if (cell && cell.isConnected && this.isShown(widget, info, cell)) this.showHandles(widget, info, cell);
    else {
      this.closeMenu(false);
      this.hideHandles();
    }
    if (this.menu) this.positionMenu();
  }

  /** Whether any of the element is in view: inside the page's scroll view and the table's sideways view */
  private isShown(widget: HTMLElement, info: WidgetInfo, element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const view = this.scrollParentOf(widget)?.getBoundingClientRect();
    const box = widget.getBoundingClientRect();
    const head = info.table.tHead;
    // A body cell under the header held at the top is out of view
    const top = Math.max(
      view?.top ?? 0,
      box.top,
      head && element.closest("tbody") ? head.getBoundingClientRect().bottom : -Infinity,
    );
    const bottom = Math.min(view?.bottom ?? this.doc.defaultView!.innerHeight, box.bottom);
    return rect.bottom > top && rect.top < bottom && rect.right > box.left && rect.left < box.right;
  }

  // ---- sticky header -----------------------------------------------------

  private queueStickyUpdate(): void {
    if (this.stickyQueued) return;
    this.stickyQueued = true;
    const run = () => {
      this.stickyQueued = false;
      if (this.stopped) return;
      this.updateStickyHeaders();
      // After the header has moved: controls that point at it follow
      this.followScroll();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  /**
   * Keeps each table's header in view while the page scrolls past the table.
   * CSS `position: sticky` cannot do it: the table sits in a sideways
   * scrolling box, which captures sticky positioning. So the header is moved
   * down with a transform, never past the table's last row.
   */
  private updateStickyHeaders(): void {
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      const head = info?.table.tHead;
      if (!info || !head || renderedTable(widget) !== info.table) continue;
      // Held below the page top (with room for the toolbar), or, in a table
      // scrolled inside its own box, at the top of that box
      const pageTop = (this.scrollParentOf(widget)?.getBoundingClientRect().top ?? 0) + STICKY_GAP;
      const boxTop = this.scrollsInside(widget) ? widget.getBoundingClientRect().top : -Infinity;
      const table = info.table.getBoundingClientRect();
      const offset = Math.max(0, Math.min(Math.max(pageTop, boxTop) - table.top, table.height - head.offsetHeight));
      head.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
      head.classList.toggle("tp-stuck", offset > 0);
    }
  }

  /** Whether a table is taller than its box (the maximum height setting) and scrolls inside it */
  private scrollsInside(widget: HTMLElement): boolean {
    return widget.scrollHeight > widget.clientHeight + 1;
  }

  private scrollParentOf(element: HTMLElement): HTMLElement | undefined {
    const win = this.doc.defaultView!;
    for (let el = element.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(win.getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
    }
    return undefined;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.menu) {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu(true);
      return;
    }
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.toLowerCase();
    const step = mod && key === "z" ? (e.shiftKey ? "redo" : "undo") : mod && key === "y" && !e.shiftKey ? "redo" : undefined;
    const inEditor = e.target instanceof Element && !!e.target.closest(EDITOR_SELECTOR);
    if (step && inEditor && this.bridge[step] && this.bridge.getCursor) {
      e.preventDefault();
      e.stopPropagation();
      void this.historyStep(step);
    }
  };

  // ---- undo / redo of table edits ----------------------------------------

  /**
   * Undo moves the editor's cursor back to where it was before an edit and
   * scrolls to it. Table Plus edits away from that cursor, so before each edit
   * it puts the cursor right after the table (outside it, so the table stays
   * rendered) and remembers that position: an undo or redo that lands there
   * undid a table edit, and the page is scrolled back to where it was.
   */
  private async placeHistoryMarker(text: string, from: number, to: number): Promise<number | undefined> {
    if (!this.bridge.setSelection) return undefined;
    const marker = to < text.length ? to + 1 : from > 0 ? from - 1 : undefined;
    if (marker === undefined) return undefined;
    await this.bridge.setSelection(marker, marker);
    this.historyMarkers.add(marker);
    if (this.historyMarkers.size > 500) this.historyMarkers.delete(this.historyMarkers.values().next().value!);
    return marker;
  }

  private async historyStep(step: "undo" | "redo"): Promise<void> {
    const editor = this.doc.querySelector<HTMLElement>(EDITOR_SELECTOR);
    const scroller = editor && this.scrollParentOf(editor);
    const top = scroller?.scrollTop;
    await this.bridge[step]!();
    const cursor = await this.bridge.getCursor!();
    if (!scroller || top === undefined || !this.historyMarkers.has(cursor)) return;
    // After the editor's own scroll, which runs in the next animation frame
    const restore = () => {
      scroller.scrollTop = top;
    };
    const win = this.doc.defaultView!;
    restore();
    if (!win.requestAnimationFrame) return;
    win.requestAnimationFrame(() => {
      restore();
      win.requestAnimationFrame(restore);
    });
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Control") this.setNavigating(false);
  };

  // While Ctrl is held in a cell editor, arrows move between cells: the pointer shows it
  private setNavigating(on: boolean): void {
    this.doc.body.classList.toggle("tp-navigating", on);
  }

  private onMouseMove = (e: MouseEvent): void => {
    // A pressed button: dragging a scrollbar or selecting; the controls stay where they are
    if (this.dragging || this.menu || e.buttons !== 0) return;
    const target = e.target;
    if (target instanceof Node && this.isFloating(target)) {
      this.cancelHide();
      return;
    }
    const hit = this.enhancedWidgetOf(target);
    if (!hit) {
      if (!this.overScrollbar(e)) this.scheduleHide();
      return;
    }
    const [widget, info] = hit;
    this.cancelHide();
    if (this.hoverWidget !== widget) {
      this.hoverWidget = widget;
      this.showTableControls(widget, info);
    }
    if (this.editor) {
      this.hideHandles();
      return;
    }
    // Not over a cell (e.g. the table's own scrollbar): the grips stay on the last cell
    const cell = this.tableCellOf(info, target);
    if (cell && cell !== this.hoverCell) this.showHandles(widget, info, cell);
  };

  /** Whether the pointer is over the scrollbar of the element under it */
  private overScrollbar(e: MouseEvent): boolean {
    const el = e.target;
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - el.clientLeft;
    const y = e.clientY - rect.top - el.clientTop;
    return (el.clientWidth > 0 && x >= el.clientWidth) || (el.clientHeight > 0 && y >= el.clientHeight);
  }

  // ---- cell editing ------------------------------------------------------

  private cellRef(info: WidgetInfo, cell: HTMLTableCellElement): CellRef | undefined {
    const tr = cell.parentElement as HTMLTableRowElement | null;
    if (!tr) return undefined;
    const row = tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow);
    return Number.isInteger(row) ? { row, column: cell.cellIndex } : undefined;
  }

  private cellAt(info: WidgetInfo, ref: CellRef): HTMLTableCellElement | undefined {
    const tr =
      ref.row === 0
        ? info.table.rows[0]
        : info.table.querySelector<HTMLTableRowElement>(`tr[data-tp-row="${ref.row}"]`);
    if (!tr || tr.classList.contains("tp-hidden")) return undefined;
    return tr.cells[ref.column];
  }

  private openEditor(
    widget: HTMLElement,
    info: WidgetInfo,
    cell: HTMLTableCellElement,
    select = false,
  ): void {
    const ref = this.cellRef(info, cell);
    if (!ref || this.editor) return;
    const original = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";

    // The cell keeps its size while its content is swapped for the field
    const cellStyle = cell.getAttribute("style");
    const rect = cell.getBoundingClientRect();
    if (rect.width > 0) {
      cell.style.boxSizing = "border-box";
      cell.style.width = `${rect.width}px`;
      cell.style.minWidth = `${rect.width}px`;
      cell.style.maxWidth = `${rect.width}px`;
      cell.style.height = `${rect.height}px`;
    }

    const field = this.doc.createElement("input");
    field.type = "text";
    field.className = `${UI_CLASS} tp-cell-editor`;
    // A small intrinsic width, so the field never widens the column
    field.size = 1;
    field.spellcheck = true;
    field.value = unescapeCell(original);
    const kept = this.doc.createDocumentFragment();
    while (cell.firstChild) kept.append(cell.firstChild);
    cell.classList.add("tp-editing");
    cell.append(field);
    this.editor = { widget, cell, ...ref, original, field, kept, cellStyle };
    this.reveal(widget, cell);
    this.hideHandles();

    this.isolate(field);
    field.addEventListener("blur", () => {
      // Focus went elsewhere on purpose: save, but leave the focus there
      if (this.editor?.field === field) void this.finishEditing(true, undefined, false);
    });
    field.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Control") this.setNavigating(true);
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && MOVE_KEYS.has(e.key)) {
        e.preventDefault();
        void this.moveWithKeyboard(e.key);
      } else if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && NAVIGATION_KEYS.has(e.key)) {
        e.preventDefault();
        void this.navigate(e.key);
      } else if (e.key === "Escape") {
        e.preventDefault();
        void this.finishEditing(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.enter(e.shiftKey);
      } else if (e.key === "Tab") {
        e.preventDefault();
        void this.step(e.shiftKey ? -1 : 1);
      }
    });
    field.focus({ preventScroll: true });
    if (select) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
  }

  /** Puts the rendered cell back; returns what was being edited */
  private closeEditor(): (ActiveEditor & { value: string }) | undefined {
    const active = this.editor;
    if (!active) return undefined;
    this.editor = undefined;
    let value = escapeCell(active.field.value);
    if (active.row === 0 && value === "" && active.original !== "") {
      // SilverBullet would not show a column without a name
      value = active.original;
      void this.bridge.flash("Table Plus: a column needs a name; the old name was kept", "info");
    }
    active.field.remove();
    active.cell.classList.remove("tp-editing");
    if (active.cellStyle === null) active.cell.removeAttribute("style");
    else active.cell.setAttribute("style", active.cellStyle);
    active.cell.append(active.kept);
    return { ...active, value };
  }

  /**
   * Ends editing, saving the cell if asked and changed, then opens `next`
   * (a cell of the same or another table) or hands the keyboard back to the editor.
   */
  private async finishEditing(
    save: boolean,
    next?: CellRef & { widget: HTMLElement },
    refocus = true,
  ): Promise<void> {
    const closed = this.closeEditor();
    if (!closed) return;
    const changed = save && closed.value !== closed.original;
    const sameTable = next?.widget === closed.widget;
    let result: WriteResult = "unchanged";
    if (changed) {
      result = await this.write(closed.widget, (t) => this.withCellEdit(t, closed), sameTable ? next : undefined);
    }
    if (next && (result === "unchanged" || !sameTable)) {
      // The other table was not re-rendered by this edit unless they share text
      const info = this.infos.get(next.widget);
      const cell = info && this.cellAt(info, next);
      if (info && cell) this.openEditor(next.widget, info, cell);
      return;
    }
    if (!next && refocus) this.focusEditor(closed.widget);
  }

  private withCellEdit(
    table: Table,
    edit: { row: number; column: number; original: string; value: string },
  ): Table | undefined {
    if ((table.rows[edit.row]?.cells[edit.column] ?? "") !== edit.original) return undefined;
    return setCell(table, edit.row, edit.column, edit.value);
  }

  /** A setting's value, falling back to its default when unset or not valid */
  private async setting<K extends keyof typeof SETTINGS>(name: K): Promise<SettingValue<K>> {
    const { path, parse } = SETTINGS[name];
    const fallback = SETTINGS[name].default as SettingValue<K>;
    try {
      const value = (parse as (v: unknown) => SettingValue<K> | undefined)(
        await this.bridge.getConfig?.(path, fallback),
      );
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Enter saves the cell. With the "moveDown" setting it then edits
   * the cell below (Shift+Enter: above), as in a spreadsheet; at the table's
   * edge it just saves.
   */
  private async enter(up: boolean): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    if ((await this.setting("enterKey")) !== "moveDown" || this.editor !== active) {
      if (this.editor === active) await this.finishEditing(true);
      return;
    }
    const shown = this.shownRows(info);
    const target = shown[shown.indexOf(active.cell.parentElement as HTMLTableRowElement) + (up ? -1 : 1)];
    const cell = target?.cells[active.column];
    const ref = cell && this.cellRef(info, cell);
    await this.finishEditing(true, ref ? { widget: active.widget, ...ref } : undefined);
  }

  /** The header row and the shown body rows, in display order */
  private shownRows(info: WidgetInfo): HTMLTableRowElement[] {
    return [
      info.table.rows[0]!,
      ...Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")),
    ];
  }

  /**
   * Ctrl+Shift+arrows: move the edited cell's row up / down, or its column
   * left / right; Ctrl+Shift+Home / End: its column to the first / last place.
   * The cell is saved in the same edit and the editor stays on it. Rows cannot
   * move while sorted or filtered, nor the header row.
   */
  private async moveWithKeyboard(key: string): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const vertical = key === "ArrowUp" || key === "ArrowDown";
    const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
    const from = vertical ? active.row : active.column;
    const to = key === "Home" ? 0 : key === "End" ? info.columns - 1 : from + step;
    if (to === from) return;
    if (vertical) {
      if (from === 0) return;
      if (this.rearranged(info)) {
        void this.bridge.flash(`Table Plus: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
      if (to < 1 || to >= parseTable(info.source).rows.length) return;
    } else if (to < 0 || to >= info.columns) {
      return;
    }
    const closed = this.closeEditor()!;
    await this.write(
      closed.widget,
      (t) => {
        const edited = closed.value !== closed.original ? this.withCellEdit(t, closed) : t;
        if (!edited) return undefined;
        return vertical ? moveRow(edited, from, to) : moveColumn(edited, from, to);
      },
      vertical ? { row: to, column: closed.column } : { row: closed.row, column: to },
      vertical ? undefined : (c) => columnAfterMove(c, from, to),
    );
  }

  /**
   * Ctrl+arrows: save and edit the neighbouring shown cell; Ctrl+Home / End:
   * the first / last cell of the row. Nothing happens at the table's edge.
   */
  private async navigate(key: string): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const shown = this.shownRows(info);
    let r = shown.indexOf(active.cell.parentElement as HTMLTableRowElement);
    let column = active.column;
    if (key === "ArrowLeft") column--;
    else if (key === "ArrowRight") column++;
    else if (key === "ArrowUp") r--;
    else if (key === "ArrowDown") r++;
    else if (key === "Home") column = 0;
    else if (key === "End") column = info.columns - 1;
    const target = shown[r]?.cells[column];
    if (!target || target === active.cell) return;
    const ref = this.cellRef(info, target);
    if (ref) await this.finishEditing(true, { widget: active.widget, ...ref });
  }

  /** Tab / Shift+Tab: save and move to the next / previous shown cell */
  private async step(direction: 1 | -1): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const shown = this.shownRows(info);
    const rowIndex = shown.indexOf(active.cell.parentElement as HTMLTableRowElement);
    let r = rowIndex;
    let column = active.column + direction;
    if (column >= info.columns) {
      column = 0;
      r++;
    } else if (column < 0) {
      column = info.columns - 1;
      r--;
    }
    if (r < 0) {
      await this.finishEditing(true);
      return;
    }
    const target = shown[r];
    if (target) {
      const ref = this.cellRef(info, target.cells[column] ?? target.cells[0]!);
      if (ref) await this.finishEditing(true, { widget: active.widget, ...ref });
      return;
    }
    // Tab on the last cell adds a row
    const closed = this.closeEditor()!;
    const rowsBefore = parseTable(info.source).rows.length;
    await this.write(
      closed.widget,
      (t) => {
        const edited = closed.value !== closed.original ? this.withCellEdit(t, closed) : t;
        return edited && insertRow(edited, edited.rows.length);
      },
      { row: rowsBefore, column: 0 },
    );
  }

  private takePendingFocus(widget: HTMLElement, info: WidgetInfo): void {
    const pending = this.pendingFocus;
    if (!pending || pending.key !== info.key) return;
    this.pendingFocus = undefined;
    if (Date.now() > pending.until || this.editor) return;
    const cell = this.cellAt(info, pending);
    if (cell) this.openEditor(widget, info, cell, pending.select);
  }

  /** Scrolls a wide table sideways so that the cell is fully visible */
  /**
   * Scrolls so that the cell is fully visible: a wide table sideways, the page
   * up or down, keeping a body cell clear of the header held at the top
   */
  private reveal(widget: HTMLElement, cell: HTMLElement): void {
    const box = widget.getBoundingClientRect();
    let rect = cell.getBoundingClientRect();
    if (rect.right > box.right) widget.scrollLeft += rect.right - box.right;
    else if (rect.left < box.left) widget.scrollLeft -= box.left - rect.left;

    const head = this.infos.get(widget)?.table.tHead;
    const headHeight = head && !head.contains(cell) ? head.offsetHeight : 0;
    if (this.scrollsInside(widget)) {
      rect = cell.getBoundingClientRect();
      if (rect.top < box.top + headHeight) widget.scrollTop -= box.top + headHeight - rect.top;
      else if (rect.bottom > box.bottom) widget.scrollTop += rect.bottom - box.bottom;
    }

    const scroller = this.scrollParentOf(widget);
    if (!scroller) return;
    rect = cell.getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    const top = view.top + (headHeight ? STICKY_GAP + headHeight : 0);
    if (rect.top < top) scroller.scrollTop -= top - rect.top;
    else if (rect.bottom > view.bottom) scroller.scrollTop += rect.bottom - view.bottom;
  }

  private focusEditor(widget: HTMLElement): void {
    widget.closest<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
  }

  // ---- writing markdown --------------------------------------------------

  /**
   * Re-reads the table from the page, applies `change` and writes the result
   * back as one edit. `change` returns undefined to abort.
   */
  private async write(
    widget: HTMLElement,
    change: (table: Table) => Table | undefined,
    focus?: FocusTarget,
    columnMap?: (column: number) => number | undefined,
  ): Promise<WriteResult> {
    const info = this.infos.get(widget);
    if (!info) return "failed";
    try {
      const text = await this.bridge.getText();
      const range = locateBySource(text, info.hint, info.source);
      const changed = range && change(parseTable(range.text));
      if (!range || !changed) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const markdown = serializeTable(changed);
      if (markdown === range.text) return "unchanged";
      if (columnMap) this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
      if (focus) this.pendingFocus = { key: info.key, ...focus, until: Date.now() + 3000 };
      this.scrollLefts.set(info.key, widget.scrollLeft);
      this.scrollTops.set(info.key, widget.scrollTop);
      const edit = minimalEdit(range.text, markdown);
      const marker = await this.placeHistoryMarker(text, range.from, range.to);
      await this.bridge.replaceRange(range.from + edit.from, range.from + edit.to, edit.insert);
      if (marker !== undefined) {
        // Redo restores the cursor where the edit left it: the marker, moved by the edit
        this.historyMarkers.add(marker + (marker > range.from + edit.from ? markdown.length - range.text.length : 0));
      }
      return "written";
    } catch (e) {
      this.pendingFocus = undefined;
      console.error("Table Plus: could not save the table", e);
      void this.bridge.flash(`Table Plus: could not save the table (${String(e)})`, "error");
      return "failed";
    }
  }

  /** Shows the table's markdown by moving the cursor into it: to its start, or into a cell */
  private async showMarkdown(info: WidgetInfo, at?: CellRef & { within: number }): Promise<void> {
    const range = locateBySource(await this.bridge.getText(), info.hint, info.source);
    if (!range) {
      void this.bridge.flash(NOT_SAVED.replace(", nothing was saved", ""), "error");
      return;
    }
    this.hideFloating();
    this.closeMenu(false);
    const offset = at ? cellSourceOffset(range.text, at.row, at.column, at.within) : 0;
    await this.bridge.moveCursor(range.from + offset);
  }

  private appendRow(): void {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info) return;
    const rows = parseTable(info.source).rows.length;
    void this.write(widget, (t) => insertRow(t, t.rows.length), {
      row: rows,
      column: this.firstVisibleColumn(widget, info),
    });
  }

  /** The leftmost column in view, so editing a new row does not scroll a wide table back */
  private firstVisibleColumn(widget: HTMLElement, info: WidgetInfo): number {
    const left = widget.getBoundingClientRect().left;
    const cells = Array.from(info.table.rows[0]!.cells);
    const index = cells.findIndex((cell) => cell.getBoundingClientRect().left >= left - 1);
    return Math.max(0, index);
  }

  private appendColumn(): void {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info) return;
    void this.write(widget, (t) => insertColumn(t, t.align.length), { row: 0, column: info.columns, select: true });
  }

  // ---- floating UI: toolbar, grips, add buttons --------------------------

  private floating<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
  ): HTMLElementTagNameMap[K] {
    const element = this.doc.createElement(tag);
    element.className = `tp-floating ${className}`;
    element.addEventListener("mousedown", (e) => {
      // keep the focus where it is (e.g. in a filter field)
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
    this.doc.body.append(element);
    return element;
  }

  private floatingButton(className: string, title: string, icon: string): HTMLButtonElement {
    const button = this.floating("button", className);
    button.type = "button";
    button.tabIndex = -1;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = icon;
    return button;
  }

  private isFloating(node: Node): boolean {
    return (
      [this.bar, this.rowGrip, this.columnGrip, this.addRow, this.addColumn].some((el) => el.contains(node)) ||
      !!this.menu?.element.contains(node)
    );
  }

  private place(element: HTMLElement, left: number, top: number): void {
    const win = this.doc.defaultView!;
    const maxLeft = Math.max(4, win.innerWidth - element.offsetWidth - 4);
    element.style.left = `${Math.round(Math.max(4, Math.min(left, maxLeft)))}px`;
    element.style.top = `${Math.round(top)}px`;
    element.classList.add("tp-visible");
  }

  private cancelHide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  private scheduleHide(): void {
    if (!this.hoverWidget || this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.hideFloating();
    }, 300);
  }

  private hideHandles(): void {
    for (const el of [this.rowGrip, this.columnGrip]) el.classList.remove("tp-visible");
    this.hoverCell = undefined;
    this.handleTarget = undefined;
  }

  private hideFloating(): void {
    this.hideHandles();
    for (const el of [this.bar, this.addRow, this.addColumn]) el.classList.remove("tp-visible");
    this.hoverWidget = undefined;
  }

  /** The toolbar above the table and the add-row / add-column buttons */
  private showTableControls(widget: HTMLElement, info: WidgetInfo): void {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    if (view.sort) {
      // "Sorted by Name ↓ ×": the cross goes back to the order as written
      const { column, direction } = view.sort;
      const name = cellText(info.table.rows[0]!.cells[column]!) || `column ${column + 1}`;
      const chip = this.doc.createElement("span");
      chip.className = "tp-status tp-chip";
      chip.textContent = `Sorted by ${name} ${direction === "asc" ? "↑" : "↓"}`;
      const clear = this.doc.createElement("button");
      clear.type = "button";
      clear.tabIndex = -1;
      clear.className = "tp-chip-clear";
      clear.title = "Clear sorting: show the rows as written";
      clear.setAttribute("aria-label", clear.title);
      clear.innerHTML = ICONS.clear;
      clear.addEventListener("click", (e) => {
        e.preventDefault();
        this.setView(widget, info, withoutSort(this.viewOf(info)));
      });
      chip.append(clear);
      bar.append(chip);
    }
    const rows = this.bodyRows(info);
    const shown = rows.filter((tr) => !tr.classList.contains("tp-hidden")).length;
    if (shown !== rows.length) {
      const status = this.doc.createElement("span");
      status.className = "tp-status";
      status.textContent = `${shown} of ${rows.length} rows`;
      bar.append(status);
    }
    const button = (label: string, title: string, run: () => void, pressed?: boolean) => {
      const b = this.doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.textContent = label;
      b.title = title;
      if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        run();
      });
      bar.append(b);
    };
    button(
      "Filter",
      "Show or hide the filter row",
      () => {
        // Hidden filters would hide rows without a visible reason, so hiding clears them
        const current = this.viewOf(info);
        this.setView(
          widget,
          info,
          current.showFilters ? { ...current, filters: [], showFilters: false } : { ...current, showFilters: true },
        );
      },
      view.showFilters,
    );
    button("Edit markdown", "Show this table as markdown", () => void this.showMarkdown(info));

    const rect = widget.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    // The header as shown, which may be held at the top of the view
    const headerRect = info.table.rows[0]!.getBoundingClientRect();
    const viewTop = this.scrollParentOf(widget)?.getBoundingClientRect().top ?? 0;
    bar.classList.add("tp-visible");
    const above = headerRect.top - bar.offsetHeight - BAR_GAP;
    // No room above the header: over the header's right end instead
    const fits = above >= viewTop + 2;
    const top = fits ? above : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    this.place(bar, rect.right - bar.offsetWidth - (fits ? 0 : 6), top);

    this.addRow.classList.add("tp-visible");
    const inView = this.shownRect(widget, info);
    this.place(this.addRow, inView.left, inView.bottom + 4);
    this.addColumn.classList.add("tp-visible");
    this.place(
      this.addColumn,
      Math.min(tableRect.right, rect.right) + 4,
      headerRect.top + (headerRect.height - this.addColumn.offsetHeight) / 2,
    );
  }

  private showHandles(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    this.hoverCell = cell;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    this.handleTarget = { widget, info, column: ref.column, ...(ref.row > 0 ? { row: ref.row } : {}) };
    const tr = cell.parentElement as HTMLTableRowElement;
    // The part of a wide table in view: the table itself may be scrolled sideways
    const shown = this.shownRect(widget, info);
    const rearranged = this.rearranged(info);

    if (ref.row > 0) {
      const rowRect = tr.getBoundingClientRect();
      this.rowGrip.classList.toggle("tp-no-drag", rearranged);
      this.rowGrip.title = rearranged ? `Row: click for actions (${MOVE_BLOCKED.toLowerCase()})` : "Row: click for actions, drag to move";
      this.place(this.rowGrip, shown.left - 22, rowRect.top + (rowRect.height - 18) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0]!.cells[ref.column];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      // Centered on the column, as far as the column is in view
      const center = Math.max(shown.left + 9, Math.min(h.left + h.width / 2, shown.right - 9));
      this.place(this.columnGrip, center - 9, h.top - 9);
    }
  }

  /** Where a table is in view: the table, cut to the box that scrolls it sideways */
  private shownRect(
    widget: HTMLElement,
    info: WidgetInfo,
  ): { left: number; right: number; top: number; bottom: number } {
    const box = widget.getBoundingClientRect();
    const table = info.table.getBoundingClientRect();
    return {
      left: Math.max(box.left, table.left),
      right: Math.min(box.right, table.right),
      top: Math.max(box.top, table.top),
      bottom: Math.min(box.bottom, table.bottom),
    };
  }

  // ---- grips: click opens a menu, drag moves -----------------------------

  private onGripPointerDown(e: PointerEvent, axis: Axis): void {
    const target = this.handleTarget;
    if (e.button !== 0 || !target || (axis === "row" && target.row === undefined)) return;
    e.preventDefault();
    const grip = axis === "row" ? this.rowGrip : this.columnGrip;
    const canDrag = axis === "column" || !this.rearranged(target.info);
    const win = this.doc.defaultView!;
    const startX = e.clientX;
    const startY = e.clientY;
    let drag: ReturnType<Controller["beginDrag"]> | undefined;

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
      win.removeEventListener("keydown", escape, true);
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
    win.addEventListener("keydown", escape, true);
  }

  private beginDrag(target: HandleTarget, axis: Axis): { move: (e: PointerEvent) => void; finish: (commit: boolean) => void } {
    const { widget, info } = target;
    const from = axis === "row" ? target.row! : target.column;
    const table = info.table;
    const header = table.rows[0]!;
    const bodyRows = this.bodyRows(info);
    const carried =
      axis === "row"
        ? bodyRows.filter((tr) => Number(tr.dataset.tpRow) === from)
        : [header, ...bodyRows].map((tr) => tr.cells[from]).filter((c): c is HTMLTableCellElement => !!c);
    carried.forEach((el) => el.classList.add("tp-dragged"));
    const line = this.floating("div", "tp-drop tp-visible");
    this.doc.body.classList.add("tp-dragging");
    this.dragging = true;
    let slot = from;

    // A slot is "before item i"; one past the last item means "at the end"
    const move = (ev: PointerEvent) => {
      const tableRect = table.getBoundingClientRect();
      const shown = this.shownRect(widget, info);
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
      this.doc.body.classList.remove("tp-dragging");
      this.dragging = false;
      this.hideHandles();
      const to = slot > from ? slot - 1 : slot;
      if (!commit || to === from) return;
      if (axis === "row") void this.write(widget, (t) => moveRow(t, from, to));
      else void this.write(widget, (t) => moveColumn(t, from, to), undefined, (c) => columnAfterMove(c, from, to));
    };
    return { move, finish };
  }

  // ---- menus -------------------------------------------------------------

  private toggleMenu(axis: Axis, target: HandleTarget, anchor: HTMLElement): void {
    if (this.menu?.axis === axis) {
      this.closeMenu(true);
      return;
    }
    this.closeMenu(false);
    const { widget, info } = target;
    const element =
      axis === "row"
        ? renderMenu(this.doc, `Row ${target.row}`, this.rowMenu(widget, info, target.row!, target.column))
        : renderMenu(
            this.doc,
            `Column: ${cellText(info.table.rows[0]!.cells[target.column]!) || target.column + 1}`,
            this.columnMenu(widget, info, target.column),
          );
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    this.doc.body.append(element);
    this.menu = { element, axis, widget, anchor };
    this.positionMenu();
    anchor.classList.add("tp-active");
    focusMenu(element);
  }

  /** Rows: to the right of the grip; columns: below it; always inside the window */
  private positionMenu(): void {
    if (!this.menu) return;
    const { element, axis, anchor } = this.menu;
    const win = this.doc.defaultView!;
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
    const hadFocus = menu.element.contains(this.doc.activeElement);
    menu.element.remove();
    this.rowGrip.classList.remove("tp-active");
    this.columnGrip.classList.remove("tp-active");
    this.hideHandles();
    if (refocus && hadFocus) this.focusEditor(menu.widget);
  }

  private runAndClose(run: () => void): () => void {
    return () => {
      this.closeMenu(false);
      run();
    };
  }

  // `column`: the hovered column, where editing a new row starts
  private rowMenu(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[] {
    const rows = parseTable(info.source).rows.length;
    const rearranged = this.rearranged(info);
    const edit = (change: (t: Table) => Table | undefined, focus?: FocusTarget) =>
      this.runAndClose(() => void this.write(widget, change, focus));
    return [
      { kind: "item", label: "Insert row above", icon: ICONS.rowAbove, run: edit((t) => insertRow(t, row), { row, column }) },
      {
        kind: "item",
        label: "Insert row below",
        icon: ICONS.rowBelow,
        run: edit((t) => insertRow(t, row + 1), { row: row + 1, column }),
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: edit((t) => duplicateRow(t, row)) },
      { kind: "separator" },
      {
        kind: "item",
        label: "Move up",
        icon: ICONS.arrowUp,
        run: edit((t) => moveRow(t, row, row - 1)),
        disabled: rearranged ? MOVE_BLOCKED : row <= 1 ? "Already the first row" : undefined,
      },
      {
        kind: "item",
        label: "Move down",
        icon: ICONS.arrowDown,
        run: edit((t) => moveRow(t, row, row + 1)),
        disabled: rearranged ? MOVE_BLOCKED : row >= rows - 1 ? "Already the last row" : undefined,
      },
      { kind: "separator" },
      { kind: "item", label: "Delete row", icon: ICONS.trash, danger: true, run: edit((t) => deleteRow(t, row)) },
    ];
  }

  private columnMenu(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    const view = this.viewOf(info);
    const sorted = view.sort?.column === column ? view.sort.direction : undefined;
    const align = parseTable(info.source).align[column] ?? "";
    const edit = (
      change: (t: Table) => Table | undefined,
      focus?: FocusTarget,
      columnMap?: (c: number) => number | undefined,
    ) => this.runAndClose(() => void this.write(widget, change, focus, columnMap));
    const sortBy = (next: ViewState) => this.runAndClose(() => this.setView(widget, info, next));
    const alignTo = (target: Align) => edit((t) => setAlign(t, column, align === target ? "" : target));
    const entries: MenuEntry[] = [
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
          this.setView(widget, info, { ...this.viewOf(info), showFilters: true });
          info.table.querySelector<HTMLInputElement>(`.tp-filter[data-tp-column="${column}"]`)?.focus();
        }),
      },
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
        run: edit((t) => insertColumn(t, column), { row: 0, column, select: true }, (c) => (c >= column ? c + 1 : c)),
      },
      {
        kind: "item",
        label: "Insert column right",
        icon: ICONS.columnRight,
        run: edit((t) => insertColumn(t, column + 1), { row: 0, column: column + 1, select: true }, (c) =>
          c > column ? c + 1 : c,
        ),
      },
      {
        kind: "item",
        label: "Move left",
        icon: ICONS.arrowLeft,
        run: edit((t) => moveColumn(t, column, column - 1), undefined, (c) => columnAfterMove(c, column, column - 1)),
        disabled: column === 0 ? "Already the first column" : undefined,
      },
      {
        kind: "item",
        label: "Move right",
        icon: ICONS.arrowRight,
        run: edit((t) => moveColumn(t, column, column + 1), undefined, (c) => columnAfterMove(c, column, column + 1)),
        disabled: column >= info.columns - 1 ? "Already the last column" : undefined,
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Delete column",
        icon: ICONS.trash,
        danger: true,
        run: edit((t) => deleteColumn(t, column), undefined, (c) => (c === column ? undefined : c > column ? c - 1 : c)),
        disabled: info.columns <= 1 ? "A table needs at least one column" : undefined,
      },
    );
    return entries;
  }
}
