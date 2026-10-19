// Enhances SilverBullet's rendered markdown tables in place: sorting, filtering,
// inline cell editing and row/column editing. Every change to the markdown is
// one `editor.replaceRange`, so undo works as for any other edit.
import { type Bridge, type FeatureName, SETTINGS, type SettingValue } from "./bridge.ts";
import type {
  CellEditor,
  CellRef,
  Feature,
  RowHold,
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
import { Filters } from "./features/filters.ts";
import { Formulas } from "./features/formulas.ts";
import { Grips } from "./features/grips.ts";
import { History } from "./features/history.ts";
import { Metadata } from "./features/metadata.ts";
import { Names } from "./features/names.ts";
import { Paste } from "./features/paste.ts";
import { Selection } from "./features/selection.ts";
import { Sticky } from "./features/sticky.ts";
import {
  caretTextOffset,
  cellText,
  cellValue,
  EDITOR_SELECTOR,
  INTERACTIVE_SELECTOR,
  keepIconsWithName,
  NATIVE_ACTION_SELECTOR,
  positionHint,
  renderedTable,
  UI_CLASS,
  WIDGET_SELECTOR,
} from "./dom.ts";
import {
  cellNamesOf,
  followTable,
  formulasAfterEdit,
  type NamedCell,
  recalculate,
  referredCellNames,
  referredPages,
  referredTableNames,
  type TableSource,
} from "./formula/index.ts";
import { ICONS } from "./icons.ts";
import {
  cellSourceOffset,
  findTables,
  locateBySource,
  locateByShape,
  locateWithEmptyHeaders,
  minimalEdit,
  parseTable,
  serializeTable,
  type Table,
  type TableRange,
} from "./markdown.ts";
import { focusMenu, type MenuEntry, renderMenu } from "./menu.ts";
import { metadataAfterEdit, metaName, metaPins, metaSort, withMetaSort } from "./meta.ts";
import { namedCells } from "./names.ts";
import { appendColumnAt, appendRowAt } from "./pins.ts";
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


// Toolbar distance above the header: clear of the column grip on the header's top edge
const BAR_GAP = 10;

// A sorting is stored (metadata setting) once the clicks have settled
const STORE_SORT_DELAY_MS = 400;



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

type PageTable = { readonly range: TableRange; readonly table: Table };

/** The tables of a page's text, parsed */
function pageTablesOf(text: string): PageTable[] {
  return findTables(text).map((range) => ({ range, table: parseTable(range.text) }));
}

/**
 * The other pages formulas can read: this page's name, and the tables of the
 * others as read (undefined: not read, null: no such page). Without `linked`
 * (the pageLinks module off) formulas read none: those referring to them keep their results.
 */
type OtherPages = {
  readonly here: string;
  readonly tables: (page: string) => readonly PageTable[] | null | undefined;
  readonly linked: boolean;
};

/** A page's tables by their names, and its named cells by their names (lowercase) */
type PageNames = { readonly tables: Map<string, Table>; readonly cells: Map<string, NamedCell> };

/**
 * The tables of a page by their names, and its named cells, for formulas that
 * refer to them: `replace` stands in for one table (the one being written),
 * and `others` has those of other pages. `tables` is read on the first lookup.
 */
function pageTables(
  tables: () => readonly PageTable[],
  replace?: { readonly from: number; readonly table: Table },
  others?: OtherPages,
): TableSource {
  const pages = new Map<string, PageNames>();
  const namesOf = (page: string | undefined): PageNames | undefined => {
    const here = page === undefined || page === others?.here;
    const key = here ? "" : page;
    let names = pages.get(key);
    if (!names) {
      const list = here ? tables() : others?.tables(page);
      if (!list) return undefined;
      names = { tables: new Map(), cells: new Map() };
      for (const { range, table: parsed } of list) {
        const table = here && replace && range.from === replace.from ? replace.table : parsed;
        const own = metaName(table)?.toLowerCase();
        if (own && !names.tables.has(own)) names.tables.set(own, table);
        for (const [name, cell] of namedCells(table)) if (!names.cells.has(name)) names.cells.set(name, { table, ...cell });
      }
      pages.set(key, names);
    }
    return names;
  };
  return Object.assign((name: string, page?: string) => namesOf(page)?.tables.get(name.toLowerCase()), {
    cell: (name: string, page?: string) => namesOf(page)?.cells.get(name.toLowerCase()),
    ...(others && !others.linked ? { unread: (page: string) => page !== others.here } : {}),
  });
}

/** What a table's write affects in the other tables: its name and the names of its cells (lowercase) */
type Affected = { readonly tables: Set<string>; readonly cells: Set<string> };

function affectedBy(...tables: Table[]): Affected {
  const affected: Affected = { tables: new Set(), cells: new Set() };
  for (const table of tables) addAffected(affected, table);
  return affected;
}

function addAffected(affected: Affected, table: Table): void {
  const name = metaName(table)?.toLowerCase();
  if (name) affected.tables.add(name);
  for (const cell of cellNamesOf(table)) affected.cells.add(cell);
}

/** What a table's formulas refer to on the page: tables by name, cells by name */
function referredBy(table: Table): Affected {
  return { tables: referredTableNames(table), cells: referredCellNames(table) };
}

function isAffected(referred: Affected, affected: Affected): boolean {
  return [...referred.tables].some((n) => affected.tables.has(n)) || [...referred.cells].some((n) => affected.cells.has(n));
}

/**
 * The tables a write of the table `source` recalculates: that table, and the
 * tables that refer to it by name, or in turn to those. All of the page's when
 * the table is not found.
 */
function tablesWritten(all: readonly PageTable[], source: string): Table[] {
  const own = all.find((t) => t.range.text === source)?.table;
  if (!own) return all.map((t) => t.table);
  const result = [own];
  const affected = affectedBy(own);
  const rest = all.filter((t) => t.table !== own).map((t) => ({ table: t.table, referred: referredBy(t.table) }));
  for (let found = true; found; ) {
    found = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (!isAffected(rest[i]!.referred, affected)) continue;
      result.push(rest[i]!.table);
      addAffected(affected, rest[i]!.table);
      rest.splice(i, 1);
      found = true;
    }
  }
  return result;
}

