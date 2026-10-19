// Enhances SilverBullet's rendered markdown tables in place: sorting, filtering,
// inline cell editing and row/column editing. Every change to the markdown is
// one `editor.replaceRange`, so undo works as for any other edit.
import { type Bridge, SETTINGS, type SettingValue } from "./bridge.ts";
import type {
  CellEditor,
  CellRef,
  Feature,
  TableHost,
  ToolbarButton,
  WidgetInfo,
  WriteOptions,
  WriteResult,
  WriteStep,
} from "./core/feature.ts";
import { CellEditing } from "./core/editor.ts";
import { insertColumnWith, insertRowWith } from "./core/structure.ts";
import { Autoscroll } from "./features/autoscroll.ts";
import { ColumnTypes } from "./features/types.ts";
import { Expressions } from "./features/expressions.ts";
import { Formulas } from "./features/formulas.ts";
import { Grips } from "./features/grips.ts";
import { History } from "./features/history.ts";
import { Metadata } from "./features/metadata.ts";
import { Paste } from "./features/paste.ts";
import { Selection } from "./features/selection.ts";
import { Sticky } from "./features/sticky.ts";
import {
  caretTextOffset,
  cellText,
  cellValue,
  EDITOR_SELECTOR,
  INTERACTIVE_SELECTOR,
  NATIVE_ACTION_SELECTOR,
  positionHint,
  renderedTable,
  UI_CLASS,
  WIDGET_SELECTOR,
} from "./dom.ts";
import { formulasAfterEdit } from "./formula/index.ts";
import { ICONS } from "./icons.ts";
import {
  cellSourceOffset,
  locateBySource,
  locateByShape,
  locateWithEmptyHeaders,
  minimalEdit,
  parseTable,
  serializeTable,
  type Table,
} from "./markdown.ts";
import type { MenuEntry } from "./menu.ts";
import { metadataAfterEdit, metaPins, metaSort, withMetaSort } from "./meta.ts";
import { appendColumnAt, appendRowAt } from "./pins.ts";
import { nameEmptyHeaders, reorderRows } from "./ops.ts";
import {
  cycleSort,
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_VIEW,
  type FilterOptions,
  withPins,
  isRearranged,
  parseFilter,
  remapColumns,
  type ViewState,
  visibleRows,
  withFilter,
  withoutSort,
  withSort,
} from "./view.ts";

// The cell editor as features see it, and what it takes to put the cell back


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


// Toolbar distance above the header: clear of the column grip on the header's top edge
const BAR_GAP = 10;

// A sorting is stored (metadata setting) once the clicks have settled
const STORE_SORT_DELAY_MS = 400;



const FILTER_HINT =
  "Text to find. Also: >10 <10 >=10 <=10 (numbers), /pattern/ (regular expression; /pattern/c is case-sensitive), =text (whole cell), !filter (not)";

const NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";

/**
 * Puts the rows at the end of `parent`, in this order, moving only those out
 * of place: rows already in order keep their DOM node where it is (moving the
 * row of a focused cell editor would take its focus).
 */
function placeAtEnd(parent: Element, rows: readonly HTMLTableRowElement[]): void {
  let next: Node | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const tr = rows[i]!;
    if (tr.parentElement !== parent || tr.nextSibling !== next) parent.insertBefore(tr, next);
    next = tr;
  }
}

