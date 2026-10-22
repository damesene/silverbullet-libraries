// The sheet module (docs/silverware-table-sheets.md; the plan:
// docs/silverware-table-sheet-plan.md): a toolbar icon shows the table's sheet
// as a spreadsheet's sheet over the whole window. A table on a sheet (its
// metadata row: `sheet`, `at`, sheet/page.ts) shows with the sheet's other
// tables, each at its place on one grid; a table on no sheet shows alone, at
// A1. Around them empty cells in every direction, as many as the window shows
// and more as it scrolls on, the columns' letters above, the rows' numbers
// beside. A value typed into an empty cell right of a table (in its rows) or
// below it (in its columns), up to the next table, grows that table to hold it
// in one edit (TableHost.editBeyond); a growth that would reach into another
// table is refused (moving tables is to come); elsewhere nothing is written yet.
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
// SilverBullet's navigation.
import type { AdapterFeature, CellRef, RenderedEditor, TableHost, ToolbarButton, WidgetInfo } from "../../feature.ts";
import { oncePerFrame } from "../../frame.ts";
import { claimWindow, releaseWindow } from "../../overwindow.ts";
import { DRAWN_CLASS, UI_CLASS } from "../../../dom.ts";
import { columnLetters } from "../../../formulas/index.ts";
import { ICONS } from "../../../icons.ts";
import { findTables, parseTable, type TableRange } from "../../../markdown.ts";
import { metaName } from "../../../meta.ts";
import { SHEET_ATTRIBUTE, sameSheet, type SheetCell, sheetsOf, sheetTables, sheetWidths } from "../../../sheet/page.ts";
import { type CellRenderer, StaticCellRenderer } from "../cells.ts";
import { drawTable } from "../drawn.ts";

// An empty column's width, a row's height when no table gives one
const COLUMN_WIDTH = 100;
const ROW_HEIGHT = 36;
// The room for the rows' numbers (left) and the columns' letters (above): as the full screen's
const NUMBERS_ROOM = 28;
const LETTERS_ROOM = 42;
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
  readonly key: string;
  readonly range: TableRange;
  readonly at: SheetCell;
  readonly widget: HTMLElement;
  // Its columns' widths as drawn, before the sheet's were applied; its body rows' height
  natural: readonly number[];
  rowHeight: number;
};