// At most this many other pages are read for one page's formulas (pages that refer on and on)
const MAX_OTHER_PAGES = 20;

export class Controller implements TableHost {
  private readonly infos = new WeakMap<HTMLElement, WidgetInfo>();
  // The page's text as last read, and its tables for formulas that refer to them
  private pageText = "";
  private pageSource: { readonly key: string; readonly source: TableSource } | undefined;
  private currentPage = "";
  // The other pages formulas refer to, as last read: their tables (null: the page could not be read)
  private readonly otherPages = new Map<string, readonly PageTable[] | null>();
  private otherPagesRead = 0;
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
  private readonly cellEditor: CellEditing;
  private hoverWidget: HTMLElement | undefined;
  private hoverCell: HTMLTableCellElement | undefined;
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
  private readonly addRow: HTMLButtonElement;
  private readonly addColumn: HTMLButtonElement;
  // Features that keep their own state and work through this controller
  // (core/feature.ts): those turned on, filled in when Table Plus starts
  private readonly features: Feature[] = [];
  private featuresStarted: Promise<void> | undefined;
  // The toolbar's open ⋯ menu
  private tableMenu: { element: HTMLElement; widget: HTMLElement; anchor: HTMLElement } | undefined;
  // Formulas read other pages (the pageLinks module); read when Table Plus starts
  private pageLinks = true;
  private readonly metadata: Metadata;
  private expressions: Expressions | undefined;
  // Steps every write goes through after the edit, in this order
  private readonly writeSteps: readonly WriteStep[] = [formulasAfterEdit, metadataAfterEdit];

