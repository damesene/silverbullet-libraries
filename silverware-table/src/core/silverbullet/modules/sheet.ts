// The sheet module (docs/silverware-table-sheets.md; the plan:
// docs/silverware-table-sheet-plan.md): a toolbar icon shows the table's sheet
// as a spreadsheet's sheet over the whole window. A table on a sheet (its
// metadata row: `sheet`, `at`, sheet/page.ts) shows with the sheet's other
// tables, each at its place on one grid; a table on no sheet shows alone, at
// A1. Around them empty cells in every direction, as many as the window shows
// and more as it scrolls on, the columns' letters above, the rows' numbers
// beside. A value typed into the empty cell right next to a table (in its
// rows) or right under it (in its columns) grows that table by that column or
// row, as a spreadsheet's table grows, in one edit (TableHost.editBeyond), the
// tables beyond moved as far as it reaches into them (sheet/layout.ts, in the
// sheets module's write); a value typed elsewhere makes a table of its own
// there (header *Column 1* above it, named, on the sheet: TableHost.insertTable,
// after the page's last table, so no other table's key moves), a formula as
// text until its table exists. A table alone's sheet view becomes a sheet so
// (`Sheet1`, the table at A1 and named, in the same edit).
// The same icon or Esc closes it.
//
// The tables are drawn by the module itself from the markdown (drawn.ts, their
// cells rendered as SilverBullet renders them: cells.ts), each standing for
// the page's table of its key while it is shown, so the core and the modules
// work on them as on SilverBullet's (and on a table far from the others in
// the page, which SilverBullet keeps out of the DOM). One box over the window
// (the board) holds them: rows of one height, the sheet's columns' widths
// (`sheet.width.<letters>` in its first table, else the widest of the tables'
// columns there). After every write the page's text is read again and the
// tables whose markdown changed are drawn anew; links in them go to
// SilverBullet's navigation. Formulas of the board's tables read in the
// sheet's addresses (addressFrame): a reference is to a record, so sorting a
// table changes the address shown, not the value.
import { CELL_MENU_ORDER, type AdapterFeature, type AddressFrame, type AlsoChanged, type CellArea, type CellEditor, type CellMenuGroup, type CellRef, type RenderedEditor, type TableHost, type TableInfo, type TableTarget, type ToolbarButton, type WidgetInfo, type WriteResult } from "../../feature.ts";
import { oncePerFrame } from "../../frame.ts";
import { claimWindow, releaseWindow } from "../../overwindow.ts";
import { DRAWN_CLASS, STAND_IN_CLASS, UI_CLASS } from "../../../dom.ts";
import { el } from "../../../elements.ts";
import { columnLetters, isFormulaInput } from "../../../formulas/index.ts";
import { ICONS } from "../../../icons.ts";
import { escapeCell, findTables, parseTable, type Table, type TableRange } from "../../../markdown.ts";
import { sameTableName } from "../../../namerules.ts";
import { AT_KEY, formatAt, freeName, freeSheetName, SHEET_KEY, WIDTH_PREFIX, sameSheet, type SheetCell, sheetNameProblem, sheetOfTable, sheetsOf, sheetTables, sheetWidths } from "../../../sheet/page.ts";
import { nameEmptyHeaders } from "../../../ops.ts";
import { parseClipboardCells } from "../../../paste.ts";
import { placeProblem, roomFor } from "../../../sheet/layout.ts";
import { watchPress } from "../../press.ts";
import { growTo } from "../../structure.ts";
import { type MenuEntry, namingThatCloses } from "../../../menu.ts";
import { withoutTags } from "../../../tags.ts";
import { type CellRenderer, StaticCellRenderer } from "../cells.ts";
import { drawTable } from "../drawn.ts";
import type { TableKey } from "../../tables.ts";

// An empty column's width, a row's height when no table gives one
const COLUMN_WIDTH = 100;
// The widest a column of no width of its own is, by its cells' text (a long text is cut or wraps in it, as the longText
// module's setting says; its maximum width, when smaller, too): a sheet's columns are narrower than a page's tables
const NATURAL_MAX = 300;
const ROW_HEIGHT = 36;
// The room for the sheets' tabs, at the board's bottom (its border: CSS)
const TABS_ROOM = 30;
// A column's narrowest width dragged by its letter's edge (as the widths module's)
const MIN_COLUMN_WIDTH = 40;
// How long a copy stands in at most for a table drawn anew that is not enhanced
const STAND_IN_MS = 1000;
// The room for the rows' numbers (left) and the columns' letters (above): as the full screen's
const NUMBERS_ROOM = 28;
const LETTERS_ROOM = 66;
// Empty columns and rows beyond the view's edge: the box scrolls on into them, and more come
const COLUMNS_BEYOND = 4;
const ROWS_BEYOND = 10;
// Arrows: the rows and columns they go by
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/** A table on the board: where it is on the sheet, which table of the page, its drawing */
type Placed = {
  readonly key: TableKey;
  readonly range: TableRange;
  readonly at: SheetCell;
  readonly widget: HTMLElement;
  // Its columns' widths as drawn, before the sheet's were applied; its body rows' height
  natural: readonly number[];
  rowHeight: number;
};

/** The board shown: which sheet (none: the table `alone`, by its key), its tables, its box */
type Board = {
  // (A table alone's board becomes its sheet's once a table is made beside it)
  sheet: string | undefined;
  // A new sheet (+ in its tabs) no table is on yet: kept only while it is shown, it exists once a table is made there
  fresh: boolean;
  readonly alone: TableKey;
  readonly box: HTMLElement;
  readonly content: HTMLElement;
  readonly tables: Map<TableKey, Placed>;
  // The sheet's own widths (its first table's sheet.width.*; a table alone: its own sheet.width.*), by column
  widths: ReadonlyMap<number, number>;
  // A column's width while it is dragged (AddressFrame.previewColumnWidth), by column
  readonly preview: Map<number, number>;
  // How far the grid reaches (its content's size), which only grows while the board is shown: a column widened by
  // an edit would otherwise need fewer empty ones after it, and the scrollbars would jump with each write
  reach: { width: number; height: number };
};

export class Sheet implements AdapterFeature {
  private readonly renderer: CellRenderer;
  private board: Board | undefined;
  // The columns' letters (above) and the rows' numbers (beside), over the box's rooms
  private readonly letters: HTMLElement;
  // The page's sheets, one tab each, at the board's bottom: the one shown, the others to go to, + a new one
  private readonly tabs: HTMLElement;
  private readonly numbers: HTMLElement;
  private readonly columnLines: HTMLElement;
  private readonly queuePlace: () => void;
  private readonly queueRefresh: () => void;
  // The grid as last placed: columns' left edges (from the content's left), the rows' height
  private grid: { lefts: number[]; rowHeight: number } | undefined;
  // The module's td over the empty cell selected or edited (a sheet's cell)
  private cell: { readonly element: HTMLTableCellElement; readonly at: SheetCell } | undefined;
  // The empty cell selected (select mode): a press on it, typing, Enter or F2 edits it
  private chosen: SheetCell | undefined;
  // A press on an empty cell while a cell was edited: acted on once that edit is saved
  private pendingPress: { x: number; y: number } | undefined;
  // Where the keyboard goes on from the empty cell edited (Enter, Tab, Esc), once its editor is closed;
  // `grown`: the table it grew and where in it the value went (rows pinned to the bottom stay last), so once that
  // is drawn anew (`ready` then)
  private after:
    // (key: Enter, Tab, Escape, or an arrow: Ctrl+arrow)
    | { at: SheetCell; key: string; back: boolean; grown: { key: TableKey; cell: CellRef } | undefined; ready: boolean }
    | undefined;
  // The board's tables as shown (their rows' order), as of the last view applied to them
  private shownIndex: { placed: Placed; info: WidgetInfo; order: number[] }[] | undefined;
  // The rows' order each table's cells last looked by (their formulas' addresses on the sheet follow it)
  private readonly looksOrder = new Map<string, string>();
  // The empty cell edited that makes a table of its own (no table grows to it), and that table's key: made as Enter or
  // Tab saves a value, before the table is written (what follows it once it is drawn needs it)
  private making: { readonly at: SheetCell; key: TableKey | undefined } | undefined;
  // The empty cell's menu (Add table here), by the point it opened at
  private cellMenuOpen: { readonly element: HTMLElement; readonly at: SheetCell; readonly point: { x: number; y: number } } | undefined;
  // Drawings asked for, by table: only the last of each is put in
  private readonly drawing = new Map<TableKey, number>();
  // Tables drawn anew not shown yet, by key: a copy of what they replaced stands in their place until they are
  // enhanced and laid out on the grid (a frame or two: unplaced, unsized and undecorated meanwhile, the sheet flickered)
  private readonly standIns = new Map<TableKey, { readonly copy: HTMLElement; readonly timer: ReturnType<typeof setTimeout>; ready: boolean }>();
  // A drawing put off while a cell of a table drawn is edited (swapping it would take the editor's cell away)
  private putOff = false;
  // Moving a table: the handle at the top left corner of the table hovered (a touch: with a cell selected), the
  // outline of where it would go, and the table Move table… places with the next press
  private readonly grab: HTMLButtonElement;
  private grabFor: TableKey | undefined;
  private overGrab = false;
  private hovering = false;
  private dragging = false;
  private preview: HTMLElement | undefined;
  private picking: TableKey | undefined;
  private stopTap: (() => void) | undefined;
  // The page watched while the board shows: a change no table's rendering follows (a table removed, undone) is read
  private watching: MutationObserver | undefined;

  constructor(private readonly host: TableHost) {
    const { doc, bridge } = host;
    this.renderer = new StaticCellRenderer(doc, (markdown) =>
      bridge.markdownToHtml ? bridge.markdownToHtml(markdown) : Promise.reject(new Error("SilverBullet's markdown.markdownToHtml is not handed over")),
    );
    this.queuePlace = oncePerFrame(doc, () => this.place());
    this.queueRefresh = oncePerFrame(doc, () => void this.refresh());
    this.letters = host.floating("div", "swt-sheet-letters");
    this.letters.setAttribute("aria-hidden", "true");
    // The edge right of a column's letter sets its width, as a spreadsheet's does: a table there or none
    this.letters.addEventListener("pointerdown", (e) => this.widthPress(e));
    this.letters.addEventListener("dblclick", (e) => {
      const column = this.widthColumn(e.target);
      if (column === undefined || !this.board) return;
      e.preventDefault();
      void this.setColumnWidth(this.board, column, undefined);
    });
    this.numbers = host.floating("div", "swt-over-window-rows swt-sheet-numbers");
    this.tabs = host.floating("div", "swt-sheet-tabs");
    this.tabs.setAttribute("role", "tablist");
    this.numbers.setAttribute("aria-hidden", "true");
    this.columnLines = doc.createElement("div");
    this.columnLines.className = `${UI_CLASS} swt-sheet-column-lines`;
    this.grab = host.floating("button", "swt-sheet-grab");
    this.grab.type = "button";
    this.grab.title = "Drag to move the table on the sheet; click to select it whole";
    this.grab.setAttribute("aria-label", "Move table");
    this.grab.innerHTML = ICONS.move;
    this.grab.addEventListener("pointerenter", () => (this.overGrab = true));
    this.grab.addEventListener("pointerleave", () => {
      this.overGrab = false;
      if (!this.dragging && !this.hovering) this.hideGrab();
    });
    this.grab.addEventListener("pointerdown", (e) => this.grabbed(e));
  }

  stop(): void {
    this.end();
    this.letters.remove();
    this.tabs.remove();
    this.numbers.remove();
    this.grab.remove();
  }

  // ---- the toolbar, opening and ending ------------------------------------------

