// Enhances SilverBullet's rendered markdown tables in place: sorting, filtering,
// inline cell editing and row/column editing. Every change to the markdown is
// one `editor.replaceRange`, so undo works as for any other edit.
import { type Bridge, type FeatureName, moduleOnByDefault, SETTINGS, type SettingValue } from "./bridge.ts";
import type {
  CellEditor,
  CellRef,
  Feature,
  RowHold,
  TableHost,
  ToolbarButton,
  WidgetInfo,
  WriteOptions,
  WritePage,
  WriteResult,
  WriteStep,
  MetadataPart,
} from "./core/feature.ts";
import { type Dialog, type DialogOptions, Dialogs } from "./core/dialog.ts";
import { CellEditing } from "./core/editor.ts";
import { insertColumnWith, insertRowWith } from "./core/structure.ts";
import { TouchKeyboard } from "./core/touch-keyboard.ts";
import { CONFIG_PAGE, withConfigSettings } from "./configpage.ts";
import { SettingsDialog } from "./settings.ts";
import { Autoscroll } from "./features/autoscroll.ts";
import { ColumnTypes } from "./features/columntypes.ts";
import { Excel } from "./features/excel.ts";
import { Export } from "./features/export.ts";
import { Expressions } from "./features/expressions.ts";
import { PageLinks } from "./features/pagelinks.ts";
import { Filters } from "./features/filters.ts";
import { Formulas } from "./features/formulas.ts";
import { Grips } from "./features/grips.ts";
import { History } from "./features/history.ts";
import { Widths } from "./features/widths.ts";
import { FullScreen } from "./features/fullscreen.ts";
import { LargeTables } from "./features/largetables.ts";
import { LongText } from "./features/longtext.ts";
import { CellPopup } from "./features/popup.ts";
import { Metadata } from "./features/metadata.ts";
import { Names } from "./features/names.ts";
import { Lazy } from "./features/lazy.ts";
import { Themes } from "./features/themes.ts";
import { Paste } from "./features/paste.ts";
import { Selection } from "./features/selection.ts";
import { AutoFill } from "./features/autofill.ts";
import { Sticky } from "./features/sticky.ts";
import {
  caretTextOffset,
  cellText,
  cellValue,
  EDITOR_SELECTOR,
  INTERACTIVE_SELECTOR,
  layOutHeaderCell,
  OUT_OF_LINE_CLASS,
  NATIVE_ACTION_SELECTOR,
  positionHint,
  renderedTable,
  SCROLLER_SELECTOR,
  UI_CLASS,
  WIDGET_SELECTOR,
} from "./dom.ts";
import { ICONS } from "./icons.ts";
import {
  cellSourceOffset,
  locateBySource,
  locateByShape,
  locateWithEmptyHeaders,
  minimalEdit,
  type OtherPages,
  pageTablesOf,
  parseTable,
  serializeTable,
  type Table,
  type TableRange,
} from "./markdown.ts";
import { focusMenu, type MenuBack, type MenuEntry, renderMenu, wrapRuns } from "./menu.ts";
import { metadataAfterEdit, metaPins, metaSort, withMetaSort } from "./meta.ts";
import { appendColumnAt, appendRowAt } from "./pins.ts";
import { keepTags } from "./tags.ts";
import { nameEmptyHeaders, reorderRows } from "./ops.ts";
import {
  cycleSort,
  DEFAULT_VIEW,
  hasPins,
  NO_PINS,
  withPins,
  remapColumns,
  type ViewState,
  visibleRows,
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
const BAR_GAP = 12;
// How far the toolbar keeps left of the table's right edge: clear of the +
// adding a column there (in its lane above the header, as high as the toolbar)
const BAR_CLEAR = 15;

// How near the table's end a column border must be to count as in view
const INSERT_REACH = 6;
// The + inserting a row (column) has a lane of its own beside the grips (which
// sit on the table's left edge and on the header's top edge, 12px thick): its
// centre this far out from the edge, shown while the pointer is past the grip,
// in a band reaching this far out (and this far past the table's last row or
// column), on the border nearest the pointer
const INSERT_LANE_AT = 17;
const INSERT_LANE_FROM = 7;
const INSERT_LANE_BAND = 32;
const INSERT_LANE_PAST = 16;

// A press this long on a touch screen opens the cell menu
const LONG_PRESS_MS = 550;

// A sorting is stored (metadata setting) once the clicks have settled
const STORE_SORT_DELAY_MS = 400;

// After a write, how long a table rendered anew is kept where it was in the
// page's view, against the editor's own scrolling as it measures the new
// rendering (until the user scrolls, presses or types)
const ANCHOR_MS = 1000;

// The click that ends a press that inserted (the + takes the press, the table
// is rendered anew under the pointer) is swallowed within this time
const INSERT_CLICK_MS = 1000;



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

// The element under the pointer while Ctrl is held in a cell editor (the move cursor, CSS)
const NAVIGATING_CLASS = "tp-navigating-here";

export class Controller implements TableHost {
  private readonly infos = new WeakMap<HTMLElement, WidgetInfo>();
  // The page's text as last read
  pageText = "";
  currentPage = "";

  // Tables being enhanced: a scan meanwhile waits for it instead of starting again
  private readonly enhancing = new WeakMap<HTMLElement, Promise<void>>();
  private readonly views = new Map<string, ViewState>();
  // The maximum table height setting, in pixels; 0: no limit
  private maxHeight = 0;
  // The metadata setting, for menus that offer pinning
  private metadataOn = false;
  // Sideways scroll of each wide table, carried over to its next rendering
  private readonly scrollLefts = new Map<string, number>();
  // The same for tables taller than the maximum height setting, scrolled inside
  private readonly scrollTops = new Map<string, number>();
  // A table being written, and where it was in the page's view (its top below
  // the scroller's): the editor renders it anew and may scroll the page while
  // it measures the new rendering, which would leave the user elsewhere
  private anchor: { readonly key: string; readonly scroller: HTMLElement; offset: number; readonly until: number } | undefined;
  // When a press inserted with the +: the click that ends it is no click on what is under the pointer then
  private insertPressAt = 0;
  private readonly cellEditor: CellEditing;
  // The settings dialog while open, and while it reads the settings to open
  private settingsDialog: SettingsDialog | undefined;
  // A feature's dialog (openDialog)
  private readonly dialogs: Dialogs;
  private settingsOpening = false;
  // Countermeasures to SilverBullet and the on-screen keyboard on touch screens (a workaround, see its file)
  private readonly touchKeyboard: TouchKeyboard;
  private hoverWidget: HTMLElement | undefined;
  private hoverCell: HTMLTableCellElement | undefined;
  // Ctrl held in a cell editor, and the element under the pointer showing the move cursor
  private navigating = false;
  private navigatingAt: HTMLElement | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private scanQueued = false;
  // Set by stop(): work already scheduled then does nothing
  private stopped = false;
  // Rows are being rearranged: a cell editor losing its focus to that is not left
  private movingRows = false;
  // The row being edited (or just added), in the table with `key`: it stays
  // where it is shown until the editor leaves it, so sorting and filters do not
  // move or hide it while it is typed into
  private held: (RowHold & { readonly key: string; readonly row: number }) | undefined;
  private settingsTimer: ReturnType<typeof setTimeout> | undefined;
  private settingsReadAt = 0;
  private readonly sortTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Tables whose sorting is stored once their cell editor closes
  private readonly sortsWaiting = new Set<string>();
  private stickyQueued = false;
  private warnedIncompatible = false;
  private observer: MutationObserver | undefined;
  private readonly bar: HTMLElement;
  // Inserting rows and columns: a + on a border of the table, and the border marked
  private readonly insertMark: HTMLButtonElement;
  private readonly insertLine: HTMLElement;
  private insertAt: { readonly key: string; readonly axis: "row" | "column"; readonly at: number; readonly beside: RowHold } | undefined;
  // Quiet + buttons under the last row and right of the last column, shown
  // while that row (column) is hovered, selected or edited; lit up under the
  // pointer. A + the pointer brings up on the same axis takes their place.
  private readonly quietMarks: Readonly<Record<"row" | "column", HTMLButtonElement>>;
  // The quiet + under the pointer: its line shows
  private quietHovered: "row" | "column" | undefined;
  // Features that keep their own state and work through this controller
  // (core/feature.ts): those turned on, filled in when Table Plus starts
  private readonly features: Feature[] = [];
  private featuresStarted: Promise<void> | undefined;
  // The modules turned on
  private readonly modulesOn = new Set<FeatureName>();
  // The toolbar's open ⋯ menu
  // The open menu of a table's toolbar (⋯, at its button) or of cells (at the pointer)
  private tableMenu:
    | { element: HTMLElement; widget: HTMLElement; kind: "table" | "cell"; anchor?: HTMLElement; point?: { x: number; y: number } }
    | undefined;
  // When a press was last taken (a cell menu a touch opened, a feature's: takePress): its mouse events after it are no click on the cell
  private pressTakenAt = 0;
  private stopLongPress: (() => void) | undefined;
  private readonly metadata: Metadata;
  // Each table's rows as SilverBullet rendered them (the header first), whether
  // a feature took some of them out of the document or not; its body rows; and
  // the rows shown, in display order, as the view last placed them
  private readonly renderedRows = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();
  private readonly bodyRowsOf = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();
  private readonly shownOrder = new WeakMap<HTMLTableElement, HTMLTableRowElement[]>();
  // A row each table keeps in the document whatever a feature takes out (a row being dragged)
  private readonly heldRows = new WeakMap<HTMLTableElement, HTMLTableRowElement>();
  // Steps every write goes through after the edit, in this order
  private readonly writeSteps: readonly WriteStep[] = [metadataAfterEdit];

  constructor(
    readonly doc: Document,
    public bridge: Bridge,
  ) {
    this.dialogs = new Dialogs(doc);
    this.metadata = new Metadata(this);
    this.cellEditor = new CellEditing(this, {
      features: this.features,
      isolate: (element) => this.isolate(element),
      endHover: () => this.hoverEdited(),
      movingRows: () => this.movingRows,
      dialogOpen: () => this.dialogs.isOpen,
      holdRow: (widget, info, row) => this.holdRow(widget, info, row),
      releaseRow: () => this.releaseRow(),
      editingEnded: (widget) => this.editingEnded(widget),
      editingStarted: () => this.touchKeyboard.editorOpened(),
      navigating: (on) => {
        this.navigating = on;
        this.markNavigating();
      },
    });
    this.touchKeyboard = new TouchKeyboard({
      doc,
      inTable: (target) => this.enhancedWidgetOf(target) !== undefined,
      editing: () => this.cellEditor.active !== undefined,
      revealEditing: () => this.cellEditor.revealActive(),
      // The cell being edited wins over keeping a table written in its place:
      // the keyboard shows as the next cell opens after a write (Enter)
      viewResized: () => this.dropAnchor(),
    });
    this.bar = this.floating("div", "tp-bar");
    this.insertMark = this.floatingButton("tp-insert", "Insert here", ICONS.plus);
    this.quietMarks = {
      row: this.floatingButton("tp-insert tp-quiet", "Add a row", ICONS.plus),
      column: this.floatingButton("tp-insert tp-quiet", "Add a column", ICONS.plus),
    };
    this.insertLine = this.floating("div", "tp-insert-line");
  }

  setBridge(bridge: Bridge): void {
    this.bridge = bridge;
  }

  start(): void {
    const win = this.doc.defaultView!;
    // Before the controller's own listeners: a press that opens a cell's editor holds it in view after it ends the hold
    this.touchKeyboard.start();
    win.addEventListener("mousedown", this.onMouseDown, true);
    win.addEventListener("click", this.onClick, true);
    win.addEventListener("contextmenu", this.onContextMenu, true);
    win.addEventListener("pointerdown", this.onPointerDown, true);
    win.addEventListener("dblclick", this.onDoubleClick, true);
    win.addEventListener("scroll", this.onScroll, true);
    win.addEventListener("keydown", this.onKeyDown, true);
    win.addEventListener("keyup", this.onKeyUp, true);
    win.addEventListener("blur", this.onBlur);
    this.doc.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });
    this.doc.addEventListener("pointerout", this.onPointerOut, { passive: true });
    win.addEventListener("mouseup", this.onMouseUp, true);
    // The user scrolls: a table written is no longer kept in its place
    win.addEventListener("wheel", this.dropAnchor, { capture: true, passive: true });
    win.addEventListener("touchstart", this.dropAnchor, { capture: true, passive: true });

    // A click without a press (the keyboard); a press is taken in onMouseDown
    this.insertMark.addEventListener("click", () => this.insertHere());
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
        if (!this.insertAt) this.insertLine.classList.remove("tp-visible");
      });
    }

    this.observer = new MutationObserver((records) => {
      this.tablesAdded(records);
      this.queueScan();
    });
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    this.featuresStarted = this.startFeatures();
    void this.scan();
    void this.refreshSettings();
  }

  /**
   * Creates and starts the features, but the modules turned off
   * (`tablePlus.modules.<name>.enabled`). Read once: a change applies when the
   * page is loaded again.
   */
  private async startFeatures(): Promise<void> {
    const optional = (name: FeatureName, create: () => Feature) => ({ name, create });
    const always = (create: () => Feature) => ({ name: undefined, create });
    // In the order they get events
    const all = [
      // First: the header moves before what follows it
      optional("sticky", () => new Sticky(this)),
      // Before what takes presses: a press while picking where AutoFill to… fills to ends picking (or fills) first;
      // before the selection too: Esc while dragging the fill handle cancels the fill, the selection stays
      optional("autofill", () => new AutoFill(this)),
      optional("autoscroll", () => new Autoscroll(this)),
      optional("handles", () => new Grips(this)),
      optional("widths", () => new Widths(this)),
      optional("longText", () => new LongText(this)),
      // Before what places rows into the table: it takes them out of the document first
      optional("largeTables", () => new LargeTables(this)),
      // Recalculate first in the toolbar
      optional("formulas", () => new Formulas(this)),
      optional("pageLinks", () => new PageLinks(this)),
      // Before types: Filter right after the sorting in the column menu
      optional("filters", () => new Filters(this)),
      // After formulas: a formula's result is shown in its column's type
      optional("columnTypes", () => new ColumnTypes(this)),
      // Before metadata: Name before Remove metadata in the toolbar
      optional("names", () => new Names(this)),
      always(() => this.metadata),
      optional("paste", () => new Paste(this)),
      optional("selection", () => new Selection(this)),
      optional("lazy", () => new Lazy(this)),
      optional("themes", () => new Themes(this)),
      optional("export", () => new Export(this)),
      optional("excel", () => new Excel(this)),
      // Its icon last in the toolbar, before the menu
      optional("fullScreen", () => new FullScreen(this)),
      always(() => new Expressions(this)),
      always(() => new History(this)),
      always(() => new CellPopup(this)),
    ];
    const enabled = await Promise.all(all.map(({ name }) => (name ? this.featureEnabled(name) : true)));
    if (this.stopped) return;
    all.forEach(({ name }, i) => {
      if (name && enabled[i]) this.modulesOn.add(name);
    });
    const features = all.filter((_, i) => enabled[i]).map(({ create }) => create());
    this.features.push(...features);
    for (const feature of features) feature.start?.();
  }

  private async featureEnabled(name: FeatureName): Promise<boolean> {
    try {
      const value = await this.bridge.getConfig?.(`tablePlus.modules.${name}.enabled`, moduleOnByDefault(name));
      return typeof value === "boolean" ? value : moduleOnByDefault(name);
    } catch {
      return moduleOnByDefault(name);
    }
  }

  /** Detaches from the page: listeners, observer and floating controls */
  stop(): void {
    this.stopped = true;
    const win = this.doc.defaultView!;
    win.removeEventListener("mousedown", this.onMouseDown, true);
    win.removeEventListener("click", this.onClick, true);
    win.removeEventListener("contextmenu", this.onContextMenu, true);
    win.removeEventListener("pointerdown", this.onPointerDown, true);
    this.stopLongPress?.();
    delete this.doc.documentElement.dataset.tpPointer;
    win.removeEventListener("dblclick", this.onDoubleClick, true);
    win.removeEventListener("scroll", this.onScroll, true);
    win.removeEventListener("keydown", this.onKeyDown, true);
    for (const feature of this.features) feature.stop?.();
    win.removeEventListener("keyup", this.onKeyUp, true);
    win.removeEventListener("blur", this.onBlur);
    this.doc.removeEventListener("pointermove", this.onPointerMove);
    this.doc.removeEventListener("mousemove", this.onMouseMove);
    this.doc.removeEventListener("pointerout", this.onPointerOut);
    win.removeEventListener("mouseup", this.onMouseUp, true);
    // An editor open in its popup (in the page's body) goes too
    this.cellEditor.close();
    win.removeEventListener("wheel", this.dropAnchor, true);
    win.removeEventListener("touchstart", this.dropAnchor, true);
    this.touchKeyboard.stop();
    this.anchor = undefined;
    this.observer?.disconnect();
    clearTimeout(this.settingsTimer);
    for (const timer of this.sortTimers.values()) clearTimeout(timer);
    this.closeTableMenu(false);
    for (const el of [this.bar, this.insertMark, this.insertLine, ...Object.values(this.quietMarks)]) el.remove();
    this.settingsDialog?.close();
    this.dialogs.close();
  }

  private onBlur = (): void => this.cellEditor.setNavigating(false);

  /**
   * A cell editor opened: the grips go to the edited cell and stay there while
   * it is edited, so its row's and column's menus are a click away (and on a
   * touch screen, where nothing hovers, the way to them)
   */
  private hoverEdited(): void {
    const active = this.cellEditor.active;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) {
      this.endHover(false);
      return;
    }
    this.hoverCell = active.cell;
    this.cellHovered(active.widget, info, active.cell);
  }

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

  otherPages(): OtherPages | undefined {
    for (const feature of this.features) {
      const pages = feature.otherPages?.();
      if (pages) return pages;
    }
    return undefined;
  }

  selectCells(info: WidgetInfo, anchor: CellRef, focus: CellRef): void {
    for (const feature of this.features) feature.selectCells?.(info, anchor, focus);
  }

  editCell(info: WidgetInfo, ref: CellRef, how?: "replace" | "select", popup = false): void {
    const widget = this.widgetForKey(info.key);
    const current = widget && this.infos.get(widget);
    const cell = current && this.cellAt(current, ref);
    if (widget && current && cell) this.cellEditor.open(widget, current, cell, how === "select" ? true : undefined, how === "replace", popup ? {} : undefined);
  }

  editInPopup(): void {
    this.cellEditor.toPopup();
  }

  selectsCells(): boolean {
    return this.features.some((f) => f.selectCells);
  }

  selectedCells(info: WidgetInfo): readonly CellRef[] {
    for (const feature of this.features) {
      const cells = feature.selected?.(info);
      if (cells) return cells;
    }
    return [];
  }

  moduleOn(name: FeatureName): boolean {
    return this.modulesOn.has(name);
  }

  tablesChanged(): void {
    for (const feature of this.features) feature.tablesChanged?.();
  }

  columnDeleteWarnings(info: WidgetInfo, column: number): string[] {
    return this.features.flatMap((f) => f.columnDeleteWarning?.(info, column) ?? []);
  }

  uniqueTags(): ReadonlySet<string> {
    return new Set(this.features.flatMap((f) => f.uniqueTags?.() ?? []));
  }

  metadataParts(tables: readonly Table[]): MetadataPart[] {
    return this.features.flatMap((f) => f.metadataPart?.(tables) ?? []);
  }

  tableResized(info: WidgetInfo): void {
    // Pinned columns stick at offsets from the widths of those further out
    this.pinColumns(info);
    this.queueStickyUpdate();
  }

  toolbarChanged(): void {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (widget && info && this.bar.classList.contains("tp-visible")) this.showTableControls(widget, info, false);
  }

  /**
   * The toolbar placed again, once in the next frame: placing it measures the
   * table, and measured right after each change (a write applies the view more
   * than once) the browser would lay out a large table again each time
   */
  private queuePlaceBar(): void {
    if (this.barPlaceQueued) return;
    this.barPlaceQueued = true;
    const run = () => {
      this.barPlaceQueued = false;
      const widget = this.hoverWidget;
      const info = widget && this.infos.get(widget);
      if (this.stopped || !widget || !info || renderedTable(widget) !== info.table || !this.bar.classList.contains("tp-visible")) return;
      this.placeBar(widget, info);
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  async promptText(message: string, value = ""): Promise<string | undefined> {
    const answer = this.bridge.prompt
      ? await this.bridge.prompt(message, value)
      : this.doc.defaultView!.prompt(message, value);
    return answer ?? undefined;
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
    this.sortsWaiting.delete(shownInfo.key);
    const [widget, info] = this.current(shownWidget, shownInfo);
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellValue));
    const { top, bottom } = info.pins;
    const middle = visibleRows(values, withPins(view, info.pins));
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
   * The view a table's metadata stored ends with the metadata, so the rows
   * show as written: forgotten, so Ctrl+Z (the metadata back) shows it again
   */
  forgetStoredView(key: string): void {
    clearTimeout(this.sortTimers.get(key));
    this.sortTimers.delete(key);
    this.sortsWaiting.delete(key);
    this.views.delete(key);
    for (const feature of this.features) feature.viewForgotten?.(key);
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
    const maxHeight = await this.setting("maxHeight");
    this.metadataOn = await this.setting("metadata");
    this.cellEditor.selectOnClick = await this.setting("selectOnClick");
    if (this.stopped || maxHeight === this.maxHeight) return;
    this.maxHeight = maxHeight;
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.infos.get(widget);
      if (info && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
    this.queueStickyUpdate();
  }

  rearranged(info: WidgetInfo): boolean {
    return !!this.viewOf(info).sort || this.features.some((f) => f.hidesRows?.(info));
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

  /** A table's rows as rendered (the header first), kept from when it was first seen */
  private rowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
    let rows = this.renderedRows.get(table);
    if (!rows) this.renderedRows.set(table, (rows = Array.from(table.rows)));
    return rows;
  }

  /**
   * Tables SilverBullet just put into the page (a mutation observer's callback
   * runs before the browser lays them out): their rows kept, and the features
   * told, so they may take rows out of the document before they cost a layout
   */
  private tablesAdded(records: readonly MutationRecord[]): void {
    if (!this.features.some((f) => f.tableAdded)) return;
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        // Inside a table: its own content (Table Plus' decorations), not a new table
        const tables = node instanceof HTMLTableElement ? [node] : node.closest("table") ? [] : Array.from(node.getElementsByTagName("table"));
        for (const table of tables) {
          const widget = table.closest<HTMLElement>(WIDGET_SELECTOR);
          if (!widget || this.renderedRows.has(table) || this.ownTable(widget)) continue;
          const rows = this.rowsOf(table);
          for (const feature of this.features) feature.tableAdded?.(widget, table, rows);
        }
      }
    }
  }

  /** A table in one of Table Plus' floating elements (a theme's preview in a menu): not one of the page's */
  private ownTable(widget: HTMLElement): boolean {
    return !!widget.closest(".tp-floating");
  }

  /** Enhances every rendered table that is not enhanced yet */
  async scan(): Promise<void> {
    if (this.stopped) return;
    // Tables are enhanced by the features that are on
    await this.featuresStarted;
    if (this.stopped) return;
    const pending: Promise<void>[] = [];
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR))) {
      const table = renderedTable(widget);
      if (!table || table.rows.length === 0 || this.ownTable(widget)) continue;
      if (this.infos.get(widget)?.table === table || widget.dataset.tpUnsupported) continue;
      pending.push(this.enhance(widget, table));
    }
    await Promise.all(pending);
  }

  private enhance(widget: HTMLElement, table: HTMLTableElement): Promise<void> {
    const running = this.enhancing.get(widget);
    if (running) return running;
    const done = this.enhanceNow(widget, table).finally(() => this.enhancing.delete(widget));
    this.enhancing.set(widget, done);
    return done;
  }

  private async enhanceNow(widget: HTMLElement, table: HTMLTableElement): Promise<void> {
    try {
      const hint = positionHint(table);
      if (hint === undefined) {
        this.markUnsupported(widget, true);
        return;
      }
      const rendered = this.rowsOf(table);
      const header = rendered[0]!;
      const shape = {
        rows: rendered.length,
        columns: header.cells.length,
        headers: Array.from(header.cells).map(cellText),
      };
      const text = await this.bridge.getText();
      if (this.stopped || renderedTable(widget) !== table) return;
      this.pageText = text;
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
      this.currentPage = page;
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
      // Where it was in the page's view, then the cell to edit next scrolled into view from there
      this.keepAnchor(info.key, widget);
      this.cellEditor.takePending(widget, info);
      this.anchorAgain(widget, info.key);
      for (const feature of this.features) feature.enhanced?.(widget, info);
      // The cell showing the move cursor was rendered anew (Ctrl+arrows saved a cell)
      if (this.navigating) this.markNavigating();
      this.reshowInsert(widget, info);
      this.queueStickyUpdate();
      void this.refreshSettings();
    } catch (e) {
      console.error("Table Plus: could not enhance a table", e);
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
    const rows = [...this.rowsOf(info.table)];
    const metaRow = info.metaRow ? rows.pop() : undefined;
    this.bodyRowsOf.set(info.table, rows.slice(1));
    metaRow?.classList.add("tp-meta-row");
    // Pinned rows and columns carry the pin icon of their menu item
    const mark = (icon: string, title: string) => {
      const span = this.doc.createElement("span");
      span.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-pin-mark`;
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
    // Last: the header's name on one line with the icons the features added
    for (const cell of Array.from(rows[0]!.cells)) layOutHeaderCell(cell);
  }

  // ---- view: sort and filter --------------------------------------------

  viewOf(info: WidgetInfo): ViewState {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }

  keepTags(value: string, from: string): string {
    return keepTags(value, from, new Set(this.features.flatMap((f) => f.takesTags?.() ?? [])));
  }

  clickSelects(): boolean {
    return this.features.some((f) => f.clickSelects?.());
  }

  headerRenamed(name: string, original: string): string {
    for (const feature of this.features) {
      const kept = feature.headerRenamed?.(name, original);
      if (kept !== undefined) return kept;
    }
    return name;
  }

  fillCell(info: WidgetInfo, cell: string, from: CellRef, to: CellRef): string | undefined {
    for (const feature of this.features) {
      const copy = feature.fillCell?.(info, cell, from, to);
      if (copy !== undefined) return copy;
    }
    return undefined;
  }

  cellKeptBy(cell: string): string | undefined {
    for (const feature of this.features) {
      const reason = feature.keepsCell?.(cell);
      if (reason) return reason;
    }
    return undefined;
  }

  viewChanged(widget: HTMLElement, info: WidgetInfo): void {
    this.setView(widget, info, this.viewOf(info));
  }

  setView(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    this.views.set(info.key, view);
    // A new sorting or filter places every row, the one being edited too,
    // which is then held where it shows
    if (this.held?.key === info.key) this.held = undefined;
    this.applyView(widget, info);
    const active = this.cellEditor.active;
    if (active?.widget === widget) this.holdRow(widget, info, active.row);
  }

  /**
   * A view change that may change the sorting. With the metadata setting on,
   * the sorting is also stored in the table, so it is the table's view next time.
   */
  setSort(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    this.setView(widget, info, view);
    this.scheduleSortStore(info.key);
  }

  /**
   * Stores a table's sorting a moment after it changed: clicks in a row store
   * only where they end, in the table as rendered then. Not while a cell of the
   * table is edited (writing would render the table anew under the editor): then
   * once the editor closes.
   */
  private scheduleSortStore(key: string): void {
    clearTimeout(this.sortTimers.get(key));
    this.sortTimers.set(
      key,
      setTimeout(() => {
        this.sortTimers.delete(key);
        const active = this.cellEditor.active;
        if (active && this.infos.get(active.widget)?.key === key) this.sortsWaiting.add(key);
        else void this.storeSort(key);
      }, STORE_SORT_DELAY_MS),
    );
  }

  /** The cell editor closed: a sorting waiting for it is stored */
  private editingEnded(widget: HTMLElement): void {
    const key = this.infos.get(widget)?.key;
    if (key && this.sortsWaiting.delete(key)) this.scheduleSortStore(key);
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

  takePress(): void {
    this.pressTakenAt = Date.now();
  }

  /** The mouse events now are those of a press taken (until the next press, at most a second) */
  pressTaken(): boolean {
    return Date.now() - this.pressTakenAt < 1000;
  }

  get pressedWith(): string {
    return this.doc.documentElement.dataset.tpPointer ?? "";
  }

  columnMenuEntries(
    widget: HTMLElement,
    info: WidgetInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[] {
    return this.features.flatMap((f) => f.columnMenuEntries?.(widget, info, column, open) ?? []);
  }

  columnMenuTopEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    return this.features.flatMap((f) => f.columnMenuTopEntries?.(widget, info, column) ?? []);
  }

  columnMenuInsertEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    return this.features.flatMap((f) => f.columnMenuInsertEntries?.(widget, info, column) ?? []);
  }

  rowMenuEntries(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[] {
    return this.features.flatMap((f) => f.rowMenuEntries?.(widget, info, row, column) ?? []);
  }

  lineMenuEntries(widget: HTMLElement, info: WidgetInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[] {
    return this.features.flatMap((f) => f.lineMenuEntries?.(widget, info, axis, lines) ?? []);
  }

  get metadataEnabled(): boolean {
    return this.metadataOn;
  }

  saveEditing(): Promise<void> {
    return this.cellEditor.finish(true, undefined, false);
  }

  takeEditor(): { widget: HTMLElement; row: number; column: number; save: (table: Table) => Table | undefined } | undefined {
    const closed = this.cellEditor.close();
    return closed && { widget: closed.widget, row: closed.row, column: closed.column, save: (t) => this.cellEditor.withSaved(t, closed) };
  }

  /** The settings dialog (the table's ⋯ menu, the "Table Plus: Settings" command) */
  async openSettings(): Promise<void> {
    if (this.settingsDialog?.isOpen || this.settingsOpening) return;
    this.settingsOpening = true;
    // Made anew each time: with the bridge as it is now (SilverBullet hands a new one over when it loads the configuration again)
    const bridge = this.bridge;
    this.settingsDialog = new SettingsDialog({
      doc: this.doc,
      bridge,
      canSave: !!bridge.saveSettings || (!!bridge.saveConfigPage && !!bridge.readPage),
      save: (values) => this.saveSettings(values),
      saved: () => {
        // Read at once, not after the usual second
        this.settingsReadAt = 0;
        void this.refreshSettings();
      },
    });
    try {
      await this.settingsDialog.open();
    } finally {
      this.settingsOpening = false;
    }
  }

  /** Settings saved where SilverBullet keeps them: the CONFIG page's managed block (configpage.ts), or the bridge's own store */
  private async saveSettings(values: Readonly<Record<string, unknown>>): Promise<void> {
    const bridge = this.bridge;
    if (bridge.saveSettings) {
      await bridge.saveSettings(values);
      return;
    }
    if (!bridge.saveConfigPage || !bridge.readPage) throw new Error("no configuration page to save to");
    let text = "";
    try {
      text = (await bridge.readPage(CONFIG_PAGE)) ?? "";
    } catch (e) {
      // No configuration page yet: it is created. Any other failure writes nothing (an empty text would replace the page)
      if (!/not.?found|does not exist|no such/i.test(String(e))) throw e;
    }
    // A sync conflict left in the page (its markers): its Lua is broken, written over it would be worse
    if (/^(<{7}|={7}|>{7})( |$)/m.test(text)) throw new Error("the CONFIG page has a sync conflict: resolve it there first");
    await bridge.saveConfigPage(withConfigSettings(text, values));
  }

  /** The "Table Plus: Remove table metadata" command */
  removeAllMetadata(): Promise<void> {
    return this.metadata.removeFromPage();
  }

  /** SilverBullet's `page:index` event */
  async pageIndexed(name: string): Promise<void> {
    for (const feature of this.features) await feature.pageIndexed?.(name);
  }

  /** SilverBullet's `editor:pageLoaded` event: another page is in the editor */
  async pageLoaded(): Promise<void> {
    const name = await this.bridge.getCurrentPage();
    for (const feature of this.features) await feature.pageLoaded?.(name);
  }

  tableOf(info: WidgetInfo): Table {
    return this.features.reduce((table, f) => f.pendingEdits?.(info)?.apply(table) ?? table, parseTable(info.source));
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
    // In the document or not (a feature may keep only the rows in view there)
    const kept = this.bodyRowsOf.get(info.table);
    if (kept) return [...kept];
    return Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow),
    );
  }

  rowNeeded(info: WidgetInfo, row: HTMLTableRowElement): void {
    if (row.isConnected) return;
    for (const feature of this.features) feature.rowNeeded?.(info, row);
  }

  holdInDocument(info: WidgetInfo, row: HTMLTableRowElement | undefined): void {
    if (row) this.heldRows.set(info.table, row);
    else this.heldRows.delete(info.table);
  }

  heldInDocument(info: WidgetInfo): HTMLTableRowElement | undefined {
    return this.heldRows.get(info.table);
  }

  rowsAttached(info: WidgetInfo, rows: readonly HTMLTableRowElement[]): void {
    for (const feature of this.features) feature.rowsAttached?.(info, rows);
    // Pinned columns' cells of those rows get their offsets
    this.pinColumns(info);
  }

  /**
   * The rows shown (indexes of the body rows), with the held row of this table
   * shown beside its anchors, whether the sorting and filters would show it there or not
   */
  private withHeldRow(info: WidgetInfo, order: number[], count: number): number[] {
    const held = this.held;
    const { top, bottom } = info.pins;
    if (held?.key !== info.key || held.row - 1 < top || held.row - 1 >= count - bottom) return order;
    const index = held.row - 1;
    const rest = order.filter((i) => i !== index);
    const after = held.after === undefined ? -1 : rest.indexOf(held.after - 1);
    const before = held.before === undefined ? -1 : rest.indexOf(held.before - 1);
    const at = after >= 0 ? after + 1 : before >= 0 ? before : rest.length;
    return [...rest.slice(0, at), index, ...rest.slice(at)];
  }

  /** A row is entered in the cell editor: held where it is shown now, beside the rows shown next to it */
  private holdRow(widget: HTMLElement, info: WidgetInfo, row: number): void {
    if (this.held?.key === info.key && this.held.row === row) return;
    this.releaseRow();
    if (row === 0) return;
    const { top, bottom } = info.pins;
    // The rows shown, but those pinned (they are not sorted or filtered)
    const shown = this.shownRows(info)
      .slice(1)
      .map((tr) => Number(tr.dataset.tpRow))
      .filter((r) => r > top && r <= info.rows - 1 - bottom);
    const at = shown.indexOf(row);
    if (at < 0) return;
    this.held = {
      key: info.key,
      row,
      ...(at > 0 ? { after: shown[at - 1] } : {}),
      ...(at < shown.length - 1 ? { before: shown[at + 1] } : {}),
    };
  }

  /** The held row is left: the sorting and filters place it */
  private releaseRow(): void {
    const held = this.held;
    if (!held) return;
    this.held = undefined;
    const widget = this.widgetForKey(held.key);
    const info = widget && this.infos.get(widget);
    // Rows as written (not sorted nor filtered): the held row is where it goes already
    if (widget && info && renderedTable(widget) === info.table && this.rearranged(info)) this.applyView(widget, info);
  }

  /** After a write: a new row focused is held beside the rows asked */
  private holdAfterWrite(key: string, options: WriteOptions): void {
    if (options.hold && options.focus) {
      this.held = { key, row: options.focus.row, ...options.hold };
      return;
    }
    // Rows moved, inserted or deleted: the row is held anew where it shows once the editor is back in it
    if (this.held?.key === key && options.rowMap) this.held = undefined;
  }

  /**
   * A cell's value for sorting and filtering: the edited cell shows the
   * editor, not its text, so its value is what is typed (a type's value stays)
   */
  cellValue(cell: HTMLTableCellElement): string {
    const active = this.cellEditor.active;
    return active?.cell === cell && cell.dataset.tpValue === undefined ? active.field.value : cellValue(cell);
  }

  /**
   * Each body cell's content in a box of its own (Table Plus' own elements
   * stay outside it), as wide as its text: what modules size and limit (the
   * longText module: wrapped or cut at a maximum width; widths: a width set).
   * Idempotent: run again after a feature replaced a cell's content.
   */
  private layOutCells(info: WidgetInfo): void {
    for (const tr of this.bodyRows(info)) {
      for (const cell of Array.from(tr.cells)) {
        if (cell.classList.contains("tp-editing")) continue;
        // One pass through the cell's children (every cell, on every view): its box, and what is not in it yet
        let box: HTMLElement | undefined;
        const loose: Node[] = [];
        for (let n = cell.firstChild; n; n = n.nextSibling) {
          if (n instanceof HTMLElement && n.classList.contains("tp-cell-content") && !box) box = n;
          else if (!(n instanceof Element && n.classList.contains(UI_CLASS))) loose.push(n);
        }
        if (loose.length === 0) continue;
        if (!box) {
          box = this.doc.createElement("div");
          box.className = "tp-cell-content";
          cell.prepend(box);
        }
        box.append(...loose);
      }
    }
  }

  applyView(widget: HTMLElement, info: WidgetInfo): void {
    this.layOutCells(info);
    const view = this.viewOf(info);
    const { top, bottom } = info.pins;
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map((cell) => this.cellValue(cell)));
    // The rows features hide (filters)
    const hidden = new Set<number>();
    for (const feature of this.features) for (const i of feature.hiddenRows?.(info, values) ?? []) hidden.add(i);
    const order = this.withHeldRow(info, visibleRows(values, withPins(view, info.pins), hidden), rows.length);
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
    const shownBody = order.map((i) => rows[i]!);
    this.shownOrder.set(info.table, [info.table.rows[0]!, ...rows.slice(0, top), ...shownBody, ...rows.slice(rows.length - bottom)]);
    this.movingRows = true;
    try {
      const head = info.table.tHead;
      if (head) placeAtEnd(head, rows.slice(0, top));
      // A feature may place the shown rows itself (only those in view of a large table)
      const placed = body instanceof HTMLTableSectionElement && this.features.some((f) => f.placeRows?.(widget, info, body, shownBody));
      if (!placed) placeAtEnd(body, bodyRows);
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

    for (const feature of this.features) feature.viewApplied?.(widget, info);
    this.pinColumns(info);
    widget.classList.toggle("tp-rearranged", this.rearranged(info));
    // A taller table scrolls inside its own box (the table box already has overflow: auto)
    widget.style.maxHeight = this.maxHeight > 0 ? `${this.maxHeight}px` : "";
    if (this.hoverWidget === widget) this.showTableControls(widget, info, false);
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
    const rows = this.rowsOf(info.table).filter((tr) => !tr.classList.contains("tp-meta-row"));
    // Read before the cells are written: a read between writes lays the whole table out again
    const widths = Array.from(header.cells, (cell) => cell.getBoundingClientRect().width);
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
      offset += widths[c] ?? 0;
    }
    offset = 0;
    for (let c = info.columns - 1; c >= info.columns - right; c--) {
      pin(c, "right", offset, c === info.columns - right);
      offset += widths[c] ?? 0;
    }
  }

  // ---- event routing -----------------------------------------------------

  // Keyboard and input events from Table Plus' own fields must not reach the editor
  isolate(element: HTMLElement): void {
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
    // Rows Table Plus adds (a feature's: the filter row) and the metadata row are no table cells
    return row?.contains(UI_CLASS) || row?.contains("tp-meta-row") ? undefined : cell;
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.dropAnchor();
    // Only the press that inserted has its end swallowed
    this.insertPressAt = 0;
    // The mouse events of a press taken, as a touch screen fires them after a tap (they would close the menu it opened, or select or edit the cell)
    if (this.pressTaken()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // A press anywhere but the toolbar or its menu closes the menu
    if (this.tableMenu && e.target instanceof Node && !this.tableMenu.element.contains(e.target) && !this.bar.contains(e.target)) {
      this.closeTableMenu(false);
    }
    for (const feature of this.features) if (feature.mouseDown?.(e)) return;
    // A press on the +, or in the band beside the table that misses it (or where none shows), is the +'s:
    // SilverBullet would put the cursor into the table and show its markdown. It inserts at once, and the
    // click that ends it is swallowed: the table rendered anew (the page maybe scrolled) puts something
    // else under the pointer, e.g. a link, which the click would follow
    const quietAxis = (["row", "column"] as const).find((axis) => e.target instanceof Node && this.quietMarks[axis].contains(e.target));
    if (e.button === 0 && quietAxis) {
      e.preventDefault();
      e.stopPropagation();
      this.insertPressAt = Date.now();
      this.insertAtEnd(quietAxis);
      return;
    }
    const onMark = e.target instanceof Node && this.insertMark.contains(e.target);
    if (e.button === 0 && (onMark || (this.inInsertBand && !(e.target instanceof Node && this.isFloating(e.target))))) {
      e.preventDefault();
      e.stopPropagation();
      if (this.insertAt) {
        this.insertPressAt = Date.now();
        this.insertHere();
      }
      return;
    }
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
    if (element.closest(`.tp-cell-editor, tr.${UI_CLASS}`) || element.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    e.preventDefault();
    const cell = this.tableCellOf(info, element);
    if (!cell || this.cellEditor.active?.cell === cell) return;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    for (const feature of this.features) if (feature.beforeCellPress?.(widget, info, ref, e)) return;
    // The selectOnClick setting selects the cell's text; Shift the reverse (where no feature took Shift+click to select cells)
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

  // The end of a press that inserted with the +, or of a press taken: it reaches nothing
  private onMouseUp = (e: MouseEvent): void => {
    if (this.pressTaken()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.button !== 0 || !this.insertPressAt || Date.now() - this.insertPressAt > INSERT_CLICK_MS) return;
    e.preventDefault();
    e.stopPropagation();
  };

  private onClick = (e: MouseEvent): void => {
    // The click of a press taken: it would run the menu item that opened under the finger, follow a link, tick a task, sort
    if (e.detail !== 0 && this.pressTaken()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // detail 0: a click from the keyboard, no press
    if (e.button === 0 && e.detail !== 0 && this.insertPressAt && Date.now() - this.insertPressAt <= INSERT_CLICK_MS) {
      this.insertPressAt = 0;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
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
    } else if (action?.dataset.tpAction) {
      const name = action.dataset.tpAction;
      if (this.features.some((f) => f.action?.(name, action, widget, info))) e.preventDefault();
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
    // The editor scrolled the page while it measured a table written: it goes back
    if (this.anchor && e.target === this.anchor.scroller) this.keepAnchor(this.anchor.key);
  };

  // ---- keeping a table written in its place ----------------------------------

  /** Before a write: where the table is in the page's view */
  private anchorAt(widget: HTMLElement, key: string): void {
    const scroller = widget.isConnected ? this.scrollParentOf(widget) : undefined;
    this.anchor = scroller && {
      key,
      scroller,
      offset: widget.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
      until: Date.now() + ANCHOR_MS,
    };
  }

  /** The table rendered anew is scrolled to where it was, so the row edited stays under the user's eyes */
  private keepAnchor(key: string, widget = this.widgetForKey(key)): void {
    const anchor = this.anchor;
    if (!anchor || anchor.key !== key || !widget) return;
    if (Date.now() > anchor.until || !anchor.scroller.isConnected) {
      this.anchor = undefined;
      return;
    }
    const offset = widget.getBoundingClientRect().top - anchor.scroller.getBoundingClientRect().top;
    if (Math.abs(offset - anchor.offset) >= 1) anchor.scroller.scrollTop += offset - anchor.offset;
  }

  /**
   * After the table's own scrolling (the cell to edit next revealed): kept
   * there, also once the editor has measured the new rendering, in the next
   * frames
   */
  private anchorAgain(widget: HTMLElement, key: string): void {
    const anchor = this.anchor;
    if (!anchor || anchor.key !== key) return;
    anchor.offset = widget.getBoundingClientRect().top - anchor.scroller.getBoundingClientRect().top;
    const keep = () => this.keepAnchor(key);
    const win = this.doc.defaultView!;
    win.requestAnimationFrame?.(() => {
      keep();
      win.requestAnimationFrame(keep);
    });
    setTimeout(keep, 100);
  }

  private dropAnchor = (): void => {
    this.anchor = undefined;
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
      this.cellHovered(widget, info, cell);
    } else this.endHover(true);
    // The table moved under a pointer that did not: the + where the pointer is now
    if (this.insertAt || this.inInsertBand) this.insertUnderPointer();
    // Another cell under a pointer that did not move
    if (this.navigating) this.markNavigating();
  }

  shownPart(widget: HTMLElement, info: WidgetInfo, cell: HTMLElement): { left: number; right: number; top: number; bottom: number } | undefined {
    if (!cell.isConnected) return undefined;
    const rect = cell.getBoundingClientRect();
    const shown = this.shownRect(widget, info);
    const view = this.viewBounds(widget);
    // A body cell scrolls under what is held over the body; a pinned column's cell is itself held
    const held = cell.closest("tbody") ? this.heldBounds(info) : undefined;
    const pinned = cell.classList.contains("tp-pin-left") || cell.classList.contains("tp-pin-right");
    const part = {
      left: Math.max(rect.left, shown.left, view.left, held && !pinned ? held.left : -Infinity),
      right: Math.min(rect.right, shown.right, view.right, held && !pinned ? held.right : Infinity),
      top: Math.max(rect.top, shown.top, view.top, held ? held.top : -Infinity),
      bottom: Math.min(rect.bottom, shown.bottom, view.bottom, held ? held.bottom : Infinity),
    };
    return part.right > part.left && part.bottom > part.top ? part : undefined;
  }

  /** Whether any of the element is in view: inside the page's scroll view and the table's sideways view */
  private isShown(widget: HTMLElement, info: WidgetInfo, element: Element): boolean {
    // Out of the document while its table is in it (a large table's row out of view)
    if (!element.isConnected && info.table.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const view = this.viewBounds(widget);
    const box = this.innerBox(widget);
    const head = info.table.tHead;
    // A body cell under the header held at the top is out of view
    const top = Math.max(view.top, box.top, head && element.closest("tbody") ? head.getBoundingClientRect().bottom : -Infinity);
    // ... and one under the rows held at the bottom
    const bottom = Math.min(view.bottom, box.bottom, element.closest("tbody") ? this.heldBounds(info).bottom : Infinity);
    return rect.bottom > top && rect.top < bottom && rect.right > box.left && rect.left < box.right;
  }

  // ---- layout: what follows scrolling ------------------------------------------

  /** Once per frame after scrolling or rendering: the sticky header, then what points at it */
  private barPlaceQueued = false;

  private queueStickyUpdate(): void {
    if (this.stickyQueued) return;
    this.stickyQueued = true;
    const run = () => {
      this.stickyQueued = false;
      if (this.stopped) return;
      // The cell's popup stays over its cell, before what is placed by it (a formula's help)
      this.cellEditor.placePopup();
      for (const feature of this.features) feature.layoutChanged?.();
      this.showQuietMarks();
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

  viewBounds(element: HTMLElement): { left: number; right: number; top: number; bottom: number } {
    const win = this.doc.defaultView!;
    // A table whose box is laid over the window (position: fixed, e.g. shown full screen) is in view across the window
    const widget = element.closest<HTMLElement>(WIDGET_SELECTOR);
    const overWindow = !!widget && win.getComputedStyle(widget).position === "fixed";
    // A page too short to scroll has no scroll parent, but its view still starts below the top bar
    const scroller = overWindow ? undefined : (this.scrollParentOf(element) ?? element.closest<HTMLElement>(SCROLLER_SELECTOR) ?? undefined);
    const rect = scroller?.getBoundingClientRect();
    // Not laid out (in tests): the window
    const view = rect && rect.height > 0 ? rect : { left: 0, right: win.innerWidth, top: 0, bottom: win.innerHeight };
    // An on-screen keyboard that only shrinks the visual viewport covers the page's bottom
    const visual = win.visualViewport;
    const visibleBottom = visual && visual.height > 0 ? visual.offsetTop + visual.height : Infinity;
    const visibleTop = visual && visual.height > 0 ? visual.offsetTop : -Infinity;
    return { left: view.left, right: view.right, top: Math.max(view.top, visibleTop), bottom: Math.min(view.bottom, visibleBottom) };
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // The settings dialog's keys are its own (not a selected cell's, not the table menu's), a feature's dialog's too
    if (e.target instanceof Node && this.dialogs.contains(e.target)) return;
    if (this.settingsDialog?.isOpen && e.target instanceof Node && this.settingsDialog.contains(e.target)) return;
    // Keys may scroll (PageDown, a cell editor moving to the next cell): a table written is not held in place against them
    this.dropAnchor();
    if (e.key === "Escape" && this.tableMenu) {
      e.preventDefault();
      e.stopPropagation();
      this.closeTableMenu(true);
      return;
    }
    if (this.cellMenuKey(e)) return;
    for (const feature of this.features) if (feature.keyDown?.(e)) return;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Control") this.cellEditor.setNavigating(false);
  };

  // Over the band around the table where a + inserts: as over the table, its controls stay
  private inInsertBand = false;
  // Where a hovering pointer was last, and the table a + inserted into, to show the + again once it is rendered anew
  private lastPointer: { readonly pointerType: string; readonly clientX: number; readonly clientY: number } | undefined;
  private insertedIn: string | undefined;

  // The pointer left the window: the + goes (no move tells it so)
  private onPointerOut = (e: PointerEvent): void => {
    if (e.relatedTarget !== null) return;
    this.lastPointer = undefined;
    this.inInsertBand = this.hideInsert();
  };

  /**
   * While Ctrl is held in a cell editor the pointer shows the move cursor over
   * a table: on the cell under it only (the table where it is between cells),
   * moved with it. A class on an ancestor of every cell (body) made the browser
   * recalculate the whole page's style on every press and release of Ctrl.
   */
  private markNavigating(): void {
    const pointer = this.lastPointer;
    const under = this.navigating && pointer ? this.doc.elementFromPoint?.(pointer.clientX, pointer.clientY) : null;
    const table = `${WIDGET_SELECTOR}.tp-table`;
    const target = under?.closest<HTMLElement>(`${table} td, ${table} th`) ?? under?.closest<HTMLElement>(table) ?? undefined;
    if (target === this.navigatingAt) return;
    this.navigatingAt?.classList.remove(NAVIGATING_CLASS);
    target?.classList.add(NAVIGATING_CLASS);
    this.navigatingAt = target;
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.lastPointer = { pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY };
    if (this.navigating) this.markNavigating();
    const busy = this.features.map((f) => f.pointerBusy?.()).find(Boolean);
    this.inInsertBand = !this.tableMenu && busy !== "drag" ? this.showInsert(e, !busy) : this.hideInsert();
  };

  private onMouseMove = (e: MouseEvent): void => {
    // A pressed button: dragging a scrollbar or selecting; the controls stay where they are
    const busy = this.features.map((f) => f.pointerBusy?.()).find(Boolean);
    if (this.tableMenu || busy === "drag" || e.buttons !== 0) return;
    const target = e.target;
    if ((target instanceof Node && this.isFloating(target)) || this.inInsertBand) {
      this.cancelHide();
      return;
    }
    const hit = this.enhancedWidgetOf(target);
    if (!hit) {
      if (!busy && !this.overScrollbar(e)) this.scheduleHide();
      return;
    }
    const [widget, info] = hit;
    this.cancelHide();
    if (this.hoverWidget !== widget) {
      // A menu open: the controls stay in its table (its grips follow the pointer there)
      if (busy) return;
      this.hoverWidget = widget;
      this.showTableControls(widget, info);
    }
    // The grips stay with the edited cell (hoverEdited)
    if (this.cellEditor.active) return;
    // Not over a cell (e.g. the table's own scrollbar): the grips stay on the last cell
    const cell = this.tableCellOf(info, target);
    if (cell && cell !== this.hoverCell) {
      this.hoverCell = cell;
      this.cellHovered(widget, info, cell);
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
    // As the view placed them, also those a feature keeps out of the document
    const placed = this.shownOrder.get(info.table);
    if (placed) return [...placed];
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
    const tr = ref.row === 0 ? info.table.rows[0] : this.bodyRows(info)[ref.row - 1];
    if (!tr || (tr.classList.contains("tp-hidden") && !includeHidden)) return undefined;
    return tr.cells[ref.column];
  }

  focusEditor(widget: HTMLElement): void {
    // Not after a touch (core/touch-keyboard.ts)
    if (this.touchKeyboard.letGoOfFocus()) return;
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
      // What the write needs read is read before the page's text (other pages,
      // which take a while), so the text the edit is computed from is not stale
      // by the time it is written
      for (const feature of this.features) await feature.prepareWrite?.(info);
      const text = await this.bridge.getText();
      this.pageText = text;
      const range = locateBySource(text, info.hint, info.source);
      // The edits features hold for the table go into it first: the change applies to the table as shown
      const held = range ? this.features.flatMap((f) => f.pendingEdits?.(info) ?? []) : [];
      const before = range && held.reduce((table, pending) => pending.apply(table), parseTable(range.text));
      const edited = before && change(before);
      if (!range || !before || !edited) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const page: WritePage = { text, tables: pageTablesOf(text), from: range.from };
      for (const feature of this.features) await feature.prepareEdit?.(edited, page);
      // The features' write steps (formulas), then the core's (metadata)
      const edit = { ...options, page };
      let changed = edited;
      for (const feature of this.features) if (feature.writeStep) changed = feature.writeStep(before, changed, edit);
      changed = this.writeSteps.reduce((table, step) => step(before, table, options), changed);
      // With the autoFormat setting every edited table is written aligned
      const format = await this.setting("autoFormat");
      const serialize = (t: Table) => serializeTable(format ? { ...t, padded: true } : t);
      const markdown = serialize(changed);
      if (markdown === range.text) {
        for (const pending of held) pending.written();
        return "unchanged";
      }
      // Other tables the features change with it (those whose formulas refer
      // to it), in the same edit: one Ctrl+Z undoes it all
      const updates: { readonly range: TableRange; readonly markdown: string }[] = [{ range, markdown }];
      for (const feature of this.features) {
        for (const other of feature.otherTablesWritten?.(before, changed, edit) ?? []) {
          updates.push({ range: other.range, markdown: serialize(other.table) });
        }
      }
      if (columnMap) {
        this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
        for (const feature of this.features) feature.columnsMoved?.(info.key, columnMap);
      }
      if (focus) this.cellEditor.editAfterWrite(info.key, focus);
      this.holdAfterWrite(info.key, options);
      this.scrollLefts.set(info.key, widget.scrollLeft);
      this.scrollTops.set(info.key, widget.scrollTop);
      let written = text;
      for (const update of [...updates].sort((a, b) => b.range.from - a.range.from)) {
        written = written.slice(0, update.range.from) + update.markdown + written.slice(update.range.to);
      }
      const replace = minimalEdit(text, written);
      // The edit spans all the tables written: features see that span, so what
      // they place after it (the history marker) is outside every one of them
      const spanFrom = Math.min(...updates.map((update) => update.range.from));
      const spanTo = Math.max(...updates.map((update) => update.range.to));
      const after: ((editFrom: number, lengthChange: number) => void)[] = [];
      for (const feature of this.features) {
        const then = await feature.beforeWrite?.(text, spanFrom, spanTo, replace);
        if (then) after.push(then);
      }
      this.anchorAt(widget, info.key);
      await this.bridge.replaceRange(replace.from, replace.to, replace.insert);
      this.pageText = written;
      for (const pending of held) pending.written();
      for (const then of after) then(replace.from, written.length - text.length);
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

  // ---- inserting rows and columns: a + on a border --------------------------

  /**
   * A pointer that hovers (a mouse, a pen) near a border of the table shown:
   * on a border between rows (or under the last), left of the table, or between
   * columns (or right of the last), above the header, a + inserts one there.
   * A finger does not hover: it inserts from the row and column menus.
   * Whether the pointer is in that band around the table.
   */
  // `mark` false (a menu open): the grips follow the pointer along the edges, no + is shown
  private showInsert(e: Pick<PointerEvent, "pointerType" | "buttons" | "target" | "clientX" | "clientY">, mark = true): boolean {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (e.pointerType === "touch" || e.buttons !== 0 || !widget || !info || renderedTable(widget) !== info.table) return this.hideInsert();
    if (e.target instanceof Node && this.insertMark.contains(e.target)) return true;
    if (e.target instanceof Node && this.isFloating(e.target)) return this.hideInsert();
    const shown = this.shownRect(widget, info);
    const header = info.table.rows[0]!.getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    // Left of the table: the borders under the header and under each row shown;
    // over the row grip (on the edge) the band, but no +; left of it, the +
    // on the border nearest the pointer, so it needs no aiming
    if (x >= shown.left - INSERT_LANE_BAND && x <= shown.left + 2 && y >= header.top && y <= shown.bottom + INSERT_LANE_PAST) {
      // Body rows as far as they show between the rows held over them (the
      // header held at the top, rows pinned there or to the bottom): one that
      // scrolled under them gets no grip, its border no +
      const held = this.heldBounds(info);
      const body = (tr: HTMLTableRowElement) => tr.parentElement?.tagName === "TBODY";
      const span = (tr: HTMLTableRowElement) => {
        const r = tr.getBoundingClientRect();
        // (A DOMRect's fields are getters: spreading it copies none)
        return body(tr) ? { top: Math.max(r.top, held.top), bottom: Math.min(r.bottom, held.bottom), edge: r.bottom } : { top: r.top, bottom: r.bottom, edge: r.bottom };
      };
      const rows = this.shownRows(info).filter((tr) => span(tr).bottom > span(tr).top + 1);
      // The row grip goes to the row beside the pointer
      const beside = rows.find((tr, i) => i > 0 && y >= span(tr).top && y < span(tr).bottom);
      if (beside) this.hoverAt(widget, info, beside.cells[this.hoverCell?.cellIndex ?? 0] ?? beside.cells[0]);
      // The borders under the rows shown, where they show
      const edges = rows
        .map((tr, i) => ({ edge: span(tr).edge, i }))
        .filter(({ edge, i }) => !body(rows[i]!) || (edge >= held.top - 1 && edge <= held.bottom + 1));
      if (mark && x <= shown.left - INSERT_LANE_FROM && edges.length) {
        const { edge, i } = edges.reduce((best, e) => (Math.abs(y - e.edge) < Math.abs(y - best.edge) ? e : best));
        const next = rows[i + 1];
        const below = next && Number(next.dataset.tpRow);
        const above = i > 0 ? Number(rows[i]!.dataset.tpRow) : undefined;
        // Above the row shown below the border; under the last one, at the end (above rows pinned to the bottom)
        const at = below !== undefined && below > 0 ? below : appendRowAt(info.pins, info.rows);
        const beside: RowHold = below !== undefined && below > 0 ? { before: below } : above !== undefined ? { after: above } : {};
        this.markInsert(widget, info, { key: info.key, axis: "row", at, beside }, edge, shown);
        return true;
      }
      return this.hideInsert(true);
    }
    // Above the header: the borders between columns, and right of the last; over
    // the column grip (on the header's top edge) the band, but no +; above it,
    // the + on the border nearest the pointer, as for rows
    if (y >= header.top - INSERT_LANE_BAND && y <= header.top + 2 && x >= shown.left - INSERT_REACH && x <= shown.right + INSERT_LANE_PAST) {
      const cells = Array.from(info.table.rows[0]!.cells);
      const pinned = (c: HTMLTableCellElement) => c.classList.contains("tp-pin-left") || c.classList.contains("tp-pin-right");
      // The column grip goes to the column under the pointer (in the row hovered last): a pinned
      // column over one the table scrolled sideways under it
      const under = cells.filter((c) => x >= c.getBoundingClientRect().left && x < c.getBoundingClientRect().right);
      const column = (under.find(pinned) ?? under[0])?.cellIndex ?? -1;
      const row = (this.hoverCell?.parentElement as HTMLTableRowElement | undefined) ?? info.table.rows[0]!;
      if (column >= 0 && row.closest("table") === info.table) this.hoverAt(widget, info, row.cells[column]);
      // The borders in view (a wide table scrolls sideways, under its pinned
      // columns), by the column they insert at: a pinned column's, and the
      // others' between the pinned ones
      const held = this.heldBounds(info);
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
        this.markInsert(widget, info, { key: info.key, axis: "column", at, beside: {} }, edge, shown);
        return true;
      }
      return this.hideInsert(true);
    }
    return this.hideInsert();
  }

  /** As if the pointer were over this cell: the grips go to its row and column */
  private hoverAt(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement | undefined): void {
    if (!cell || cell === this.hoverCell || this.cellEditor.active) return;
    this.hoverCell = cell;
    this.cellHovered(widget, info, cell);
  }

  private markInsert(
    _widget: HTMLElement,
    info: WidgetInfo,
    at: NonNullable<Controller["insertAt"]>,
    edge: number,
    shown: { left: number; right: number; top: number; bottom: number },
  ): void {
    this.insertAt = at;
    const mark = this.insertMark;
    mark.title = at.axis === "row" ? "Insert a row here" : "Insert a column here";
    mark.setAttribute("aria-label", mark.title);
    mark.classList.add("tp-visible");
    this.placeInsert(mark, info, at.axis, edge, shown);
    // The quiet + on its axis gives way
    this.showQuietMarks();
  }

  /**
   * A + and the line it inserts at: a row's left of the row grips, the line
   * across the table; a column's above the column grips, the line down the
   * table
   */
  private placeInsert(
    mark: HTMLElement,
    info: WidgetInfo,
    axis: "row" | "column",
    edge: number,
    shown: { left: number; right: number; top: number; bottom: number },
    // The line is one for all the +: drawn for the one it belongs to (the pointer's, or the quiet one under the pointer)
    withLine = true,
  ): void {
    const line = this.insertLine;
    if (withLine) line.classList.add("tp-visible");
    if (axis === "row") {
      const center = shown.left - INSERT_LANE_AT;
      if (withLine) Object.assign(line.style, { left: `${center}px`, top: `${edge - 1}px`, width: `${shown.right - center}px`, height: "2px" });
      this.place(mark, center - mark.offsetWidth / 2, edge - mark.offsetHeight / 2);
    } else {
      const center = info.table.rows[0]!.getBoundingClientRect().top - INSERT_LANE_AT;
      if (withLine) Object.assign(line.style, { left: `${edge - 1}px`, top: `${center}px`, width: "2px", height: `${shown.bottom - center}px` });
      this.place(mark, edge - mark.offsetWidth / 2, center - mark.offsetHeight / 2);
    }
  }

  /**
   * The + the pointer brought up goes (the quiet ones come back); `inBand`:
   * the pointer is still in the band around the table (the table's controls
   * stay)
   */
  private hideInsert(inBand = false): boolean {
    this.insertAt = undefined;
    this.insertMark.classList.remove("tp-visible");
    this.insertLine.classList.remove("tp-visible");
    this.showQuietMarks();
    return inBand;
  }

  /** A cell is hovered or edited (or the page moved under it): the features follow it; the quiet + of a last row or column */
  private cellHovered(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    for (const feature of this.features) feature.cellHovered?.(widget, info, cell);
    this.showQuietMarks();
  }

  selectionChanged(): void {
    this.showQuietMarks();
    for (const feature of this.features) feature.selectionChanged?.();
  }

  /**
   * The table whose last row or column has the cell edited, the cell hovered
   * or a selected cell (in this order), and which of the two
   */
  private quietTarget(): { widget: HTMLElement; info: WidgetInfo; row: boolean; column: boolean } | undefined {
    const editing = this.cellEditor.active?.cell;
    const hovered = this.hoverCell?.isConnected ? this.hoverCell : undefined;
    const selected = Array.from(this.doc.querySelectorAll<HTMLTableCellElement>(".tp-selected"));
    const first = editing ?? hovered ?? selected[0];
    const hit = first && this.enhancedWidgetOf(first);
    if (!hit) return undefined;
    const [widget, info] = hit;
    const rows = this.shownRows(info);
    const lastRow = rows.length > 1 ? rows[rows.length - 1] : undefined;
    const lastColumn = info.table.rows[0]!.cells.length - 1;
    const cells = [editing, hovered, ...selected].filter((cell) => cell?.closest("table") === info.table);
    const row = cells.some((cell) => cell!.parentElement === lastRow);
    const column = cells.some((cell) => cell!.cellIndex === lastColumn);
    return row || column ? { widget, info, row, column } : undefined;
  }

  /** Where a row (column) is added at the end: its edge, and the insert there */
  private endOf(widget: HTMLElement, info: WidgetInfo, axis: "row" | "column") {
    const shown = this.shownRect(widget, info);
    if (axis === "row") {
      const rows = this.shownRows(info);
      const last = rows[rows.length - 1]!;
      const at = { key: info.key, axis, at: appendRowAt(info.pins, info.rows), beside: { after: Number(last.dataset.tpRow) } };
      return { at, edge: last.getBoundingClientRect().bottom, shown };
    }
    const cells = info.table.rows[0]!.cells;
    const at = { key: info.key, axis, at: appendColumnAt(info.pins, info.columns), beside: {} };
    return { at, edge: cells[cells.length - 1]!.getBoundingClientRect().right, shown };
  }

  /** The quiet + of the last row and column (quietTarget), but on an axis where the pointer brought up a +, or out of view */
  private showQuietMarks(): void {
    const target = this.quietTarget();
    for (const axis of ["row", "column"] as const) {
      const mark = this.quietMarks[axis];
      if (!target || !target[axis] || this.insertAt?.axis === axis) {
        mark.classList.remove("tp-visible");
        continue;
      }
      const { widget, info } = target;
      const end = this.endOf(widget, info, axis);
      const view = this.viewBounds(widget);
      // Where it goes: the border under the last row, the header's top at the last column
      const y = axis === "row" ? end.edge : info.table.rows[0]!.getBoundingClientRect().top - INSERT_LANE_AT;
      // A last body row scrolled under the rows held at the top has its border there too: out of view
      const held = this.heldBounds(info);
      const inView =
        y >= view.top && y <= view.bottom && (axis === "row" ? end.edge >= held.top - 1 : end.edge <= end.shown.right + INSERT_REACH);
      if (!inView) {
        mark.classList.remove("tp-visible");
        continue;
      }
      // Shown before it is placed: hidden, it has no size to centre by
      mark.classList.add("tp-visible");
      this.placeInsert(mark, info, axis, end.edge, end.shown, false);
    }
    // The line: the pointer's +'s (left as it is), else the quiet + under the pointer's, else none
    if (this.insertAt) return;
    const hovered = this.quietHovered;
    if (hovered && this.quietMarks[hovered].classList.contains("tp-visible")) this.lineAtEnd(hovered);
    else this.insertLine.classList.remove("tp-visible");
  }

  /** The pointer on a quiet +: the line where it adds */
  private lineAtEnd(axis: "row" | "column"): void {
    const target = this.quietTarget();
    if (!target || this.insertAt) return;
    const end = this.endOf(target.widget, target.info, axis);
    this.placeInsert(this.quietMarks[axis], target.info, axis, end.edge, end.shown);
  }

  /** A quiet + pressed: a row (column) added at the end, its first cell (name) edited */
  private insertAtEnd(axis: "row" | "column"): void {
    const target = this.quietTarget();
    if (!target) return;
    const { widget, info } = target;
    const { at } = this.endOf(widget, info, axis);
    this.insertedIn = info.key;
    if (axis === "row") void insertRowWith(this, widget, info, at.at, this.firstVisibleColumn(widget, info), undefined, at.beside);
    else void insertColumnWith(this, widget, info, at.at);
  }

  /** The + clicked: a row (column) inserted there, its first cell (name) edited */
  private insertHere(): void {
    const at = this.insertAt;
    const widget = at && this.widgetForKey(at.key);
    const info = widget && this.infos.get(widget);
    if (!at || !widget || !info) return;
    // The table rendered anew shows the + again under the pointer (reshowInsert): another click inserts another
    this.insertedIn = at.key;
    if (at.axis === "row") void insertRowWith(this, widget, info, at.at, this.firstVisibleColumn(widget, info), undefined, at.beside);
    else void insertColumnWith(this, widget, info, at.at);
  }

  /** A table rendered anew after a + inserted into it: the + where the pointer still is */
  private reshowInsert(widget: HTMLElement, info: WidgetInfo): void {
    if (this.insertedIn !== info.key || !this.lastPointer) return;
    this.insertedIn = undefined;
    this.hoverWidget = widget;
    this.insertUnderPointer();
  }

  /** The + where the pointer is now, as a move there would show it */
  private insertUnderPointer(): void {
    const pointer = this.lastPointer;
    const busy = this.features.map((f) => f.pointerBusy?.()).find(Boolean);
    if (!pointer || this.tableMenu || busy === "drag") {
      this.inInsertBand = this.hideInsert();
      return;
    }
    const target = this.doc.elementFromPoint?.(pointer.clientX, pointer.clientY) ?? null;
    this.inInsertBand = this.showInsert({ ...pointer, buttons: 0, target }, !busy);
  }

  /** The leftmost column in view, so editing a new row does not scroll a wide table back */
  private firstVisibleColumn(widget: HTMLElement, info: WidgetInfo): number {
    const left = widget.getBoundingClientRect().left;
    const cells = Array.from(info.table.rows[0]!.cells);
    const index = cells.findIndex((cell) => cell.getBoundingClientRect().left >= left - 1);
    return Math.max(0, index);
  }

  // ---- floating UI: the toolbar ----------------------------------------------

  floating<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
  ): HTMLElementTagNameMap[K] {
    const element = this.doc.createElement(tag);
    element.className = `tp-floating ${className}`;
    element.addEventListener("mousedown", (e) => {
      // keep the focus where it is (e.g. in a filter field); a field takes the press
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
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

  openDialog(options: DialogOptions): Dialog {
    return this.dialogs.open(options);
  }

  isFloating(node: Node): boolean {
    return (
      [this.bar, this.insertMark, this.insertLine, ...Object.values(this.quietMarks)].some((el) => el.contains(node)) ||
      this.cellEditor.owns(node) ||
      this.dialogs.contains(node) ||
      !!this.tableMenu?.element.contains(node) ||
      this.features.some((f) => f.owns?.(node))
    );
  }

  place(element: HTMLElement, left: number, top: number): void {
    const win = this.doc.defaultView!;
    // Measured at the window's left edge: placed further right, a box of no set width is as narrow as the room
    // left of it, and placing it again by that width would move it left and widen it on every call
    element.style.left = "0px";
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
    this.showQuietMarks();
    for (const feature of this.features) feature.hoverEnded?.(closeMenus);
  }

  private hideFloating(closeMenus = false): void {
    this.endHover(closeMenus);
    this.closeTableMenu(false);
    for (const el of [this.bar, this.insertMark, this.insertLine]) el.classList.remove("tp-visible");
    this.insertAt = undefined;
    this.hoverWidget = undefined;
    // A selected cell's quiet + stays
    this.showQuietMarks();
  }

  /**
   * The toolbar above the table and the add-row / add-column buttons; placed
   * now, or (`placeNow` false: after a change of the table) in the next frame
   */
  private showTableControls(widget: HTMLElement, info: WidgetInfo, placeNow = true): void {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    // A button with its label, or (with an icon) the icon alone, the label its accessible name
    const button = (item: ToolbarButton, className?: string): HTMLButtonElement => {
      const b = this.doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.title = item.title;
      if (className) b.className = className;
      if (item.place === "icon" && item.icon) {
        b.classList.add("tp-bar-icon");
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
      return b;
    };
    const featureButtons = this.features.flatMap((feature) => feature.toolbarButtons?.(widget, info) ?? []);
    // At the left, what the table is and how it is shown: its name, its sorting, its rows filtered
    for (const item of featureButtons.filter((b) => b.place === "label")) button(item, "tp-bar-label");
    // How the table is shown, each a chip whose × ends it: the sorting, the features' (filters)
    const chips: ToolbarButton[] = [];
    if (view.sort) {
      const { column, direction } = view.sort;
      const name = cellText(info.table.rows[0]!.cells[column]!) || `column ${column + 1}`;
      chips.push({
        label: `Sorted by ${name} ${direction === "asc" ? "↑" : "↓"}`,
        title: "Clear sorting: show the rows as written",
        place: "chip",
        run: () => {
          const [w, i] = this.current(widget, info);
          this.setSort(w, i, withoutSort(this.viewOf(i)));
        },
        // Apply: the rows are sorted in the markdown, and the sorting view ends
        actions: [{ icon: ICONS.applySort, title: "Sort the rows in the markdown this way", run: () => void this.applySort(widget, info) }],
      });
    }
    for (const item of [...chips, ...featureButtons.filter((b) => b.place === "chip")]) {
      const chip = this.doc.createElement("span");
      chip.className = "tp-status tp-chip";
      if (item.icon) chip.innerHTML = item.icon;
      chip.append(item.label);
      const small = (className: string, title: string, icon: string, run: () => void) => {
        const b = this.doc.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.className = className;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.innerHTML = icon;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          run();
        });
        return b;
      };
      for (const action of item.actions ?? []) chip.append(small("tp-chip-apply", action.title, action.icon, action.run));
      chip.append(small("tp-chip-clear", item.title, ICONS.clear, item.run));
      bar.append(chip);
    }
    // At the right, icons always in the same places: the features' (Recalculate, Filter), and the menu
    for (const item of featureButtons.filter((b) => b.place === "icon")) button(item);
    const menuItems = [
      ...featureButtons.filter((b) => (b.place ?? "menu") === "menu"),
      // Pinned rows and columns are at the edges already: unpinned, they stay where they are
      ...(hasPins(info.pins)
        ? [
            {
              label: "Unpin all",
              title: "Unpin all rows and columns: they stay where they are, and scroll and sort with the others",
              icon: ICONS.unpin,
              run: () => {
                const [w] = this.current(widget, info);
                void this.write(w, (t) => t, { pins: NO_PINS });
              },
            },
          ]
        : []),
      // Aligned already, it writes nothing
      {
        label: "Format table",
        title: "Align the table's markdown: its columns padded to one width",
        icon: ICONS.format,
        run: () => {
          const [w] = this.current(widget, info);
          void this.write(w, (t) => ({ ...t, padded: true }));
        },
      },
      {
        label: "Edit markdown",
        title: "Show this table as markdown",
        icon: ICONS.markdown,
        run: () => void this.showMarkdown(this.current(widget, info)[1]),
      },
      // Last before the destructive ones: not about this table
      {
        label: "Table Plus settings…",
        title: "Settings for every table in the space (not just this one): SilverBullet's configuration",
        icon: ICONS.settings,
        run: () => void this.openSettings(),
      },
    ];
    const more = button(
      {
        label: "More",
        title: "More for this table",
        place: "icon",
        icon: ICONS.more,
        run: () => (this.tableMenu?.kind === "table" ? this.closeTableMenu(true) : this.openTableMenu(widget, more, menuItems)),
      },
      "tp-bar-more",
    );
    if (this.tableMenu?.kind === "table") {
      // Shown again (a write, a change of the table's state): the open menu stays, at the new button
      more.classList.add("tp-active");
      this.tableMenu.anchor = more;
    }
    // Shown already: it stays where it is until placed
    if (placeNow || !bar.classList.contains("tp-visible")) this.placeBar(widget, info);
    else this.queuePlaceBar();
  }

  /** The toolbar placed above the table's header (or over its right end), and the open table menu with it */
  private placeBar(widget: HTMLElement, info: WidgetInfo): void {
    const bar = this.bar;
    const rect = widget.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    // The header as shown, which may be held at the top of the view
    const headerRect = info.table.rows[0]!.getBoundingClientRect();
    // The page's view: below SilverBullet's top bar, also on a page too short to scroll
    const shown = this.viewBounds(widget);
    bar.classList.add("tp-visible");
    const above = headerRect.top - bar.offsetHeight - BAR_GAP;
    // No room above the header: over the header's right end instead. A header
    // held at the top of the view has the room (STICKY_GAP): the toolbar goes
    // there, so it never covers a column's name while the page scrolls
    const held = info.table.tHead?.classList.contains("tp-stuck") ?? false;
    const fits = held || above >= shown.top + 2;
    const top = fits ? Math.max(above, shown.top) : headerRect.top + (headerRect.height - bar.offsetHeight) / 2;
    // At the table's right edge, or its box's when the table scrolls in it,
    // as far as it is in view: the page around a wide table may scroll
    // sideways too, taking the box's edge along. A box wider than its table
    // (a renderer's block) does not take the toolbar past the table.
    this.place(bar, Math.min(rect.right, tableRect.right, shown.right) - bar.offsetWidth - (fits ? BAR_CLEAR : 6), top);
    this.positionTableMenu();
  }

  /**
   * The toolbar's ⋯ menu: the table's actions that are not used all the time,
   * the destructive ones last, after a separator
   */
  private openTableMenu(widget: HTMLElement, anchor: HTMLElement, items: readonly ToolbarButton[]): void {
    const place = { kind: "table" as const, anchor };
    // An item with choices shows them in the menu's place, the back arrow (or ArrowLeft) the menu again
    const back = { icon: ICONS.arrowLeft, run: () => this.openTableMenu(widget, anchor, items) };
    const entry = (item: ToolbarButton): MenuEntry => ({
      kind: "item",
      label: item.label,
      icon: item.icon ?? "",
      hint: item.title,
      ...(item.value ? { value: { text: item.value } } : {}),
      ...(item.danger ? { danger: true } : {}),
      run: item.choices ? () => this.showMenu(widget, item.choices!.title, item.choices!.entries(), place, back) : item.run,
    });
    const safe = items.filter((item) => !item.danger).map(entry);
    const danger = items.filter((item) => item.danger).map(entry);
    this.showMenu(widget, "Table", [...safe, ...(safe.length && danger.length ? [{ kind: "separator" as const }] : []), ...danger], place);
  }

  /** A menu of the toolbar or of cells: its items close it when run; Escape or a press elsewhere closes it */
  private showMenu(
    widget: HTMLElement,
    title: string,
    entries: readonly MenuEntry[],
    place: { readonly kind: "table" | "cell"; readonly anchor?: HTMLElement; readonly point?: { x: number; y: number } },
    back?: MenuBack,
  ): void {
    this.closeTableMenu(false);
    const close = (run: () => void) => () => {
      this.closeTableMenu(false);
      run();
    };
    const closing = wrapRuns(entries, close);
    const element = renderMenu(this.doc, title, closing, back);
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    this.doc.body.append(element);
    this.tableMenu = { element, widget, ...place };
    place.anchor?.classList.add("tp-active");
    this.positionTableMenu();
    focusMenu(element);
  }

  /** Below the ⋯ button, its right edge at the button's; at the pointer; always inside the window */
  private positionTableMenu(): void {
    if (!this.tableMenu) return;
    const { element, anchor, point } = this.tableMenu;
    const win = this.doc.defaultView!;
    const m = element.getBoundingClientRect();
    let left: number;
    let top: number;
    if (anchor) {
      const a = anchor.getBoundingClientRect();
      left = a.right - m.width;
      top = a.bottom + 4;
      if (top + m.height > win.innerHeight - 4) top = a.top - m.height - 4;
    } else {
      left = point?.x ?? 0;
      top = point?.y ?? 0;
      if (top + m.height > win.innerHeight - 4) top -= m.height;
      if (left + m.width > win.innerWidth - 4) left -= m.width;
    }
    element.style.left = `${Math.round(Math.max(4, Math.min(left, win.innerWidth - m.width - 4)))}px`;
    element.style.top = `${Math.round(Math.max(4, top))}px`;
  }

  private closeTableMenu(refocus: boolean): void {
    const menu = this.tableMenu;
    if (!menu) return;
    this.tableMenu = undefined;
    const hadFocus = menu.element.contains(this.doc.activeElement);
    menu.element.remove();
    menu.anchor?.classList.remove("tp-active");
    if (refocus && hadFocus) this.focusEditor(menu.widget);
  }

  // ---- the cell menu: right click, a long press, the Menu key ------------------

  /**
   * The menu of a cell, or of the cells selected when it is one of them: what
   * the features offer (Feature.cellMenuEntries), in their groups' order.
   * False when none offers anything: the browser's menu stays.
   */
  openCellMenu(widget: HTMLElement, info: WidgetInfo, at: CellRef, point: { x: number; y: number }): boolean {
    // A feature's own menu there instead (rows selected whole: theirs); the others' menus and picking end, as for the cell menu
    const taker = this.features.find((f) => f.cellMenu?.(widget, info, at, point));
    if (taker) {
      for (const feature of this.features) if (feature !== taker) feature.cellMenuOpened?.();
      if (this.pressedWith === "touch") this.takePress();
      return true;
    }
    let cells: readonly CellRef[] = [at];
    for (const feature of this.features) {
      const selected = feature.selectedCells?.(info, at);
      if (selected) {
        cells = selected;
        break;
      }
    }
    const groups = this.features
      .flatMap((f) => [f.cellMenuEntries?.(widget, info, cells) ?? []].flat())
      .filter((group) => group.entries.length > 0)
      .sort((a, b) => a.order - b.order);
    if (groups.length === 0) return false;
    const entries = groups.flatMap((group, i): MenuEntry[] => [...(i ? [{ kind: "separator" as const }] : []), ...group.entries]);
    if (this.pressedWith === "touch") this.takePress();
    const header = cellText(info.table.rows[0]!.cells[at.column]!) || `column ${at.column + 1}`;
    const title = cells.length > 1 ? `${cells.length} cells` : at.row === 0 ? `Header: ${header}` : `Cell: ${header}, row ${at.row}`;
    for (const feature of this.features) feature.cellMenuOpened?.();
    this.showMenu(widget, title, entries, { kind: "cell", point });
    return true;
  }

  /** The cell a pointer event is on, in an enhanced table; not in the cell editor (its menu is the browser's) */
  private cellOfEvent(e: Event): [HTMLElement, WidgetInfo, CellRef] | undefined {
    if (!(e.target instanceof Element) || e.target.closest(".tp-cell-editor")) return undefined;
    const hit = this.enhancedWidgetOf(e.target);
    const cell = hit && this.tableCellOf(hit[1], e.target);
    const ref = hit && cell && this.cellRef(hit[1], cell);
    return hit && ref ? [hit[0], hit[1], ref] : undefined;
  }

  /** Right click (Shift+right click: the browser's menu) */
  private onContextMenu = (e: MouseEvent): void => {
    if (e.shiftKey) return;
    // A long press opened it already (Android fires this too)
    if (this.pressTaken()) {
      e.preventDefault();
      return;
    }
    const hit = this.cellOfEvent(e);
    if (hit && this.openCellMenu(hit[0], hit[1], hit[2], { x: e.clientX, y: e.clientY })) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /** What pressed (pressedWith); a long press on a touch screen: the cell menu, where no right click is (iOS fires no contextmenu) */
  private onPointerDown = (e: PointerEvent): void => {
    this.stopLongPress?.();
    // What pressed, for CSS (set only when it changes: the page's style is worked out again)
    const root = this.doc.documentElement;
    if (e.pointerType && root.dataset.tpPointer !== e.pointerType) root.dataset.tpPointer = e.pointerType;
    // A new press: the mouse events of the press taken are over
    this.pressTakenAt = 0;
    // A feature's own element in a cell (the fill handle) is no long press on the cell
    if (e.pointerType !== "touch" || (e.target instanceof Node && this.isFloating(e.target))) return;
    const hit = this.cellOfEvent(e);
    if (!hit) return;
    const win = this.doc.defaultView!;
    const { clientX: x, clientY: y } = e;
    const timer = setTimeout(() => {
      stop();
      if (this.tableMenu?.kind === "cell") return;
      this.openCellMenu(hit[0], hit[1], hit[2], { x, y });
    }, LONG_PRESS_MS);
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - x, ev.clientY - y) > 10) stop();
    };
    const stop = () => {
      clearTimeout(timer);
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", stop, true);
      win.removeEventListener("pointercancel", stop, true);
      this.stopLongPress = undefined;
    };
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", stop, true);
    win.addEventListener("pointercancel", stop, true);
    this.stopLongPress = stop;
  };

  /** The Menu key or Shift+F10 in a cell editor: the menu of the edited cell (or of the cells selected) */
  private cellMenuKey(e: KeyboardEvent): boolean {
    if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return false;
    const editing = this.cellEditor.active;
    const info = editing && this.infos.get(editing.widget);
    if (!editing || !info) return false;
    const rect = editing.cell.getBoundingClientRect();
    if (!this.openCellMenu(editing.widget, info, { row: editing.row, column: editing.column }, { x: rect.left, y: rect.bottom })) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  /** Where a table is in view: the table, cut to the box that scrolls it sideways */
  /**
   * Where the body shows between what is held over it as the page and the
   * table scroll: below the header (with the rows pinned to the top), above
   * the rows pinned to the bottom, between the columns pinned left and right.
   * What scrolls under those is out of view.
   */
  private heldBounds(info: WidgetInfo): { left: number; right: number; top: number; bottom: number } {
    const { tHead: head, tFoot: foot } = info.table;
    const header = Array.from(info.table.rows[0]!.cells);
    const lefts = header.filter((c) => c.classList.contains("tp-pin-left")).map((c) => c.getBoundingClientRect().right);
    const rights = header.filter((c) => c.classList.contains("tp-pin-right")).map((c) => c.getBoundingClientRect().left);
    return {
      top: head ? head.getBoundingClientRect().bottom : -Infinity,
      bottom: foot?.rows.length ? foot.getBoundingClientRect().top : Infinity,
      left: lefts.length ? Math.max(...lefts) : -Infinity,
      right: rights.length ? Math.min(...rights) : Infinity,
    };
  }

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
