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
import { CELL_MENU_ORDER, type AdapterFeature, type AddressFrame, type CellArea, type CellMenuGroup, type CellRef, type RenderedEditor, type TableHost, type TableInfo, type ToolbarButton, type WidgetInfo, type WriteResult } from "../../feature.ts";
import { oncePerFrame } from "../../frame.ts";
import { claimWindow, releaseWindow } from "../../overwindow.ts";
import { DRAWN_CLASS, UI_CLASS } from "../../../dom.ts";
import { el } from "../../../elements.ts";
import { columnLetters, isFormulaInput } from "../../../formulas/index.ts";
import { ICONS } from "../../../icons.ts";
import { escapeCell, findTables, parseTable, type Table, type TableRange } from "../../../markdown.ts";
import { metaName, sameTableName, withMeta, withMetaName } from "../../../meta.ts";
import { AT_ATTRIBUTE, formatAt, freeName, freeSheetName, parseAt, SHEET_ATTRIBUTE, SHEET_WIDTH_PREFIX, sameSheet, type SheetCell, sheetsOf, sheetTables, sheetWidths } from "../../../sheet/page.ts";
import { placeProblem, roomFor } from "../../../sheet/layout.ts";
import { watchPress } from "../../press.ts";
import { growTo } from "../../structure.ts";
import { type CellRenderer, StaticCellRenderer } from "../cells.ts";
import { drawTable } from "../drawn.ts";
import type { TableKey } from "../../tables.ts";

// An empty column's width, a row's height when no table gives one
const COLUMN_WIDTH = 100;
const ROW_HEIGHT = 36;
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
  readonly alone: TableKey;
  readonly box: HTMLElement;
  readonly content: HTMLElement;
  readonly tables: Map<TableKey, Placed>;
  // The sheet's own widths (its first table's sheet.width.*; a table alone: its own sheet.width.*), by column
  widths: ReadonlyMap<number, number>;
  // A column's width while it is dragged (AddressFrame.previewColumnWidth), by column
  readonly preview: Map<number, number>;
};