  toolbarButtons(info: WidgetInfo): ToolbarButton[] {
    const on = !!this.board?.tables.has(info.key);
    const sheet = sheetOfTable(this.host, parseTable(info.source));
    return [
      {
        label: on ? "Exit sheet view" : "Sheet view",
        title: on
          ? "Show the table in the page again (Esc)"
          : sheet
            ? `Show the sheet ${sheet} with its other tables, as a spreadsheet over the whole window`
            : "Show the table as a spreadsheet over the whole window: type into an empty cell past it to grow it",
        // Before the sheet's name: the sheet, shown whole
        place: "name-icon",
        slot: "container",
        icon: ICONS.sheet,
        pressed: on,
        run: () => (on ? this.end() : void this.open(info)),
      },
      // On a sheet only: a table alone's board has nowhere else to put it
      ...(on && this.board?.sheet ? [this.moveItem(info)] : []),
    ];
  }

  /** Move table… (the ⋯ menu, a cell's menu on the sheet): the next press or tap places the table's top left corner */
  private moveItem(info: WidgetInfo): ToolbarButton {
    return {
      label: "Move table…",
      title: "Move the table on the sheet: click or tap the cell where its top left corner goes (Esc cancels)",
      icon: ICONS.move,
      run: () => this.startPicking(info.key),
    };
  }

  cellMenuEntries(info: TableInfo): CellMenuGroup | undefined {
    if (!this.board?.sheet || !this.board.tables.has(info.key)) return undefined;
    const item = this.moveItem(info as WidgetInfo);
    return { order: CELL_MENU_ORDER.editing, entries: [{ kind: "item", label: item.label, icon: item.icon!, hint: item.title, run: item.run }] };
  }

  /** The board of the table's sheet (or of the table alone), its tables drawn */
  private async open(info: WidgetInfo): Promise<void> {
    this.end();
    const doc = this.host.doc;
    const box = doc.createElement("div");
    box.className = "swt-sheet-board";
    // The focus the board's (keys typed with nothing selected reach no page under it)
    box.tabIndex = -1;
    const content = doc.createElement("div");
    content.className = "swt-sheet-content";
    content.append(this.columnLines);
    box.append(content);
    const board: Board = { sheet: sheetOfTable(this.host, parseTable(info.source)), fresh: false, alone: info.key, box, content, tables: new Map(), widths: new Map(), preview: new Map(), reach: { width: 0, height: 0 } };
    this.board = board;
    claimWindow(this.host, this);
    box.addEventListener("scroll", () => {
      // The empty cell's menu was for the cell where it opened
      this.closeCellMenu(false);
      this.queuePlace();
    });
    doc.body.append(box);
    box.focus({ preventScroll: true });
    this.watching = new MutationObserver((records) => {
      if (records.some((r) => !box.contains(r.target) && !this.host.isFloating(r.target))) this.queueRefresh();
    });
    this.watching.observe(doc.body, { childList: true, subtree: true, characterData: true });
    this.letters.classList.add("swt-visible");
    this.numbers.classList.add("swt-visible");
    this.tabs.classList.add("swt-visible");
    await this.refresh();
    this.host.toolbarChanged();
  }

  /** Part of what is over the window: the board */
  holds(node: Node): boolean {
    return !!this.board?.box.contains(node);
  }

  /** Closes the board: its tables go, the page's show as they were */
  end(): void {
    const board = this.board;
    if (!board) return;
    this.board = undefined;
    releaseWindow(this.host, this);
    this.watching?.disconnect();
    this.watching = undefined;
    this.drawing.clear();
    this.closeCellMenu(false);
    for (const key of [...this.standIns.keys()]) this.showDrawn(key);
    this.shownIndex = undefined;
    this.looksOrder.clear();
    this.putOff = false;
    this.chosen = undefined;
    this.pendingPress = undefined;
    this.after = undefined;
    if (this.cell && this.host.editing?.cell === this.cell.element) this.host.cancelEditing();
    this.dropCell();
    this.endPicking();
    this.hideGrab();
    this.preview = undefined;
    board.box.remove();
    this.letters.classList.remove("swt-visible");
    this.numbers.classList.remove("swt-visible");
    this.tabs.classList.remove("swt-visible");
    this.closeTabMenu();
    this.grid = undefined;
    this.host.toolbarChanged();
  }

  pageLoaded(): void {
    this.end();
  }

  /**
   * The board's tables from the page's text as it is now: those of its sheet
   * (or the table alone), each drawn anew where its markdown or its place
   * changed, those no longer on it taken away. None left: the board ends.
   */
  private async refresh(): Promise<void> {
    const board = this.board;
    if (!board) return;
    const text = await this.host.bridge.getText();
    if (this.board !== board) return;
    // A table of the board put on another sheet (its name typed in the toolbar), or the table alone put on one: the
    // board shows that sheet from now on
    const onSheets = sheetTables(this.host, text);
    const keys = this.host.tableKeys(this.host.currentPage, text);
    const keyOf = (range: TableRange) => keys[range.ordinal]!;
    const moved = board.sheet
      ? onSheets.find((t) => board.tables.has(keyOf(t.range)) && !sameSheet(t.sheet, board.sheet!))
      : onSheets.find((t) => keyOf(t.range) === board.alone);
    if (moved) board.sheet = moved.sheet;
    const wanted = new Map<TableKey, { range: TableRange; at: SheetCell }>();
    if (board.sheet) {
      const mine = sheetsOf(sheetTables(this.host, text)).find((s) => sameSheet(s.name, board.sheet!))?.tables ?? [];
      for (const t of mine) wanted.set(keyOf(t.range), { range: t.range, at: t.at });
      board.widths = sheetWidths(this.host, mine[0]?.table);
    } else {
      const range = findTables(text)[keys.indexOf(board.alone)];
      if (range) wanted.set(board.alone, { range, at: { row: 0, column: 0 } });
      // A table alone: its grid's widths are kept in it, as a sheet's are in its first table
      board.widths = sheetWidths(this.host, range && parseTable(range.text));
    }
    // A width dragged and stored: shown as stored from now on
    for (const [column, width] of board.preview) if (board.widths.get(column) === width) board.preview.delete(column);
    if (wanted.size === 0 && !board.fresh) {
      this.end();
      return;
    }
    if (wanted.size > 0) board.fresh = false;
    this.showTabs(text);
    for (const [key, placed] of board.tables) {
      if (wanted.has(key)) continue;
      placed.widget.remove();
      board.tables.delete(key);
      this.shownIndex = undefined;
    }
    const draws: Promise<void>[] = [];
    for (const [key, want] of wanted) {
      const placed = board.tables.get(key);
      const same = placed && placed.range.text === want.range.text && placed.range.from === want.range.from;
      if (same && placed.at.row === want.at.row && placed.at.column === want.at.column) continue;
      draws.push(this.draw(board, key, want.range, want.at));
    }
    await Promise.all(draws);
    this.queuePlace();
  }