/** The board shown: which sheet (none: one table alone), its tables, its box */
type Board = {
  readonly sheet: string | undefined;
  readonly box: HTMLElement;
  readonly content: HTMLElement;
  readonly tables: Map<string, Placed>;
  // The sheet's own widths (its first table's sheet.width.*), by column
  widths: ReadonlyMap<number, number>;
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
  // `grown`: the table it grew, so once that is drawn anew (`ready` then)
  private after: { at: SheetCell; key: "Enter" | "Tab" | "Escape"; back: boolean; grown: string | undefined; ready: boolean } | undefined;
  // Drawings asked for, by table: only the last of each is put in
  private readonly drawing = new Map<string, number>();
  // A drawing put off while a cell of a table drawn is edited (swapping it would take the editor's cell away)
  private putOff = false;
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
  }

  stop(): void {
    this.end();
    this.letters.remove();
    this.numbers.remove();
  }

  // ---- the toolbar, opening and ending ------------------------------------------

  toolbarButtons(info: WidgetInfo): ToolbarButton[] {
    const on = !!this.board?.tables.has(info.key);
    const sheet = parseTable(info.source).meta?.[SHEET_ATTRIBUTE]?.trim();
    return [
      {
        label: on ? "Exit sheet view" : "Sheet view",
        title: on
          ? "Show the table in the page again (Esc)"
          : sheet
            ? `Show the sheet ${sheet} with its other tables, as a spreadsheet over the whole window`
            : "Show the table as a spreadsheet over the whole window: type into an empty cell past it to grow it",
        place: "icon",
        icon: ICONS.sheet,
        pressed: on,
        run: () => (on ? this.end() : void this.open(info)),
      },
    ];
  }

  /** The board of the table's sheet (or of the table alone), its tables drawn */
  private async open(info: WidgetInfo): Promise<void> {
    this.end();
    const doc = this.host.doc;
    const box = doc.createElement("div");
    box.className = "swt-sheet-board";
    const content = doc.createElement("div");
    content.className = "swt-sheet-content";
    content.append(this.columnLines);
    box.append(content);
    const sheet = parseTable(info.source).meta?.[SHEET_ATTRIBUTE]?.trim() || undefined;
    const board: Board = { sheet, box, content, tables: new Map(), widths: new Map() };
    this.board = board;
    claimWindow(doc, this);
    box.addEventListener("scroll", () => this.queuePlace());
    doc.body.append(box);
    this.watching = new MutationObserver((records) => {
      if (records.some((r) => !box.contains(r.target) && !this.host.isFloating(r.target))) this.queueRefresh();
    });
    this.watching.observe(doc.body, { childList: true, subtree: true, characterData: true });
    this.letters.classList.add("swt-visible");
    this.numbers.classList.add("swt-visible");
    await this.refresh(info.key);
    this.host.toolbarChanged();
  }

  /** Closes the board: its tables go, the page's show as they were */
  end(): void {
    const board = this.board;
    if (!board) return;
    this.board = undefined;
    releaseWindow(this.host.doc, this);
    this.watching?.disconnect();
    this.watching = undefined;
    this.drawing.clear();
    this.putOff = false;
    this.chosen = undefined;
    this.pendingPress = undefined;
    this.after = undefined;
    if (this.cell && this.host.editing?.cell === this.cell.element) this.host.cancelEditing();
    this.dropCell();
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
   * (or the table alone, `alone`: its key), each drawn anew where its markdown
   * or its place changed, those no longer on it taken away. None left: the
   * board ends.
   */
  private async refresh(alone?: string): Promise<void> {
    const board = this.board;
    if (!board) return;
    const text = await this.host.bridge.getText();
    if (this.board !== board) return;
    const page = this.host.currentPage;
    const wanted = new Map<string, { range: TableRange; at: SheetCell }>();
    if (board.sheet) {
      const mine = sheetsOf(sheetTables(text)).find((s) => sameSheet(s.name, board.sheet!))?.tables ?? [];
      for (const t of mine) wanted.set(`${page}#${t.range.ordinal}`, { range: t.range, at: t.at });
      board.widths = sheetWidths(mine);
    } else {
      const key = alone ?? [...board.tables.keys()][0];
      const range = key === undefined ? undefined : findTables(text)[Number(key.slice(key.lastIndexOf("#") + 1))];
      if (key !== undefined && range) wanted.set(key, { range, at: { row: 0, column: 0 } });
    }
    if (wanted.size === 0) {
      this.end();
      return;
    }
    for (const [key, placed] of board.tables) {
      if (wanted.has(key)) continue;
      placed.widget.remove();
      board.tables.delete(key);
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
  private async draw(board: Board, key: string, range: TableRange, at: SheetCell): Promise<void> {
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
  }

  /** A table of the board as enhanced now, by its key */
  private infoOfKey(key: string): WidgetInfo | undefined {
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
    if (this.after?.grown === info.key) this.after.ready = true;
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
    if (this.board?.tables.get(info.key)?.widget === this.host.widgetOf(info)) this.queuePlace();
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
        if (!typing && !paste) e.preventDefault();
        this.edit(at);
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
    // Something typed is written, the table grown to hold it: on once it is drawn anew
    const grown = e.key !== "Escape" && editor.field.value.trim() !== "" ? this.ownerOf(this.cell.at)?.key : undefined;
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
    // The board is no table the core keeps the press from: the browser would take the focus from the editor opened
    e.preventDefault();
    if (this.host.editing) {
      this.pendingPress = { x: e.clientX, y: e.clientY };
      void this.host.saveEditing().then(() => this.queuePlace());
      return;
    }
    this.press(e.clientX, e.clientY);
  }

  /** A table's selection ends the empty cell's */
  selectionChanged(): void {
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
    this.dropCell();
    // Nothing written (Esc, nothing typed): on at once, as the cells are now
    if (this.after && !this.after.grown) this.after.ready = true;
    this.queuePlace();
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

  /** The table holding a sheet's cell, and that cell in it (its row in the markdown), if one does */
  private tableAt(at: SheetCell): { info: WidgetInfo; ref: CellRef } | undefined {
    for (const placed of this.board?.tables.values() ?? []) {
      const info = this.infoOfKey(placed.key);
      if (!info) continue;
      const order = this.shownOrder(info);
      const row = at.row - placed.at.row;
      const column = at.column - placed.at.column;
      if (row >= 0 && row < order.length && column >= 0 && column < info.columns) return { info, ref: { row: order[row]!, column } };
    }
    return undefined;
  }

  /** The rows (as shown) and columns a table takes on the sheet */
  private extent(placed: Placed): { top: number; left: number; bottom: number; right: number } {
    const info = this.infoOfKey(placed.key);
    const model = parseTable(placed.range.text);
    const rows = info ? this.shownOrder(info).length : model.rows.length;
    const columns = info?.columns ?? model.align.length;
    return { top: placed.at.row, left: placed.at.column, bottom: placed.at.row + rows - 1, right: placed.at.column + columns - 1 };
  }

  /**
   * The table an empty cell grows, and the cell in it: the nearest table left
   * of it in its row (the cell in that table's rows), else the nearest above
   * it in its column (in its columns)
   */
  private ownerOf(at: SheetCell): { key: string; info: WidgetInfo; cell: CellRef } | undefined {
    const board = this.board;
    if (!board) return undefined;
    const tables = [...board.tables.values()].map((placed) => ({ placed, box: this.extent(placed) }));
    const left = tables.filter(({ box }) => at.row >= box.top && at.row <= box.bottom && at.column > box.right).sort((a, b) => b.box.right - a.box.right)[0];
    if (left) {
      const info = this.infoOfKey(left.placed.key);
      const order = info && this.shownOrder(info);
      if (info && order) return { key: left.placed.key, info, cell: { row: order[at.row - left.box.top]!, column: at.column - left.box.left } };
    }
    const above = tables.filter(({ box }) => at.column >= box.left && at.column <= box.right && at.row > box.bottom).sort((a, b) => b.box.bottom - a.box.bottom)[0];
    if (above) {
      const info = this.infoOfKey(above.placed.key);
      if (info) return { key: above.placed.key, info, cell: { row: info.rows + (at.row - above.box.bottom - 1), column: at.column - above.box.left } };
    }
    return undefined;
  }

  /** The table a table grown to hold a cell would reach into, if any */
  private wouldOverlap(key: string, cell: CellRef): string | undefined {
    const board = this.board;
    const placed = board?.tables.get(key);
    const info = this.infoOfKey(key);
    if (!board || !placed || !info) return undefined;
    const box = this.extent(placed);
    // As many rows and columns as reach the cell are added (TableHost.editBeyond: growTo in structure.ts)
    const next = {
      top: box.top,
      left: box.left,
      bottom: box.bottom + Math.max(0, cell.row - info.rows + 1),
      right: box.right + Math.max(0, cell.column - info.columns + 1),
    };
    for (const other of board.tables.values()) {
      if (other.key === key) continue;
      const o = this.extent(other);
      if (next.left <= o.right && o.left <= next.right && next.top <= o.bottom && o.top <= next.bottom) {
        return metaName(parseTable(other.range.text)) ?? `the table at ${columnLetters(o.left)}${o.top + 1}`;
      }
    }
    return undefined;
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
    const sign = after.back ? -1 : 1;
    if (after.key === "Escape") this.go(after.at, false);
    else if (after.key === "Tab") this.go({ row: after.at.row, column: Math.max(0, after.at.column + sign) }, true);
    else if ((await this.host.setting("enterKey")) === "moveDown") this.go({ row: Math.max(0, after.at.row + sign), column: after.at.column }, true);
    else this.go(after.at, false);
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
    const owner = this.ownerOf(at);
    if (!owner) {
      void this.host.bridge.flash("Silverware Table: a cell right of a table or below it grows that table; a new table elsewhere is to come", "info");
      return;
    }
    const overlap = this.wouldOverlap(owner.key, owner.cell);
    if (overlap) {
      void this.host.bridge.flash(`Silverware Table: the table would grow into ${overlap} (moving tables is to come)`, "info");
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

  /** A sheet column's width: the sheet's own, else the widest of the tables' columns there, else an empty one's */
  private columnWidth(column: number): number {
    const board = this.board!;
    const own = board.widths.get(column);
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
