// Enhances SilverBullet's rendered markdown tables in place: sorting, filtering,
// inline cell editing and row/column editing. Every change to the markdown is
// one `editor.replaceRange`, so undo works as for any other edit.
import { type Bridge, type FeatureName, moduleOnByDefault, SETTINGS, type SettingValue } from "./bridge.ts";
import { type CellEditor, type CellHit, type CellRef, editorRect, type ClipboardData, type LineDrag, type DragOptions, type Feature, type HandleLayer, type HandlePlace, type MarkLayer, type OutlineLayer, type Panel, type PanelAnchor, type PointerTarget, type Side, type RowHold, type TableHost, type TableLook, type TablePreview, type TableTarget, type WidgetInfo, type WriteOptions, type WritePage, type WriteResult, type WriteStep, type MetadataPart, type NamingTarget } from "./core/feature.ts";
import { type Dialog, type DialogOptions, Dialogs } from "./core/dialog.ts";
import { ViewAnchor } from "./core/anchor.ts";
import { placeAtEnd, TableRows } from "./core/rows.ts";
import { CellEditing } from "./core/editor.ts";
import { InsertControls, type PointerAt } from "./core/insert.ts";
import { TableMenu } from "./core/tablemenu.ts";
import { Toolbar } from "./core/toolbar.ts";
import { oncePerFrame } from "./core/frame.ts";
import { watchPress } from "./core/press.ts";
import { heldBounds, innerBox, isShown, overScrollbar, type Rect, scrollParentOf, scrollsInside, shownPart, shownRect, viewBounds } from "./core/geometry.ts";
import { TouchKeyboard } from "./core/touch-keyboard.ts";
import type { TableAdapter } from "./core/adapter.ts";
import { mergeLooks } from "./core/looks.ts";
import { Panels } from "./core/panel.ts";
import { type DragContext, followDrag } from "./core/drag.ts";
import { copyingFromMenu } from "./clipboard.ts";
import { markTable, renderedMeta, SilverBulletAdapter } from "./core/silverbullet/adapter.ts";
import { CONFIG_PAGE, withConfigSettings } from "./configpage.ts";
import { SettingsDialog } from "./settings.ts";
import { Metadata } from "./features/metadata.ts";
import { featureEntries } from "./modules.ts";
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
  type TableMeta,
  type TableRange,
} from "./markdown.ts";
import type { MenuEntry, MenuNaming } from "./menu.ts";
import { metadataAfterEdit, metaPins, metaSort, withMetaSort } from "./meta.ts";
import { keepTags } from "./tags.ts";
import { nameEmptyHeaders, reorderRows } from "./ops.ts";
import {
  cycleSort,
  DEFAULT_VIEW,
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

// A sorting is stored (metadata setting) once the clicks have settled
const STORE_SORT_DELAY_MS = 400;

const NOT_SAVED = "Silverware Table: the table changed in the meantime, nothing was saved";

// The element under the pointer while Ctrl is held in a cell editor (the move cursor, CSS)
const NAVIGATING_CLASS = "swt-navigating-here";

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
  // A table being written stays where it was in the page's view
  private readonly anchor: ViewAnchor;
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
  // Once per frame (oncePerFrame): looking for tables rendered; what follows scrolling
  private readonly queueScan: () => void;
  private readonly queueStickyUpdate: () => void;
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
  private warnedIncompatible = false;
  private observer: MutationObserver | undefined;
  private readonly toolbar: Toolbar;
  // Inserting rows and columns: a + on a border of the table, and the border marked
  private readonly insert: InsertControls;
  // Features that keep their own state and work through this controller
  // (core/feature.ts): those turned on, filled in when Silverware Table starts
  private readonly features: Feature[] = [];
  private featuresStarted: Promise<void> | undefined;
  // The modules turned on
  private readonly modulesOn = new Set<FeatureName>();
  // The open menu of a table's toolbar (⋯, at its button) or of cells (at the pointer)
  private readonly tableMenu: TableMenu;
  // When a press was last taken (a cell menu a touch opened, a feature's: takePress): its mouse events after it are no click on the cell
  private pressTakenAt = 0;
  private stopLongPress: (() => void) | undefined;
  private readonly metadata: Metadata;
  // Each table's rows as SilverBullet rendered them, in the document or not
  private readonly rows = new TableRows();
  // What renders the tables (SilverBullet's): what the core asks of the rendering goes through it
  private readonly adapter: TableAdapter;
  // The features' panels (TableHost.panel)
  private readonly panels: Panels;
  // The marks of cells (TableHost.markLayer), by mark: the cells of each table that have it
  private readonly markLayers = new Map<string, Map<string, readonly CellRef[]>>();
  // The outlines (TableHost.outlineLayer) and handles (handleLayer) shown, by layer: in which table, where
  private readonly outlines = new Map<
    string,
    { readonly pieces: (sides: readonly Side[]) => readonly string[]; at?: { readonly key: string; readonly rows: readonly number[]; readonly columns: readonly [number, number] } }
  >();
  private readonly handleLayers = new Map<string, { at?: { readonly key: string; readonly places: readonly HandlePlace[] } }>();
  private readonly dragContext: DragContext;
  // The tables marked (TableHost.tableMark), by mark
  private readonly tableMarks = new Map<string, Set<string>>();
  // Steps every write goes through after the edit, in this order
  private readonly writeSteps: readonly WriteStep[] = [metadataAfterEdit];

  constructor(
    readonly doc: Document,
    public bridge: Bridge,
  ) {
    this.adapter = new SilverBulletAdapter(doc, this.rows, {
      infoOf: (widget) => this.infos.get(widget),
      rowNeeded: (info, row) => this.rowNeeded(info, row),
      holdInDocument: (info, row) => this.holdInDocument(info, row),
      floating: (className) => this.floating("div", className),
      place: (element, left, top) => this.place(element, left, top),
    });
    this.dragContext = {
      doc,
      targetOf: (target) => this.targetOf(target),
      targetAt: (x, y) => this.targetOf(null, { x, y }),
      tableFor: (key) => this.tableFor(key),
      cellNear: (info, x, y) => this.adapter.cellNear(info, x, y),
      scrollNear: (info, x, y, sideways) => this.adapter.scrollNear(info, x, y, sideways),
      pageMark: (mark, on) => this.adapter.pageMark(mark, on),
    };
    this.panels = new Panels({
      doc,
      floating: (className) => this.floating("div", className),
      place: (element, left, top) => this.place(element, left, top),
      anchorRect: (anchor) => this.anchorRect(anchor),
      view: (anchor) => {
        const active = this.cellEditor.active;
        const info = anchor.kind === "cell" ? this.tableFor(anchor.key) : anchor.kind === "editor" && active ? this.infos.get(active.widget) : undefined;
        return this.adapter.pageView(info);
      },
    });
    this.dialogs = new Dialogs(doc);
    this.anchor = new ViewAnchor(doc, (key) => this.widgetForKey(key));
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
      viewResized: () => this.anchor.drop(),
    });
    this.tableMenu = new TableMenu(doc, (widget) => this.focusEditor(widget));
    this.toolbar = new Toolbar({
      host: this,
      menu: this.tableMenu,
      hovered: () => this.hoverWidget,
      stopped: () => this.stopped,
      buttons: (widget, info) => this.features.flatMap((feature) => feature.toolbarButtons?.(widget, info) ?? []),
      current: (widget, info) => this.current(widget, info),
      applySort: (widget, info) => void this.applySort(widget, info),
      showMarkdown: (info) => void this.showMarkdown(info),
      openSettings: () => void this.openSettings(),
    });
    this.insert = new InsertControls({
      host: this,
      hovered: () => ({ widget: this.hoverWidget, cell: this.hoverCell }),
      hoverTable: (widget) => {
        this.hoverWidget = widget;
      },
      hoverAt: (widget, info, cell) => this.hoverAt(widget, info, cell),
      pointer: () => this.lastPointer,
      busy: () => this.pointerBusy(),
      menuOpen: () => this.tableMenu.kind !== undefined,
      floatingButton: (className, title, icon) => this.floatingButton(className, title, icon),
    });
    this.queueScan = oncePerFrame(doc, () => {
      void this.scan();
      // The page changed (e.g. the Configuration Manager opened or closed): settings may have too
      this.queueSettingsRefresh();
    });
    this.queueStickyUpdate = oncePerFrame(doc, () => this.followLayout());
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
    win.addEventListener("copy", this.onClipboard, true);
    win.addEventListener("cut", this.onClipboard, true);
    win.addEventListener("blur", this.onBlur);
    this.doc.addEventListener("pointermove", this.onPointerMove, { passive: true });
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });
    this.doc.addEventListener("pointerout", this.onPointerOut, { passive: true });
    win.addEventListener("mouseup", this.onMouseUp, true);
    // The user scrolls: a table written is no longer kept in its place
    win.addEventListener("wheel", this.anchor.drop, { capture: true, passive: true });
    win.addEventListener("touchstart", this.anchor.drop, { capture: true, passive: true });

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
   * (`silverware.table.modules.<name>.enabled`). Read once: a change applies when the
   * page is loaded again.
   */
  private async startFeatures(): Promise<void> {
    const all = featureEntries(this, this.metadata);
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
      const value = await this.bridge.getConfig?.(`silverware.table.modules.${name}.enabled`, moduleOnByDefault(name));
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
    delete this.doc.documentElement.dataset.swtPointer;
    win.removeEventListener("dblclick", this.onDoubleClick, true);
    win.removeEventListener("scroll", this.onScroll, true);
    win.removeEventListener("keydown", this.onKeyDown, true);
    win.removeEventListener("copy", this.onClipboard, true);
    win.removeEventListener("cut", this.onClipboard, true);
    for (const feature of this.features) feature.stop?.();
    win.removeEventListener("keyup", this.onKeyUp, true);
    win.removeEventListener("blur", this.onBlur);
    this.doc.removeEventListener("pointermove", this.onPointerMove);
    this.doc.removeEventListener("mousemove", this.onMouseMove);
    this.doc.removeEventListener("pointerout", this.onPointerOut);
    win.removeEventListener("mouseup", this.onMouseUp, true);
    // An editor open in its popup (in the page's body) goes too
    this.cellEditor.close();
    win.removeEventListener("wheel", this.anchor.drop, true);
    win.removeEventListener("touchstart", this.anchor.drop, true);
    this.touchKeyboard.stop();
    this.anchor.drop();
    this.observer?.disconnect();
    clearTimeout(this.settingsTimer);
    for (const timer of this.sortTimers.values()) clearTimeout(timer);
    this.tableMenu.close(false);
    this.toolbar.remove();
    this.insert.remove();
    this.settingsDialog?.close();
    this.dialogs.close();
    this.panels.removeAll();
    this.adapter.stop();
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

  editBeyond(widget: HTMLElement, info: WidgetInfo, at: CellRef, cell: HTMLTableCellElement): void {
    if (at.row < info.rows && at.column < info.columns) return;
    this.cellEditor.open(widget, info, cell, false, false, undefined, at);
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
    this.toolbar.changed();
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
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.swt-table`))) {
      const info = this.infos.get(widget);
      if (info && renderedTable(widget) === info.table) this.applyView(widget, info);
    }
    this.queueStickyUpdate();
  }

  rearranged(info: WidgetInfo): boolean {
    return !!this.viewOf(info).sort || this.features.some((f) => f.hidesRows?.(info));
  }

  // ---- discovering rendered tables --------------------------------------

  /**
   * Tables SilverBullet just put into the page (a mutation observer's callback
   * runs before the browser lays them out): their rows kept, and the features
   * told, so they may take rows out of the document before they cost a layout
   */
  private tablesAdded(records: readonly MutationRecord[]): void {
    if (!this.features.some((f) => f.tableAdded || f.tableLook)) return;
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        // Inside a table: its own content (Silverware Table's decorations), not a new table
        const tables = node instanceof HTMLTableElement ? [node] : node.closest("table") ? [] : Array.from(node.getElementsByTagName("table"));
        for (const table of tables) {
          const widget = table.closest<HTMLElement>(WIDGET_SELECTOR);
          if (!widget || this.rows.knows(table) || this.ownTable(widget)) continue;
          const rows = this.rows.renderedRows(table);
          // How it looks as a whole, from its metadata as rendered, before the browser lays it out
          markTable(widget, this.tableLook(renderedMeta(rows)));
          for (const feature of this.features) feature.tableAdded?.(widget, table, rows);
        }
      }
    }
  }

  /** A table in one of Silverware Table's floating elements (a theme's preview in a menu): not one of the page's */
  private ownTable(widget: HTMLElement): boolean {
    return !!widget.closest(".swt-floating");
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
      if (this.infos.get(widget)?.table === table || widget.dataset.swtUnsupported) continue;
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
      const rendered = this.rows.renderedRows(table);
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
      this.anchor.keep(info.key, widget);
      this.cellEditor.takePending(widget, info);
      this.anchor.again(widget, info.key);
      for (const feature of this.features) feature.enhanced?.(widget, info);
      // The cell showing the move cursor was rendered anew (Ctrl+arrows saved a cell)
      if (this.navigating) this.markNavigating();
      this.insert.tableEnhanced(widget, info);
      this.queueStickyUpdate();
      void this.refreshSettings();
    } catch (e) {
      console.error("Silverware Table: could not enhance a table", e);
    }
  }

  private markUnsupported(widget: HTMLElement, incompatible: boolean): void {
    widget.dataset.swtUnsupported = "true";
    if (!incompatible || this.warnedIncompatible) return;
    this.warnedIncompatible = true;
    const message =
      "Silverware Table is inactive: this SilverBullet version renders tables differently than expected";
    console.warn(message);
    void this.bridge.flash(message, "error");
  }

  /**
   * A table with unnamed columns renders with its header shifted against its
   * data, so Silverware Table leaves it alone and offers to name those columns
   */
  private offerHeaderFix(widget: HTMLElement, source: string, hint: number): void {
    if (widget.querySelector(".swt-notice")) return;
    const notice = this.doc.createElement("div");
    notice.className = `${UI_CLASS} swt-notice`;
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
      console.error("Silverware Table: could not name the columns", e);
      void this.bridge.flash(`Silverware Table: could not name the columns (${String(e)})`, "error");
    }
  }

  private decorate(widget: HTMLElement, info: WidgetInfo): void {
    widget.classList.add("swt-table");
    const rows = [...this.rows.renderedRows(info.table)];
    const metaRow = info.metaRow ? rows.pop() : undefined;
    this.rows.setBodyRows(info.table, rows.slice(1));
    metaRow?.classList.add("swt-meta-row");
    // Pinned rows and columns carry the pin icon of their menu item
    const mark = (icon: string, title: string) => {
      const span = this.doc.createElement("span");
      span.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} swt-pin-mark`;
      span.title = title;
      span.innerHTML = icon;
      return span;
    };
    const { top, bottom, left, right } = info.pins;
    rows.slice(1).forEach((tr, i) => {
      const row = i + 1;
      tr.dataset.swtRow = String(row);
      if (row <= top) tr.cells[0]?.append(mark(ICONS.pinTop, "Pinned to the top"));
      else if (row > rows.length - 1 - bottom) tr.cells[0]?.append(mark(ICONS.pinBottom, "Pinned to the bottom"));
    });
    Array.from(rows[0]!.cells).forEach((cell, column) => {
      if (column < left) cell.append(mark(ICONS.pinLeft, "Pinned to the left"));
      else if (column >= info.columns - right) cell.append(mark(ICONS.pinRight, "Pinned to the right"));
      const button = this.doc.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.className = `${UI_CLASS} swt-sort`;
      button.dataset.swtAction = "sort";
      button.dataset.swtColumn = String(column);
      cell.append(button);
    });
    for (const feature of this.features) feature.decorate?.(widget, info);
    this.adapter.applyTableLook(info, this.tableLook(parseTable(info.source).meta));
    this.applyLooks(info);
    this.marksAgain(info);
    // Last: the header's name on one line with the icons the features added
    for (const cell of Array.from(rows[0]!.cells)) layOutHeaderCell(cell);
  }

  // ---- view: sort and filter --------------------------------------------

  viewOf(info: TableTarget): ViewState {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }

  keepTags(value: string, from: string): string {
    return keepTags(value, from, new Set(this.features.flatMap((f) => f.takesTags?.() ?? [])));
  }

  clickSelects(): boolean {
    return this.features.some((f) => f.clickSelects?.());
  }

  menuNaming(info: WidgetInfo, target: NamingTarget): MenuNaming | undefined {
    const widget = this.widgetOf(info);
    for (const feature of this.features) {
      const naming = feature.menuNaming?.(widget, info, target);
      if (naming) return naming;
    }
    return undefined;
  }

  openTableMenu(widget: HTMLElement, naming = false): void {
    this.toolbar.openMenu(widget, naming);
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

  viewChangedFor(key: string): void {
    const widget = this.widgetForKey(key);
    const info = widget && this.infos.get(widget);
    if (widget && info) this.viewChanged(widget, info);
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
  setSort(info: WidgetInfo, view: ViewState): void {
    this.setView(this.widgetOf(info), info, view);
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

  tableFor(key: string): WidgetInfo | undefined {
    const widget = this.widgetForKey(key);
    return widget && this.infos.get(widget);
  }

  shownTables(): WidgetInfo[] {
    const shown: WidgetInfo[] = [];
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.swt-table`))) {
      const info = this.infos.get(widget);
      if (info && renderedTable(widget) === info.table) shown.push(info);
    }
    return shown;
  }

  shownOrder(info: WidgetInfo): number[] {
    return this.rows.shownRows(info).map((tr) => this.rows.rowOf(info, tr));
  }

  rowHidden(info: WidgetInfo, row: number): boolean {
    return row > 0 && !!this.bodyRows(info)[row - 1]?.classList.contains("swt-hidden");
  }

  shownText(info: WidgetInfo, ref: CellRef): string | undefined {
    return this.adapter.renderedText(info, ref);
  }

  shownValue(info: WidgetInfo, ref: CellRef): string | undefined {
    const cell = this.cellAt(info, ref, true);
    return cell && this.cellValue(cell);
  }

  looksChanged(info: WidgetInfo): void {
    const widget = this.widgetForKey(info.key);
    const now = widget && this.infos.get(widget);
    if (!widget || !now) return;
    this.applyLooks(now);
    this.applyView(widget, now);
  }

  /** How a table looks as a whole: the features' (Feature.tableLook), a later one's attribute winning */
  private tableLook(meta: TableMeta | undefined): TableLook {
    return Object.assign({}, ...this.features.map((f) => f.tableLook?.(meta) ?? {})) as TableLook;
  }

  tableLooksChanged(): void {
    for (const info of this.shownTables()) this.adapter.applyTableLook(info, this.tableLook(parseTable(info.source).meta));
  }

  previewTable(header: readonly string[], rows: readonly (readonly string[])[], look: TableLook): TablePreview {
    return this.adapter.previewTable(header, rows, look);
  }

  /** The features' looks of the table's cells and headers (core/looks.ts), applied by the adapter */
  private applyLooks(info: WidgetInfo): void {
    const table = this.tableOf(info);
    const active = this.cellEditor.active;
    const editing = active && this.infos.get(active.widget)?.key === info.key ? { row: active.row, column: active.column } : undefined;
    this.adapter.applyLooks(info, mergeLooks(this.features.map((f) => f.looks?.(info, table))), editing);
  }

  panel(className: string): Panel {
    return this.panels.create(className);
  }

  hideHeaderTags(owner: string, tags: { readonly exact: readonly string[]; readonly prefixes: readonly string[] }): void {
    this.adapter.hideHeaderTags(owner, tags);
  }

  markLayer(mark: string): MarkLayer {
    const tables = new Map<string, readonly CellRef[]>();
    this.markLayers.set(mark, tables);
    const show = (key: string, cells: readonly CellRef[]) => {
      const info = this.tableFor(key);
      if (info) this.adapter.markCells(info, mark, cells);
    };
    return {
      set: (key, cells) => {
        if (cells.length) tables.set(key, cells);
        else tables.delete(key);
        show(key, cells);
      },
      clear: () => {
        for (const key of [...tables.keys()]) show(key, []);
        tables.clear();
      },
    };
  }

  /** A table rendered anew: the marks its cells had show again, its outlines and handles too */
  private marksAgain(info: WidgetInfo): void {
    for (const [mark, tables] of this.markLayers) {
      const cells = tables.get(info.key);
      if (cells) this.adapter.markCells(info, mark, cells);
    }
    for (const [name, layer] of this.outlines) {
      if (layer.at?.key === info.key) this.adapter.showOutline(name, info, layer.at.rows, layer.at.columns, layer.pieces);
    }
    for (const [name, layer] of this.handleLayers) if (layer.at?.key === info.key) this.adapter.placeHandles(name, info, layer.at.places);
    for (const [mark, tables] of this.tableMarks) if (tables.has(info.key)) this.adapter.tableMark(info, mark, true);
  }

  outlineLayer(name: string, pieces: (sides: readonly Side[]) => readonly string[]): OutlineLayer {
    const layer: { pieces: typeof pieces; at?: { key: string; rows: readonly number[]; columns: readonly [number, number] } } = { pieces };
    this.outlines.set(name, layer);
    return {
      show: (key, rows, columns) => {
        layer.at = { key, rows, columns };
        const info = this.tableFor(key);
        if (info) this.adapter.showOutline(name, info, rows, columns, pieces);
        else this.adapter.hideOutline(name);
      },
      hide: () => {
        layer.at = undefined;
        this.adapter.hideOutline(name);
      },
      get shown() {
        return layer.at !== undefined;
      },
    };
  }

  handleLayer(name: string): HandleLayer {
    const layer: { at?: { key: string; places: readonly HandlePlace[] } } = {};
    this.handleLayers.set(name, layer);
    return {
      place: (key, places) => {
        layer.at = { key, places };
        const info = this.tableFor(key);
        if (info) this.adapter.placeHandles(name, info, places);
        else this.adapter.hideHandles(name);
      },
      hide: () => {
        layer.at = undefined;
        this.adapter.hideHandles(name);
      },
    };
  }

  targetOf(target: EventTarget | null, point?: { readonly x: number; readonly y: number }): PointerTarget {
    const element = point ? this.adapter.elementAt(point.x, point.y) : target;
    if (!(element instanceof Element)) return { kind: "none" };
    return this.adapter.targetOf(element) ?? (this.isFloating(element) ? { kind: "control" } : { kind: "none" });
  }

  drag(start: MouseEvent | PointerEvent, options: DragOptions): () => void {
    return followDrag(this.dragContext, start, options);
  }

  pageMark(mark: string, on: boolean): void {
    this.adapter.pageMark(mark, on);
  }

  tableMark(key: string, mark: string, on: boolean): void {
    let tables = this.tableMarks.get(mark);
    if (!tables) this.tableMarks.set(mark, (tables = new Set()));
    if (on) tables.add(key);
    else tables.delete(key);
    const info = this.tableFor(key);
    if (info) this.adapter.tableMark(info, mark, on);
  }

  revealCell(info: WidgetInfo, ref: CellRef): void {
    this.adapter.revealCell(this.tableFor(info.key) ?? info, ref);
  }

  shownBetween(info: WidgetInfo, a: number, b: number): number[] {
    const order = this.shownOrder(info);
    const from = order.indexOf(a);
    const to = order.indexOf(b);
    return from < 0 || to < 0 ? [] : order.slice(Math.min(from, to), Math.max(from, to) + 1);
  }

  /**
   * A copy or a cut (Ctrl+C, Ctrl+X): a field's when it has text selected (a
   * cut: when it has the focus) or is in a menu, else what a feature puts on
   * the clipboard (the cells selected); every feature hears of it. A copy from
   * a menu (Copy, Copy as CSV) puts its own text there.
   */
  private onClipboard = (e: ClipboardEvent): void => {
    if (copyingFromMenu()) return;
    const kind = e.type === "cut" ? "cut" : "copy";
    const active = this.doc.activeElement;
    const field = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    const fields = kind === "cut" ? field : (field && active.selectionStart !== active.selectionEnd) || !!active?.closest(".swt-menu");
    let data: ClipboardData | undefined;
    if (!fields && e.clipboardData) {
      for (const feature of this.features) {
        data = feature.clipboardData?.(kind);
        if (data) break;
      }
    }
    if (data && e.clipboardData) {
      e.clipboardData.setData("text/plain", data.text);
      if (data.html !== undefined) e.clipboardData.setData("text/html", data.html);
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    for (const feature of this.features) feature.copied?.(kind, data);
  };

  /** Where a panel's anchor is in the window, while it is in view */
  private anchorRect(anchor: PanelAnchor): Rect | undefined {
    if (anchor.kind === "point") return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    if (anchor.kind === "element") return anchor.element.isConnected ? anchor.element.getBoundingClientRect() : undefined;
    if (anchor.kind === "cell") {
      const info = this.tableFor(anchor.key);
      return info && this.adapter.cellRect(info, anchor);
    }
    const active = this.cellEditor.active;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return undefined;
    const rect = editorRect(active);
    // Not laid out (in tests): where it is; else only while the cell shows
    if (rect.width === 0 && rect.height === 0) return rect;
    return this.shownPart(active.widget, info, active.cell) ? rect : undefined;
  }

  focusPage(): void {
    // Not after a touch (core/touch-keyboard.ts)
    if (this.touchKeyboard.letGoOfFocus()) return;
    this.doc.querySelector<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
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
    return this.doc.documentElement.dataset.swtPointer ?? "";
  }

  columnMenuEntries(info: WidgetInfo, column: number, open: (title: string, entries: readonly MenuEntry[]) => void): MenuEntry[] {
    const widget = this.widgetOf(info);
    return this.features.flatMap((f) => f.columnMenuEntries?.(widget, info, column, open) ?? []);
  }

  columnMenuLeadEntries(info: WidgetInfo, column: number, open: (title: string, entries: readonly MenuEntry[]) => void): MenuEntry[] {
    const widget = this.widgetOf(info);
    return this.features.flatMap((f) => f.columnMenuLeadEntries?.(widget, info, column, open) ?? []);
  }

  columnMenuTopEntries(info: WidgetInfo, column: number): MenuEntry[] {
    const widget = this.widgetOf(info);
    return this.features.flatMap((f) => f.columnMenuTopEntries?.(widget, info, column) ?? []);
  }

  columnMenuInsertEntries(info: WidgetInfo, column: number): MenuEntry[] {
    const widget = this.widgetOf(info);
    return this.features.flatMap((f) => f.columnMenuInsertEntries?.(widget, info, column) ?? []);
  }

  rowMenuEntries(info: WidgetInfo, row: number, column: number): MenuEntry[] {
    const widget = this.widgetOf(info);
    return this.features.flatMap((f) => f.rowMenuEntries?.(widget, info, row, column) ?? []);
  }

  lineMenuEntries(info: WidgetInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[] {
    const widget = this.widgetOf(info);
    return this.features.flatMap((f) => f.lineMenuEntries?.(widget, info, axis, lines) ?? []);
  }

  /** The element a table's info was rendered in (the hooks that still take it: docs/silverware-table-isolation.md) */
  private widgetOf(info: WidgetInfo): HTMLElement {
    return info.table.closest<HTMLElement>(WIDGET_SELECTOR) ?? info.table;
  }

  rectOf(info: WidgetInfo, part: { readonly row: number; readonly column: number } | { readonly row: number } | { readonly column: number } | "table"): Rect | undefined {
    return this.adapter.rectOf(info, part);
  }

  dragLines(info: WidgetInfo, axis: "row" | "column", block: { readonly first: number; readonly last: number }, pressedAt: number, blockTo: (asked: number) => number): LineDrag | undefined {
    return this.adapter.dragLines(info, axis, block, pressedAt, blockTo);
  }

  areaRect(info: WidgetInfo, first: CellRef, last: CellRef): Rect | undefined {
    return this.adapter.areaRect(info, first, last);
  }

  cellAtPoint(info: WidgetInfo, x: number, y: number): CellRef | undefined {
    return this.adapter.cellAtPoint(info, x, y);
  }

  /** The widths of a table's columns: the first feature's that has them */
  private columnWidths(info: WidgetInfo): ReadonlyMap<number, number> {
    for (const feature of this.features) {
      const widths = feature.columnWidths?.(info);
      if (widths) return widths;
    }
    return new Map();
  }

  showColumnWidth(info: WidgetInfo, column: number, width: number | undefined): void {
    const now = this.tableFor(info.key) ?? info;
    this.adapter.applyColumnWidth(now, column, width ?? this.columnWidths(now).get(column));
    this.tableResized(now);
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

  /** The settings dialog (the table's ⋯ menu, the "Silverware Table: Settings" command) */
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

  /** The "Silverware Table: Remove table metadata" command */
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
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.swt-table`))) {
      const info = this.infos.get(widget);
      if (info?.key === key && renderedTable(widget) === info.table) return widget;
    }
    return undefined;
  }

  bodyRows(info: WidgetInfo): HTMLTableRowElement[] {
    return this.rows.bodyRows(info);
  }

  rowNeeded(info: WidgetInfo, row: HTMLTableRowElement): void {
    if (row.isConnected) return;
    for (const feature of this.features) feature.rowNeeded?.(info, row);
  }

  holdInDocument(info: WidgetInfo, row: HTMLTableRowElement | undefined): void {
    this.rows.holdInDocument(info, row);
  }

  heldInDocument(info: WidgetInfo): HTMLTableRowElement | undefined {
    return this.rows.heldInDocument(info);
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
      .map((tr) => Number(tr.dataset.swtRow))
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
    return active?.cell === cell && cell.dataset.swtValue === undefined ? active.field.value : cellValue(cell);
  }

  /**
   * Each body cell's content in a box of its own (Silverware Table's own elements
   * stay outside it), as wide as its text: what modules size and limit (the
   * longText module: wrapped or cut at a maximum width; widths: a width set).
   * Idempotent: run again after a feature replaced a cell's content.
   */
  private layOutCells(info: WidgetInfo): void {
    for (const tr of this.bodyRows(info)) {
      for (const cell of Array.from(tr.cells)) {
        if (cell.classList.contains("swt-editing")) continue;
        // One pass through the cell's children (every cell, on every view): its box, and what is not in it yet
        let box: HTMLElement | undefined;
        const loose: Node[] = [];
        for (let n = cell.firstChild; n; n = n.nextSibling) {
          if (n instanceof HTMLElement && n.classList.contains("swt-cell-content") && !box) box = n;
          else if (!(n instanceof Element && n.classList.contains(UI_CLASS))) loose.push(n);
        }
        if (loose.length === 0) continue;
        if (!box) {
          box = this.doc.createElement("div");
          box.className = "swt-cell-content";
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
      tr.classList.toggle("swt-hidden", !pinned && !shown.has(i));
    });
    // Rows pinned to the top go with the header, rows pinned to the bottom into
    // the footer: both stay in view (features/sticky.ts). Then the shown rows,
    // the hidden ones and the (hidden) metadata row, last as in the markdown.
    const metaRow = info.table.querySelector<HTMLTableRowElement>("tr.swt-meta-row");
    const middle = rows.filter((_, i) => i >= top && i < rows.length - bottom);
    const bodyRows = [
      ...order.map((i) => rows[i]!),
      ...middle.filter((tr) => tr.classList.contains("swt-hidden")),
      ...(metaRow ? [metaRow] : []),
    ];
    // Moving the row of an open cell editor would take its focus: restored below
    const editing = this.cellEditor.active?.widget === widget ? this.cellEditor.active : undefined;
    const selection = editing && [editing.field.selectionStart, editing.field.selectionEnd];
    const shownBody = order.map((i) => rows[i]!);
    this.rows.setShownRows(info.table, [info.table.rows[0]!, ...rows.slice(0, top), ...shownBody, ...rows.slice(rows.length - bottom)]);
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
      const button = cell.querySelector<HTMLElement>(".swt-sort");
      if (button) {
        button.textContent = SORT_GLYPH[direction ?? "none"];
        button.classList.toggle("swt-active", !!direction);
        button.title =
          direction === "asc" ? "Sorted ascending" : direction === "desc" ? "Sorted descending" : "Sort";
      }
      if (direction) cell.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      else cell.removeAttribute("aria-sort");
    });

    for (const feature of this.features) feature.viewApplied?.(widget, info);
    // The columns' widths (the widths module's), once the cells are laid out (their content boxes made)
    this.adapter.applyColumnWidths(info, this.columnWidths(info));
    // The features' rows of their own UI under the header (the filter row)
    if (this.features.some((f) => f.headerRow)) this.adapter.placeHeaderRows(info, this.features.flatMap((f) => (f.headerRow ? [f.headerRow(info)] : [])));
    this.pinColumns(info);
    widget.classList.toggle("swt-rearranged", this.rearranged(info));
    // A taller table scrolls inside its own box (the table box already has overflow: auto)
    widget.style.maxHeight = this.maxHeight > 0 ? `${this.maxHeight}px` : "";
    if (this.hoverWidget === widget) this.toolbar.show(widget, info, false);
  }

  /**
   * Columns pinned to the left (right) stay at that edge while the table
   * scrolls sideways: CSS sticky, offset by the widths of the pinned columns
   * further out.
   */
  private pinColumns(info: WidgetInfo): void {
    for (const cell of Array.from(info.table.querySelectorAll<HTMLElement>(".swt-pin-left, .swt-pin-right"))) {
      cell.classList.remove("swt-pin-left", "swt-pin-right", "swt-pin-edge");
      cell.style.left = "";
      cell.style.right = "";
    }
    const { left, right } = info.pins;
    if (left + right === 0) return;
    const header = info.table.rows[0]!;
    const rows = this.rows.renderedRows(info.table).filter((tr) => !tr.classList.contains("swt-meta-row"));
    // Read before the cells are written: a read between writes lays the whole table out again
    const widths = Array.from(header.cells, (cell) => cell.getBoundingClientRect().width);
    const pin = (column: number, side: "left" | "right", offset: number, edge: boolean) => {
      for (const tr of rows) {
        const cell = tr.cells[column];
        if (!cell) continue;
        cell.classList.add(side === "left" ? "swt-pin-left" : "swt-pin-right");
        cell.classList.toggle("swt-pin-edge", edge);
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

  // Keyboard and input events from Silverware Table's own fields must not reach the editor
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
    // Rows Silverware Table adds (a feature's: the filter row) and the metadata row are no table cells
    return row?.contains(UI_CLASS) || row?.contains("swt-meta-row") ? undefined : cell;
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.anchor.drop();
    this.insert.pressStarted();
    // The mouse events of a press taken, as a touch screen fires them after a tap (they would close the menu it opened, or select or edit the cell)
    if (this.pressTaken()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // A press anywhere but the toolbar or its menu closes the menu
    if (e.target instanceof Node && !this.tableMenu.owns(e.target) && !this.toolbar.owns(e.target)) this.tableMenu.close(false);
    for (const feature of this.features) if (feature.mouseDown?.(e)) return;
    // A press on a + or in the band beside the table is the +'s (SilverBullet would show the table's markdown)
    if (this.insert.mouseDown(e)) return;
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
    if (element.closest("[data-swt-action]")) {
      e.preventDefault();
      return;
    }
    if (element.closest(`.swt-cell-editor, tr.${UI_CLASS}`) || element.closest(INTERACTIVE_SELECTOR)) {
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
    if (!this.insert.endsInsertingPress(e)) return;
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
    if (e.detail !== 0 && this.insert.endsInsertingPress(e)) {
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
    const action = target.closest<HTMLElement>("[data-swt-action]");
    if (action?.dataset.swtAction === "sort") {
      e.preventDefault();
      this.setSort(info, cycleSort(this.viewOf(info), Number(action.dataset.swtColumn)));
    } else if (action?.dataset.swtAction) {
      const name = action.dataset.swtAction;
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
    this.anchor.scrolled(e.target);
  };

  /**
   * Keeps the toolbar, grips and an open menu on what they belong to while the
   * page or the table scrolls; hides them only once that is out of view
   */
  private followScroll(): void {
    if (this.features.some((f) => f.pointerBusy?.() === "drag")) return;
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (!widget || !info || renderedTable(widget) !== info.table || !isShown(widget, info, info.table)) {
      this.hideFloating(true);
      return;
    }
    this.toolbar.show(widget, info);
    const cell = this.hoverCell;
    if (cell && cell.isConnected && isShown(widget, info, cell)) {
      this.cellHovered(widget, info, cell);
    }
    // A cell gone with its table rendered anew (an edit) did not leave the view: menus open on it stay (a header's, opened as the edit was saved)
    else this.endHover(!cell || cell.isConnected);
    // The table moved under a pointer that did not: the + where the pointer is now
    this.insert.followPointer();
    // Another cell under a pointer that did not move
    if (this.navigating) this.markNavigating();
  }

  shownPart(widget: HTMLElement, info: WidgetInfo, cell: HTMLElement): Rect | undefined {
    return shownPart(widget, info, cell);
  }

  // ---- layout: what follows scrolling ------------------------------------------

  /** After scrolling or rendering (queued once per frame): the sticky header, then what points at it */
  private followLayout(): void {
    if (this.stopped) return;
    // The cell's popup stays over its cell, before what is placed by it (a formula's help)
    this.cellEditor.placePopup();
    // The features' panels follow what they are anchored to (a formula's help: the popup placed first)
    this.panels.placeAll();
    for (const feature of this.features) feature.layoutChanged?.();
    this.insert.showQuiet();
    // After the header has moved: controls that point at it follow
    this.followScroll();
  }

  innerBox(widget: HTMLElement): Rect {
    return innerBox(widget);
  }

  scrollsInside(widget: HTMLElement): boolean {
    return scrollsInside(widget);
  }

  scrollParentOf(element: HTMLElement): HTMLElement | undefined {
    return scrollParentOf(element);
  }

  viewBounds(element: HTMLElement): Rect {
    return viewBounds(element);
  }

  heldBounds(info: WidgetInfo): Rect {
    return heldBounds(info);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // The settings dialog's keys are its own (not a selected cell's, not the table menu's), a feature's dialog's too
    if (e.target instanceof Node && this.dialogs.contains(e.target)) return;
    if (this.settingsDialog?.isOpen && e.target instanceof Node && this.settingsDialog.contains(e.target)) return;
    // Keys may scroll (PageDown, a cell editor moving to the next cell): a table written is not held in place against them
    this.anchor.drop();
    // A name typed in a menu's title: its keys are the field's (Esc leaves the name, not the menu)
    if (e.target instanceof HTMLInputElement && e.target.closest(".swt-menu")) return;
    if (e.key === "Escape" && this.tableMenu.kind) {
      e.preventDefault();
      e.stopPropagation();
      this.tableMenu.close(true);
      return;
    }
    // A menu's keys are its own (arrows go along it, Enter runs a button): not the selection's under it; Esc closes a feature's menu
    if (e.key !== "Escape" && e.target instanceof Element && e.target.closest(".swt-menu")) return;
    if (this.cellMenuKey(e)) return;
    for (const feature of this.features) if (feature.keyDown?.(e)) return;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Control") this.cellEditor.setNavigating(false);
  };

  // Where a hovering pointer was last
  private lastPointer: PointerAt | undefined;

  // The pointer left the window: the + goes (no move tells it so)
  private onPointerOut = (e: PointerEvent): void => {
    if (e.relatedTarget !== null) return;
    this.lastPointer = undefined;
    this.insert.pointerLeft();
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
    const table = `${WIDGET_SELECTOR}.swt-table`;
    const target = under?.closest<HTMLElement>(`${table} td, ${table} th`) ?? under?.closest<HTMLElement>(table) ?? undefined;
    if (target === this.navigatingAt) return;
    this.navigatingAt?.classList.remove(NAVIGATING_CLASS);
    target?.classList.add(NAVIGATING_CLASS);
    this.navigatingAt = target;
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.lastPointer = { pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY };
    if (this.navigating) this.markNavigating();
    this.insert.pointerMoved(e);
  };

  private onMouseMove = (e: MouseEvent): void => {
    // A pressed button: dragging a scrollbar or selecting; the controls stay where they are
    const busy = this.pointerBusy();
    // The toolbar's ⋯ menu keeps the controls where they are; with a cell's menu open the grips follow the pointer
    if (this.tableMenu.kind === "table" || busy === "drag" || e.buttons !== 0) return;
    const target = e.target;
    if ((target instanceof Node && this.isFloating(target)) || this.insert.inBand) {
      this.cancelHide();
      return;
    }
    const hit = this.enhancedWidgetOf(target);
    if (!hit) {
      if (!busy && !overScrollbar(e)) this.scheduleHide();
      return;
    }
    const [widget, info] = hit;
    this.cancelHide();
    if (this.hoverWidget !== widget) {
      // A menu open: the controls stay in its table (its grips follow the pointer there)
      if (busy) return;
      this.hoverWidget = widget;
      this.toolbar.show(widget, info);
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

  // ---- cell editing ------------------------------------------------------

  cellRef(info: WidgetInfo, cell: HTMLTableCellElement): CellRef | undefined {
    return this.rows.cellRef(info, cell);
  }

  cellUnder(target: EventTarget | null, key?: string): CellHit | undefined {
    const hit = this.enhancedWidgetOf(target);
    if (!hit || (key !== undefined && hit[1].key !== key)) return undefined;
    const [widget, info] = hit;
    const cell = this.tableCellOf(info, target);
    const ref = cell && this.cellRef(info, cell);
    return cell && ref ? { widget, info, cell, ref } : undefined;
  }

  rowOf(info: WidgetInfo, tr: HTMLTableRowElement): number {
    return this.rows.rowOf(info, tr);
  }

  /** The header row and the shown body rows, in display order */
  shownRows(info: WidgetInfo): HTMLTableRowElement[] {
    return this.rows.shownRows(info);
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
    return this.rows.cellAt(info, ref, includeHidden);
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
    const info = this.infos.get(widget);
    if (!info) return "failed";
    return this.writeAt(info, widget, change, options);
  }

  writeTable(target: TableTarget, change: (table: Table) => Table | undefined, options: WriteOptions = {}): Promise<WriteResult> {
    // Rendered: written as its widget's, so the view stays where it was
    const widget = this.widgetForKey(target.key);
    const info = widget && this.infos.get(widget);
    return info && info.source === target.source ? this.writeAt(info, widget, change, options) : this.writeAt(target, undefined, change, options);
  }

  /** A table written where `info` says it is in the page; `widget` its table rendered, if it is */
  private async writeAt(
    info: TableTarget,
    widget: HTMLElement | undefined,
    change: (table: Table) => Table | undefined,
    options: WriteOptions,
  ): Promise<WriteResult> {
    const { focus, columnMap } = options;
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
      if (widget) {
        this.scrollLefts.set(info.key, widget.scrollLeft);
        this.scrollTops.set(info.key, widget.scrollTop);
      }
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
      if (widget) this.anchor.set(widget, info.key);
      await this.bridge.replaceRange(replace.from, replace.to, replace.insert);
      this.pageText = written;
      for (const pending of held) pending.written();
      for (const then of after) then(replace.from, written.length - text.length);
      return "written";
    } catch (e) {
      this.cellEditor.dropPending();
      console.error("Silverware Table: could not save the table", e);
      void this.bridge.flash(`Silverware Table: could not save the table (${String(e)})`, "error");
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

  /** What holds the pointer, if anything (Feature.pointerBusy): a drag, a menu open */
  private pointerBusy(): "drag" | "menu" | undefined {
    return this.features.map((f) => f.pointerBusy?.()).find(Boolean);
  }

  /** As if the pointer were over this cell: the grips go to its row and column */
  private hoverAt(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement | undefined): void {
    if (!cell || cell === this.hoverCell || this.cellEditor.active) return;
    this.hoverCell = cell;
    this.cellHovered(widget, info, cell);
  }

  /** A cell is hovered or edited (or the page moved under it): the features follow it; the quiet + of a last row or column */
  private cellHovered(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    const ref = this.cellRef(info, cell);
    for (const feature of this.features) {
      feature.cellHovered?.(widget, info, cell);
      if (ref) feature.hovered?.(info, ref);
    }
    this.insert.showQuiet();
  }

  selectionChanged(): void {
    this.insert.showQuiet();
    for (const feature of this.features) feature.selectionChanged?.();
  }

  selectionLeaves(info: WidgetInfo, from: CellRef, step: readonly [number, number]): boolean {
    return this.features.some((f) => f.selectionLeaves?.(info, from, step));
  }

  // ---- floating UI: the toolbar ----------------------------------------------

  floating<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
  ): HTMLElementTagNameMap[K] {
    const element = this.doc.createElement(tag);
    element.className = `swt-floating ${className}`;
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
      this.toolbar.owns(node) ||
      this.insert.owns(node) ||
      this.cellEditor.owns(node) ||
      this.dialogs.contains(node) ||
      this.tableMenu.owns(node) ||
      this.panels.owns(node) ||
      this.adapter.owns(node) ||
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
    element.classList.add("swt-visible");
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
    this.insert.showQuiet();
    for (const feature of this.features) feature.hoverEnded?.(closeMenus);
  }

  private hideFloating(closeMenus = false): void {
    this.endHover(closeMenus);
    this.tableMenu.close(false);
    this.toolbar.hide();
    this.insert.hidePointers();
    this.hoverWidget = undefined;
    // A selected cell's quiet + stays
    this.insert.showQuiet();
  }

  // ---- the cell menu: right click, a long press, the Menu key ------------------

  /**
   * The menu of a cell, or of the cells selected when it is one of them: what
   * the features offer (Feature.cellMenuEntries), in their groups' order.
   * False when none offers anything: the browser's menu stays.
   */
  openCellMenu(info: WidgetInfo, at: CellRef, point: { x: number; y: number }): boolean {
    const widget = this.widgetForKey(info.key);
    const now = widget && this.infos.get(widget);
    return !!widget && !!now && this.openCellMenuAt(widget, now, at, point);
  }

  private openCellMenuAt(widget: HTMLElement, info: WidgetInfo, at: CellRef, point: { x: number; y: number }): boolean {
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
    // One cell: its name (a header's: its column's) in the title, a pencil to change it
    const naming =
      cells.length === 1
        ? this.menuNaming(info, at.row === 0 ? { kind: "column", column: at.column } : { kind: "cell", row: at.row, column: at.column })
        : undefined;
    const title =
      cells.length > 1
        ? `${cells.length} cells`
        : at.row === 0
          ? naming?.name
            ? `Column: ${naming.name}`
            : `Column: ${header}`
          : naming?.name
            ? `Cell: ${naming.name}`
            : `Cell: ${header}, row ${at.row}`;
    for (const feature of this.features) feature.cellMenuOpened?.();
    // The grips at the cell the menu is for (a long press, the Menu key: no pointer moved there)
    const cell = this.cellAt(info, at);
    if (cell && !this.cellEditor.active && cell !== this.hoverCell) {
      if (this.hoverWidget !== widget) {
        this.hoverWidget = widget;
        this.toolbar.show(widget, info);
      }
      this.hoverCell = cell;
      this.cellHovered(widget, info, cell);
    }
    this.tableMenu.show(widget, title, entries, { kind: "cell", point }, undefined, naming);
    return true;
  }

  /** The cell a pointer event is on, in an enhanced table; not in the cell editor (its menu is the browser's) */
  private cellOfEvent(target: EventTarget | null): [HTMLElement, WidgetInfo, CellRef] | undefined {
    if (!(target instanceof Element) || target.closest(".swt-cell-editor")) return undefined;
    const hit = this.cellUnder(target);
    return hit && [hit.widget, hit.info, hit.ref];
  }

  /** Right click (Shift+right click: the browser's menu) */
  private onContextMenu = (e: MouseEvent): void => {
    if (e.shiftKey) return;
    // A long press opened it already (Android fires this too)
    if (this.pressTaken()) {
      e.preventDefault();
      return;
    }
    const point = { x: e.clientX, y: e.clientY };
    const hit = this.cellOfEvent(e.target);
    if (hit && this.openCellMenuAt(hit[0], hit[1], hit[2], point)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Its press saved a cell being edited and the table was rendered anew, not enhanced yet: the menu once it is
    const widget = !hit && e.target instanceof Element ? e.target.closest<HTMLElement>(WIDGET_SELECTOR) : null;
    const table = widget && renderedTable(widget);
    if (!widget || !table || this.infos.get(widget)?.table === table || this.ownTable(widget) || widget.dataset.swtUnsupported) return;
    e.preventDefault();
    e.stopPropagation();
    void this.enhance(widget, table).then(() => {
      const again = this.cellOfEvent(this.doc.elementFromPoint?.(point.x, point.y) ?? null);
      if (again) this.openCellMenuAt(again[0], again[1], again[2], point);
    });
  };

  /** What pressed (pressedWith); a long press on a touch screen: the cell menu, where no right click is (iOS fires no contextmenu) */
  private onPointerDown = (e: PointerEvent): void => {
    this.stopLongPress?.();
    // What pressed, for CSS (set only when it changes: the page's style is worked out again)
    const root = this.doc.documentElement;
    if (e.pointerType && root.dataset.swtPointer !== e.pointerType) root.dataset.swtPointer = e.pointerType;
    // A new press: the mouse events of the press taken are over
    this.pressTakenAt = 0;
    // A feature's own element in a cell (the fill handle) is no long press on the cell
    if (e.pointerType !== "touch" || (e.target instanceof Node && this.isFloating(e.target))) return;
    const hit = this.cellOfEvent(e.target);
    if (!hit) return;
    const point = { x: e.clientX, y: e.clientY };
    this.stopLongPress = watchPress(this.doc.defaultView!, e, {
      longPress: () => {
        if (this.tableMenu.kind !== "cell") this.openCellMenuAt(hit[0], hit[1], hit[2], point);
      },
    });
  };

  /** The Menu key or Shift+F10 in a cell editor: the menu of the edited cell (or of the cells selected) */
  private cellMenuKey(e: KeyboardEvent): boolean {
    if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return false;
    const editing = this.cellEditor.active;
    const info = editing && this.infos.get(editing.widget);
    if (!editing || !info) return false;
    const rect = editing.cell.getBoundingClientRect();
    if (!this.openCellMenuAt(editing.widget, info, { row: editing.row, column: editing.column }, { x: rect.left, y: rect.bottom })) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  shownRect(widget: HTMLElement, info: WidgetInfo): Rect {
    return shownRect(widget, info);
  }
}