  /** Draws a table from its markdown and puts it in place of its drawing before; the last asked for wins */
  private async draw(board: Board, key: TableKey, range: TableRange, at: SheetCell): Promise<void> {
    const asked = (this.drawing.get(key) ?? 0) + 1;
    this.drawing.set(key, asked);
    const widget = await drawTable(this.host.doc, range.text, range.from, this.renderer);
    if (this.board !== board || this.drawing.get(key) !== asked) return;
    const before = board.tables.get(key);
    // A cell of the table drawn being edited: swapped once the editor closes (its cell would go with the table)
    const editing = this.host.editing;
    if (before && editing && before.widget.contains(editing.cell)) {
      this.putOff = true;
      return;
    }
    // Links and hashtags, a plain click: SilverBullet's navigation, not the browser's (it would load the window
    // anew); with a modifier the browser's (a new tab)
    widget.addEventListener("click", (e) => {
      const link = e.target instanceof Element ? e.target.closest<HTMLElement>("a[data-ref]") : null;
      const navigate = this.host.bridge.navigate;
      if (!link?.dataset.ref || !navigate || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      void navigate(link.dataset.ref);
    });
    widget.classList.add("swt-sheet-table");
    // At its place on the grid at once, not at the board's start until the next frame lays it out: the cell to edit
    // next is focused in it as it is enhanced, which scrolled the board to where it stood first
    const grid = this.grid;
    if (grid) Object.assign(widget.style, { left: `${this.leftOf(at.column)}px`, top: `${at.row * grid.rowHeight}px` });
    if (before) {
      // (Drawn anew again before shown: the copy of what was shown stays)
      if (!this.standIns.has(key)) {
        const copy = before.widget.cloneNode(true) as HTMLElement;
        copy.classList.add(STAND_IN_CLASS);
        before.widget.before(copy);
        // Shown at the latest after a while, should it not be enhanced
        this.standIns.set(key, { copy, timer: setTimeout(() => this.showDrawn(key), STAND_IN_MS), ready: false });
      }
      before.widget.replaceWith(widget);
    } else board.content.append(widget);
    board.tables.set(key, { key, range, at, widget, natural: before?.natural ?? [], rowHeight: before?.rowHeight ?? 0 });
    this.shownIndex = undefined;
    // Its looks are made by its rows as in the markdown (then sorted or filtered: viewApplied asks for them again)
    if (!before) this.looksOrder.set(key, Array.from(parseTable(range.text).rows, (_, i) => i).join(","));
  }

  // ---- the sheets' tabs ------------------------------------------------------------------------

  // The menu of a tab (its name with a pencil, Remove sheet), by the tab
  private tabMenu: { readonly element: HTMLElement; readonly tab: HTMLElement } | undefined;

  /**
   * The sheets the tabs show, in the page's order (of their first tables): a
   * table alone's board its table first (undefined: on no sheet), a new sheet
   * shown last
   */
  private sheetNames(text: string): (string | undefined)[] {
    const board = this.board;
    if (!board) return [];
    const names: (string | undefined)[] = sheetsOf(sheetTables(this.host, text)).map((s) => s.name);
    if (this.aloneOnNoSheet(text)) names.unshift(undefined);
    else if (board.fresh && !names.some((n) => n !== undefined && sameSheet(n, board.sheet!))) names.push(board.sheet);
    return names;
  }

  /** Whether the table the board was opened with is on no sheet (its tab, Table, there to go back to) */
  private aloneOnNoSheet(text: string): boolean {
    const board = this.board;
    if (!board) return false;
    const range = findTables(text)[this.host.tableKeys(this.host.currentPage, text).indexOf(board.alone)];
    return !!range && !sheetTables(this.host, text).some((s) => s.range.from === range.from);
  }

  /** The tabs as the page's text has the sheets: the one shown selected; a click on it its menu, on another goes there */
  private showTabs(text: string): void {
    const board = this.board;
    if (!board) return;
    const doc = this.host.doc;
    const metadata = this.host.metadataEnabled;
    const tabs = this.sheetNames(text).map((name) => {
      const current = name === undefined ? !board.sheet : !!board.sheet && sameSheet(name, board.sheet);
      const tab = el(doc, "button", {
        class: `swt-sheet-tab${name === undefined ? " swt-muted" : ""}`,
        text: name ?? "Table",
        title: name === undefined ? "This table, on no sheet" : current ? `The sheet ${name}: click for its menu (rename, remove)` : `Show the sheet ${name}`,
        attrs: { role: "tab", "aria-selected": current ? "true" : "false" },
        run: () => (current ? name !== undefined && this.openTabMenu(name, tab) : void this.switchTo(name, false)),
      });
      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (name !== undefined) this.openTabMenu(name, tab);
      });
      return tab;
    });
    const add = el(doc, "button", {
      class: "swt-sheet-tab-add",
      html: ICONS.plus,
      title: metadata ? "A new sheet: type into it, paste or add a table there to keep it" : "A sheet is kept in its tables' metadata: turn on Store table metadata in the settings",
      attrs: { "aria-label": "New sheet", ...(metadata ? {} : { "aria-disabled": "true" }) },
      run: () => metadata && void this.newSheet(),
    });
    this.tabs.replaceChildren(...tabs, add);
  }

  /** At the board's bottom, over its room for them */
  private placeTabs(box: HTMLElement): void {
    const view = box.getBoundingClientRect();
    Object.assign(this.tabs.style, { left: `${view.left}px`, width: `${view.width}px`, top: `${view.bottom - TABS_ROOM}px`, height: `${TABS_ROOM}px` });
  }

  /**
   * The board shows another sheet (undefined: the table alone it was opened
   * with), from its start: the cell being edited saved first, what was
   * selected, picked or open on this one ended
   */
  private async switchTo(sheet: string | undefined, fresh: boolean): Promise<void> {
    const board = this.board;
    if (!board) return;
    if (this.host.editing) await this.host.saveEditing();
    if (this.board !== board) return;
    this.closeTabMenu();
    this.closeCellMenu(false);
    this.endPicking();
    this.hideGrab();
    this.unselect();
    this.dropCell();
    this.putOff = false;
    this.pendingPress = undefined;
    this.after = undefined;
    this.making = undefined;
    for (const placed of board.tables.values()) placed.widget.remove();
    board.tables.clear();
    for (const key of [...this.standIns.keys()]) this.showDrawn(key);
    this.drawing.clear();
    this.shownIndex = undefined;
    this.looksOrder.clear();
    board.preview.clear();
    board.reach = { width: 0, height: 0 };
    board.sheet = sheet;
    board.fresh = fresh;
    board.box.scrollTo?.({ left: 0, top: 0 });
    board.box.focus({ preventScroll: true });
    await this.refresh();
    this.host.toolbarChanged();
  }

  /** A new sheet, shown: Sheet2…, kept once a table is made there */
  private async newSheet(): Promise<void> {
    const board = this.board;
    if (!board) return;
    await this.switchTo(freeSheetName(this.host, await this.host.bridge.getText()), true);
  }

  /** A tab's menu, above it: its name in the title (the pencil renames the sheet), Remove sheet */
  private openTabMenu(sheet: string, tab: HTMLElement): void {
    this.closeTabMenu();
    this.closeCellMenu(false);
    const board = this.board;
    if (!board) return;
    const needs = "A sheet is kept in its tables' metadata: turn on Store table metadata in the settings";
    const disabled = this.host.metadataEnabled ? undefined : needs;
    const fresh = board.fresh && !!board.sheet && sameSheet(board.sheet, sheet);
    const naming = namingThatCloses(
      { name: sheet, label: "Rename this sheet", ...(disabled ? { disabled } : {}), save: (name) => this.renameSheet(sheet, name) },
      () => this.closeTabMenu(),
    );
    const entries: MenuEntry[] = [
      {
        kind: "item",
        label: "Remove sheet",
        icon: ICONS.clear,
        hint: fresh ? "The new sheet goes (no table is on it)" : "Take its tables off the sheet: they stay in the page, where they are, with their names",
        ...(disabled && !fresh ? { disabled } : {}),
        run: () => {
          this.closeTabMenu();
          void this.removeSheet(sheet);
        },
      },
    ];
    const element = this.host.floatingMenu(sheet, entries, { naming, close: () => this.closeTabMenu(), owner: this });
    this.tabMenu = { element, tab };
    tab.classList.add("swt-active");
    const t = tab.getBoundingClientRect();
    const m = element.getBoundingClientRect();
    const win = this.host.doc.defaultView!;
    element.style.left = `${Math.round(Math.max(4, Math.min(t.left, win.innerWidth - m.width - 4)))}px`;
    element.style.top = `${Math.round(Math.max(4, t.top - m.height - 4))}px`;
    this.host.focusMenu(element);
  }

  private closeTabMenu(): void {
    const open = this.tabMenu;
    if (!open) return;
    this.tabMenu = undefined;
    open.tab.classList.remove("swt-active");
    open.element.remove();
  }

  /** The tables of a sheet of the page, in the page's order */
  private tablesOfSheet(text: string, sheet: string): { target: TableTarget; table: Table }[] {
    const keys = this.host.tableKeys(this.host.currentPage, text);
    const tables = sheetsOf(sheetTables(this.host, text)).find((s) => sameSheet(s.name, sheet))?.tables ?? [];
    return tables.map((t) => ({ target: { key: keys[t.range.ordinal]!, source: t.range.text, hint: t.range.from }, table: t.table }));
  }

  /**
   * The sheet renamed: `sheet` in each of its tables, in one edit (one
   * Ctrl+Z). Written by its last table, the others with it: its first keeps
   * the sheet's own data (its widths). A new sheet: only its tab's.
   */
  private async renameSheet(sheet: string, typed: string): Promise<string | undefined> {
    const board = this.board;
    const name = typed.trim();
    if (!board || name === sheet) return undefined;
    const problem = sheetNameProblem(name);
    if (problem) return problem;
    const text = await this.host.bridge.getText();
    const shown = !!board.sheet && sameSheet(board.sheet, sheet);
    // (Its own name in another case: renamed)
    const taken = sheetsOf(sheetTables(this.host, text)).some((s) => sameSheet(s.name, name) && !sameSheet(s.name, sheet)) || (board.fresh && !shown && !!board.sheet && sameSheet(board.sheet, name));
    if (taken) return `another sheet of this page is named ${name}`;
    if (board.fresh && shown) {
      board.sheet = name;
      this.showTabs(text);
      return undefined;
    }
    const tables = this.tablesOfSheet(text, sheet);
    const last = tables[tables.length - 1];
    if (!last) return undefined;
    const renamed = (t: Table) => this.host.setMeta(t, SHEET_KEY, name);
    const result = await this.host.writeTable(last.target, renamed, { also: tables.slice(0, -1).map((t) => ({ target: t.target, change: renamed })) });
    if (result === "written" && shown && this.board === board) board.sheet = name;
    return undefined;
  }

  /**
   * The sheet's tables taken off it, in one edit: their `sheet` and `at` go
   * (the sheet's own data, its widths, too), their names stay. The board goes
   * to the page's next sheet, else ends. A new sheet: its tab goes.
   */
  private async removeSheet(sheet: string): Promise<void> {
    const board = this.board;
    if (!board) return;
    const text = await this.host.bridge.getText();
    const shown = !!board.sheet && sameSheet(board.sheet, sheet);
    const fresh = board.fresh && shown;
    // Shown: the board goes to the next tab first (else it would end, seeing no table of it left, as it reads the page)
    let ends = false;
    if (shown) {
      const rest = this.sheetNames(text).filter((s) => s === undefined || !sameSheet(s, sheet));
      if (rest.length) await this.switchTo(rest[0], false);
      else ends = true;
    }
    if (!fresh) {
      const tables = this.tablesOfSheet(text, sheet);
      const last = tables[tables.length - 1];
      if (!last) return;
      const off = (t: Table) => this.host.setMeta(this.host.setMeta(t, SHEET_KEY, undefined), AT_KEY, undefined);
      const bare = (t: Table) => [...this.host.metaOf(t).keys()].filter((k) => k.startsWith(WIDTH_PREFIX)).reduce((out, k) => this.host.setMeta(out, k, undefined), off(t));
      await this.host.writeTable(last.target, off, { also: tables.slice(0, -1).map((t) => ({ target: t.target, change: bare })) });
    }
    if (ends && this.board === board) this.end();
  }

  /** A table drawn anew shown, its stand-in gone */
  private showDrawn(key: TableKey): void {
    const standIn = this.standIns.get(key);
    if (!standIn) return;
    this.standIns.delete(key);
    clearTimeout(standIn.timer);
    standIn.copy.remove();
  }

  /** A table of the board as enhanced now, by its key */
  private infoOfKey(key: TableKey): WidgetInfo | undefined {
    const widget = this.board?.tables.get(key)?.widget;
    return widget?.isConnected ? this.host.infoOf(widget) : undefined;
  }

  // ---- what the core tells ------------------------------------------------------------

  enhanced(info: WidgetInfo): void {
    const board = this.board;
    if (!board) return;
    const widget = this.host.widgetOf(info);
    if (!widget.classList.contains(DRAWN_CLASS)) {
      // SilverBullet's table rendered anew (an edit, by another client too): the board follows the page
      if (board.tables.has(info.key) || (board.sheet && this.host.getMeta(parseTable(info.source), SHEET_KEY))) this.queueRefresh();
      return;
    }
    const placed = board.tables.get(info.key);
    if (!placed || placed.widget !== widget) return;
    // Shown in place of its stand-in once laid out (place)
    const standIn = this.standIns.get(info.key);
    if (standIn) standIn.ready = true;
    // Its columns and rows as drawn, before the sheet's widths and height are applied
    // (As wide as its content: SilverBullet's tables are as wide as their box, which would spread the columns)
    // Without a cell editor opened in it meanwhile (the cell to edit next): its field, and the width its cell was held
    // to as it opened, which was the table's before the sheet laid it out (the grid's columns size it from now on)
    const table = info.table;
    const { tableLayout, width } = table.style;
    const fields = Array.from(table.querySelectorAll<HTMLElement>(".swt-cell-editor"), (field) => ({ field, display: field.style.display }));
    for (const { field } of fields) {
      field.style.display = "none";
      const cell = field.closest<HTMLElement>("td, th");
      if (cell) Object.assign(cell.style, { width: "", minWidth: "", maxWidth: "" });
    }
    table.style.tableLayout = "auto";
    table.style.width = "max-content";
    // (At most NATURAL_MAX, or the longText module's maximum width where it is smaller)
    const limit = Math.min(NATURAL_MAX, parseFloat(this.host.doc.defaultView!.getComputedStyle(widget).getPropertyValue("--swt-cell-max-width")) || Infinity);
    placed.natural = Array.from(table.rows[0]?.cells ?? [], (cell) => Math.min(limit, cell.getBoundingClientRect().width));
    placed.rowHeight = this.host.bodyRows(info).find((tr) => tr.isConnected)?.getBoundingClientRect().height ?? 0;
    table.style.tableLayout = tableLayout;
    table.style.width = width;
    for (const { field, display } of fields) field.style.display = display;
    this.shownIndex = undefined;
    if (this.after?.grown?.key === info.key) this.after.ready = true;
    this.queuePlace();
  }

  /** Every write: what it wrote is read again (a table far in the page has no rendering of SilverBullet's to follow) */
  async beforeWrite(): Promise<(() => void) | undefined> {
    return this.board ? () => this.queueRefresh() : undefined;
  }

  // `${…}` results may change once the page is indexed: the tables with such cells drawn anew
  pageIndexed(): void {
    const board = this.board;
    if (!board) return;
    for (const placed of [...board.tables.values()]) {
      if (parseTable(placed.range.text).rows.some((row) => row.cells.some((cell) => this.renderer.refreshesAfterIndex(cell)))) {
        void this.draw(board, placed.key, placed.range, placed.at).then(() => this.queuePlace());
      }
    }
  }

  // The letters, numbers and empty cells follow the tables
  layoutChanged(): void {
    if (this.board) this.queuePlace();
  }

  viewApplied(info: WidgetInfo): void {
    if (this.board?.tables.get(info.key)?.widget !== this.host.widgetOf(info)) return;
    this.shownIndex = undefined;
    // Sorted or filtered anew: the cells' looks were made before (by the rows' order of before), and what they
    // show in the sheet's addresses (a formula's title) follows the order now
    const order = this.shownOrder(info).join(",");
    if (this.looksOrder.get(info.key) !== order) {
      this.looksOrder.set(info.key, order);
      this.host.looksChanged(info);
    }
    this.queuePlace();
  }

  // ---- keys and presses -----------------------------------------------------------------

  /**
   * An empty cell selected: typing edits it (the key goes into its field, as on
   * a table's cell), so do Enter and F2, and Ctrl+V; arrows select the next
   * cell, a table's too; Esc unselects it. Esc with nothing selected or edited
   * closes the board (the selection module takes it first while cells are selected).
   */
  keyDown(e: KeyboardEvent): boolean {
    if (!this.board) return false;
    const board = this.board;
    // Ctrl+Shift+PageUp / PageDown, as Google Sheets has them: a browser keeps Ctrl+PageUp / PageDown for its own tabs
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.shiftKey && (e.key === "PageUp" || e.key === "PageDown") && !this.host.editing) {
      e.preventDefault();
      e.stopPropagation();
      const sheets = this.sheetNames(this.host.pageText);
      const i = sheets.findIndex((s) => (s === undefined ? !board.sheet : !!board.sheet && sameSheet(s, board.sheet)));
      const j = i + (e.key === "PageUp" ? -1 : 1);
      // (A new sheet left this way: it goes, as on a click on another tab)
      if (i >= 0 && j >= 0 && j < sheets.length) void this.switchTo(sheets[j], false);
      return true;
    }
    if (this.tabMenu && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.closeTabMenu();
      board.box.focus({ preventScroll: true });
      return true;
    }
    // The empty cell's menu: Esc closes it, the cell stays selected
    if (this.cellMenuOpen && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.closeCellMenu(true);
      return true;
    }
    if (this.picking && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.endPicking();
      return true;
    }
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const at = this.chosen;
    if (at && !this.host.editing && !inField) {
      // AltGr arrives as Ctrl+Alt
      const typing = e.key.length === 1 && (!(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.altKey));
      const paste = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "v";
      // (Ctrl+arrows as arrows, as in a table)
      const step = !e.metaKey && !e.altKey && !e.shiftKey ? ARROWS[e.key] : undefined;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.unselect();
        return true;
      }
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        const rect = this.cell?.element.getBoundingClientRect();
        if (rect) this.openCellMenu(at, { x: rect.left, y: rect.bottom });
        return true;
      }
      if (step) {
        e.preventDefault();
        e.stopPropagation();
        this.go({ row: Math.max(0, at.row + step[0]), column: Math.max(0, at.column + step[1]) }, false);
        return true;
      }
      if (typing || paste || e.key === "Enter" || e.key === "F2") {
        this.edit(at);
        // The key goes into the editor opened (typed, pasted); no editor: nowhere (not into the page under the board),
        // and the cell is unselected, so the keys after it do not say why again
        if (!this.host.editing || (!typing && !paste)) e.preventDefault();
        if (!this.host.editing) this.unselect();
        return true;
      }
    }
    if (e.key === "Escape" && !this.host.editing && !inField) {
      e.preventDefault();
      e.stopPropagation();
      this.end();
      return true;
    }
    return false;
  }

  /**
   * Enter, Tab or Esc in the empty cell's editor: the core's editor saves it (or
   * drops it); where the keyboard goes then is the module's, as in a table.
   * Ctrl+arrow: saved, and the next cell that way edited, as a table's editor does.
   */
  editorKeyDown(e: KeyboardEvent, editor: RenderedEditor): boolean {
    if (!this.cell || editor.cell !== this.cell.element || e.metaKey || e.altKey) return false;
    const arrow = e.ctrlKey && !e.shiftKey && !!ARROWS[e.key];
    if (e.ctrlKey && !arrow) return false;
    if (!arrow && e.key !== "Enter" && e.key !== "Tab" && e.key !== "Escape") return false;
    // Something typed is written, the table grown to hold it (or made: its first body cell): on once it is drawn
    // anew, from where the value went
    const typed = e.key !== "Escape" && editor.field.value.trim() !== "";
    const owner = typed ? this.ownerOf(this.cell.at) : undefined;
    const made = typed && this.making && same(this.making.at, this.cell.at) ? { key: (this.making.key ??= this.host.newTableKey()), cell: { row: 1, column: 0 } } : undefined;
    const grown = owner ? { key: owner.key, cell: growTo(owner.info, owner.cell).cell } : made;
    this.after = { at: this.cell.at, key: e.key, back: e.shiftKey, grown, ready: false };
    // The core's editor saves on Enter, Tab and Esc; a Ctrl+arrow here is saved so
    if (arrow) {
      e.preventDefault();
      e.stopPropagation();
      void this.host.saveEditing();
      return true;
    }
    return false;
  }

  /** An arrow at a table's edge: on into the sheet past it (an empty cell, or another table), selected or edited */
  selectionLeaves(info: WidgetInfo, from: CellRef, step: readonly [number, number]): ((edit: boolean) => void) | undefined {
    const placed = this.board?.tables.get(info.key);
    const here = placed && this.sheetCellOf(info, placed, from);
    if (!here) return undefined;
    const to = { row: Math.max(0, here.row + step[0]), column: Math.max(0, here.column + step[1]) };
    return (edit) => {
      if (this.board) this.go(to, edit);
    };
  }

  /** Presses on the empty cells are the module's: other buttons than the left do nothing there */
  mouseDown(e: MouseEvent): boolean {
    if (e.button === 0 || !this.inGrid(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  /**
   * A press on an empty cell selects it (select mode), or edits it (edit mode,
   * or the cell selected already); with a cell being edited, that one is saved
   * first. A press elsewhere unselects the empty cell.
   */
  beforeMouseDown(e: MouseEvent): void {
    if (this.cellMenuOpen && !(e.target instanceof Node && this.cellMenuOpen.element.contains(e.target))) this.closeCellMenu(false);
    if (this.tabMenu && !(e.target instanceof Node && (this.tabMenu.element.contains(e.target) || this.tabs.contains(e.target)))) this.closeTabMenu();
    if (!this.inGrid(e.target)) {
      if (!(e.target instanceof Node && this.host.isFloating(e.target))) this.unselect();
      return;
    }
    // The board is no table the core keeps the press from: the browser would take the focus from the editor
    // opened; the board takes it unless a field has it
    e.preventDefault();
    const active = this.host.doc.activeElement;
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) this.board?.box.focus({ preventScroll: true });
    if (this.host.editing) {
      this.pendingPress = { x: e.clientX, y: e.clientY };
      void this.host.saveEditing().then(() => this.queuePlace());
      return;
    }
    this.press(e.clientX, e.clientY);
  }

  /** A table's selection ends the empty cell's; after a touch, the table with cells selected has the move handle */
  selectionChanged(): void {
    if (this.board?.sheet && this.host.pressedWith === "touch") {
      const key = [...this.board.tables.keys()].find((k) => {
        const info = this.infoOfKey(k);
        return info && this.host.selectedCells(info).length > 0;
      });
      if (key) this.showGrab(key);
      else if (!this.dragging) this.hideGrab();
    }
    if (!this.chosen || !this.board) return;
    for (const key of this.board.tables.keys()) {
      const info = this.infoOfKey(key);
      if (info && this.host.selectedCells(info).length > 0) {
        this.unselect();
        return;
      }
    }
  }

  editorClosed(editor: RenderedEditor): void {
    // A drawing put off while a cell of its table was edited: done now (a write draws anew anyway)
    if (this.putOff) {
      this.putOff = false;
      this.queueRefresh();
    }
    if (!this.cell || editor.cell !== this.cell.element) return;
    this.chosen = undefined;
    this.making = undefined;
    this.dropCell();
    // Esc: the cell stays selected now, so a second Esc unselects it (not the board's Esc, which closes it)
    if (this.after?.key === "Escape") {
      const at = this.after.at;
      this.after = undefined;
      this.select(at);
    }
    // Nothing written (nothing typed): on at once, as the cells are now
    if (this.after && !this.after.grown) this.after.ready = true;
    this.queuePlace();
  }

  // ---- the sheet's addresses -------------------------------------------------------------

  /**
   * A table of the board's addresses for formulas: a sheet's row is its row as
   * shown (the header at the table's `at`), a table's body row its row in the
   * markdown. Other tables are those of the board, by their names.
   */
  addressFrame(info: TableInfo): AddressFrame | undefined {
    const board = this.board;
    const mine = board?.tables.get(info.key);
    if (!board || !mine || this.infoOfKey(info.key) !== info) return undefined;
    return {
      tables: [...board.tables.keys()],
      outward: (table, area) => {
        const entry = this.shown().find(({ placed }) =>
          table === undefined ? placed === mine : sameTableName(this.host.tableName(parseTable(placed.range.text)) ?? "", table),
        );
        if (!entry) return undefined;
        const { placed, info: shown, order } = entry;
        // Its rows one after another as shown, in the markdown's order (a range in a sorted table is not)
        const top = order.indexOf(area.top + 1);
        if (top < 1) return undefined;
        for (let r = area.top; r <= area.bottom; r++) if (order[top + r - area.top] !== r + 1) return undefined;
        if (area.right >= shown.columns) return undefined;
        return { top: placed.at.row + top, left: placed.at.column + area.left, bottom: placed.at.row + top + area.bottom - area.top, right: placed.at.column + area.right };
      },
      inward: (area) => this.inward(info.key, area),
      columnWidth: (column) => board.widths.get(mine.at.column + column),
      previewColumnWidth: (column, width) => {
        if (width === undefined) board.preview.delete(mine.at.column + column);
        else board.preview.set(mine.at.column + column, width);
        this.queuePlace();
      },
      setColumnWidth: (column, width) => this.setColumnWidth(board, mine.at.column + column, width),
      movable: !!board.sheet,
      origin: mine.at,
      cellAt: (point) => this.cellNear(point.x, point.y),
      placeProblem: (at) => this.placeProblemOf(info.key, at),
      previewPlace: (at) => this.previewPlace(info.key, at),
      moveTo: (at) => this.moveTable(info.key, at),
      // (Once the board follows the page: a table deleted is still on it until then)
      selectCell: (at) =>
        void this.refresh().then(() => {
          if (this.board !== board) return;
          board.box.focus({ preventScroll: true });
          this.go(at, false);
        }),
    };
  }

  // ---- moving a table ----------------------------------------------------------------------

  /** Why a table of the board cannot lie with its top left at `at` (sheet/layout.ts) */
  private placeProblemOf(key: TableKey, at: SheetCell): string | undefined {
    const board = this.board;
    const placed = board?.tables.get(key);
    if (!board || !placed) return undefined;
    if (!board.sheet) return "the table is on no sheet: put it on one first (the sheet's name in its ⋯ menu)";
    if (at.row < 0 || at.column < 0) return "the sheet starts at A1";
    // By its rows in the markdown, not as shown: a filter's hidden rows keep their room
    const laidOut = [...board.tables.values()].map((p) => {
      const model = parseTable(p.range.text);
      const name = this.host.tableName(model);
      return { id: p.range.from, at: p.at, rows: model.rows.length, columns: model.align.length, ...(name ? { name } : {}) };
    });
    const problem = placeProblem(laidOut, placed.range.from, at);
    return problem && `${problem} is there`;
  }

  /** The outline of where a table would go (its address by it; marked where it cannot), or none */
  private previewPlace(key: TableKey, at: SheetCell | undefined): void {
    const placed = this.board?.tables.get(key);
    if (!placed || !this.grid || !at) {
      if (this.preview) this.preview.hidden = true;
      return;
    }
    const model = parseTable(placed.range.text);
    this.outline(at, model.rows.length, model.align.length, this.placeProblemOf(key, at));
  }

  /** The outline of `rows` and `columns` from `at` (its address by it, marked where it cannot go: `problem`) */
  private outline(at: SheetCell, rows: number, columns: number, problem: string | undefined): void {
    const board = this.board;
    const grid = this.grid;
    if (!board || !grid) return;
    let preview = this.preview;
    if (!preview || !preview.isConnected) {
      preview = el(this.host.doc, "div", { class: `${UI_CLASS} swt-sheet-move`, attrs: { "aria-hidden": "true" } }, el(this.host.doc, "span", "swt-sheet-move-tip"));
      board.content.append(preview);
      this.preview = preview;
    }
    const left = this.leftOf(at.column);
    Object.assign(preview.style, {
      left: `${left}px`,
      top: `${at.row * grid.rowHeight}px`,
      width: `${this.leftOf(at.column + columns) - left}px`,
      height: `${rows * grid.rowHeight}px`,
    });
    preview.classList.toggle("swt-invalid", !!problem);
    preview.firstElementChild!.textContent = problem ? `${formatAt(at)}: ${problem}` : formatAt(at);
    preview.hidden = false;
  }

  /** The table put with its top left at `at`: its `at` written, nothing else; refused, said why, where it cannot go */
  private async moveTable(key: TableKey, at: SheetCell): Promise<WriteResult> {
    this.previewPlace(key, undefined);
    const placed = this.board?.tables.get(key);
    const info = this.infoOfKey(key);
    if (!placed || !info) return "failed";
    if (placed.at.row === at.row && placed.at.column === at.column) return "unchanged";
    const problem = this.placeProblemOf(key, at);
    if (problem) {
      void this.host.bridge.flash(`Silverware Table: the table cannot go to ${formatAt(at)}: ${problem}`, "info");
      return "failed";
    }
    return this.host.writeTable(info, (t) => this.host.setMeta(t, AT_KEY, formatAt(at)));
  }

  /** The board scrolls what is on it, its tables and empty cells (middle-button autoscroll) */
  scrollBox(target: EventTarget | null): HTMLElement | undefined {
    const box = this.board?.box;
    return box && target instanceof Node && box.contains(target) ? box : undefined;
  }

  // ---- adding a table of the page ------------------------------------------------------------

  /**
   * A right click or a long press on an empty cell: it is selected, and its
   * menu opens by the point; a cell being edited saved first (its editor is in
   * the module's td, which the cell selected takes)
   */
  pointMenu(target: Element, point: { x: number; y: number }): (() => void) | undefined {
    if (!this.board || !this.inGrid(target)) return undefined;
    const at = this.cellAtPoint(point.x, point.y);
    if (!at || this.tableAt(at)) return undefined;
    return () => {
      const open = () => {
        if (!this.board || this.tableAt(at)) return;
        this.select(at);
        this.openCellMenu(at, point);
      };
      if (this.host.editing) void this.host.saveEditing().then(open);
      else open();
    };
  }

  /** The empty cell's menu, titled by its address: Add table here, a list of the page's tables in its place */
  private openCellMenu(at: SheetCell, point: { x: number; y: number }): void {
    this.closeCellMenu(false);
    this.closeTabMenu();
    const count = this.addable().length;
    const entries: MenuEntry[] = [
      {
        kind: "item",
        label: "Add table here",
        icon: ICONS.table,
        hint: "Put one of the page's tables on this sheet, its top left in this cell",
        ...(this.board?.tables.size && count === 0 ? { disabled: "Every table of the page is on this sheet" } : {}),
        ...(!this.host.metadataEnabled ? { disabled: "A table's sheet is kept in its metadata: turn on Store table metadata in the settings" } : {}),
        run: () => this.showAddable(at),
      },
    ];
    const element = this.host.floatingMenu(`Cell ${formatAt(at)}`, entries, { close: () => this.closeCellMenu(true), owner: this });
    this.cellMenuOpen = { element, at, point };
    this.placeCellMenu();
    this.host.focusMenu(element);
  }

  /** The page's tables not on this sheet, in its order, each at the cell: hovered, where it would go outlined */
  private showAddable(at: SheetCell): void {
    const open = this.cellMenuOpen;
    if (!open) return;
    const previous = open.element;
    const entries = this.addable().map((table): MenuEntry => {
      const problem = this.addProblem(table, at);
      return {
        kind: "item",
        label: table.label,
        icon: ICONS.table,
        hint: table.sheet ? `On the sheet ${table.sheet}: moved to this one` : "On no sheet",
        ...(problem ? { disabled: `It would cover ${problem}` } : {}),
        highlight: (on) => {
          if (on) this.outline(at, table.rows, table.columns, problem && `${problem} is there`);
          else if (this.preview) this.preview.hidden = true;
        },
        run: () => {
          this.closeCellMenu(false);
          void this.addTable(table.key, at);
        },
      };
    });
    const back = { icon: ICONS.arrowLeft, run: () => this.swapCellMenu(previous) };
    this.swapCellMenu(this.host.floatingMenu("Add table here", entries, { back, close: () => this.closeCellMenu(true), owner: this }));
  }

  private swapCellMenu(element: HTMLElement): void {
    const open = this.cellMenuOpen;
    if (!open) return;
    open.element.replaceWith(element);
    this.cellMenuOpen = { ...open, element };
    this.placeCellMenu();
    this.host.focusMenu(element);
  }

  /** By the point it opened at, inside the window */
  private placeCellMenu(): void {
    const open = this.cellMenuOpen;
    if (!open) return;
    const win = this.host.doc.defaultView!;
    const m = open.element.getBoundingClientRect();
    const left = Math.max(4, Math.min(open.point.x, win.innerWidth - m.width - 4));
    const top = open.point.y + m.height > win.innerHeight - 4 ? Math.max(4, win.innerHeight - m.height - 4) : open.point.y;
    open.element.style.left = `${Math.round(left)}px`;
    open.element.style.top = `${Math.round(top)}px`;
  }

  private closeCellMenu(refocus: boolean): void {
    const open = this.cellMenuOpen;
    if (!open) return;
    this.cellMenuOpen = undefined;
    open.element.remove();
    if (this.preview) this.preview.hidden = true;
    if (refocus) this.board?.box.focus({ preventScroll: true });
  }

  /** The menu of a table's cell opened: the empty cell's closes */
  cellMenuOpened(): void {
    this.closeCellMenu(false);
  }

  /**
   * The page's tables the sheet can take: not on it (a table alone's board:
   * any but that table), by their name, else their header's text; their size
   * as in the markdown
   */
  private addable(): { key: TableKey; label: string; sheet: string | undefined; rows: number; columns: number }[] {
    const board = this.board;
    if (!board) return [];
    const text = this.host.pageText;
    const keys = this.host.tableKeys(this.host.currentPage, text);
    return findTables(text).flatMap((range, i) => {
      const key = keys[i]!;
      if (board.tables.has(key) || key === board.alone) return [];
      const model = parseTable(range.text);
      const sheet = this.host.getMeta(model, SHEET_KEY);
      if (board.sheet && sheet && sameSheet(sheet, board.sheet)) return [];
      const header = (model.rows[0]?.cells ?? []).map((cell) => withoutTags(cell).trim()).filter(Boolean).join(", ");
      const label = this.host.tableName(model) ?? (header.length > 40 ? `${header.slice(0, 39)}…` : header || "Table");
      return [{ key, label, sheet, rows: model.rows.length, columns: model.align.length }];
    });
  }

  /** What a table put at `at` would cover (a table of the sheet's), or nothing */
  private addProblem(table: { rows: number; columns: number }, at: SheetCell): string | undefined {
    const board = this.board;
    if (!board) return undefined;
    const laidOut = [...board.tables.values()].map((p) => {
      const model = parseTable(p.range.text);
      const name = this.host.tableName(model);
      return { id: p.range.from, at: p.at, rows: model.rows.length, columns: model.align.length, ...(name ? { name } : {}) };
    });
    return placeProblem([...laidOut, { id: -1, at, rows: table.rows, columns: table.columns }], -1, at);
  }

  /**
   * The page's table `key` put on the board's sheet with its top left at
   * `at`: its sheet and place written, named if it has none, in one edit; the
   * last table of another sheet asked first (that sheet goes with it). A table
   * alone's board becomes a sheet with it, as a table made beside it does.
   */
  private async addTable(key: TableKey, at: SheetCell): Promise<void> {
    const board = this.board;
    if (!board) return;
    const text = await this.host.bridge.getText();
    const keys = this.host.tableKeys(this.host.currentPage, text);
    const ranges = findTables(text);
    const range = ranges[keys.indexOf(key)];
    if (!range) return;
    const model = parseTable(range.text);
    const problem = this.addProblem({ rows: model.rows.length, columns: model.align.length }, at);
    if (problem) {
      void this.host.bridge.flash(`Silverware Table: the table cannot go to ${formatAt(at)}: it would cover ${problem}`, "info");
      return;
    }
    const from = this.host.getMeta(model, SHEET_KEY);
    if (from && sheetTables(this.host, text).filter((t) => sameSheet(t.sheet, from)).length === 1) {
      if (!(await this.host.ask(`Move this table here from the sheet ${from}? It is that sheet's only table: the sheet goes with it.`))) return;
    }
    const { sheet, taken, also } = this.sheetFor(board, text);
    const name = this.host.tableName(model) ?? freeName(this.host, text, taken);
    const result = await this.host.writeTable(
      { key, source: range.text, hint: range.from },
      (t) => this.host.setMeta(this.host.setMeta(this.host.withTableName(t, name), SHEET_KEY, sheet), AT_KEY, formatAt(at)),
      also ? { also: [also] } : {},
    );
    if (result !== "written" || this.board !== board) return;
    this.unselect();
    this.becameSheet(board, sheet, also, "the one added");
    this.queueRefresh();
  }

  /** The sheet's cell at a point, the point kept on the grid (left of it or above it: its first column or row) */
  private cellNear(x: number, y: number): SheetCell | undefined {
    const content = this.board?.content.getBoundingClientRect();
    return content && this.cellAtPoint(Math.max(x, content.left), Math.max(y, content.top));
  }

  /** The move handle at a table's top left corner, over the corner where its row and column grips meet */
  private showGrab(key: TableKey): void {
    this.grabFor = key;
    this.placeGrab();
  }

  private hideGrab(): void {
    this.grabFor = undefined;
    this.overGrab = false;
    this.grab.classList.remove("swt-visible");
  }

  private placeGrab(): void {
    const placed = this.grabFor && this.board?.tables.get(this.grabFor);
    const table = placed && placed.widget.querySelector("table");
    if (!table) {
      this.grab.classList.remove("swt-visible");
      return;
    }
    const rect = table.getBoundingClientRect();
    const box = this.board!.box.getBoundingClientRect();
    // Its corner scrolled out of the board's view (past the letters' and numbers' room): none
    if (rect.left < box.left + NUMBERS_ROOM - 1 || rect.top < box.top + LETTERS_ROOM - 1 || rect.left > box.right || rect.top > box.bottom) {
      this.grab.classList.remove("swt-visible");
      return;
    }
    const size = this.grab.offsetWidth || 18;
    this.host.place(this.grab, rect.left - size - 2, rect.top - size - 2);
  }

  /** A drag of the handle, a place being picked: the hover controls stay, Esc is this module's first */
  pointerBusy(): "drag" | "pick" | undefined {
    return this.dragging ? "drag" : this.picking ? "pick" : undefined;
  }

  cellHovered(_widget: HTMLElement, info: WidgetInfo): void {
    this.hovering = true;
    if (this.board?.sheet && this.board.tables.has(info.key) && !this.dragging) this.showGrab(info.key);
  }

  hoverEnded(): void {
    this.hovering = false;
    if (!this.overGrab && !this.dragging && this.host.pressedWith !== "touch") this.hideGrab();
  }

  /**
   * A press on the move handle: dragged, the table's outline follows the
   * pointer on the grid (its top left corner where the handle's bottom right
   * is), let go it moves there; Esc cancels; a click or tap without moving
   * selects the whole table
   */
  private grabbed(e: PointerEvent): void {
    const key = this.grabFor;
    const placed = key && this.board?.tables.get(key);
    const table = placed && placed.widget.querySelector("table");
    if (!key || !table || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = table.getBoundingClientRect();
    const dx = rect.left - e.clientX;
    const dy = rect.top - e.clientY;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    let at: SheetCell | undefined;
    this.dragging = true;
    this.host.drag(e, {
      key,
      events: "pointer",
      byPoint: true,
      escape: true,
      autoscroll: true,
      pageMark: "moving-table",
      onMove: (point) => {
        moved ||= Math.abs(point.x - start.x) + Math.abs(point.y - start.y) > 4;
        if (!moved) return;
        at = this.cellNear(point.x + dx + 1, point.y + dy + 1);
        this.previewPlace(key, at);
      },
      onEnd: (_point, cancelled) => {
        this.dragging = false;
        this.previewPlace(key, undefined);
        if (cancelled) return;
        if (!moved) this.selectWhole(key);
        else if (at) void this.moveTable(key, at);
        this.placeGrab();
      },
    });
  }

  /** The whole table selected: its header and rows, every column */
  private selectWhole(key: TableKey): void {
    const info = this.infoOfKey(key);
    if (info) this.host.selectCells(info, { row: 0, column: 0 }, { row: info.rows - 1, column: info.columns - 1 });
  }

  /** Move table…: the next press (a click, a tap) on the grid places the table's top left corner there; Esc cancels */
  private startPicking(key: TableKey): void {
    this.endPicking();
    this.picking = key;
    this.host.pageMark("table-picking", true);
    const win = this.host.doc.defaultView!;
    win.addEventListener("mousemove", this.showPicked, true);
    win.addEventListener("pointerdown", this.pickPress, true);
    const press = this.host.pressedWith === "touch" ? "tap the cell where its top left corner goes" : "click the cell where its top left corner goes; Esc cancels";
    void this.host.bridge.flash(`Silverware Table: ${press}`, "info");
  }

  private endPicking(): void {
    if (this.picking) this.previewPlace(this.picking, undefined);
    this.picking = undefined;
    this.stopTap?.();
    this.stopTap = undefined;
    this.host.pageMark("table-picking", false);
    const win = this.host.doc.defaultView;
    win?.removeEventListener("mousemove", this.showPicked, true);
    win?.removeEventListener("pointerdown", this.pickPress, true);
  }

  private showPicked = (e: MouseEvent): void => {
    if (this.picking) this.previewPlace(this.picking, this.cellAtPoint(e.clientX, e.clientY));
  };

  /** A press while Move table… waits: on the grid the table goes there (a touch: once it is told a tap); elsewhere it ends */
  private pickPress = (e: PointerEvent): void => {
    const key = this.picking;
    if (!key) return;
    const at = this.inBoard(e.target) ? this.cellAtPoint(e.clientX, e.clientY) : undefined;
    if (!at || e.button !== 0) {
      this.endPicking();
      return;
    }
    // The press is the move's: no cell selected, no editor opened, no link followed
    e.preventDefault();
    e.stopPropagation();
    this.host.takePress();
    if (e.pointerType === "touch") {
      // A touch that moves scrolls the sheet: Move table… goes on
      this.stopTap?.();
      this.stopTap = watchPress(this.host.doc.defaultView!, e, {
        tap: () => {
          this.endPicking();
          void this.moveTable(key, at);
        },
      });
      return;
    }
    this.endPicking();
    void this.moveTable(key, at);
  };

  /** Whether a node is on the board (its grid or a table of it) */
  private inBoard(target: EventTarget | null): boolean {
    return target instanceof Node && !!this.board?.box.contains(target);
  }

  /**
   * A grid's column's width stored: sheet.width.<letters> in the sheet's first
   * table, or in the table alone (its own widths, width.*, are the page's);
   * the preview kept until the table is drawn anew with it
   */
  private async setColumnWidth(board: Board, column: number, width: number | undefined): Promise<void> {
    try {
      const text = await this.host.bridge.getText();
      const keys = this.host.tableKeys(this.host.currentPage, text);
      const range = board.sheet
        ? sheetsOf(sheetTables(this.host, text)).find((s) => sameSheet(s.name, board.sheet!))?.tables[0]?.range
        : findTables(text)[keys.indexOf(board.alone)];
      // Without a metadata row and the setting (a table alone): for the view only, as the widths module keeps them
      if (range && !parseTable(range.text).meta && !this.host.metadataEnabled) {
        if (width === undefined) board.preview.delete(column);
        else board.preview.set(column, width);
        this.queuePlace();
        return;
      }
      const target = range && { key: keys[range.ordinal]!, source: range.text, hint: range.from };
      const result = target && (await this.host.writeTable(target, (t) => this.host.setMeta(t, `${WIDTH_PREFIX}${columnLetters(column)}`, width === undefined ? undefined : String(width))));
      if (result === "written") return;
    } catch (e) {
      console.error("Silverware Table: could not store the column's width", e);
    }
    // Not stored (unchanged, refused, failed): shown as it is again
    board.preview.delete(column);
    this.queuePlace();
  }

  /** The table of the board holding a sheet's area whole, as one area of its body rows (in the markdown's order) */
  private inward(key: TableKey, area: CellArea): { table: string | undefined; area: CellArea } | undefined {
    const first = this.tableAt({ row: area.top, column: area.left });
    if (!first || first.ref.row === 0) return undefined;
    const rows: number[] = [];
    for (let r = area.top; r <= area.bottom; r++) {
      const hit = this.tableAt({ row: r, column: area.right });
      if (!hit || hit.info.key !== first.info.key || hit.ref.row === 0) return undefined;
      rows.push(hit.ref.row);
    }
    // One area of the table: rows one after another in the markdown, as on the sheet
    if (rows.some((row, i) => row !== rows[0]! + i)) return undefined;
    const name = first.info.key === key ? undefined : this.host.tableName(parseTable(first.info.source));
    if (first.info.key !== key && !name) return undefined;
    const left = first.ref.column;
    return { table: name, area: { top: rows[0]! - 1, left, bottom: rows[rows.length - 1]! - 1, right: left + area.right - area.left } };
  }

  // ---- the sheet's cells ------------------------------------------------------------------

  /** Where a table's cell (its row in the markdown) is on the sheet, as its rows are shown */
  private sheetCellOf(info: WidgetInfo, placed: Placed, ref: CellRef): SheetCell | undefined {
    const shown = this.shownOrder(info).indexOf(ref.row);
    return shown < 0 ? undefined : { row: placed.at.row + shown, column: placed.at.column + ref.column };
  }

  /** A table's rows as shown (the header first), by their rows in the markdown */
  private shownOrder(info: WidgetInfo): number[] {
    return this.host.shownRows(info).map((tr) => this.host.rowOf(info, tr));
  }

  /** The board's tables enhanced, with their rows' order as shown (kept until a table is drawn or viewed anew) */
  private shown(): { placed: Placed; info: WidgetInfo; order: number[] }[] {
    if (!this.shownIndex) {
      this.shownIndex = [];
      for (const placed of this.board?.tables.values() ?? []) {
        const info = this.infoOfKey(placed.key);
        if (info) this.shownIndex.push({ placed, info, order: this.shownOrder(info) });
      }
    }
    return this.shownIndex;
  }

  /** The table holding a sheet's cell, and that cell in it (its row in the markdown), if one does */
  private tableAt(at: SheetCell): { info: WidgetInfo; ref: CellRef } | undefined {
    for (const { placed, info, order } of this.shown()) {
      const row = at.row - placed.at.row;
      const column = at.column - placed.at.column;
      if (row >= 0 && row < order.length && column >= 0 && column < info.columns) return { info, ref: { row: order[row]!, column } };
    }
    return undefined;
  }

  /** The rows (as shown) and columns a table takes on the sheet */
  private extent(placed: Placed): { top: number; left: number; bottom: number; right: number } {
    const entry = this.shown().find((e) => e.placed === placed);
    const info = entry?.info;
    const model = parseTable(placed.range.text);
    const rows = entry ? entry.order.length : model.rows.length;
    const columns = info?.columns ?? model.align.length;
    return { top: placed.at.row, left: placed.at.column, bottom: placed.at.row + rows - 1, right: placed.at.column + columns - 1 };
  }

  /**
   * The tables an empty cell can grow, with the cell in each: the table whose
   * last column it is right next to (in that table's rows), the one whose last
   * row it is right under (in its columns), the left one first; a cell
   * farther from a table makes a table of its own (editNew)
   */
  private ownersOf(at: SheetCell): { key: TableKey; info: WidgetInfo; cell: CellRef }[] {
    const board = this.board;
    if (!board) return [];
    const tables = [...board.tables.values()].map((placed) => ({ placed, box: this.extent(placed) }));
    const owners: { key: TableKey; info: WidgetInfo; cell: CellRef; gap: number }[] = [];
    const left = tables.find(({ box }) => at.row >= box.top && at.row <= box.bottom && at.column === box.right + 1);
    const leftInfo = left && this.infoOfKey(left.placed.key);
    if (left && leftInfo) {
      const order = this.shownOrder(leftInfo);
      owners.push({ key: left.placed.key, info: leftInfo, cell: { row: order[at.row - left.box.top]!, column: at.column - left.box.left }, gap: at.column - left.box.right });
    }
    const above = tables.find(({ box }) => at.column >= box.left && at.column <= box.right && at.row === box.bottom + 1);
    const aboveInfo = above && this.infoOfKey(above.placed.key);
    if (above && aboveInfo) {
      const cell = { row: aboveInfo.rows + (at.row - above.box.bottom - 1), column: at.column - above.box.left };
      owners.push({ key: above.placed.key, info: aboveInfo, cell, gap: at.row - above.box.bottom });
    }
    return owners.sort((a, b) => a.gap - b.gap);
  }

  /** The table an empty cell grows (ownersOf), the nearest whose growth the sheet has room for */
  private ownerOf(at: SheetCell): { key: TableKey; info: WidgetInfo; cell: CellRef } | undefined {
    return this.ownersOf(at).find((owner) => !this.wouldOverlap(owner.key, owner.cell));
  }

  /**
   * The table a table grown to hold a cell (TableHost.editBeyond: growTo in
   * structure.ts) cannot make room for, if any: the sheet's rule (sheet/layout.ts),
   * as the write applies it, the tables beyond moved
   */
  private wouldOverlap(key: TableKey, cell: CellRef): string | undefined {
    const board = this.board;
    const placed = board?.tables.get(key);
    const info = this.infoOfKey(key);
    if (!board || !placed || !info) return undefined;
    const laidOut = [...board.tables.values()].map((p) => {
      const model = parseTable(p.range.text);
      const name = this.host.tableName(model);
      return { id: p.range.from, at: p.at, rows: model.rows.length, columns: model.align.length, ...(name ? { name } : {}) };
    });
    const room = roomFor(laidOut, { id: placed.range.from, rows: Math.max(info.rows, cell.row + 1), columns: Math.max(info.columns, cell.column + 1), claims: true });
    return "refused" in room ? room.refused : undefined;
  }

  /** Selects or edits a sheet's cell: a table's, or an empty one */
  private go(to: SheetCell, edit: boolean): void {
    const hit = this.tableAt(to);
    if (hit) {
      this.unselect();
      if (edit) this.host.editCell(hit.info, hit.ref);
      else this.host.selectCells(hit.info, hit.ref, hit.ref);
    } else if (edit) this.edit(to);
    else this.select(to);
  }

  /** Where the keyboard goes on after the empty cell's editor (`after`), the cells placed as they are now */
  private async goOn(): Promise<void> {
    const after = this.after;
    if (!after) return;
    this.after = undefined;
    // The value's cell in the table grown, on the sheet (a row pinned to the bottom stays under it)
    const grown = after.grown && this.board?.tables.get(after.grown.key);
    const info = grown && this.infoOfKey(grown.key);
    const at = (grown && info && after.grown && this.sheetCellOf(info, grown, after.grown.cell)) || after.at;
    const sign = after.back ? -1 : 1;
    const step = ARROWS[after.key];
    if (step) this.go({ row: Math.max(0, at.row + step[0]), column: Math.max(0, at.column + step[1]) }, true);
    else if (after.key === "Escape") this.go(at, false);
    else if (after.key === "Tab") this.go({ row: at.row, column: Math.max(0, at.column + sign) }, true);
    else if ((await this.host.setting("enterKey")) === "moveDown") this.go({ row: Math.max(0, at.row + sign), column: at.column }, true);
    else this.go(at, false);
  }

  private inGrid(target: EventTarget | null): boolean {
    const content = this.board?.content;
    if (!(target instanceof Element) || !content?.contains(target) || target.closest(".swt-cell-editor")) return false;
    // A table's own cells are the table's
    return !target.closest(".swt-sheet-table");
  }

  private press(x: number, y: number): void {
    const at = this.cellAtPoint(x, y);
    if (!at || this.tableAt(at)) {
      this.unselect();
      return;
    }
    const same = this.chosen?.row === at.row && this.chosen.column === at.column;
    if (this.host.clickSelects() && !same) this.select(at);
    else this.edit(at);
  }

  private select(at: SheetCell): void {
    this.chosen = at;
    this.showCell(at)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  private unselect(): void {
    if (!this.chosen) return;
    this.chosen = undefined;
    if (!this.cell || this.host.editing?.cell !== this.cell.element) this.dropCell();
  }

  /** Opens the cell editor in an empty cell (TableHost.editBeyond) for the table it grows, in the module's td over it */
  private edit(at: SheetCell): void {
    const owners = this.ownersOf(at);
    const owner = owners.find((o) => !this.wouldOverlap(o.key, o.cell));
    if (!owner && owners.length === 0) {
      this.editNew(at);
      return;
    }
    if (!owner) {
      const into = this.wouldOverlap(owners[0]!.key, owners[0]!.cell);
      void this.host.bridge.flash(`Silverware Table: the table cannot grow into ${into}, which overlaps it on the sheet already: check their places (at)`, "info");
      return;
    }
    const cell = this.showCell(at);
    if (!cell) return;
    this.host.editBeyond(this.host.widgetOf(owner.info), owner.info, owner.cell, cell);
    // (Read again: the editor opened, or did not)
    if ((this.host.editing as RenderedEditor | undefined)?.cell !== cell) {
      this.chosen = undefined;
      this.dropCell();
    }
  }

  /**
   * The editor in an empty cell no table grows to: what is typed there makes a
   * table of its own (writeNew), its header above the cell (the cell on the
   * sheet's first row: the table starts there, the value under it). Only on a
   * sheet (a table alone has none to put it on), with the metadata setting (a
   * sheet is metadata), where nothing is in its way.
   */
  private editNew(at: SheetCell): void {
    const board = this.board;
    if (!board) return;
    if (!this.host.metadataEnabled) {
      void this.host.bridge.flash("Silverware Table: a table on a sheet is kept in its metadata: turn on Store table metadata in the settings first", "info");
      return;
    }
    const top = Math.max(0, at.row - 1);
    const last = [...board.tables.values()].sort((a, b) => b.range.from - a.range.from)[0];
    // (A new sheet no table is on: a table of the page shown, the board's covered one among them)
    const host = last ? this.infoOfKey(last.key) : this.host.shownTables().find((info) => this.host.widgetOf(info).isConnected);
    const pageTables = findTables(this.host.pageText);
    if (!host || !pageTables.length) {
      // (An editor belongs to a table: none of the page's is in the document, far from the part of the page in view)
      if (!last) void this.host.bridge.flash("Silverware Table: no table of the page is at hand to type with: add one here from the cell's menu (right-click), or close the sheet view near a table of the page", "info");
      return;
    }
    const inWay = [...board.tables.values()].some((p) => {
      const e = this.extent(p);
      return at.column >= e.left && at.column <= e.right && top + 1 >= e.top && top <= e.bottom;
    });
    if (inWay) {
      void this.host.bridge.flash("Silverware Table: there is no room for a new table here (its header goes above the cell)", "info");
      return;
    }
    const cell = this.showCell(at);
    if (!cell) return;
    const making: { readonly at: SheetCell; key: TableKey | undefined } = { at, key: undefined };
    this.making = making;
    // The editor belongs to a table of the sheet (what the features ask of it), past its rows and columns (so no
    // column's type applies): nothing of it is written
    this.host.editBeyond(this.host.widgetOf(host), host, { row: host.rows, column: host.columns }, cell, (typed) => this.writeNew(at, typed, making.key));
    if ((this.host.editing as RenderedEditor | undefined)?.cell !== cell) {
      this.chosen = undefined;
      this.making = undefined;
      this.dropCell();
    }
  }

  /**
   * A table made of a value typed into an empty cell: `| Column 1 |`, the value
   * under it, its name, sheet and place; written after the page's last table,
   * with `key` (made for it as its editor opened).
   * As a cell's text is read elsewhere: '=… is the text =…; a formula is
   * written as text too (its references are the sheet's, and its table does not
   * exist yet), said so.
   */
  private async writeNew(at: SheetCell, typed: string, key: TableKey | undefined): Promise<"written" | "unchanged" | "failed"> {
    if (!this.board) return "failed";
    const text = await this.host.bridge.getText();
    const trimmed = typed.trim();
    const value = trimmed.startsWith("'=") ? trimmed.slice(1) : trimmed;
    if (!trimmed.startsWith("'=") && isFormulaInput(trimmed)) {
      void this.host.bridge.flash(
        "Silverware Table: saved as text, as a formula needs its table first: edit the cell in the sheet view and remove the ' to make it a formula",
        "info",
      );
    }
    return this.insertNew(text, parseTable(`| Column 1 |\n|---|\n| ${escapeCell(value)} |`), { row: Math.max(0, at.row - 1), column: at.column }, key);
  }

  /**
   * A new table at `at` on the board's sheet: named, its sheet and place in its
   * metadata, written after the page's last table, with `key`. A table alone's
   * board becomes a sheet with it (the table at A1, named), in the same edit.
   */
  private async insertNew(text: string, made: Table, at: SheetCell, key: TableKey | undefined): Promise<"written" | "unchanged" | "failed"> {
    const board = this.board;
    if (!board) return "failed";
    const keys = this.host.tableKeys(this.host.currentPage, text);
    const ranges = findTables(text);
    const last = ranges[ranges.length - 1];
    if (!last) return "failed";
    const { sheet, taken, also } = this.sheetFor(board, text);
    const table = this.host.setMeta(this.host.setMeta(this.host.withTableName(made, freeName(this.host, text, taken)), SHEET_KEY, sheet), AT_KEY, formatAt(at));
    const result = await this.host.insertTable(table, { key: keys[last.ordinal]!, source: last.text, hint: last.from }, also, key);
    if (result === "written") this.becameSheet(board, sheet, also, "the new one");
    return result;
  }

  /**
   * The sheet a table joins on the board: the board's, or (a table alone's
   * board) a new one, the table alone put on it at A1, named, in the same
   * edit (`also`: a formula refers to another table by its name); `taken`:
   * the name given to it, which the joining table cannot have
   */
  private sheetFor(board: Board, text: string): { sheet: string; taken: string[]; also: AlsoChanged | undefined } {
    if (board.sheet) return { sheet: board.sheet, taken: [], also: undefined };
    const keys = this.host.tableKeys(this.host.currentPage, text);
    const alone = findTables(text)[keys.indexOf(board.alone)];
    const sheet = freeSheetName(this.host, text);
    if (!alone) return { sheet, taken: [], also: undefined };
    const name = this.host.tableName(parseTable(alone.text)) ?? freeName(this.host, text);
    return {
      sheet,
      taken: [name],
      also: {
        target: { key: board.alone, source: alone.text, hint: alone.from },
        change: (t: Table) => this.host.setMeta(this.host.setMeta(this.host.withTableName(t, name), SHEET_KEY, sheet), AT_KEY, "A1"),
      },
    };
  }

  /** A table alone's board written to be a sheet (sheetFor's `also`): the sheet's from now on, said so */
  private becameSheet(board: Board, sheet: string, also: AlsoChanged | undefined, joined: string): void {
    if (!also || this.board !== board) return;
    // Its tables, the one joining too, as the page has them
    board.sheet = sheet;
    void this.host.bridge.flash(`Silverware Table: the table and ${joined} are on the sheet ${sheet} now (Ctrl+Z undoes it)`, "info");
  }

  /**
   * Cells pasted into an empty cell no table grows to (Ctrl+V on it selected,
   * or into its editor), from a spreadsheet or a table: a table of their own,
   * its top left at the cell, their first row its header (one row: the body,
   * under Column 1…), as a spreadsheet pastes them there. A single value goes
   * into the field, as typed.
   */
  editorPaste(editor: CellEditor, text: string): boolean {
    const making = this.making;
    if (!editor.placed || !making || !this.cell || !same(making.at, this.cell.at)) return false;
    const data = parseClipboardCells(text);
    if (!data) return false;
    void this.pasteNew(making.at, data);
    return true;
  }

  private async pasteNew(at: SheetCell, data: readonly (readonly string[])[]): Promise<void> {
    const board = this.board;
    if (!board) return;
    const columns = Math.max(...data.map((row) => row.length));
    const header = data.length > 1 ? data[0]! : [];
    const body = data.length > 1 ? data.slice(1) : data;
    // One row: the values where they were pasted, the header above them, as for a value typed (writeNew)
    const top = data.length > 1 ? at.row : Math.max(0, at.row - 1);
    const rows = body.length + 1;
    const inWay = [...board.tables.values()].find((p) => {
      const e = this.extent(p);
      return at.column + columns - 1 >= e.left && at.column <= e.right && top + rows - 1 >= e.top && top <= e.bottom;
    });
    // The editor opened for the paste goes, nothing of it written; the keys stay the board's (not the page's under it)
    this.host.takeEditor();
    this.making = undefined;
    board.box.focus({ preventScroll: true });
    if (inWay) {
      // (The cell stays selected)
      this.go(at, false);
      const name = this.host.tableName(parseTable(inWay.range.text));
      const what = `${data.length} row${data.length === 1 ? "" : "s"} and ${columns} column${columns === 1 ? "" : "s"}`;
      void this.host.bridge.flash(`Silverware Table: there is no room here for the ${what} pasted: they would cover ${name ?? `the table at ${formatAt(inWay.at)}`}`, "info");
      return;
    }
    // The table takes the cell's place
    this.unselect();
    const line = (cells: readonly string[]) => `| ${Array.from({ length: columns }, (_, c) => escapeCell((cells[c] ?? "").trim())).join(" | ")} |`;
    const markdown = [line(header), `|${"---|".repeat(columns)}`, ...body.map(line)].join("\n");
    // Empty header cells named as a new column is, each name once
    await this.insertNew(await this.host.bridge.getText(), nameEmptyHeaders(parseTable(markdown)), { row: top, column: at.column }, undefined);
  }

  /** The module's td over an empty cell (the one selected or edited), where that cell is now */
  private showCell(at: SheetCell): HTMLTableCellElement | undefined {
    const box = this.cellBox(at);
    const board = this.board;
    if (!box || !board) {
      this.dropCell();
      return undefined;
    }
    let element = this.cell?.element;
    if (!element) {
      element = this.host.doc.createElement("td");
      element.className = "swt-sheet-cell";
      board.content.append(element);
    }
    this.cell = { element, at };
    Object.assign(element.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    return element;
  }

  private dropCell(): void {
    this.cell?.element.remove();
    this.cell = undefined;
  }

  // ---- the layout -------------------------------------------------------------------------

  /** A sheet column's width: as dragged, else the sheet's own, else the widest of the tables' columns there, else an empty one's */
  private columnWidth(column: number): number {
    const board = this.board!;
    const own = board.preview.get(column) ?? board.widths.get(column);
    if (own) return own;
    let width = 0;
    for (const placed of board.tables.values()) {
      const i = column - placed.at.column;
      if (i >= 0 && i < placed.natural.length) width = Math.max(width, placed.natural[i]!);
    }
    return width > 0 ? Math.ceil(width) : COLUMN_WIDTH;
  }

  /** The left edge of a sheet column (and of the one after the last: its right edge), as the grid was last placed */
  private leftOf(column: number): number {
    const lefts = this.grid!.lefts;
    while (lefts.length <= column) lefts.push(lefts[lefts.length - 1]! + COLUMN_WIDTH);
    return lefts[column]!;
  }

  /** Where a sheet's cell is in the box's content, as the grid was last placed */
  private cellBox(at: SheetCell): { left: number; top: number; width: number; height: number } | undefined {
    const grid = this.grid;
    if (!grid) return undefined;
    const left = this.leftOf(at.column);
    return { left, top: at.row * grid.rowHeight, width: this.leftOf(at.column + 1) - left, height: grid.rowHeight };
  }

  /** The sheet's cell at a point of the window */
  private cellAtPoint(x: number, y: number): SheetCell | undefined {
    const grid = this.grid;
    const content = this.board?.content.getBoundingClientRect();
    if (!grid || !content) return undefined;
    const dx = x - content.left;
    const dy = y - content.top;
    if (dx < 0 || dy < 0) return undefined;
    let column = 0;
    while (this.leftOf(column + 1) <= dx) column++;
    return { row: Math.floor(dy / grid.rowHeight), column };
  }

  /**
   * The tables at their places, the sheet's widths and height applied to them,
   * the empty cells' lines, the letters and numbers; enough of the grid to fill
   * the view and more. Everything is measured before anything is changed.
   */
  private place(): void {
    const board = this.board;
    if (!board) return;
    const { box, content } = board;
    const tables = [...board.tables.values()];
    const rowHeight = Math.max(ROW_HEIGHT, ...tables.map((p) => Math.ceil(p.rowHeight)));
    const extents = tables.map((p) => this.extent(p));
    const lastColumn = Math.max(0, ...extents.map((e) => e.right));
    const lastRow = Math.max(0, ...extents.map((e) => e.bottom));
    const viewWidth = box.clientWidth;
    const viewHeight = box.clientHeight;
    // Columns' left edges, as far as the tables go and the view (and more) needs
    // As far as the view needs, and as far as it reached before: the grid never shrinks while it is shown, nor grows
    // for a column widened (only for the view's need), so the scrollbars stay as they are through writes
    const needed = box.scrollLeft + viewWidth + COLUMNS_BEYOND * COLUMN_WIDTH;
    const lefts = [0];
    for (let c = 0; c <= lastColumn || lefts[c]! < needed; c++) lefts.push(lefts[c]! + this.columnWidth(c));
    while (lefts[lefts.length - 1]! < board.reach.width) lefts.push(lefts[lefts.length - 1]! + this.columnWidth(lefts.length - 1));
    const rows = Math.max(lastRow + 1 + ROWS_BEYOND, Math.ceil((box.scrollTop + viewHeight) / rowHeight) + ROWS_BEYOND);
    const tablesWidth = lefts[lastColumn + 1]!;
    this.grid = { lefts, rowHeight };
    // (Not to a column's edge: a column widened would move it; past the tables, the view's need as it is)
    board.reach = { width: Math.max(board.reach.width, tablesWidth, Math.ceil(needed)), height: Math.max(board.reach.height, rows * rowHeight) };

    content.style.width = `${board.reach.width}px`;
    content.style.height = `${board.reach.height}px`;
    box.style.setProperty("--swt-sheet-row", `${rowHeight}px`);
    // The tables: their columns the sheet's widths, at their places
    for (const placed of tables) {
      const table = placed.widget.querySelector("table");
      if (!table) continue;
      const count = table.rows[0]?.cells.length ?? 0;
      let colgroup = table.querySelector<HTMLTableColElement>(":scope > colgroup.swt-sheet-cols");
      if (!colgroup) {
        colgroup = this.host.doc.createElement("colgroup");
        colgroup.className = "swt-sheet-cols";
        table.prepend(colgroup);
      }
      while (colgroup.children.length < count) colgroup.append(this.host.doc.createElement("col"));
      while (colgroup.children.length > count) colgroup.lastElementChild!.remove();
      let width = 0;
      for (let j = 0; j < count; j++) {
        const w = this.leftOf(placed.at.column + j + 1) - this.leftOf(placed.at.column + j);
        (colgroup.children[j] as HTMLElement).style.width = `${w}px`;
        width += w;
      }
      table.style.tableLayout = "fixed";
      table.style.width = `${width}px`;
      Object.assign(placed.widget.style, { left: `${this.leftOf(placed.at.column)}px`, top: `${placed.at.row * rowHeight}px`, width: `${width}px` });
      if (this.standIns.get(placed.key)?.ready) this.showDrawn(placed.key);
    }
    // The column lines no gradient can draw (the columns' widths differ); the rows' lines are a gradient (CSS)
    let shown = 0;
    for (let c = 0; c < lefts.length; c++) {
      if (lefts[c]! < box.scrollLeft || lefts[c]! > box.scrollLeft + viewWidth) continue;
      let line = this.columnLines.children[shown] as HTMLElement | undefined;
      if (!line) {
        line = this.host.doc.createElement("div");
        this.columnLines.append(line);
      }
      line.style.left = `${lefts[c]! - 1}px`;
      line.hidden = false;
      shown++;
    }
    for (let i = shown; i < this.columnLines.children.length; i++) (this.columnLines.children[i] as HTMLElement).hidden = true;
    this.placeLetters(box, content, lefts);
    this.placeNumbers(box, content, rowHeight);
    if (this.grabFor) this.placeGrab();
    // The empty cell selected or edited follows the grid
    if (this.cell) this.showCell(this.cell.at);
    const pending = this.pendingPress;
    if (pending && !this.host.editing) {
      this.pendingPress = undefined;
      this.press(pending.x, pending.y);
    }
    if (this.after?.ready && !this.host.editing) void this.goOn();
  }

  /** Every column's letter in view, in the room above the grid */
  private placeLetters(box: HTMLElement, content: HTMLElement, lefts: readonly number[]): void {
    this.placeTabs(box);
    const view = box.getBoundingClientRect();
    const origin = content.getBoundingClientRect();
    const layer = this.letters;
    Object.assign(layer.style, { left: `${view.left + NUMBERS_ROOM}px`, width: `${Math.max(0, view.width - NUMBERS_ROOM)}px`, top: `${view.top}px`, height: `${LETTERS_ROOM}px` });
    let shown = 0;
    for (let c = 0; c + 1 < lefts.length; c++) {
      const left = origin.left + lefts[c]! - view.left - NUMBERS_ROOM;
      const width = lefts[c + 1]! - lefts[c]!;
      if (left + width <= 0 || left >= view.width) continue;
      let letter = layer.children[shown] as HTMLElement | undefined;
      if (!letter) {
        letter = this.host.doc.createElement("span");
        const edge = el(this.host.doc, "span", { class: "swt-sheet-width", title: "Drag to set the column's width; double-click for its width as its cells need" });
        letter.append(this.host.doc.createTextNode(""), edge);
        layer.append(letter);
      }
      letter.hidden = false;
      (letter.firstChild as Text).data = columnLetters(c);
      (letter.lastElementChild as HTMLElement).dataset.column = String(c);
      letter.style.left = `${left}px`;
      letter.style.width = `${width}px`;
      shown++;
    }
    for (let i = shown; i < layer.children.length; i++) (layer.children[i] as HTMLElement).hidden = true;
  }

  /** The column whose letter's edge `target` is */
  private widthColumn(target: EventTarget | null): number | undefined {
    const edge = target instanceof Element ? target.closest<HTMLElement>(".swt-sheet-width") : null;
    const column = edge ? Number(edge.dataset.column) : NaN;
    return Number.isInteger(column) ? column : undefined;
  }

  /**
   * A letter's edge dragged: the column as wide as at the press plus the
   * pointer's move (shown meanwhile, the grid laid out anew each frame), stored
   * as it is let go as the table's header's handle stores it; Esc leaves it
   */
  private widthPress(e: PointerEvent): void {
    const board = this.board;
    const column = this.widthColumn(e.target);
    if (!board || column === undefined || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const edge = e.target as HTMLElement;
    edge.setPointerCapture?.(e.pointerId);
    const start = this.columnWidth(column);
    const x = e.clientX;
    let width = start;
    edge.classList.add("swt-active");
    const move = (ev: PointerEvent) => {
      width = Math.max(MIN_COLUMN_WIDTH, Math.round(start + ev.clientX - x));
      board.preview.set(column, width);
      this.queuePlace();
    };
    const finish = (store: boolean) => {
      edge.removeEventListener("pointermove", move);
      edge.removeEventListener("pointerup", up);
      edge.removeEventListener("pointercancel", cancel);
      this.host.doc.removeEventListener("keydown", key, true);
      edge.classList.remove("swt-active");
      if (store && width !== start) void this.setColumnWidth(board, column, width);
      else {
        board.preview.delete(column);
        this.queuePlace();
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };
    edge.addEventListener("pointermove", move);
    edge.addEventListener("pointerup", up);
    edge.addEventListener("pointercancel", cancel);
    this.host.doc.addEventListener("keydown", key, true);
  }

  /** Every row's number in view, in the room beside the grid */
  private placeNumbers(box: HTMLElement, content: HTMLElement, rowHeight: number): void {
    const view = box.getBoundingClientRect();
    const origin = content.getBoundingClientRect();
    const layer = this.numbers;
    const top = view.top + LETTERS_ROOM;
    Object.assign(layer.style, { left: `${view.left}px`, top: `${top}px`, height: `${Math.max(0, view.bottom - top)}px` });
    const first = Math.max(0, Math.floor((top - origin.top) / rowHeight));
    let shown = 0;
    for (let r = first; origin.top + r * rowHeight < view.bottom; r++) {
      let span = layer.children[shown] as HTMLElement | undefined;
      if (!span) {
        span = this.host.doc.createElement("span");
        layer.append(span);
      }
      span.hidden = false;
      span.textContent = String(r + 1);
      span.style.top = `${origin.top + r * rowHeight - top}px`;
      span.style.height = `${rowHeight}px`;
      shown++;
    }
    for (let i = shown; i < layer.children.length; i++) (layer.children[i] as HTMLElement).hidden = true;
  }
}



/** Whether two sheet's cells are the same */
function same(a: SheetCell, b: SheetCell): boolean {
  return a.row === b.row && a.column === b.column;
}