export class Controller implements TableHost {
  private readonly infos = new WeakMap<HTMLElement, WidgetInfo>();
  private readonly enhancing = new WeakSet<HTMLElement>();
  private readonly views = new Map<string, ViewState>();
  private filterOptions: FilterOptions = DEFAULT_FILTER_OPTIONS;
  // The maximum table height setting, in pixels; 0: no limit
  private maxHeight = 0;
  // The metadata setting, for menus that offer pinning
  private metadataOn = false;
  // Sideways scroll of each wide table, carried over to its next rendering
  private readonly scrollLefts = new Map<string, number>();
  // The same for tables taller than the maximum height setting, scrolled inside
  private readonly scrollTops = new Map<string, number>();
  private readonly cellEditor: CellEditing;
  private hoverWidget: HTMLElement | undefined;
  private hoverCell: HTMLTableCellElement | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private scanQueued = false;
  // Set by stop(): work already scheduled then does nothing
  private stopped = false;
  // Rows are being rearranged: a cell editor losing its focus to that is not left
  private movingRows = false;
  private settingsTimer: ReturnType<typeof setTimeout> | undefined;
  private settingsReadAt = 0;
  private readonly sortTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stickyQueued = false;
  private warnedIncompatible = false;
  private observer: MutationObserver | undefined;
  private readonly bar: HTMLElement;
  private readonly addRow: HTMLButtonElement;
  private readonly addColumn: HTMLButtonElement;
  // Features that keep their own state and work through this controller (core/feature.ts)
  private readonly features: readonly Feature[];
  private readonly metadata: Metadata;
  private readonly expressions: Expressions;
  // Steps every write goes through after the edit, in this order
  private readonly writeSteps: readonly WriteStep[] = [formulasAfterEdit, metadataAfterEdit];

  constructor(
    readonly doc: Document,
    public bridge: Bridge,
  ) {
    this.metadata = new Metadata(this);
    this.expressions = new Expressions(this);
    // In the order they get events
    this.features = [
      // First: the header moves before what follows it
      new Sticky(this),
      new Autoscroll(this),
      new Grips(this),
      new Formulas(this),
      // After formulas: a formula's result is shown in its column's type
      new ColumnTypes(this),
      this.metadata,
      new Paste(this),
      new Selection(this),
      this.expressions,
      new History(this),
    ];
    this.cellEditor = new CellEditing(this, {
      features: this.features,
      isolate: (element) => this.isolate(element),
      endHover: () => this.endHover(false),
      movingRows: () => this.movingRows,
    });
    this.bar = this.floating("div", "tp-bar");
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

    this.addRow.addEventListener("click", () => this.appendRow());
    this.addColumn.addEventListener("click", () => this.appendColumn());

    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    for (const feature of this.features) feature.start?.();
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
    for (const feature of this.features) feature.stop?.();
    win.removeEventListener("keyup", this.onKeyUp, true);
    win.removeEventListener("blur", this.onBlur);
    this.doc.removeEventListener("mousemove", this.onMouseMove);
    this.observer?.disconnect();
    clearTimeout(this.settingsTimer);
    for (const timer of this.sortTimers.values()) clearTimeout(timer);
    for (const el of [this.bar, this.addRow, this.addColumn]) el.remove();
  }

  private onBlur = (): void => this.cellEditor.setNavigating(false);

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

  /**
   * Whether settings may be stored in this table: the metadata setting is on,
   * or the table already has a metadata row (which keeps being used and
   * updated with the setting off, until it is empty or removed).
   */
  private async metadataAllowed(info: WidgetInfo): Promise<boolean> {
    return info.metaRow || (await this.setting("metadata"));
  }

  /** Asks before a destructive change, with SilverBullet's dialog (else the browser's) */
  async ask(question: string): Promise<boolean> {
    return this.bridge.confirm
      ? await this.bridge.confirm(question, { destructive: true })
      : this.doc.defaultView!.confirm(question);
  }