export class Sheet implements AdapterFeature {
  private readonly renderer: CellRenderer;
  private board: Board | undefined;
  // The columns' letters (above) and the rows' numbers (beside), over the box's rooms
  private readonly letters: HTMLElement;
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
    | { at: SheetCell; key: "Enter" | "Tab" | "Escape"; back: boolean; grown: { key: TableKey; cell: CellRef } | undefined; ready: boolean }
    | undefined;
  // The board's tables as shown (their rows' order), as of the last view applied to them
  private shownIndex: { placed: Placed; info: WidgetInfo; order: number[] }[] | undefined;
  // The rows' order each table's cells last looked by (their formulas' addresses on the sheet follow it)
  private readonly looksOrder = new Map<string, string>();
  // The empty cell edited that makes a table of its own (no table grows to it), and that table's key: made as Enter or
  // Tab saves a value, before the table is written (what follows it once it is drawn needs it)
  private making: { readonly at: SheetCell; key: TableKey | undefined } | undefined;
  // Drawings asked for, by table: only the last of each is put in
  private readonly drawing = new Map<TableKey, number>();
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
    this.numbers = host.floating("div", "swt-over-window-rows swt-sheet-numbers");
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
    this.numbers.remove();
    this.grab.remove();
  }

  // ---- the toolbar, opening and ending ------------------------------------------

  toolbarButtons(info: WidgetInfo): ToolbarButton[] {
    const on = !!this.board?.tables.has(info.key);
    const sheet = sheetOf(info.source);
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
    const board: Board = { sheet: sheetOf(info.source), alone: info.key, box, content, tables: new Map(), widths: new Map(), preview: new Map() };
    this.board = board;
    claimWindow(this.host, this);
    box.addEventListener("scroll", () => this.queuePlace());
    doc.body.append(box);
    box.focus({ preventScroll: true });
    this.watching = new MutationObserver((records) => {
      if (records.some((r) => !box.contains(r.target) && !this.host.isFloating(r.target))) this.queueRefresh();
    });
    this.watching.observe(doc.body, { childList: true, subtree: true, characterData: true });
    this.letters.classList.add("swt-visible");
    this.numbers.classList.add("swt-visible");
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
    const onSheets = sheetTables(text);
    const keys = this.host.tableKeys(this.host.currentPage, text);
    const keyOf = (range: TableRange) => keys[range.ordinal]!;
    const moved = board.sheet
      ? onSheets.find((t) => board.tables.has(keyOf(t.range)) && !sameSheet(t.sheet, board.sheet!))
      : onSheets.find((t) => keyOf(t.range) === board.alone);
    if (moved) board.sheet = moved.sheet;
    const wanted = new Map<TableKey, { range: TableRange; at: SheetCell }>();
    if (board.sheet) {
      const mine = sheetsOf(sheetTables(text)).find((s) => sameSheet(s.name, board.sheet!))?.tables ?? [];
      for (const t of mine) wanted.set(keyOf(t.range), { range: t.range, at: t.at });
      board.widths = sheetWidths(mine[0]?.table);
    } else {
      const range = findTables(text)[keys.indexOf(board.alone)];
      if (range) wanted.set(board.alone, { range, at: { row: 0, column: 0 } });
      // A table alone: its grid's widths are kept in it, as a sheet's are in its first table
      board.widths = sheetWidths(range && parseTable(range.text));
    }
    // A width dragged and stored: shown as stored from now on
    for (const [column, width] of board.preview) if (board.widths.get(column) === width) board.preview.delete(column);
    if (wanted.size === 0) {
      this.end();
      return;
    }
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
    if (before) before.widget.replaceWith(widget);
    else board.content.append(widget);
    board.tables.set(key, { key, range, at, widget, natural: before?.natural ?? [], rowHeight: before?.rowHeight ?? 0 });
    this.shownIndex = undefined;
    // Its looks are made by its rows as in the markdown (then sorted or filtered: viewApplied asks for them again)
    if (!before) this.looksOrder.set(key, Array.from(parseTable(range.text).rows, (_, i) => i).join(","));
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
      if (board.tables.has(info.key) || (board.sheet && parseTable(info.source).meta?.[SHEET_ATTRIBUTE])) this.queueRefresh();
      return;
    }
    const placed = board.tables.get(info.key);
    if (!placed || placed.widget !== widget) return;
    // Its columns and rows as drawn, before the sheet's widths and height are applied
    // (As wide as its content: SilverBullet's tables are as wide as their box, which would spread the columns)
    const table = info.table;
    const { tableLayout, width } = table.style;
    table.style.tableLayout = "auto";
    table.style.width = "max-content";
    placed.natural = Array.from(table.rows[0]?.cells ?? [], (cell) => cell.getBoundingClientRect().width);
    placed.rowHeight = this.host.bodyRows(info).find((tr) => tr.isConnected)?.getBoundingClientRect().height ?? 0;
    table.style.tableLayout = tableLayout;
    table.style.width = width;
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
      const step = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey ? ARROWS[e.key] : undefined;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.unselect();
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
   * drops it); where the keyboard goes then is the module's, as in a table
   */
  editorKeyDown(e: KeyboardEvent, editor: RenderedEditor): boolean {
    if (!this.cell || editor.cell !== this.cell.element || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key !== "Enter" && e.key !== "Tab" && e.key !== "Escape") return false;
    // Something typed is written, the table grown to hold it (or made: its first body cell): on once it is drawn
    // anew, from where the value went
    const typed = e.key !== "Escape" && editor.field.value.trim() !== "";
    const owner = typed ? this.ownerOf(this.cell.at) : undefined;
    const made = typed && this.making && same(this.making.at, this.cell.at) ? { key: (this.making.key ??= this.host.newTableKey()), cell: { row: 1, column: 0 } } : undefined;
    const grown = owner ? { key: owner.key, cell: growTo(owner.info, owner.cell).cell } : made;
    this.after = { at: this.cell.at, key: e.key, back: e.shiftKey, grown, ready: false };
    return false;
  }

  /** An arrow on a table's cell selected alone at its edge: on into the sheet past it (an empty cell, or another table) */
  selectionLeaves(info: WidgetInfo, from: CellRef, step: readonly [number, number]): boolean {
    const placed = this.board?.tables.get(info.key);
    const here = placed && this.sheetCellOf(info, placed, from);
    if (!here) return false;
    this.go({ row: Math.max(0, here.row + step[0]), column: Math.max(0, here.column + step[1]) }, false);
    return true;
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
          table === undefined ? placed === mine : sameTableName(metaName(parseTable(placed.range.text)) ?? "", table),
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
      origin: mine.at,
      cellAt: (point) => this.cellAtPoint(point.x, point.y),
      placeProblem: (at) => this.placeProblemOf(info.key, at),
      previewPlace: (at) => this.previewPlace(info.key, at),
      moveTo: (at) => this.moveTable(info.key, at),
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
    const laidOut = [...board.tables.values()].map((p) => {
      const e = this.extent(p);
      const name = metaName(parseTable(p.range.text));
      return { id: p.range.from, at: p.at, rows: e.bottom - e.top + 1, columns: e.right - e.left + 1, ...(name ? { name } : {}) };
    });
    const problem = placeProblem(laidOut, placed.range.from, at);
    return problem && `${problem} is there`;
  }

  /** The outline of where a table would go (its address by it; marked where it cannot), or none */
  private previewPlace(key: TableKey, at: SheetCell | undefined): void {
    const board = this.board;
    const placed = board?.tables.get(key);
    const grid = this.grid;
    if (!board || !placed || !grid || !at) {
      if (this.preview) this.preview.hidden = true;
      return;
    }
    let preview = this.preview;
    if (!preview || !preview.isConnected) {
      preview = el(this.host.doc, "div", { class: `${UI_CLASS} swt-sheet-move`, attrs: { "aria-hidden": "true" } }, el(this.host.doc, "span", "swt-sheet-move-tip"));
      board.content.append(preview);
      this.preview = preview;
    }
    const e = this.extent(placed);
    const left = this.leftOf(at.column);
    const problem = this.placeProblemOf(key, at);
    Object.assign(preview.style, {
      left: `${left}px`,
      top: `${at.row * grid.rowHeight}px`,
      width: `${this.leftOf(at.column + e.right - e.left + 1) - left}px`,
      height: `${(e.bottom - e.top + 1) * grid.rowHeight}px`,
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
    return this.host.writeTable(info, (t) => withMeta(t, AT_ATTRIBUTE, formatAt(at)));
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
    const size = this.grab.offsetWidth || 18;
    this.host.place(this.grab, rect.left - size - 2, rect.top - size - 2);
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
        ? sheetsOf(sheetTables(text)).find((s) => sameSheet(s.name, board.sheet!))?.tables[0]?.range
        : findTables(text)[keys.indexOf(board.alone)];
      // Without a metadata row and the setting (a table alone): for the view only, as the widths module keeps them
      if (range && !parseTable(range.text).meta && !this.host.metadataEnabled) {
        if (width === undefined) board.preview.delete(column);
        else board.preview.set(column, width);
        this.queuePlace();
        return;
      }
      const target = range && { key: keys[range.ordinal]!, source: range.text, hint: range.from };
      const result = target && (await this.host.writeTable(target, (t) => withMeta(t, `${SHEET_WIDTH_PREFIX}${columnLetters(column)}`, width === undefined ? undefined : String(width))));
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
    const name = first.info.key === key ? undefined : metaName(parseTable(first.info.source));
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
      const name = metaName(model);
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
    if (after.key === "Escape") this.go(at, false);
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
    const host = last && this.infoOfKey(last.key);
    const pageTables = findTables(this.host.pageText);
    if (!last || !host || !pageTables.length) return;
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
    const board = this.board;
    if (!board) return "failed";
    const text = await this.host.bridge.getText();
    // A table alone: put on a sheet with it, at A1, named (a formula refers to another table by its name)
    const keys = this.host.tableKeys(this.host.currentPage, text);
    const alone = board.sheet ? undefined : findTables(text)[keys.indexOf(board.alone)];
    const sheet = board.sheet ?? freeSheetName(text);
    const aloneName = alone && (metaName(parseTable(alone.text)) ?? freeName(text));
    const ranges = findTables(text);
    const last = ranges[ranges.length - 1];
    if (!last) return "failed";
    const trimmed = typed.trim();
    const value = trimmed.startsWith("'=") ? trimmed.slice(1) : trimmed;
    if (!trimmed.startsWith("'=") && isFormulaInput(trimmed)) {
      void this.host.bridge.flash(
        "Silverware Table: saved as text, as a formula needs its table first: edit the cell in the sheet view and remove the ' to make it a formula",
        "info",
      );
    }
    let table = parseTable(`| Column 1 |\n|---|\n| ${escapeCell(value)} |`);
    table = withMeta(withMeta(withMetaName(table, freeName(text, aloneName ? [aloneName] : [])), SHEET_ATTRIBUTE, sheet), AT_ATTRIBUTE, formatAt({ row: Math.max(0, at.row - 1), column: at.column }));
    const also = alone && {
      target: { key: board.alone, source: alone.text, hint: alone.from },
      change: (t: Table) => withMeta(withMeta(withMetaName(t, aloneName!), SHEET_ATTRIBUTE, sheet), AT_ATTRIBUTE, "A1"),
    };
    const result = await this.host.insertTable(table, { key: keys[last.ordinal]!, source: last.text, hint: last.from }, also, key);
    if (result === "written" && also && this.board === board) {
      // The board is the sheet's from now on: its tables, the new one too, as the page has them
      board.sheet = sheet;
      void this.host.bridge.flash(`Silverware Table: the table and the new one are on the sheet ${sheet} now (Ctrl+Z undoes it)`, "info");
    }
    return result;
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
    const lefts = [0];
    for (let c = 0; c <= lastColumn || lefts[c]! < box.scrollLeft + viewWidth + COLUMNS_BEYOND * COLUMN_WIDTH; c++) lefts.push(lefts[c]! + this.columnWidth(c));
    const rows = Math.max(lastRow + 1 + ROWS_BEYOND, Math.ceil((box.scrollTop + viewHeight) / rowHeight) + ROWS_BEYOND);
    this.grid = { lefts, rowHeight };

    content.style.width = `${lefts[lefts.length - 1]}px`;
    content.style.height = `${rows * rowHeight}px`;
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
        layer.append(letter);
      }
      letter.hidden = false;
      letter.textContent = columnLetters(c);
      letter.style.left = `${left}px`;
      letter.style.width = `${width}px`;
      shown++;
    }
    for (let i = shown; i < layer.children.length; i++) (layer.children[i] as HTMLElement).hidden = true;
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

/** The sheet a table is on: its `sheet`, with a place on it (`at`); none: it shows alone */
function sheetOf(source: string): string | undefined {
  const meta = parseTable(source).meta;
  const sheet = meta?.[SHEET_ATTRIBUTE]?.trim();
  return sheet && parseAt(meta?.[AT_ATTRIBUTE]) ? sheet : undefined;
}

/** Whether two sheet's cells are the same */
function same(a: SheetCell, b: SheetCell): boolean {
  return a.row === b.row && a.column === b.column;
}
