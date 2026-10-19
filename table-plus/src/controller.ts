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
import { columnIdOf } from "./columns.ts";
import { formatLuaNumber } from "./format.ts";
import {
  type Area,
  areaText,
  autofixFormula,
  completeFunction,
  type FunctionCompletion,
  columnRefText,
  formulaCell,
  formulaCount,
  formulaErrors,
  formulaHelp,
  formulaOf,
  type IndexMap,
  isErrorText,
  isFormulaInput,
  type PointedSpan,
  recalculate,
  type Reference,
  referenceSlot,
  referencedColumn,
  references,
  shiftReferences,
  withCalculatedCells,
  withColumnKeys,
  withoutFormulas,
} from "./formula/index.ts";
import { ICONS } from "./icons.ts";
import {
  type Align,
  cellSourceOffset,
  escapeCell,
  findTables,
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
import { parseClipboardCells, pasteCells, planPaste } from "./paste.ts";
import { followMetaSort, metaPins, metaSort, withMetaPins, withMetaSort } from "./meta.ts";
import {
  appendColumnAt,
  appendRowAt,
  clampColumnMove,
  clampRowMove,
  type ColumnZone,
  columnZone,
  deleteColumnPins,
  deleteRowPins,
  insertColumnAt,
  insertRowAt,
  pinColumn,
  pinRow,
  type RowZone,
  rowZone,
} from "./pins.ts";
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
  reorderRows,
  setAlign,
  setCell,
} from "./ops.ts";
import {
  cycleSort,
  DEFAULT_FILTER_OPTIONS,
  DEFAULT_VIEW,
  type FilterOptions,
  NO_PINS,
  type Pins,
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

type WidgetInfo = {
  readonly table: HTMLTableElement;
  // The table's markdown when it was rendered: the editor only reuses a
  // rendered table while its markdown stays exactly the same
  readonly source: string;
  readonly hint: number;
  readonly key: string;
  readonly columns: number;
  // The table ends with a metadata row (`<meta …>`), rendered as its last row
  readonly metaRow: boolean;
  // Rows in the markdown, the header included
  readonly rows: number;
  // Pinned rows and columns, as stored in the metadata row
  readonly pins: Pins;
  // Some formula cells show results from before the table was changed outside Table Plus
  readonly stale: boolean;
  // How many cells hold a formula (a <meta f> tag)
  readonly formulas: number;
};

type ActiveEditor = {
  readonly widget: HTMLElement;
  readonly cell: HTMLTableCellElement;
  readonly row: number;
  readonly column: number;
  readonly original: string;
  // What the field showed when it opened: the cell's text, or its formula
  readonly initial: string;
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

/** A table without its metadata row and without formulas (their cells keep their results) */
function withoutMetadata(table: Table): Table {
  const { meta: _meta, metaSource: _source, ...rest } = withoutFormulas(table);
  return rest;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Where the rows of the markdown go when a row is inserted at `at` */
function rowAfterInsert(at: number): IndexMap {
  return (r) => (r >= at ? r + 1 : r);
}

// Colors of the references of the formula being edited, in the order they are written
const REFERENCE_COLORS = ["#3b6fd4", "#d0453a", "#8a55c9", "#2f9a4a", "#d9771c", "#1c9c9c"];

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

// A sorting is stored (metadata setting) once the clicks have settled
const STORE_SORT_DELAY_MS = 400;

// Time the indexers get to write the index after `page:index`
const INDEX_SETTLE_MS = 500;

// Middle-button autoscroll: no movement within this distance of the start point
const AUTOSCROLL_DEAD_ZONE = 12;

// Ctrl+Alt + these keys move the edited cell's row or column
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

// Ctrl(+Shift) + these keys move the cell editor to another cell
const NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

// Rows a PageUp / PageDown jumps (Ctrl) or moves a row (Ctrl+Alt)
const PAGE_ROWS = 10;

const FILTER_HINT =
  "Text to find. Also: >10 <10 >=10 <=10 (numbers), /pattern/ (regular expression; /pattern/c is case-sensitive), =text (whole cell), !filter (not)";

const NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";
const MOVE_BLOCKED = "Clear sorting and filters to move rows";
const PASTE_BLOCKED = "Clear sorting and filters to paste cells: the rows shown are not where they would go";
const PIN_NEEDS_METADATA = "Pinning is stored in the table: turn on the Store table metadata setting (unpinning always works)";

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

export class Controller {
  private readonly infos = new WeakMap<HTMLElement, WidgetInfo>();
  private readonly enhancing = new WeakSet<HTMLElement>();
  private readonly views = new Map<string, ViewState>();
  private filterOptions: FilterOptions = DEFAULT_FILTER_OPTIONS;
  // The maximum table height setting, in pixels; 0: no limit
  private maxHeight = 0;
  // The metadata setting, for menus that offer pinning
  private metadataOn = false;
  // The selectOnClick setting: a plain click selects the cell's text
  private selectOnClick = false;
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
  // Rows are being rearranged: a cell editor losing its focus to that is not left
  private movingRows = false;
  private settingsTimer: ReturnType<typeof setTimeout> | undefined;
  private settingsReadAt = 0;
  private expressionTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly sortTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stickyQueued = false;
  private warnedIncompatible = false;
  private observer: MutationObserver | undefined;
  private readonly bar: HTMLElement;
  private readonly rowGrip: HTMLButtonElement;
  private readonly columnGrip: HTMLButtonElement;
  private readonly addRow: HTMLButtonElement;
  private readonly addColumn: HTMLButtonElement;
  private readonly formulaHint: HTMLElement;
  private referenceMarks: HTMLElement[] = [];
  private stopReferenceDrag: (() => void) | undefined;
  // The reference last inserted by pointing at the table, and the cell its range started at
  private pointed: (PointedSpan & { readonly field: HTMLInputElement; readonly anchor?: CellRef }) | undefined;
  private stopPointing: (() => void) | undefined;
  // The paste on its way was asked for with Ctrl+Shift+V: as new rows
  private pasteInserts = false;

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
    this.formulaHint = this.floating("div", "tp-formula-hint");
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
    clearTimeout(this.expressionTimer);
    for (const timer of this.sortTimers.values()) clearTimeout(timer);
    this.stopAutoscroll?.();
    this.closeMenu(false);
    this.stopPointing?.();
    this.hideFormulaUi();
    for (const el of [this.bar, this.rowGrip, this.columnGrip, this.addRow, this.addColumn, this.formulaHint]) el.remove();
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

  /**
   * Whether settings may be stored in this table: the metadata setting is on,
   * or the table already has a metadata row (which keeps being used and
   * updated with the setting off, until it is empty or removed).
   */
  private async metadataAllowed(info: WidgetInfo): Promise<boolean> {
    return info.metaRow || (await this.setting("metadata"));
  }

  /** Asks before a destructive change, with SilverBullet's dialog (else the browser's) */
  private async ask(question: string): Promise<boolean> {
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
    const values = rows.map((tr) => Array.from(tr.cells).map(cellText));
    const { top, bottom } = info.pins;
    const middle = visibleRows(values, withPins({ ...view, filters: [] }, info.pins), this.filterOptions);
    const order = [
      ...rows.slice(0, top).map((_, i) => i + 1),
      ...middle.map((i) => i + 1),
      ...rows.slice(rows.length - bottom).map((_, i) => rows.length - bottom + i + 1),
    ];
    this.views.set(info.key, withoutSort(view));
    const position = new Map(order.map((row, i) => [row, i + 1]));
    await this.write(
      widget,
      (t) => withMetaSort(reorderRows(t, order), undefined),
      undefined,
      undefined,
      undefined,
      (r) => (r === 0 ? 0 : position.get(r)),
    );
    this.focusEditor(widget);
  }

  /**
   * Removes a table's metadata, once confirmed: its metadata row (a sorting
   * stored there goes with it: the rows show as written) and the formulas of
   * its cells, which keep their results as plain values
   */
  private async removeMetadata(shownWidget: HTMLElement, shownInfo: WidgetInfo): Promise<void> {
    const removed = [
      ...(shownInfo.metaRow ? ["its stored settings (sorting, pinning)"] : []),
      ...(shownInfo.formulas ? [`its ${plural(shownInfo.formulas, "formula")}: those cells keep their current results as plain values`] : []),
    ];
    if (!(await this.ask(`Remove this table's metadata, ${removed.join(", and ")}? Ctrl+Z brings it back.`))) return;
    const [widget, info] = this.current(shownWidget, shownInfo);
    if (metaSort(parseTable(info.source))) this.dropStoredSort(info.key);
    await this.write(widget, withoutMetadata);
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.focusEditor(widget);
  }

  /**
   * The sorting a table's metadata stored ends with the metadata, so the rows
   * show as written. Without filters the view is forgotten, so Ctrl+Z (the
   * metadata back) shows the stored sorting again.
   */
  private dropStoredSort(key: string): void {
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

  /** Removes the metadata rows of all tables on the current page, once confirmed */
  async removeAllMetadata(): Promise<void> {
    const text = await this.bridge.getText();
    // From the last table up, so the earlier ones keep their positions
    const tables = findTables(text)
      .filter((range) => {
        const table = parseTable(range.text);
        return table.meta !== undefined || formulaCount(table) > 0;
      })
      .reverse();
    if (tables.length === 0) {
      void this.bridge.flash("Table Plus: no table on this page has metadata", "info");
      return;
    }
    const formulas = tables.reduce((n, range) => n + formulaCount(parseTable(range.text)), 0);
    const question =
      `Remove the metadata of ${tables.length === 1 ? "the 1 table" : `all ${tables.length} tables`} on this page` +
      (formulas ? `, including ${plural(formulas, "formula")} (those cells keep their current results as plain values)` : "") +
      "? Ctrl+Z brings it back.";
    if (!(await this.ask(question))) return;
    // One edit over the span of all those tables, so one Ctrl+Z undoes it
    const from = tables[tables.length - 1]!.from;
    const to = tables[0]!.to;
    let span = text.slice(from, to);
    const page = await this.bridge.getCurrentPage();
    for (const range of tables) {
      const table = parseTable(range.text);
      if (metaSort(table)) this.dropStoredSort(`${page}#${range.ordinal}`);
      span = span.slice(0, range.from - from) + serializeTable(withoutMetadata(table)) + span.slice(range.to - from);
    }
    const edit = minimalEdit(text.slice(from, to), span);
    await this.bridge.replaceRange(from + edit.from, from + edit.to, edit.insert);
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.doc.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
    void this.bridge.flash(`Table Plus: removed the metadata of ${tables.length} table(s)`, "info");
  }

  /** Re-reads settings the view depends on, and re-applies the views if they changed */
  private async refreshSettings(): Promise<void> {
    const smart = (await this.setting("smartFilters")) === true;
    const maxHeight = await this.setting("maxHeight");
    this.metadataOn = await this.setting("metadata");
    this.selectOnClick = await this.setting("selectOnClick");
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
        stale: recalculate(model) !== model,
        formulas: formulaCount(model),
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
    const model = parseTable(info.source);
    const errors = formulaErrors(model);
    rows.slice(1).forEach((tr, i) => {
      const row = i + 1;
      tr.dataset.tpRow = String(row);
      this.markFormulas(model, errors, row, tr);
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
  }

  /** Formula cells show that they hold one, and their formula (or error) on hover */
  private markFormulas(model: Table, errors: Map<string, string>, row: number, tr: HTMLTableRowElement): void {
    model.rows[row]?.cells.forEach((raw, column) => {
      const stored = formulaOf(raw);
      const cell = tr.cells[column];
      if (!stored || !cell) return;
      const error = isErrorText(stored.value) ? errors.get(`${row},${column}`) : undefined;
      cell.classList.add("tp-formula");
      cell.classList.toggle("tp-formula-error", !!error);
      cell.title = error ? `${stored.formula}\n${error}` : stored.formula;
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

  /**
   * A view change that may change the sorting. With the metadata setting on,
   * the sorting is also stored in the table, so it is the table's view next time.
   */
  private setSort(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
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

  /** The rendered table a view key belongs to, if it is enhanced and on screen */
  private widgetForKey(key: string): HTMLElement | undefined {
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info?.key === key && renderedTable(widget) === info.table) return widget;
    }
    return undefined;
  }

  private bodyRows(info: WidgetInfo): HTMLTableRowElement[] {
    return Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow),
    );
  }

  private applyView(widget: HTMLElement, info: WidgetInfo): void {
    const view = this.viewOf(info);
    const { top, bottom } = info.pins;
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellText));
    const order = visibleRows(values, withPins(view, info.pins), this.filterOptions);
    const shown = new Set(order);
    const body = info.table.tBodies[0] ?? info.table;
    rows.forEach((tr, i) => {
      const pinned = i < top || i >= rows.length - bottom;
      tr.classList.toggle("tp-hidden", !pinned && !shown.has(i));
    });
    // Rows pinned to the top go with the header, rows pinned to the bottom into
    // the footer: both stay in view (updateStickyHeaders). Then the shown rows,
    // the hidden ones and the (hidden) metadata row, last as in the markdown.
    const metaRow = info.table.querySelector<HTMLTableRowElement>("tr.tp-meta-row");
    const middle = rows.filter((_, i) => i >= top && i < rows.length - bottom);
    const bodyRows = [
      ...order.map((i) => rows[i]!),
      ...middle.filter((tr) => tr.classList.contains("tp-hidden")),
      ...(metaRow ? [metaRow] : []),
    ];
    // Moving the row of an open cell editor would take its focus: restored below
    const editing = this.editor?.widget === widget ? this.editor : undefined;
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
    if (editing && this.editor === editing && this.doc.activeElement !== editing.field) {
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
    const row = cell.parentElement?.classList;
    return row?.contains("tp-filter-row") || row?.contains("tp-meta-row") ? undefined : cell;
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
    // While a formula waits for a reference, a click or drag in its table inserts one
    if (this.pointReference(widget, info, ref, e)) return;
    // Shift+click selects the cell's text; the selectOnClick setting swaps that round
    const select = e.shiftKey !== this.selectOnClick;
    if (this.editor) void this.finishEditing(true, { widget, ...ref, select });
    else this.openEditor(widget, info, cell, select);
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
      if (this.editor && !this.stopReferenceDrag) this.updateFormulaUi();
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
      const boxTop = this.scrollsInside(widget) ? this.innerBox(widget).top : -Infinity;
      const table = info.table.getBoundingClientRect();
      // Rows pinned to the bottom first: held at the bottom of the view (the
      // page, or the table's box), never above the header's own place
      const foot = info.table.tFoot;
      const footHeight = foot?.offsetHeight ?? 0;
      let footTop = table.bottom - footHeight;
      if (foot && footHeight > 0) {
        const pageBottom = this.scrollParentOf(widget)?.getBoundingClientRect().bottom ?? this.doc.defaultView!.innerHeight;
        const boxBottom = this.scrollsInside(widget) ? this.innerBox(widget).bottom : Infinity;
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

  /** Where the table's box shows its content: without its border and scrollbars */
  private innerBox(widget: HTMLElement): { left: number; right: number; top: number; bottom: number } {
    const rect = widget.getBoundingClientRect();
    const left = rect.left + widget.clientLeft;
    const top = rect.top + widget.clientTop;
    // Before layout (and in tests) clientWidth is 0: the whole box then
    const width = widget.clientWidth || rect.width;
    const height = widget.clientHeight || rect.height;
    return { left, right: left + width, top, bottom: top + height };
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

  // ---- `${…}` cells: re-evaluated once the page index is up to date --------

  /**
   * SilverBullet renders a table right after Table Plus writes it, before the
   * page is re-indexed, so a `${…}` cell that reads the index (e.g. a formula
   * from a spreadsheet library) shows a stale result until the table renders
   * again. Once the page is indexed, Table Plus has SilverBullet re-evaluate
   * such cells (lua.evalExpression) and shows the new values in place.
   * `page:index` is the event the indexers write the index on, not a signal
   * that they are done, so the evaluation waits a moment for them.
   */
  async pageIndexed(name: string): Promise<void> {
    if (this.stopped || !this.bridge.evalExpression) return;
    if (name !== (await this.bridge.getCurrentPage())) return;
    clearTimeout(this.expressionTimer);
    this.expressionTimer = setTimeout(() => void this.refreshExpressions(), INDEX_SETTLE_MS);
  }

  private async refreshExpressions(): Promise<void> {
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (this.stopped || !info || !info.source.includes("${")) continue;
      const rows = parseTable(info.source).rows;
      let changed = false;
      for (let row = 0; row < rows.length; row++) {
        const cells = rows[row]!.cells;
        for (let column = 0; column < cells.length; column++) {
          // Only cells that are one expression: their shown text is its value
          const expression = /^\$\{([\s\S]+)\}$/.exec(cells[column]!.trim())?.[1];
          if (!expression) continue;
          let value: unknown;
          try {
            value = await this.bridge.evalExpression!(expression.replaceAll("\\|", "|"));
          } catch {
            continue;
          }
          const text =
            value === null || value === undefined
              ? ""
              : typeof value === "number"
                ? formatLuaNumber(value)
                : typeof value === "string" || typeof value === "boolean"
                  ? String(value)
                  : undefined;
          const cell = this.cellAt(info, { row, column }, true);
          if (text === undefined || !cell || cell === this.editor?.cell || renderedTable(widget) !== info.table) continue;
          if (cellText(cell) === text) continue;
          for (const node of Array.from(cell.childNodes)) {
            if (!(node instanceof Element && node.classList.contains(UI_CLASS))) node.remove();
          }
          cell.prepend(this.doc.createTextNode(text));
          changed = true;
        }
      }
      if (changed && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
  }

  private cellAt(info: WidgetInfo, ref: CellRef, includeHidden = false): HTMLTableCellElement | undefined {
    const tr =
      ref.row === 0
        ? info.table.rows[0]
        : info.table.querySelector<HTMLTableRowElement>(`tr[data-tp-row="${ref.row}"]`);
    if (!tr || (tr.classList.contains("tp-hidden") && !includeHidden)) return undefined;
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
    // A formula cell is edited as its formula (not in the header: a header is a name)
    const stored = ref.row > 0 ? formulaOf(original) : undefined;

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
    const text = unescapeCell(original);
    field.value = stored ? stored.formula : ref.row > 0 && text.startsWith("=") ? `'${text}` : text;
    const kept = this.doc.createDocumentFragment();
    while (cell.firstChild) kept.append(cell.firstChild);
    cell.classList.add("tp-editing");
    cell.append(field);
    this.editor = { widget, cell, ...ref, original, initial: field.value, field, kept, cellStyle };
    this.reveal(widget, cell);
    this.hideHandles();

    this.isolate(field);
    // The formula's references are shown in the table, its function explained under the cell
    for (const type of ["input", "keyup", "click", "focus"]) {
      field.addEventListener(type, () => {
        if (this.editor?.field === field && !this.stopReferenceDrag) this.updateFormulaUi();
      });
    }
    // Typing makes the reference just pointed at part of the formula: pointing no longer replaces it
    field.addEventListener("keydown", (e) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) this.pointed = undefined;
      // Ctrl+Shift+V pastes cells as new rows; the paste event does not tell Shift
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") this.pasteInserts = e.shiftKey;
    });
    // Cells copied from a spreadsheet go into the table; a single value into the field
    field.addEventListener("paste", (e) => {
      const insert = this.pasteInserts;
      this.pasteInserts = false;
      const data = parseClipboardCells(e.clipboardData?.getData("text/plain") ?? "");
      if (!data || this.editor?.field !== field) return;
      e.preventDefault();
      void this.pasteIntoTable(data, insert);
    });
    field.addEventListener("blur", () => {
      // Focus went elsewhere on purpose: save, but leave the focus there
      if (this.editor?.field === field && !this.movingRows) void this.finishEditing(true, undefined, false);
    });
    field.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Control") this.setNavigating(true);
      const ctrl = e.ctrlKey && !e.metaKey;
      if (ctrl && e.altKey && !e.shiftKey && MOVE_KEYS.has(e.key)) {
        e.preventDefault();
        void this.moveWithKeyboard(e.key);
      } else if (ctrl && !e.altKey && NAVIGATION_KEYS.has(e.key)) {
        e.preventDefault();
        void this.navigate(e.key, e.shiftKey);
      } else if (e.key === "Escape") {
        e.preventDefault();
        void this.finishEditing(false);
      } else if (e.key === "Enter" && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        void this.ctrlEnter();
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.enter(e.shiftKey);
      } else if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && this.completeFunctionName()) {
        // A function name being typed was completed: the editor stays
        e.preventDefault();
      } else if (e.key === "Tab") {
        e.preventDefault();
        void this.step(e.shiftKey ? -1 : 1);
      }
    });
    field.focus({ preventScroll: true });
    if (select) field.select();
    else field.setSelectionRange(field.value.length, field.value.length);
    this.updateFormulaUi();
  }

  /** Puts the rendered cell back; returns what was being edited */
  private closeEditor(): (ActiveEditor & { value: string }) | undefined {
    const active = this.editor;
    if (!active) return undefined;
    this.editor = undefined;
    this.stopPointing?.();
    this.pointed = undefined;
    this.hideFormulaUi();
    let value = this.cellValue(active);
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
   * The markdown for what the editor holds: the cell as it was when nothing was
   * changed, a formula cell for a formula (its result is written with the table),
   * else the text; a text that starts with "=" is typed as '=...
   */
  private cellValue(active: ActiveEditor): string {
    const typed = active.field.value;
    if (typed === active.initial) return active.original;
    if (active.row > 0 && isFormulaInput(typed)) {
      // Mistakes with only one possible fix (a missing ")") are fixed, and said so
      const { formula, fixes } = autofixFormula(typed.trim());
      if (fixes.length) void this.bridge.flash(`Table Plus: formula fixed: ${fixes.join(", ")}`, "info");
      // Column references are written by the columns' keys, as SilverBullet's queries name them
      const headers = parseTable(this.infos.get(active.widget)?.source ?? "").rows[0]?.cells ?? [];
      return formulaCell("", withColumnKeys(formula, headers));
    }
    return escapeCell(active.row > 0 && typed.startsWith("'=") ? typed.slice(1) : typed);
  }

  /**
   * Ends editing, saving the cell if asked and changed, then opens `next`
   * (a cell of the same or another table) or hands the keyboard back to the editor.
   */
  private async finishEditing(
    save: boolean,
    next?: FocusTarget & { widget: HTMLElement },
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
      if (info && cell) this.openEditor(next.widget, info, cell, next.select);
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
  /**
   * Ctrl+Enter: save the cell, add an empty row below its row and edit the
   * new row in the same column, as one edit. The ctrlEnterAddsRow setting off:
   * a plain Enter.
   */
  private async ctrlEnter(): Promise<void> {
    const active = this.editor;
    if (!active) return;
    if (!(await this.setting("ctrlEnterAddsRow")) || this.editor !== active) {
      if (this.editor === active) await this.enter(false);
      return;
    }
    const info = this.infos.get(active.widget);
    const closed = this.closeEditor()!;
    if (info) await this.insertRowWith(closed.widget, info, closed.row + 1, closed.column, (t) => this.withSaved(t, closed));
  }

  /** The table with the closed editor's value saved, if it changed */
  private withSaved(table: Table, closed: ActiveEditor & { value: string }): Table | undefined {
    return closed.value !== closed.original ? this.withCellEdit(table, closed) : table;
  }

  /**
   * Whether a cell reached with the keyboard opens with its text selected:
   * with Shift as on a Shift+click (the selectOnClick setting swaps that),
   * without it with the cursor at the end
   */
  private selectsWith(shift: boolean): boolean {
    return shift && !this.selectOnClick;
  }

  /** Enter: save; with the moveDown setting also edit the cell below (Shift: as on a Shift+click) */
  private async enter(shift: boolean): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    if ((await this.setting("enterKey")) !== "moveDown" || this.editor !== active) {
      if (this.editor === active) await this.finishEditing(true);
      return;
    }
    const shown = this.shownRows(info);
    const target = shown[shown.indexOf(active.cell.parentElement as HTMLTableRowElement) + 1];
    const cell = target?.cells[active.column];
    const ref = cell && this.cellRef(info, cell);
    await this.finishEditing(true, ref ? { widget: active.widget, ...ref, select: this.selectsWith(shift) } : undefined);
  }

  /** The header row and the shown body rows, in display order */
  private shownRows(info: WidgetInfo): HTMLTableRowElement[] {
    return [
      info.table.rows[0]!,
      ...Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")),
    ];
  }

  /**
   * Ctrl+Alt+arrows: move the edited cell's row up / down, or its column
   * left / right; Ctrl+Alt+Home / End: its column to the first / last place;
   * Ctrl+Alt+PageUp / PageDown: its row 10 places up / down.
   * The cell is saved in the same edit and the editor stays on it. Rows cannot
   * move while sorted or filtered, nor the header row.
   */
  private async moveWithKeyboard(key: string): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const vertical = key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
    const step = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
    const from = vertical ? active.row : active.column;
    const asked =
      key === "Home"
        ? 0
        : key === "End"
          ? info.columns - 1
          : key === "PageUp"
            ? from - PAGE_ROWS
            : key === "PageDown"
              ? from + PAGE_ROWS
              : from + step;
    if (vertical) {
      if (from === 0) return;
      if (this.rearranged(info)) {
        void this.bridge.flash(`Table Plus: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
    }
    // Pinned rows and columns stay within their zone, the others outside them
    const to = vertical
      ? clampRowMove(info.pins, info.rows, from, asked)
      : clampColumnMove(info.pins, info.columns, from, asked);
    if (to === from) return;
    const closed = this.closeEditor()!;
    await this.write(
      closed.widget,
      (t) => {
        const edited = this.withSaved(t, closed);
        if (!edited) return undefined;
        return vertical ? moveRow(edited, from, to) : moveColumn(edited, from, to);
      },
      vertical ? { row: to, column: closed.column } : { row: closed.row, column: to },
      vertical ? undefined : (c) => columnAfterMove(c, from, to),
      undefined,
      vertical ? (r) => columnAfterMove(r, from, to) : undefined,
    );
  }

  /**
   * Ctrl+arrows: save and edit the neighbouring shown cell; Ctrl+Home / End:
   * the first / last cell of the row. Nothing happens at the table's edge.
   * With Shift the cell opens as on a Shift+click.
   */
  private async navigate(key: string, shift: boolean): Promise<void> {
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
    // A page jump stops at the first / last body row; from the header it goes down only
    else if (key === "PageUp") r = r === 0 ? 0 : Math.max(1, r - PAGE_ROWS);
    else if (key === "PageDown") r = Math.min(shown.length - 1, r + PAGE_ROWS);
    const target = shown[r]?.cells[column];
    if (!target || target === active.cell) return;
    const ref = this.cellRef(info, target);
    if (ref) await this.finishEditing(true, { widget: active.widget, ...ref, select: this.selectsWith(shift) });
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
    // Tab on the last cell adds a row (above the rows pinned to the bottom)
    const closed = this.closeEditor()!;
    await this.insertRowWith(closed.widget, info, appendRowAt(info.pins, info.rows), 0, (t) => this.withSaved(t, closed));
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
    const box = this.innerBox(widget);
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

  // ---- formula editing: help and references -------------------------------

  /**
   * While a formula is edited: the help for what is typed under the cell, and
   * each reference outlined in the table in its own color, as in a spreadsheet.
   * An outline's edge moves the reference, its corner resizes a range.
   */
  private updateFormulaUi(): void {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    const formula = active?.field.value ?? "";
    if (!active || !info || active.row === 0 || !formula.trimStart().startsWith("=")) {
      this.hideFormulaUi();
      return;
    }
    const refs = references(formula);
    // Where a reference can go, the table shows that cells can be pointed at
    active.widget.classList.toggle("tp-pointing", this.pointingSlot(active) !== undefined);
    this.showFormulaHint(active, formula, refs);
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
    const headers = parseTable(info.source).rows[0]?.cells ?? [];
    refs.forEach((ref, index) => {
      const area = this.referenceArea(info, headers, ref, active.row - 1);
      if (!area) return;
      const color = REFERENCE_COLORS[index % REFERENCE_COLORS.length]!;
      const boxes = this.areaBoxes(active.widget, info, area);
      boxes.forEach((box, b) => {
        const mark = this.floating("div", "tp-ref-mark");
        mark.style.setProperty("--tp-ref-color", color);
        Object.assign(mark.style, {
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.right - box.left}px`,
          height: `${box.bottom - box.top}px`,
        });
        for (const side of ["top", "right", "bottom", "left"]) {
          const edge = this.doc.createElement("div");
          edge.className = `tp-ref-edge tp-ref-${side}`;
          edge.title = "Drag to move the reference";
          edge.addEventListener("pointerdown", (e) => this.dragReference(e, index, "move"));
          mark.append(edge);
        }
        // The corner is the area's last cell: on the last box when sorting splits the area
        if (ref.kind === "area" && b === boxes.length - 1) {
          const corner = this.doc.createElement("div");
          corner.className = "tp-ref-corner";
          corner.title = "Drag to resize the range";
          corner.addEventListener("pointerdown", (e) => this.dragReference(e, index, "resize"));
          mark.append(corner);
        }
        mark.classList.add("tp-visible");
        this.referenceMarks.push(mark);
      });
    });
  }

  /**
   * Pointing, as in a spreadsheet: while a formula is edited and its caret is
   * where a reference can go, a click on a cell of the same table inserts the
   * cell (A1), a drag the range (A1:B3), a click on a header the column
   * ([Qty]). Pointing again replaces the reference just inserted. Returns
   * whether the click was taken.
   */
  private pointReference(widget: HTMLElement, info: WidgetInfo, cell: CellRef, e: MouseEvent): boolean {
    const active = this.editor;
    if (!active || active.widget !== widget) return false;
    const slot = this.pointingSlot(active);
    if (!slot) return false;
    this.stopPointing?.();
    const field = active.field;
    let span = slot;
    const put = (text: string, anchor?: CellRef) => {
      this.replaceInField(field, span.from, span.to, text);
      span = { from: span.from, to: span.from + text.length };
      field.setSelectionRange(span.to, span.to);
      this.pointed = { field, ...span, text, anchor };
      this.updateFormulaUi();
    };
    if (cell.row === 0) {
      const headers = parseTable(info.source).rows[0]?.cells ?? [];
      const text = columnRefText(columnIdOf(headers, cell.column), false);
      // A header whose name cannot be a reference: the click is taken, but inserts nothing
      if (text) put(text);
      return true;
    }
    // Shift+click extends the range just pointed at, from the cell it started at
    const last = this.pointed;
    const anchor =
      e.shiftKey && last?.field === field && last.anchor && last.from === slot.from
        ? last.anchor
        : { row: cell.row - 1, column: cell.column };
    const areaTo = (to: CellRef): Area => ({
      top: Math.min(anchor.row, to.row),
      left: Math.min(anchor.column, to.column),
      bottom: Math.max(anchor.row, to.row),
      right: Math.max(anchor.column, to.column),
    });
    put(areaText(areaTo({ row: cell.row - 1, column: cell.column })), anchor);
    // Dragging with the button held makes it a range; it ends with the button,
    // a key, the window losing focus or the editor closing
    const win = this.doc.defaultView!;
    const end = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      win.removeEventListener("keydown", end, true);
      win.removeEventListener("blur", end);
      this.stopPointing = undefined;
    };
    const move = (ev: MouseEvent) => {
      if (this.editor?.field !== field || ev.buttons === 0) {
        end();
        return;
      }
      const to = this.bodyCellAt(info, ev.clientX, ev.clientY);
      const text = to && areaText(areaTo(to));
      if (text && text !== field.value.slice(span.from, span.to)) put(text, anchor);
    };
    const up = () => {
      end();
      if (this.editor?.field === field) field.focus({ preventScroll: true });
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", up, true);
    win.addEventListener("keydown", end, true);
    win.addEventListener("blur", end);
    this.stopPointing = end;
    return true;
  }

  /**
   * Pastes cells copied from a spreadsheet from the edited cell, as one edit:
   * over the cells there (insert false), or as new rows at the cell's row
   * (Ctrl+Shift+V). Cells with formulas keep them. Not while the table is
   * sorted or filtered: the rows shown are not where the cells would go.
   */
  private async pasteIntoTable(data: string[][], insert: boolean): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    if (this.rearranged(info)) {
      void this.bridge.flash(`Table Plus: ${PASTE_BLOCKED.toLowerCase()}`, "info");
      return;
    }
    const plan = planPaste(parseTable(info.source), info.pins, active, data, insert);
    if ("error" in plan) {
      void this.bridge.flash(`Table Plus: cannot paste here: ${plan.error}`, "error");
      return;
    }
    const closed = this.closeEditor()!;
    let skipped = 0;
    const { newRows, newColumns } = plan;
    const result = await this.write(
      closed.widget,
      (t) => {
        const edited = this.withSaved(t, closed);
        if (!edited) return undefined;
        const pasted = pasteCells(edited, plan, data);
        skipped = pasted.skipped;
        return pasted.table;
      },
      undefined,
      newColumns.count ? (c) => (c >= newColumns.at ? c + newColumns.count : c) : undefined,
      plan.pins,
      newRows.count ? (r) => (r >= newRows.at ? r + newRows.count : r) : undefined,
    );
    if (result !== "written") return;
    const width = Math.max(...data.map((r) => r.length));
    const added = [
      ...(newRows.count && !insert ? [`added ${plural(newRows.count, "row")}`] : []),
      ...(newColumns.count ? [`added ${plural(newColumns.count, "column")}`] : []),
      ...(skipped ? [`kept ${plural(skipped, "formula cell")}`] : []),
    ];
    const what = insert ? `${plural(data.length, "new row")}` : `${data.length} × ${width} cells`;
    void this.bridge.flash(`Table Plus: pasted ${what}${added.length ? ` (${added.join(", ")})` : ""}`, "info");
    this.focusEditor(closed.widget);
  }

  /** Tab while a function name is typed in a formula: completes it with its "(" */
  private completeFunctionName(): boolean {
    const active = this.editor;
    const completion = active && active.row > 0 ? this.functionCompletion(active) : undefined;
    if (!active || !completion) return false;
    const field = active.field;
    this.replaceInField(field, completion.from, completion.to, completion.text);
    const caret = completion.from + completion.text.length;
    field.setSelectionRange(caret, caret);
    this.updateFormulaUi();
    return true;
  }

  private functionCompletion(active: ActiveEditor): FunctionCompletion | undefined {
    const field = active.field;
    const length = field.value.length;
    return completeFunction(field.value, field.selectionStart ?? length, field.selectionEnd ?? length);
  }

  /** Where a reference pointed at in the table would go in the edited formula, if anywhere */
  private pointingSlot(active: ActiveEditor): { from: number; to: number } | undefined {
    if (active.row === 0) return undefined;
    const field = active.field;
    const length = field.value.length;
    const pointed = this.pointed?.field === field ? this.pointed : undefined;
    return referenceSlot(field.value, field.selectionStart ?? length, field.selectionEnd ?? length, pointed);
  }

  /**
   * Replaces part of the field's text, as typing would where the browser
   * allows it (so Ctrl+Z in the field undoes it), else directly
   */
  private replaceInField(field: HTMLInputElement, from: number, to: number, text: string): void {
    const expected = field.value.slice(0, from) + text + field.value.slice(to);
    field.setSelectionRange(from, to);
    try {
      if (typeof this.doc.execCommand === "function") this.doc.execCommand("insertText", false, text);
    } catch {
      // Not supported: set directly below
    }
    if (field.value !== expected) field.value = expected;
  }

  /** The formula with its references in their colors, and help for what is typed */
  private showFormulaHint(active: ActiveEditor, formula: string, refs: readonly Reference[]): void {
    const hint = this.formulaHint;
    hint.replaceChildren();
    if (refs.length) {
      const line = this.doc.createElement("div");
      line.className = "tp-formula-preview";
      let at = 0;
      refs.forEach((ref, index) => {
        line.append(formula.slice(at, ref.from));
        const span = this.doc.createElement("span");
        span.style.color = REFERENCE_COLORS[index % REFERENCE_COLORS.length]!;
        span.textContent = formula.slice(ref.from, ref.to);
        line.append(span);
        at = ref.to;
      });
      line.append(formula.slice(at));
      hint.append(line);
    }
    for (const help of formulaHelp(formula, active.field.selectionStart ?? formula.length).slice(0, 6)) {
      const item = this.doc.createElement("div");
      item.className = "tp-formula-help";
      const syntax = this.doc.createElement("code");
      syntax.textContent = help.syntax;
      const description = this.doc.createElement("span");
      description.textContent = help.description;
      item.append(syntax, description);
      hint.append(item);
    }
    const completion = this.functionCompletion(active);
    if (completion) {
      const tab = this.doc.createElement("div");
      tab.className = "tp-formula-tab";
      tab.textContent = `Tab: ${completion.text}`;
      hint.append(tab);
    }
    const rect = active.cell.getBoundingClientRect();
    this.place(hint, rect.left, rect.bottom + 4);
    const viewHeight = this.doc.defaultView!.innerHeight;
    if (rect.bottom + 4 + hint.offsetHeight > viewHeight && rect.top - 4 - hint.offsetHeight >= 0) {
      this.place(hint, rect.left, rect.top - 4 - hint.offsetHeight);
    }
  }

  private hideFormulaUi(): void {
    this.stopReferenceDrag?.();
    for (const widget of Array.from(this.doc.querySelectorAll(".tp-pointing"))) widget.classList.remove("tp-pointing");
    this.formulaHint.classList.remove("tp-visible");
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
  }

  /** The body rows and columns a reference covers, within the table; undefined if none */
  private referenceArea(info: WidgetInfo, headers: readonly string[], ref: Reference, row: number): Area | undefined {
    const lastRow = info.rows - 2;
    const lastColumn = info.columns - 1;
    if (ref.kind === "column") {
      const column = referencedColumn(headers, ref.name);
      if (column === undefined || lastRow < 0) return undefined;
      return ref.thisRow
        ? { top: row, left: column, bottom: row, right: column }
        : { top: 0, left: column, bottom: lastRow, right: column };
    }
    const { top, left, bottom, right } = ref.area;
    if (top > lastRow || left > lastColumn) return undefined;
    return { top, left, bottom: Math.min(bottom, lastRow), right: Math.min(right, lastColumn) };
  }

  /** The body rows as shown (header and filter row excluded), with their row in the markdown minus one */
  private shownBodyRows(info: WidgetInfo): { tr: HTMLTableRowElement; row: number }[] {
    return Array.from(info.table.rows)
      .filter((tr) => tr.dataset.tpRow !== undefined && !tr.classList.contains("tp-hidden"))
      .map((tr) => ({ tr, row: Number(tr.dataset.tpRow) - 1 }));
  }

  /**
   * Screen boxes outlining an area: one per run of its rows that are shown
   * next to each other (sorting and filters can split an area), clipped to
   * the table's visible box
   */
  private areaBoxes(widget: HTMLElement, info: WidgetInfo, area: Area): { left: number; top: number; right: number; bottom: number }[] {
    const clip = this.innerBox(widget);
    const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
    let run: HTMLTableRowElement[] = [];
    const flush = () => {
      const first = run[0]?.cells[area.left];
      const last = run[run.length - 1]?.cells[area.right];
      run = [];
      if (!first || !last) return;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      const box = {
        left: Math.max(Math.min(a.left, b.left), clip.left),
        top: Math.max(Math.min(a.top, b.top), clip.top),
        right: Math.min(Math.max(a.right, b.right), clip.right),
        bottom: Math.min(Math.max(a.bottom, b.bottom), clip.bottom),
      };
      if (box.right > box.left && box.bottom > box.top) boxes.push(box);
    };
    for (const { tr, row } of this.shownBodyRows(info)) {
      if (row >= area.top && row <= area.bottom) run.push(tr);
      else flush();
    }
    flush();
    return boxes;
  }

  /** The body cell (row in the markdown minus one, column) under a point, if any */
  private bodyCellAt(info: WidgetInfo, x: number, y: number): { row: number; column: number } | undefined {
    for (const { tr, row } of this.shownBodyRows(info)) {
      const rect = tr.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom) continue;
      const column = Array.from(tr.cells).findIndex((cell) => {
        const r = cell.getBoundingClientRect();
        return x >= r.left && x <= r.right;
      });
      return column < 0 ? undefined : { row, column };
    }
    return undefined;
  }

  /**
   * Dragging an outline's edge moves the reference to the cells under the
   * pointer (a column reference to another column); dragging a range's corner
   * resizes it. The formula in the editor changes as the pointer moves; Esc
   * puts it back.
   */
  private dragReference(e: PointerEvent, index: number, mode: "move" | "resize"): void {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (e.button !== 0 || !active || !info) return;
    // Not prevented: the mousedown that follows is (tp-floating), which keeps the focus in the field
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    const field = active.field;
    const originalFormula = field.value;
    const ref = references(originalFormula)[index];
    const headers = parseTable(info.source).rows[0]?.cells ?? [];
    const start = this.bodyCellAt(info, e.clientX, e.clientY);
    const startArea = ref && this.referenceArea(info, headers, ref, active.row - 1);
    if (!ref || !start || !startArea) return;
    const lastRow = info.rows - 2;
    const lastColumn = info.columns - 1;
    const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));
    this.stopReferenceDrag?.();
    this.doc.body.classList.add("tp-ref-dragging");

    const textFor = (cell: { row: number; column: number }): string | undefined => {
      const dRow = cell.row - start.row;
      const dColumn = cell.column - start.column;
      if (ref.kind === "column") {
        const column = clamp(startArea.left + dColumn, lastColumn);
        return columnRefText(columnIdOf(headers, column), ref.thisRow);
      }
      if (mode === "resize") {
        return areaText({
          top: Math.min(startArea.top, cell.row),
          left: Math.min(startArea.left, cell.column),
          bottom: Math.max(startArea.top, cell.row),
          right: Math.max(startArea.left, cell.column),
        });
      }
      const height = startArea.bottom - startArea.top;
      const width = startArea.right - startArea.left;
      const top = clamp(startArea.top + dRow, lastRow - height);
      const left = clamp(startArea.left + dColumn, lastColumn - width);
      return areaText({ top, left, bottom: top + height, right: left + width });
    };

    const win = this.doc.defaultView!;
    const move = (ev: PointerEvent) => {
      const cell = this.bodyCellAt(info, ev.clientX, ev.clientY);
      const current = references(field.value)[index];
      const text = cell && current && textFor(cell);
      if (!text || !current || field.value.slice(current.from, current.to) === text) return;
      this.replaceInField(field, current.from, current.to, text);
      const caret = current.from + text.length;
      field.setSelectionRange(caret, caret);
      this.updateFormulaUi();
    };
    const escape = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      field.value = originalFormula;
      finish();
    };
    const finish = () => {
      this.stopReferenceDrag?.();
      if (this.editor?.field === field) {
        field.focus({ preventScroll: true });
        this.updateFormulaUi();
      }
    };
    // Captured, so the drag ends even when the pointer is released outside the window;
    // a cancelled pointer (touch scroll, context menu) ends it too
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // No active pointer to capture (e.g. a synthetic event): the window listeners suffice
    }
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", finish);
    win.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    win.addEventListener("keydown", escape, true);
    this.stopReferenceDrag = () => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", finish);
      win.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", finish);
      win.removeEventListener("keydown", escape, true);
      this.doc.body.classList.remove("tp-ref-dragging");
      this.stopReferenceDrag = undefined;
    };
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
    // The pins after the edit, for edits that change them
    pins?: Pins,
    // Where each row of the markdown (header 0) goes, for edits that move rows
    rowMap?: IndexMap,
  ): Promise<WriteResult> {
    const info = this.infos.get(widget);
    if (!info) return "failed";
    try {
      const text = await this.bridge.getText();
      const range = locateBySource(text, info.hint, info.source);
      const before = range && parseTable(range.text);
      const changedTable = before && change(before);
      // Formula references follow moved rows and columns, then the results are written
      const shifted = changedTable && shiftReferences(before, changedTable, rowMap, columnMap);
      const edited = shifted && recalculate(shifted);
      if (!range || !before || !edited) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      // A stored sorting stays on its column: renamed, moved, or gone with it
      const followed = followMetaSort(before, edited, columnMap ?? ((c) => c));
      const changed = pins ? withMetaPins(followed, pins) : followed;
      // With the autoFormat setting every edited table is written aligned
      const format = await this.setting("autoFormat");
      const markdown = serializeTable(format ? { ...changed, padded: true } : changed);
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
    void this.insertRowWith(widget, info, appendRowAt(info.pins, info.rows), this.firstVisibleColumn(widget, info));
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
    void this.insertColumnWith(widget, info, appendColumnAt(info.pins, info.columns));
  }

  // ---- structural edits: pinned rows and columns keep the edges -------------

  /** Adds a row asked for at `at` (see insertRowAt) and edits it in `column` */
  private insertRowWith(
    widget: HTMLElement,
    info: WidgetInfo,
    at: number,
    column: number,
    prepare: (t: Table) => Table | undefined = (t) => t,
  ): Promise<WriteResult> {
    const insert = insertRowAt(info.pins, info.rows, at);
    return this.write(
      widget,
      (t) => {
        const prepared = prepare(t);
        // Columns that compute every row with the same formula compute the new row too
        return prepared && withCalculatedCells(insertRow(prepared, insert.at), insert.at);
      },
      { row: insert.at, column },
      undefined,
      insert.pins,
      rowAfterInsert(insert.at),
    );
  }

  private duplicateRowAt(widget: HTMLElement, info: WidgetInfo, row: number): Promise<WriteResult> {
    // The copy goes below the row, or above it when the row is the last one pinned to the bottom
    const insert = insertRowAt(info.pins, info.rows, row + 1);
    return this.write(
      widget,
      (t) => {
        const cells = t.rows[row]?.cells;
        return cells ? insertRow(t, insert.at, cells) : undefined;
      },
      undefined,
      undefined,
      insert.pins,
      rowAfterInsert(insert.at),
    );
  }

  private deleteRowAt(widget: HTMLElement, info: WidgetInfo, row: number): Promise<WriteResult> {
    return this.write(
      widget,
      (t) => deleteRow(t, row),
      undefined,
      undefined,
      deleteRowPins(info.pins, info.rows, row),
      (r) => (r === row ? undefined : r > row ? r - 1 : r),
    );
  }

  /** Moves a row, within its zone when pinned, outside the zones when not */
  private moveRowTo(widget: HTMLElement, info: WidgetInfo, from: number, asked: number): Promise<WriteResult> {
    const to = clampRowMove(info.pins, info.rows, from, asked);
    if (to === from) return Promise.resolve("unchanged");
    return this.write(widget, (t) => moveRow(t, from, to), undefined, undefined, undefined, (r) => columnAfterMove(r, from, to));
  }

  private insertColumnWith(widget: HTMLElement, info: WidgetInfo, at: number): Promise<WriteResult> {
    const insert = insertColumnAt(info.pins, info.columns, at);
    return this.write(
      widget,
      (t) => insertColumn(t, insert.at),
      { row: 0, column: insert.at, select: true },
      (c) => (c >= insert.at ? c + 1 : c),
      insert.pins,
    );
  }

  private deleteColumnAt(widget: HTMLElement, info: WidgetInfo, column: number): Promise<WriteResult> {
    return this.write(
      widget,
      (t) => deleteColumn(t, column),
      undefined,
      (c) => (c === column ? undefined : c > column ? c - 1 : c),
      deleteColumnPins(info.pins, info.columns, column),
    );
  }

  private moveColumnTo(widget: HTMLElement, info: WidgetInfo, from: number, asked: number): Promise<WriteResult> {
    const to = clampColumnMove(info.pins, info.columns, from, asked);
    if (to === from) return Promise.resolve("unchanged");
    return this.write(widget, (t) => moveColumn(t, from, to), undefined, (c) => columnAfterMove(c, from, to));
  }

  /** Pins a row to the top or bottom (moving it there), or unpins it; pinning needs the metadata setting */
  private async pinRowAt(widget: HTMLElement, info: WidgetInfo, row: number, pin: RowZone | undefined): Promise<void> {
    if (pin && !(await this.setting("metadata"))) return;
    const { to, pins } = pinRow(info.pins, info.rows, row, pin);
    await this.write(widget, (t) => moveRow(t, row, to), undefined, undefined, pins, (r) => columnAfterMove(r, row, to));
  }

  private async pinColumnAt(
    widget: HTMLElement,
    info: WidgetInfo,
    column: number,
    pin: ColumnZone | undefined,
  ): Promise<void> {
    if (pin && !(await this.setting("metadata"))) return;
    const { to, pins } = pinColumn(info.pins, info.columns, column, pin);
    await this.write(widget, (t) => moveColumn(t, column, to), undefined, (c) => columnAfterMove(c, column, to), pins);
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
        const [w, i] = this.current(widget, info);
        const now = this.viewOf(i);
        this.setView(w, i, now.showFilters ? { ...now, filters: [], showFilters: false } : { ...now, showFilters: true });
      },
      view.showFilters,
    );
    if (info.stale) {
      button(
        "Recalculate",
        "Some formula results are out of date (the table was changed outside Table Plus): write the current results",
        () => void this.write(this.current(widget, info)[0], (t) => t),
      );
    }
    if (info.metaRow || info.formulas) {
      button(
        "Remove metadata",
        "Remove this table's <meta> tags: its stored settings (sorting, pinning) and the formulas of its cells, which keep their results",
        () => void this.removeMetadata(widget, info),
      );
    }
    button("Edit markdown", "Show this table as markdown", () => void this.showMarkdown(this.current(widget, info)[1]));

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
    const box = this.innerBox(widget);
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
      if (axis === "row") void this.moveRowTo(widget, info, from, to);
      else void this.moveColumnTo(widget, info, from, to);
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
    const rearranged = this.rearranged(info);
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
    const pinBlocked = (to: string) => (this.metadataOn || zone === to ? undefined : PIN_NEEDS_METADATA);
    // Nothing goes above the first row pinned to the top, nor below the last one pinned to the bottom
    const insertBlocked = (at: number) =>
      insertRowAt(info.pins, info.rows, at).at === at
        ? undefined
        : zone === "top"
          ? "Rows pinned to the top stay at the top"
          : "Rows pinned to the bottom stay at the bottom";
    return [
      {
        kind: "item",
        label: "Insert row above",
        icon: ICONS.rowAbove,
        run: act(() => this.insertRowWith(widget, info, row, column)),
        disabled: insertBlocked(row),
      },
      {
        kind: "item",
        label: "Insert row below",
        icon: ICONS.rowBelow,
        run: act(() => this.insertRowWith(widget, info, row + 1, column)),
        disabled: insertBlocked(row + 1),
      },
      { kind: "item", label: "Duplicate row", icon: ICONS.duplicate, run: act(() => this.duplicateRowAt(widget, info, row)) },
      { kind: "separator" },
      {
        kind: "item",
        label: "Move up",
        icon: ICONS.arrowUp,
        run: act(() => this.moveRowTo(widget, info, row, row - 1)),
        disabled: moveBlocked(row - 1),
      },
      {
        kind: "item",
        label: "Move down",
        icon: ICONS.arrowDown,
        run: act(() => this.moveRowTo(widget, info, row, row + 1)),
        disabled: moveBlocked(row + 1),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin to top",
        icon: ICONS.pinTop,
        checked: zone === "top",
        run: act(() => this.pinRowAt(widget, info, row, zone === "top" ? undefined : "top")),
        disabled: pinBlocked("top"),
      },
      {
        kind: "item",
        label: "Pin to bottom",
        icon: ICONS.pinBottom,
        checked: zone === "bottom",
        run: act(() => this.pinRowAt(widget, info, row, zone === "bottom" ? undefined : "bottom")),
        disabled: pinBlocked("bottom"),
      },
      { kind: "separator" },
      { kind: "item", label: "Delete row", icon: ICONS.trash, danger: true, run: act(() => this.deleteRowAt(widget, info, row)) },
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
    const sortBy = (next: ViewState) => this.runAndClose(() => this.setSort(widget, info, next));
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
    const pinBlocked = (to: string) => (this.metadataOn || zone === to ? undefined : PIN_NEEDS_METADATA);
    const insertBlocked = (at: number) =>
      insertColumnAt(info.pins, info.columns, at).at === at
        ? undefined
        : zone === "left"
          ? "Columns pinned to the left stay at the left"
          : "Columns pinned to the right stay at the right";
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
        run: act(() => this.insertColumnWith(widget, info, column)),
        disabled: insertBlocked(column),
      },
      {
        kind: "item",
        label: "Insert column right",
        icon: ICONS.columnRight,
        run: act(() => this.insertColumnWith(widget, info, column + 1)),
        disabled: insertBlocked(column + 1),
      },
      {
        kind: "item",
        label: "Move left",
        icon: ICONS.arrowLeft,
        run: act(() => this.moveColumnTo(widget, info, column, column - 1)),
        disabled: columnMoveBlocked(column - 1),
      },
      {
        kind: "item",
        label: "Move right",
        icon: ICONS.arrowRight,
        run: act(() => this.moveColumnTo(widget, info, column, column + 1)),
        disabled: columnMoveBlocked(column + 1),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Pin left",
        icon: ICONS.pinLeft,
        checked: zone === "left",
        run: act(() => this.pinColumnAt(widget, info, column, zone === "left" ? undefined : "left")),
        disabled: pinBlocked("left"),
      },
      {
        kind: "item",
        label: "Pin right",
        icon: ICONS.pinRight,
        checked: zone === "right",
        run: act(() => this.pinColumnAt(widget, info, column, zone === "right" ? undefined : "right")),
        disabled: pinBlocked("right"),
      },
      { kind: "separator" },
      {
        kind: "item",
        label: "Delete column",
        icon: ICONS.trash,
        danger: true,
        run: act(() => this.deleteColumnAt(widget, info, column)),
        disabled: info.columns <= 1 ? "A table needs at least one column" : undefined,
      },
    );
    return entries;
  }
}