  constructor(
    readonly doc: Document,
    public bridge: Bridge,
  ) {
    this.metadata = new Metadata(this);
    this.cellEditor = new CellEditing(this, {
      features: this.features,
      isolate: (element) => this.isolate(element),
      endHover: () => this.hoverEdited(),
      movingRows: () => this.movingRows,
      holdRow: (widget, info, row) => this.holdRow(widget, info, row),
      releaseRow: () => this.releaseRow(),
      editingEnded: (widget) => this.editingEnded(widget),
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
      optional("autoscroll", () => new Autoscroll(this)),
      optional("handles", () => new Grips(this)),
      // Recalculate first in the toolbar
      optional("formulas", () => new Formulas(this)),
      // Before types: Filter right after the sorting in the column menu
      optional("filters", () => new Filters(this)),
      // After formulas: a formula's result is shown in its column's type
      optional("columnTypes", () => new ColumnTypes(this)),
      // Before metadata: Name before Remove metadata in the toolbar
      optional("names", () => new Names(this)),
      always(() => this.metadata),
      optional("paste", () => new Paste(this)),
      optional("selection", () => new Selection(this)),
      always(() => (this.expressions = new Expressions(this))),
      always(() => new History(this)),
    ];
    const [enabled, pageLinks] = await Promise.all([
      Promise.all(all.map(({ name }) => (name ? this.featureEnabled(name) : true))),
      this.featureEnabled("pageLinks"),
    ]);
    if (this.stopped) return;
    this.pageLinks = pageLinks;
    const features = all.filter((_, i) => enabled[i]).map(({ create }) => create());
    this.features.push(...features);
    for (const feature of features) feature.start?.();
  }

  private async featureEnabled(name: FeatureName): Promise<boolean> {
    try {
      const value = await this.bridge.getConfig?.(`tablePlus.modules.${name}.enabled`, true);
      return typeof value === "boolean" ? value : true;
    } catch {
      return true;
    }
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
    this.closeTableMenu(false);
    for (const el of [this.bar, this.addRow, this.addColumn]) el.remove();
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
    for (const feature of this.features) feature.cellHovered?.(active.widget, info, active.cell);
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

  /** The page's tables (as last read) that formulas can refer to by name, and those of the other pages read */
  tableSource(): TableSource {
    const key = `${this.pageLinks}\u0000${this.otherPagesRead}\u0000${this.currentPage}\u0000${this.pageText}`;
    if (this.pageSource?.key !== key) {
      const text = this.pageText;
      this.pageSource = { key, source: pageTables(() => pageTablesOf(text), undefined, this.others()) };
    }
    return this.pageSource.source;
  }

  toolbarChanged(): void {
    const widget = this.hoverWidget;
    const info = widget && this.infos.get(widget);
    if (widget && info && this.bar.classList.contains("tp-visible")) this.showTableControls(widget, info);
  }

  private others(): OtherPages {
    return { here: this.currentPage, tables: (page) => this.otherPages.get(page), linked: this.pageLinks };
  }

  /**
   * Reads the other pages these tables' formulas refer to, and in turn the
   * pages those pages' tables refer to; `fresh`: also those read before
   */
  private async loadPages(tables: Iterable<Table>, fresh: boolean | ReadonlySet<string>): Promise<void> {
    await this.featuresStarted;
    if (!this.bridge.readPage || !this.pageLinks) return;
    const queue = new Set<string>();
    for (const table of tables) for (const page of referredPages(table)) queue.add(page);
    const done = new Set<string>();
    for (const page of queue) {
      if (done.size >= MAX_OTHER_PAGES) break;
      done.add(page);
      if (page === this.currentPage) continue;
      if (fresh === true || (fresh && fresh.has(page)) || !this.otherPages.has(page)) await this.readOtherPage(page);
      for (const { table } of this.otherPages.get(page) ?? []) for (const next of referredPages(table)) queue.add(next);
    }
  }

  /** Reads another page's tables; the earlier ones stay until it is read, so formulas never see it missing meanwhile */
  private async readOtherPage(page: string): Promise<void> {
    let tables: readonly PageTable[] | null;
    try {
      tables = pageTablesOf(await this.bridge.readPage!(page));
    } catch {
      tables = null;
    }
    this.otherPages.set(page, tables);
    this.otherPagesRead++;
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

  /** Enhances every rendered table that is not enhanced yet */
  async scan(): Promise<void> {
    if (this.stopped) return;
    // Tables are enhanced by the features that are on
    await this.featuresStarted;
    if (this.stopped) return;
    const pending: Promise<void>[] = [];
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR))) {
      const table = renderedTable(widget);
      if (!table || table.rows.length === 0) continue;
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
      const header = table.rows[0]!;
      const shape = {
        rows: table.rows.length,
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
      // The other pages its formulas read, if not read yet
      await this.loadPages([model], false);
      if (this.stopped || renderedTable(widget) !== table) return;
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
    // Last: the icons the features added stay with the header's name
    for (const cell of Array.from(rows[0]!.cells)) keepIconsWithName(cell);
  }

  // ---- view: sort and filter --------------------------------------------

  viewOf(info: WidgetInfo): ViewState {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }

  keepTags(value: string, from: string): string {
    return keepTags(value, from, new Set(this.features.flatMap((f) => f.takesTags?.() ?? [])));
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

  rowMenuEntries(widget: HTMLElement, info: WidgetInfo, row: number, column: number): MenuEntry[] {
    return this.features.flatMap((f) => f.rowMenuEntries?.(widget, info, row, column) ?? []);
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
  async pageIndexed(name: string): Promise<void> {
    // Another page formulas read was changed: read it again, and check the
    // results. Also when it is the page shown now (it was read from another
    // page before), so going back there does not use it as it was.
    if (this.otherPages.has(name)) {
      if (name === this.currentPage) this.otherPages.delete(name);
      else {
        await this.loadPages(this.tablesShown(), new Set([name]));
        for (const feature of this.features) feature.tablesChanged?.();
      }
    }
    await this.expressions?.pageIndexed(name);
  }

  /** The tables Table Plus shows, as last read */
  private tablesShown(): Table[] {
    return Array.from(this.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`)).flatMap((widget) => {
      const info = this.infos.get(widget);
      return info ? [parseTable(info.source)] : [];
    });
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
    if (widget && info && renderedTable(widget) === info.table) this.applyView(widget, info);
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

  applyView(widget: HTMLElement, info: WidgetInfo): void {
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

    for (const feature of this.features) feature.viewApplied?.(widget, info);
    this.pinColumns(info);
    widget.classList.toggle("tp-rearranged", this.rearranged(info));
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
    // A press anywhere but the toolbar or its menu closes the menu
    if (this.tableMenu && e.target instanceof Node && !this.tableMenu.element.contains(e.target) && !this.bar.contains(e.target)) {
      this.closeTableMenu(false);
    }
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
    if (element.closest(`.tp-cell-editor, tr.${UI_CLASS}`) || element.closest(INTERACTIVE_SELECTOR)) {
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
    if (e.key === "Escape" && this.tableMenu) {
      e.preventDefault();
      e.stopPropagation();
      this.closeTableMenu(true);
      return;
    }
    for (const feature of this.features) if (feature.keyDown?.(e)) return;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Control") this.cellEditor.setNavigating(false);
  };

  private onMouseMove = (e: MouseEvent): void => {
    // A pressed button: dragging a scrollbar or selecting; the controls stay where they are
    if (this.tableMenu || this.features.some((f) => f.pointerBusy?.()) || e.buttons !== 0) return;
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
    // The grips stay with the edited cell (hoverEdited)
    if (this.cellEditor.active) return;
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
      // The other pages the tables this write recalculates refer to are read
      // again, before the page's text, so the text the edit is computed from is
      // not stale by the time it is written (reading pages takes a while); a
      // page referred to only by this edit is read below
      await this.loadPages(tablesWritten(pageTablesOf(this.pageText), info.source), true);
      const text = await this.bridge.getText();
      this.pageText = text;
      const range = locateBySource(text, info.hint, info.source);
      const before = range && parseTable(range.text);
      const edited = before && change(before);
      if (!range || !before || !edited) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      // Formulas see the other tables of the page, this one as edited, and
      // those of the other pages they refer to
      const all = pageTablesOf(text);
      await this.loadPages([...all.map((t) => t.table), edited], false);
      const steps = { ...options, tables: pageTables(() => all, { from: range.from, table: edited }, this.others()) };
      const changed = this.writeSteps.reduce((table, step) => step(before, table, steps), edited);
      // With the autoFormat setting every edited table is written aligned
      const format = await this.setting("autoFormat");
      const serialize = (t: Table) => serializeTable(format ? { ...t, padded: true } : t);
      const markdown = serialize(changed);
      if (markdown === range.text) return "unchanged";
      // The tables whose formulas refer to this one (by its name before or after
      // the edit), or in turn to those, get their results for this one as
      // written, in the same edit (one Ctrl+Z undoes it all). Other tables are
      // left as they are.
      const updates: { readonly range: TableRange; readonly markdown: string }[] = [{ range, markdown }];
      const now = pageTables(() => all, { from: range.from, table: changed }, this.others());
      // Its name and the names of its cells, before and after the edit, and in
      // turn those of the tables that refer to them
      const affected = affectedBy(before, changed);
      const oldName = metaName(before)?.toLowerCase();
      // What each other table refers to, read once for all the passes below
      const others = all.filter((other) => other.range.from !== range.from).map((other) => ({ ...other, referred: referredBy(other.table) }));
      for (let found = true; found; ) {
        found = false;
        for (let i = others.length - 1; i >= 0; i--) {
          const { range: otherRange, table, referred } = others[i]!;
          if (!isAffected(referred, affected)) continue;
          others.splice(i, 1);
          found = true;
          addAffected(affected, table);
          // Its references to this table follow the edit: moved rows and columns, a new name
          const followed = oldName && referred.tables.has(oldName) ? followTable(table, before, changed, options.rowMap, options.columnMap) : table;
          const recalculated = recalculate(followed, now);
          if (recalculated !== table) updates.push({ range: otherRange, markdown: serialize(recalculated) });
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
      const edit = minimalEdit(text, written);
      // The edit spans all the tables written: features see that span, so what
      // they place after it (the history marker) is outside every one of them
      const spanFrom = Math.min(...updates.map((update) => update.range.from));
      const spanTo = Math.max(...updates.map((update) => update.range.to));
      const after: ((editFrom: number, lengthChange: number) => void)[] = [];
      for (const feature of this.features) {
        const then = await feature.beforeWrite?.(text, spanFrom, spanTo);
        if (then) after.push(then);
      }
      await this.bridge.replaceRange(edit.from, edit.to, edit.insert);
      this.pageText = written;
      for (const then of after) then(edit.from, written.length - text.length);
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
    return (
      [this.bar, this.addRow, this.addColumn].some((el) => el.contains(node)) ||
      !!this.tableMenu?.element.contains(node) ||
      this.features.some((f) => f.owns?.(node))
    );
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
    this.closeTableMenu(false);
    for (const el of [this.bar, this.addRow, this.addColumn]) el.classList.remove("tp-visible");
    this.hoverWidget = undefined;
  }

  /** The toolbar above the table and the add-row / add-column buttons */
  private showTableControls(widget: HTMLElement, info: WidgetInfo): void {
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
      {
        label: "Edit markdown",
        title: "Show this table as markdown",
        icon: ICONS.markdown,
        run: () => void this.showMarkdown(this.current(widget, info)[1]),
      },
    ];
    const more = button(
      {
        label: "More",
        title: "More for this table",
        place: "icon",
        icon: ICONS.more,
        run: () => (this.tableMenu ? this.closeTableMenu(true) : this.openTableMenu(widget, more, menuItems)),
      },
      "tp-bar-more",
    );
    if (this.tableMenu) {
      // Shown again (a write, a change of the table's state): the open menu stays, at the new button
      more.classList.add("tp-active");
      this.tableMenu.anchor = more;
    }

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
    // At the table's right edge, or its box's when the table scrolls in it,
    // as far as it is in view: the page around a wide table may scroll
    // sideways too, taking the box's edge along. A box wider than its table
    // (a renderer's block) does not take the toolbar past the table.
    const viewRight = this.scrollParentOf(widget)?.getBoundingClientRect().right ?? this.doc.defaultView!.innerWidth;
    this.place(bar, Math.min(rect.right, tableRect.right, viewRight) - bar.offsetWidth - (fits ? 0 : 6), top);
    this.positionTableMenu();

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

  /**
   * The toolbar's ⋯ menu: the table's actions that are not used all the time,
   * the destructive ones last, after a separator
   */
  private openTableMenu(widget: HTMLElement, anchor: HTMLElement, items: readonly ToolbarButton[]): void {
    const entry = (item: ToolbarButton): MenuEntry => ({
      kind: "item",
      label: item.label,
      icon: item.icon ?? "",
      hint: item.title,
      ...(item.value ? { value: { text: item.value } } : {}),
      ...(item.danger ? { danger: true } : {}),
      run: () => {
        this.closeTableMenu(false);
        item.run();
      },
    });
    const safe = items.filter((item) => !item.danger).map(entry);
    const danger = items.filter((item) => item.danger).map(entry);
    const element = renderMenu(this.doc, "Table", [...safe, ...(safe.length && danger.length ? [{ kind: "separator" as const }] : []), ...danger]);
    element.classList.add("tp-floating", "tp-menu", "tp-visible");
    element.addEventListener("mousedown", (e) => e.preventDefault());
    this.doc.body.append(element);
    this.tableMenu = { element, widget, anchor };
    anchor.classList.add("tp-active");
    this.positionTableMenu();
    focusMenu(element);
  }

  /** Below the ⋯ button, its right edge at the button's; always inside the window */
  private positionTableMenu(): void {
    if (!this.tableMenu) return;
    const { element, anchor } = this.tableMenu;
    const win = this.doc.defaultView!;
    const a = anchor.getBoundingClientRect();
    const m = element.getBoundingClientRect();
    const left = Math.max(4, Math.min(a.right - m.width, win.innerWidth - m.width - 4));
    let top = a.bottom + 4;
    if (top + m.height > win.innerHeight - 4) top = Math.max(4, a.top - m.height - 4);
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  private closeTableMenu(refocus: boolean): void {
    const menu = this.tableMenu;
    if (!menu) return;
    this.tableMenu = undefined;
    const hadFocus = menu.element.contains(this.doc.activeElement);
    menu.element.remove();
    menu.anchor.classList.remove("tp-active");
    if (refocus && hadFocus) this.focusEditor(menu.widget);
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