  /**
   * Sorts the rows in the markdown as the view sorts them (the shown values;
   * rows a filter hides too, pinned rows staying where they are), once
   * confirmed, then ends the sorting view: the table now is in that order.
   */
  private async applySort(shownWidget: HTMLElement, shownInfo: WidgetInfo): Promise<void> {
    const view = this.viewOf(shownInfo);
    if (!view.sort) return;
    const name = cellText(shownInfo.table.rows[0]!.cells[view.sort.column]!) || `column ${view.sort.column + 1}`;
    const arrow = view.sort.direction === "asc" ? "\u2191" : "\u2193";
    const question = `Sort the rows in the markdown by ${name} ${arrow}? This changes the order of the rows in the file. Ctrl+Z brings it back.`;
    if (!(await this.ask(question))) return;
    // A sorting still to be stored would undo this
    clearTimeout(this.sortTimers.get(shownInfo.key));
    this.sortTimers.delete(shownInfo.key);
    const [widget, info] = this.current(shownWidget, shownInfo);
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellValue));
    const { top, bottom } = info.pins;
    const middle = visibleRows(values, withPins({ ...view, filters: [] }, info.pins), this.filterOptions);
    const order = [
      ...rows.slice(0, top).map((_, i) => i + 1),
      ...middle.map((i) => i + 1),
      ...rows.slice(rows.length - bottom).map((_, i) => rows.length - bottom + i + 1),
    ];
    this.views.set(info.key, withoutSort(view));
    const position = new Map(order.map((row, i) => [row, i + 1]));
    await this.write(widget, (t) => withMetaSort(reorderRows(t, order), undefined), {
      rowMap: (r) => (r === 0 ? 0 : position.get(r)),
    });
    this.focusEditor(widget);
  }

  /**
   * The sorting a table's metadata stored ends with the metadata, so the rows
   * show as written. Without filters the view is forgotten, so Ctrl+Z (the
   * metadata back) shows the stored sorting again.
   */
  forgetStoredSort(key: string): void {
    clearTimeout(this.sortTimers.get(key));
    this.sortTimers.delete(key);
    const view = this.views.get(key);
    if (view && view.filters.some((f) => f !== "")) this.views.set(key, withoutSort(view));
    else this.views.delete(key);
  }

  /**
   * The table as rendered now: a write (e.g. of a stored sorting) re-renders
   * it, so controls made for the earlier rendering look it up when used
   */
  private current(widget: HTMLElement, info: WidgetInfo): [HTMLElement, WidgetInfo] {
    const now = this.widgetForKey(info.key);
    const nowInfo = now && this.infos.get(now);
    return now && nowInfo ? [now, nowInfo] : [widget, info];
  }

  /** Re-reads settings the view depends on, and re-applies the views if they changed */
  private async refreshSettings(): Promise<void> {
    const smart = (await this.setting("smartFilters")) === true;
    const maxHeight = await this.setting("maxHeight");
    this.metadataOn = await this.setting("metadata");
    this.cellEditor.selectOnClick = await this.setting("selectOnClick");
    if (this.stopped || (smart === this.filterOptions.smart && maxHeight === this.maxHeight)) return;
    this.filterOptions = { smart };
    this.maxHeight = maxHeight;
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
    this.queueStickyUpdate();
  }

  rearranged(info: WidgetInfo): boolean {
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
      const model = parseTable(range.text);
      const info: WidgetInfo = {
        table,
        source: range.text,
        hint: range.from,
        key: `${page}#${range.ordinal}`,
        columns: shape.columns,
        metaRow: model.meta !== undefined,
        rows: model.rows.length,
        pins: metaPins(model),
      };
      // The sorting stored in the table is the view the first time the table shows
      const stored = metaSort(model);
      if (stored && !this.views.has(info.key)) this.views.set(info.key, withSort(DEFAULT_VIEW, stored.column, stored.direction));
      // The table under the pointer was rendered anew (after a write): its toolbar moves over
      const replaced = this.hoverWidget && !this.hoverWidget.isConnected && this.infos.get(this.hoverWidget)?.key === info.key;
      this.infos.set(widget, info);
      if (replaced) this.hoverWidget = widget;
      this.decorate(widget, info);
      this.applyView(widget, info);
      const scrollLeft = this.scrollLefts.get(info.key);
      if (scrollLeft) widget.scrollLeft = scrollLeft;
      const scrollTop = this.scrollTops.get(info.key);
      if (scrollTop) widget.scrollTop = scrollTop;
      this.cellEditor.takePending(widget, info);
      for (const feature of this.features) feature.enhanced?.(widget, info);
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
    const metaRow = info.metaRow ? rows.pop() : undefined;
    metaRow?.classList.add("tp-meta-row");
    // Pinned rows and columns carry the pin icon of their menu item
    const mark = (icon: string, title: string) => {
      const span = this.doc.createElement("span");
      span.className = `${UI_CLASS} tp-pin-mark`;
      span.title = title;
      span.innerHTML = icon;
      return span;
    };
    const { top, bottom, left, right } = info.pins;
    rows.slice(1).forEach((tr, i) => {
      const row = i + 1;
      tr.dataset.tpRow = String(row);
      if (row <= top) tr.cells[0]?.append(mark(ICONS.pinTop, "Pinned to the top"));
      else if (row > rows.length - 1 - bottom) tr.cells[0]?.append(mark(ICONS.pinBottom, "Pinned to the bottom"));
    });
    Array.from(rows[0]!.cells).forEach((cell, column) => {
      if (column < left) cell.append(mark(ICONS.pinLeft, "Pinned to the left"));
      else if (column >= info.columns - right) cell.append(mark(ICONS.pinRight, "Pinned to the right"));
      const button = this.doc.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.className = `${UI_CLASS} tp-sort`;
      button.dataset.tpAction = "sort";
      button.dataset.tpColumn = String(column);
      cell.append(button);
    });
    for (const feature of this.features) feature.decorate?.(widget, info);
  }

  // ---- view: sort and filter --------------------------------------------

  viewOf(info: WidgetInfo): ViewState {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }

  setView(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    this.views.set(info.key, view);
    this.applyView(widget, info);
  }

  /**
   * A view change that may change the sorting. With the metadata setting on,
   * the sorting is also stored in the table, so it is the table's view next time.
   */
  setSort(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    this.setView(widget, info, view);
    // Clicks in a row store only where they end, in the table as rendered then
    clearTimeout(this.sortTimers.get(info.key));
    this.sortTimers.set(
      info.key,
      setTimeout(() => {
        this.sortTimers.delete(info.key);
        void this.storeSort(info.key);
      }, STORE_SORT_DELAY_MS),
    );
  }

  private async storeSort(key: string): Promise<void> {
    const widget = this.widgetForKey(key);
    const info = widget && this.infos.get(widget);
    if (this.stopped || !widget || !info || !(await this.metadataAllowed(info))) return;
    const view = this.views.get(key) ?? DEFAULT_VIEW;
    const sort = view.sort ? { column: view.sort.column, direction: view.sort.direction } : undefined;
    await this.write(widget, (t) => withMetaSort(t, sort));
  }

  // ---- host API for features (core/feature.ts) ----------------------------

  infoOf(widget: HTMLElement): WidgetInfo | undefined {
    return this.infos.get(widget);
  }

  get editing(): CellEditor | undefined {
    return this.cellEditor.active;
  }

  columnMenuEntries(
    widget: HTMLElement,
    info: WidgetInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[] {
    return this.features.flatMap((f) => f.columnMenuEntries?.(widget, info, column, open) ?? []);
  }

  get metadataEnabled(): boolean {
    return this.metadataOn;
  }

  takeEditor(): { widget: HTMLElement; row: number; column: number; save: (table: Table) => Table | undefined } | undefined {
    const closed = this.cellEditor.close();
    return closed && { widget: closed.widget, row: closed.row, column: closed.column, save: (t) => this.cellEditor.withSaved(t, closed) };
  }

  /** The "Table Plus: Remove table metadata" command */
  removeAllMetadata(): Promise<void> {
    return this.metadata.removeFromPage();
  }

  /** SilverBullet's `page:index` event */
  pageIndexed(name: string): Promise<void> {
    return this.expressions.pageIndexed(name);
  }

  cancelEditing(): void {
    this.cellEditor.dropPending();
    if (this.cellEditor.active) void this.cellEditor.finish(false);
  }

  /** The rendered table a view key belongs to, if it is enhanced and on screen */
  widgetForKey(key: string): HTMLElement | undefined {
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info?.key === key && renderedTable(widget) === info.table) return widget;
    }
    return undefined;
  }

  bodyRows(info: WidgetInfo): HTMLTableRowElement[] {
    return Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow),
    );
  }

  applyView(widget: HTMLElement, info: WidgetInfo): void {
    const view = this.viewOf(info);
    const { top, bottom } = info.pins;
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellValue));
    const order = visibleRows(values, withPins(view, info.pins), this.filterOptions);
    const shown = new Set(order);
    const body = info.table.tBodies[0] ?? info.table;
    rows.forEach((tr, i) => {
      const pinned = i < top || i >= rows.length - bottom;
      tr.classList.toggle("tp-hidden", !pinned && !shown.has(i));
    });
    // Rows pinned to the top go with the header, rows pinned to the bottom into
    // the footer: both stay in view (features/sticky.ts). Then the shown rows,
    // the hidden ones and the (hidden) metadata row, last as in the markdown.
    const metaRow = info.table.querySelector<HTMLTableRowElement>("tr.tp-meta-row");
    const middle = rows.filter((_, i) => i >= top && i < rows.length - bottom);
    const bodyRows = [
      ...order.map((i) => rows[i]!),
      ...middle.filter((tr) => tr.classList.contains("tp-hidden")),
      ...(metaRow ? [metaRow] : []),
    ];
    // Moving the row of an open cell editor would take its focus: restored below
    const editing = this.cellEditor.active?.widget === widget ? this.cellEditor.active : undefined;
    const selection = editing && [editing.field.selectionStart, editing.field.selectionEnd];
    this.movingRows = true;
    try {
      const head = info.table.tHead;
      if (head) placeAtEnd(head, rows.slice(0, top));
      placeAtEnd(body, bodyRows);
      if (bottom > 0) placeAtEnd(info.table.tFoot ?? info.table.createTFoot(), rows.slice(rows.length - bottom));
    } finally {
      this.movingRows = false;
    }
    if (editing && this.cellEditor.active === editing && this.doc.activeElement !== editing.field) {
      editing.field.focus({ preventScroll: true });
      if (selection) editing.field.setSelectionRange(selection[0] ?? null, selection[1] ?? null);
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
    this.pinColumns(info);
    widget.classList.toggle("tp-rearranged", isRearranged(view, this.filterOptions));
    // A taller table scrolls inside its own box (the table box already has overflow: auto)
    widget.style.maxHeight = this.maxHeight > 0 ? `${this.maxHeight}px` : "";
    if (this.hoverWidget === widget) this.showTableControls(widget, info);
  }

  /**
   * Columns pinned to the left (right) stay at that edge while the table
   * scrolls sideways: CSS sticky, offset by the widths of the pinned columns
   * further out.
   */
  private pinColumns(info: WidgetInfo): void {
    for (const cell of Array.from(info.table.querySelectorAll<HTMLElement>(".tp-pin-left, .tp-pin-right"))) {
      cell.classList.remove("tp-pin-left", "tp-pin-right", "tp-pin-edge");
      cell.style.left = "";
      cell.style.right = "";
    }
    const { left, right } = info.pins;
    if (left + right === 0) return;
    const header = info.table.rows[0]!;
    const rows = Array.from(info.table.rows).filter((tr) => !tr.classList.contains("tp-meta-row"));
    const pin = (column: number, side: "left" | "right", offset: number, edge: boolean) => {
      for (const tr of rows) {
        const cell = tr.cells[column];
        if (!cell) continue;
        cell.classList.add(side === "left" ? "tp-pin-left" : "tp-pin-right");
        cell.classList.toggle("tp-pin-edge", edge);
        cell.style[side] = `${offset}px`;
      }
    };
    let offset = 0;
    for (let c = 0; c < left; c++) {
      pin(c, "left", offset, c === left - 1);
      offset += header.cells[c]?.getBoundingClientRect().width ?? 0;
    }
    offset = 0;
    for (let c = info.columns - 1; c >= info.columns - right; c--) {
      pin(c, "right", offset, c === info.columns - right);
      offset += header.cells[c]?.getBoundingClientRect().width ?? 0;
    }
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

  enhancedWidgetOf(target: EventTarget | null): [HTMLElement, WidgetInfo] | undefined {
    if (!(target instanceof Element)) return undefined;
    const widget = target.closest<HTMLElement>(WIDGET_SELECTOR);
    const info = widget && this.infos.get(widget);
    return widget && info && renderedTable(widget) === info.table ? [widget, info] : undefined;
  }

  tableCellOf(info: WidgetInfo, target: EventTarget | null): HTMLTableCellElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const cell = target.closest<HTMLTableCellElement>("td, th");
    if (!cell || cell.closest("table") !== info.table) return undefined;
    const row = cell.parentElement?.classList;
    return row?.contains("tp-filter-row") || row?.contains("tp-meta-row") ? undefined : cell;
  }

  private onMouseDown = (e: MouseEvent): void => {
    for (const feature of this.features) if (feature.mouseDown?.(e)) return;
    if (e.button !== 0) return;
    for (const feature of this.features) feature.beforeMouseDown?.(e);
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
    if (!cell || this.cellEditor.active?.cell === cell) return;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    for (const feature of this.features) if (feature.beforeCellPress?.(widget, info, ref, e)) return;
    // Shift+click selects the cell's text; the selectOnClick setting swaps that round
    const select = e.shiftKey !== this.cellEditor.selectOnClick;
    if (this.cellEditor.active) void this.cellEditor.finish(true, { widget, ...ref, select });
    else this.cellEditor.open(widget, info, cell, select);
    for (const feature of this.features) feature.afterCellPress?.(info, ref, e);
  };

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
    if (this.cellEditor.active) {
      void this.cellEditor.finish(true, undefined, false);
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
      this.setSort(widget, info, cycleSort(this.viewOf(info), Number(action.dataset.tpColumn)));
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
    if (this.features.some((f) => f.pointerBusy?.() === "drag")) return;
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info || renderedTable(widget) !== info.table || !this.isShown(widget, info, info.table)) {
      this.hideFloating(true);
      return;
    }
    this.showTableControls(widget, info);
    const cell = this.hoverCell;
    if (cell && cell.isConnected && this.isShown(widget, info, cell)) {
      for (const feature of this.features) feature.cellHovered?.(widget, info, cell);
    } else this.endHover(true);
  }

  /** Whether any of the element is in view: inside the page's scroll view and the table's sideways view */
  private isShown(widget: HTMLElement, info: WidgetInfo, element: Element): boolean {
    const rect = element.getBoundingClientRect();
    const view = this.scrollParentOf(widget)?.getBoundingClientRect();
    const box = this.innerBox(widget);
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

  // ---- layout: what follows scrolling ------------------------------------------

  /** Once per frame after scrolling or rendering: the sticky header, then what points at it */
  private queueStickyUpdate(): void {
    if (this.stickyQueued) return;
    this.stickyQueued = true;
    const run = () => {
      this.stickyQueued = false;
      if (this.stopped) return;
      for (const feature of this.features) feature.layoutChanged?.();
      // After the header has moved: controls that point at it follow
      this.followScroll();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  /** Where the table's box shows its content: without its border and scrollbars */
  innerBox(widget: HTMLElement): { left: number; right: number; top: number; bottom: number } {
    const rect = widget.getBoundingClientRect();
    const left = rect.left + widget.clientLeft;
    const top = rect.top + widget.clientTop;
    // Before layout (and in tests) clientWidth is 0: the whole box then
    const width = widget.clientWidth || rect.width;
    const height = widget.clientHeight || rect.height;
    return { left, right: left + width, top, bottom: top + height };
  }

  /** Whether a table is taller than its box (the maximum height setting) and scrolls inside it */
  scrollsInside(widget: HTMLElement): boolean {
    return widget.scrollHeight > widget.clientHeight + 1;
  }

  scrollParentOf(element: HTMLElement): HTMLElement | undefined {
    const win = this.doc.defaultView!;
    for (let el = element.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(win.getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) return el;
    }
    return undefined;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    for (const feature of this.features) if (feature.keyDown?.(e)) return;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Control") this.cellEditor.setNavigating(false);
  };

  private onMouseMove = (e: MouseEvent): void => {
    // A pressed button: dragging a scrollbar or selecting; the controls stay where they are
    if (this.features.some((f) => f.pointerBusy?.()) || e.buttons !== 0) return;
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
    if (this.cellEditor.active) {
      this.endHover(false);
      return;
    }
    // Not over a cell (e.g. the table's own scrollbar): the grips stay on the last cell
    const cell = this.tableCellOf(info, target);
    if (cell && cell !== this.hoverCell) {
      this.hoverCell = cell;
      for (const feature of this.features) feature.cellHovered?.(widget, info, cell);
    }
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

  cellRef(info: WidgetInfo, cell: HTMLTableCellElement): CellRef | undefined {
    const tr = cell.parentElement as HTMLTableRowElement | null;
    if (!tr) return undefined;
    const row = tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow);
    return Number.isInteger(row) ? { row, column: cell.cellIndex } : undefined;
  }

  /** The header row and the shown body rows, in display order */
  shownRows(info: WidgetInfo): HTMLTableRowElement[] {
    return [
      info.table.rows[0]!,
      ...Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")),
    ];
  }

  /** A setting's value, falling back to its default when unset or not valid */
  async setting<K extends keyof typeof SETTINGS>(name: K): Promise<SettingValue<K>> {
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

  cellAt(info: WidgetInfo, ref: CellRef, includeHidden = false): HTMLTableCellElement | undefined {
    const tr =
      ref.row === 0
        ? info.table.rows[0]
        : info.table.querySelector<HTMLTableRowElement>(`tr[data-tp-row="${ref.row}"]`);
    if (!tr || (tr.classList.contains("tp-hidden") && !includeHidden)) return undefined;
    return tr.cells[ref.column];
  }

  focusEditor(widget: HTMLElement): void {
    widget.closest<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
  }

  // ---- writing markdown --------------------------------------------------

  /**
   * Re-reads the table from the page, applies `change`, then the write steps
   * (formulas, metadata), and writes the result back as one edit. `change`
   * returns undefined to abort.
   */
  async write(
    widget: HTMLElement,
    change: (table: Table) => Table | undefined,
    options: WriteOptions = {},
  ): Promise<WriteResult> {
    const { focus, columnMap } = options;
    const info = this.infos.get(widget);
    if (!info) return "failed";
    try {
      const text = await this.bridge.getText();
      const range = locateBySource(text, info.hint, info.source);
      const before = range && parseTable(range.text);
      const edited = before && change(before);
      if (!range || !before || !edited) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const changed = this.writeSteps.reduce((table, step) => step(before, table, options), edited);
      // With the autoFormat setting every edited table is written aligned
      const format = await this.setting("autoFormat");
      const markdown = serializeTable(format ? { ...changed, padded: true } : changed);
      if (markdown === range.text) return "unchanged";
      if (columnMap) this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
      if (focus) this.cellEditor.editAfterWrite(info.key, focus);
      this.scrollLefts.set(info.key, widget.scrollLeft);
      this.scrollTops.set(info.key, widget.scrollTop);
      const edit = minimalEdit(range.text, markdown);
      const after: ((editFrom: number, lengthChange: number) => void)[] = [];
      for (const feature of this.features) {
        const then = await feature.beforeWrite?.(text, range.from, range.to);
        if (then) after.push(then);
      }
      await this.bridge.replaceRange(range.from + edit.from, range.from + edit.to, edit.insert);
      for (const then of after) then(range.from + edit.from, markdown.length - range.text.length);
      return "written";
    } catch (e) {
      this.cellEditor.dropPending();
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
    this.hideFloating(true);
    const offset = at ? cellSourceOffset(range.text, at.row, at.column, at.within) : 0;
    await this.bridge.moveCursor(range.from + offset);
  }

  private appendRow(): void {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info) return;
    void insertRowWith(this, widget, info, appendRowAt(info.pins, info.rows), this.firstVisibleColumn(widget, info));
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
    void insertColumnWith(this, widget, info, appendColumnAt(info.pins, info.columns));
  }

  // ---- floating UI: toolbar and add buttons ---------------------------------

  floating<K extends keyof HTMLElementTagNameMap>(
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

  isFloating(node: Node): boolean {
    return [this.bar, this.addRow, this.addColumn].some((el) => el.contains(node)) || this.features.some((f) => f.owns?.(node));
  }

  place(element: HTMLElement, left: number, top: number): void {
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

  /** No cell is hovered: the grips go, and with `closeMenus` an open menu */
  private endHover(closeMenus: boolean): void {
    this.hoverCell = undefined;
    for (const feature of this.features) feature.hoverEnded?.(closeMenus);
  }

  private hideFloating(closeMenus = false): void {
    this.endHover(closeMenus);
    for (const el of [this.bar, this.addRow, this.addColumn]) el.classList.remove("tp-visible");
    this.hoverWidget = undefined;
  }

  /** The toolbar above the table and the add-row / add-column buttons */
  private showTableControls(widget: HTMLElement, info: WidgetInfo): void {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    // A button with its label, or (with an icon) the icon alone, the label its accessible name
    const button = (item: ToolbarButton & { readonly pressed?: boolean }) => {
      const b = this.doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.title = item.title;
      if (item.icon) {
        b.className = "tp-bar-icon";
        b.setAttribute("aria-label", item.label);
        b.innerHTML = item.icon;
      } else b.textContent = item.label;
      if (item.attention) b.classList.add("tp-attention");
      if (item.pressed !== undefined) b.setAttribute("aria-pressed", String(item.pressed));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        item.run();
      });
      bar.append(b);
    };
    const featureButtons = this.features.flatMap((feature) => feature.toolbarButtons?.(widget, info) ?? []);
    // Icon buttons first, always in the same place
    for (const item of featureButtons.filter((b) => b.icon)) button(item);
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
        const [w, i] = this.current(widget, info);
        this.setSort(w, i, withoutSort(this.viewOf(i)));
      });
      // Apply: the rows are sorted in the markdown, and the sorting view ends
      const apply = this.doc.createElement("button");
      apply.type = "button";
      apply.tabIndex = -1;
      apply.className = "tp-chip-apply";
      apply.title = "Sort the rows in the markdown this way";
      apply.setAttribute("aria-label", apply.title);
      apply.innerHTML = ICONS.applySort;
      apply.addEventListener("click", (e) => {
        e.preventDefault();
        void this.applySort(widget, info);
      });
      chip.append(apply, clear);
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
    button({
      label: "Filter",
      title: "Show or hide the filter row",
      run: () => {
        // Hidden filters would hide rows without a visible reason, so hiding clears them
        const [w, i] = this.current(widget, info);
        const now = this.viewOf(i);
        this.setView(w, i, now.showFilters ? { ...now, filters: [], showFilters: false } : { ...now, showFilters: true });
      },
      pressed: view.showFilters,
    });
    for (const item of featureButtons.filter((b) => !b.icon)) button(item);
    button({
      label: "Edit markdown",
      title: "Show this table as markdown",
      run: () => void this.showMarkdown(this.current(widget, info)[1]),
    });

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

  /** Where a table is in view: the table, cut to the box that scrolls it sideways */
  shownRect(
    widget: HTMLElement,
    info: WidgetInfo,
  ): { left: number; right: number; top: number; bottom: number } {
    const box = this.innerBox(widget);
    const table = info.table.getBoundingClientRect();
    return {
      left: Math.max(box.left, table.left),
      right: Math.min(box.right, table.right),
      top: Math.max(box.top, table.top),
      bottom: Math.min(box.bottom, table.bottom),
    };
  }
}
