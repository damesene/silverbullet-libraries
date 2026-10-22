// The sheet module (the sheet's first step: docs/silverware-table-sheets.md):
// a toolbar icon shows the table as a spreadsheet's sheet over the whole
// window (core/overwindow.ts, as full screen does), with empty cells past its
// last row and column, as many as the window shows and more as it scrolls on,
// the columns' letters (all of them in the room above, which the header's own
// would scroll away from) and the rows' numbers going on over them. A value typed
// into one of them grows the table to hold it, in one edit
// (TableHost.editBeyond: rows, and columns named, added up to it); one left
// empty adds nothing. The same icon or Esc closes it.
//
// The empty cells are not elements: two areas of the table's box (right of
// the table, and below it) draw their lines, right of the table along its rows
// in view, below it along its columns. A press there finds the cell under it,
// and a td of the module's own is laid over that cell for the cell editor.
import type { AdapterFeature, CellRef, RenderedEditor, TableHost, ToolbarButton, WidgetInfo } from "../../feature.ts";
import { oncePerFrame } from "../../frame.ts";
import { STICKY_GAP } from "../../layout.ts";
import { firstRowBelow } from "../../geometry.ts";
import { growTo } from "../../structure.ts";
import { OverWindow, type RowsPast } from "../../overwindow.ts";
import { UI_CLASS } from "../../../dom.ts";
import { columnLetters } from "../../../formulas/index.ts";
import { ICONS } from "../../../icons.ts";

// An empty column's width, an empty row's height when the table has no body row to take it from
const COLUMN_WIDTH = 100;
const ROW_HEIGHT = 32;
// Arrows: the rows and columns they go by
const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};
// Empty columns and rows beyond the view's edge: the box scrolls on into them, and more come
const COLUMNS_BEYOND = 4;
const ROWS_BEYOND = 10;

/** Where the table and the empty cells are, in the box's content (its scrolled area) */
type Layout = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  // The header's bottom: the empty cells right of it are its row's
  readonly headBottom: number;
  readonly rowHeight: number;
  readonly columns: number;
  readonly rows: number;
};

export class Sheet implements AdapterFeature {
  private readonly over: OverWindow;
  // The empty cells, in the table's box: right of the table and below it
  private readonly grid: HTMLElement;
  private readonly right: HTMLElement;
  private readonly below: HTMLElement;
  // The empty columns' letters, over the room above the header
  private readonly letters: HTMLElement;
  private readonly queuePlace: () => void;
  private layout: Layout | undefined;
  // The module's td over the empty cell selected or edited
  private cell: { readonly element: HTMLTableCellElement; readonly at: CellRef } | undefined;
  // The empty cell selected (select mode): a press on it, typing, Enter or F2 edits it
  private chosen: CellRef | undefined;
  // A press on an empty cell while a cell was edited: acted on once that edit is saved and the cells placed anew
  private pendingPress: { x: number; y: number } | undefined;
  // Where the keyboard goes on from the empty cell edited (Enter, Tab, Esc), once its editor is closed: from `at`
  // (`grown`: the cell in the table its write grew, so once that is rendered anew; `ready` then)
  private after: { at: CellRef; key: "Enter" | "Tab" | "Escape"; back: boolean; grown: boolean; ready: boolean } | undefined;

  constructor(private readonly host: TableHost) {
    this.over = new OverWindow(host, {
      className: "swt-sheet",
      changed: () => {
        host.toolbarChanged();
        if (this.over.key === undefined) this.hide();
        else this.queuePlace();
      },
      past: (widget) => this.rowsPast(widget),
    });
    this.queuePlace = oncePerFrame(host.doc, () => this.place());
    const doc = host.doc;
    this.grid = doc.createElement("div");
    this.grid.className = `${UI_CLASS} swt-sheet-grid`;
    this.right = doc.createElement("div");
    this.right.className = "swt-sheet-right";
    this.below = doc.createElement("div");
    this.below.className = "swt-sheet-below";
    this.grid.append(this.right, this.below);
    this.letters = host.floating("div", "swt-sheet-letters");
    this.letters.setAttribute("aria-hidden", "true");
  }

  stop(): void {
    this.over.stop();
    this.hide();
    this.letters.remove();
  }

  toolbarButtons(info: WidgetInfo): ToolbarButton[] {
    const widget = this.host.widgetOf(info);
    const on = this.over.key === info.key;
    return [
      {
        label: on ? "Exit sheet view" : "Sheet view",
        title: on
          ? "Show the table in the page again (Esc)"
          : "Show the table as a spreadsheet over the whole window: type into an empty cell past it to grow it",
        place: "icon",
        icon: ICONS.sheet,
        pressed: on,
        run: () => (on ? this.over.end() : this.over.begin(widget, info)),
      },
    ];
  }

  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    this.over.decorate(info);
  }

  tableAdded(widget: HTMLElement, table: HTMLTableElement): void {
    this.over.tableAdded(widget, table);
  }

  enhanced(info: WidgetInfo): void {
    const widget = this.host.widgetOf(info);
    this.over.enhanced(widget, info);
    if (widget !== this.over.widget) return;
    if (this.after?.grown) this.after.ready = true;
    this.queuePlace();
  }

  viewApplied(info: WidgetInfo): void {
    const widget = this.host.widgetOf(info);
    this.over.viewApplied(widget);
    if (widget === this.over.widget) this.queuePlace();
  }

  rowsAttached(info: WidgetInfo): void {
    this.over.rowsAttached(info);
  }

  pageLoaded(): void {
    this.over.pageLoaded();
  }

  /**
   * An empty cell selected: typing edits it (the key goes into its field, as on
   * a table's cell), so do Enter and F2, and Ctrl+V (the paste goes into its
   * field, which the paste module takes: cells copied from a spreadsheet grow
   * the table); arrows select the next cell, the table's too; Esc unselects it
   * (a second one closes the sheet view)
   */
  keyDown(e: KeyboardEvent): boolean {
    const at = this.chosen;
    const widget = this.over.widget;
    const info = widget && this.host.infoOf(widget);
    if (at && info && !this.host.editing && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
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
        this.go(info, this.stepFrom(info, at, step), false);
        return true;
      }
      if (typing || paste || e.key === "Enter" || e.key === "F2") {
        if (!typing && !paste) e.preventDefault();
        this.edit(at);
        return true;
      }
    }
    return this.over.keyDown(e);
  }

  /**
   * Enter, Tab or Esc in the empty cell's editor: the core's editor saves it (or
   * drops it); where the keyboard goes then is the module's, as in a table:
   * Enter edits the cell below (the enterKey setting: else selects the cell
   * saved), Tab the next one, Shift the other way, Esc leaves the cell selected
   */
  editorKeyDown(e: KeyboardEvent, editor: RenderedEditor): boolean {
    if (!this.cell || editor.cell !== this.cell.element || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key !== "Enter" && e.key !== "Tab" && e.key !== "Escape") return false;
    const widget = this.over.widget;
    const info = widget && this.host.infoOf(widget);
    if (!info) return false;
    // Something typed is written, the table grown to hold it: on from its place in the table grown
    const grown = e.key !== "Escape" && editor.field.value.trim() !== "";
    const at = { row: editor.row, column: editor.column };
    this.after = { at: grown ? growTo(info, at).cell : at, key: e.key, back: e.shiftKey, grown, ready: false };
    return false;
  }

  /** An arrow on a table's cell selected alone at its edge: on into the empty cells past it */
  selectionLeaves(info: WidgetInfo, from: CellRef, step: readonly [number, number]): boolean {
    if (info.key !== this.over.key) return false;
    const to = this.stepFrom(info, from, step);
    if (to.row < info.rows && to.column < info.columns) return false;
    this.select(to);
    return true;
  }

  // The numbers past the table follow the empty rows: placed after them (place)
  layoutChanged(): void {
    if (this.over.layoutChanged(false)) this.place();
  }

  /** Presses on the empty cells are the module's: other buttons than the left do nothing there (no markdown shown) */
  mouseDown(e: MouseEvent): boolean {
    if (e.button === 0 || !this.inGrid(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }

  /**
   * A press on an empty cell selects it (select mode), or edits it (edit mode,
   * or the cell selected already); with a cell being edited, that one is saved
   * first, then the press acts on the cells as they are placed after it. A
   * press elsewhere unselects the empty cell (the selection module ends a
   * table's selection itself, on any press).
   */
  beforeMouseDown(e: MouseEvent): void {
    if (!this.inGrid(e.target)) {
      if (!(e.target instanceof Node && this.host.isFloating(e.target))) this.unselect();
      return;
    }
    if (this.host.editing) {
      this.pendingPress = { x: e.clientX, y: e.clientY };
      void this.host.saveEditing().then(() => this.queuePlace());
      return;
    }
    this.press(e.clientX, e.clientY);
  }

  /** The cells selected in a table changed: a table's selection ends the empty cell's */
  selectionChanged(): void {
    const widget = this.over.widget;
    const info = widget && this.host.infoOf(widget);
    if (this.chosen && info && this.host.selectedCells(info).length > 0) this.unselect();
  }

  editorClosed(editor: RenderedEditor): void {
    if (!this.cell || editor.cell !== this.cell.element) return;
    this.chosen = undefined;
    this.dropCell();
    // Nothing written (Esc, nothing typed): on at once, as the cells are now
    if (this.after && !this.after.grown) this.after.ready = true;
    this.queuePlace();
  }

  /** Where the keyboard goes on after the empty cell's editor (`after`), the cells placed as they are now */
  private async goOn(info: WidgetInfo): Promise<void> {
    const after = this.after;
    if (!after) return;
    this.after = undefined;
    const sign = after.back ? -1 : 1;
    if (after.key === "Escape") {
      this.go(info, after.at, false);
    } else if (after.key === "Tab") {
      this.go(info, this.stepFrom(info, after.at, [0, sign]), true);
    } else if ((await this.host.setting("enterKey")) === "moveDown") {
      this.go(info, this.stepFrom(info, after.at, [sign, 0]), true);
    } else {
      this.go(info, after.at, false);
    }
  }

  /** Selects or edits a cell: the table's, or an empty one */
  private go(info: WidgetInfo, to: CellRef, edit: boolean): void {
    if (to.row < info.rows && to.column < info.columns) {
      this.unselect();
      if (edit) this.host.editCell(info, to);
      else this.host.selectCells(info, to, to);
    } else if (edit) this.edit(to);
    else this.select(to);
  }

  /**
   * The cell a step away from `at`: rows as shown (the header first, then the
   * body rows in their order, then the empty rows), never before the first row
   * or column
   */
  private stepFrom(info: WidgetInfo, at: CellRef, step: readonly [number, number]): CellRef {
    const order = this.host.shownRows(info).map((tr) => this.host.rowOf(info, tr));
    const place = at.row >= info.rows ? order.length + at.row - info.rows : order.indexOf(at.row);
    const next = Math.max(0, (place < 0 ? 0 : place) + step[0]);
    const row = next < order.length ? order[next]! : info.rows + next - order.length;
    return { row, column: Math.max(0, at.column + step[1]) };
  }

  private inGrid(target: EventTarget | null): boolean {
    return target instanceof Element && this.grid.contains(target) && !target.closest(".swt-cell-editor");
  }

  private press(x: number, y: number): void {
    const widget = this.over.widget;
    const info = widget && this.host.infoOf(widget);
    const at = widget && info && this.cellAt(widget, info, x, y);
    if (!at) {
      this.unselect();
      return;
    }
    const same = this.chosen?.row === at.row && this.chosen.column === at.column;
    if (this.host.clickSelects() && !same) this.select(at);
    else this.edit(at);
  }

  private select(at: CellRef): void {
    this.chosen = at;
    this.showCell(at)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  private unselect(): void {
    if (!this.chosen) return;
    this.chosen = undefined;
    if (!this.cell || this.host.editing?.cell !== this.cell.element) this.dropCell();
  }

  /** Opens the cell editor in an empty cell (TableHost.editBeyond), in the module's td laid over it */
  private edit(at: CellRef): void {
    const widget = this.over.widget;
    const info = widget && this.host.infoOf(widget);
    const cell = this.showCell(at);
    if (!widget || !info || !cell) return;
    this.host.editBeyond(widget, info, at, cell);
    // (Read again: the editor opened, or did not)
    if ((this.host.editing as RenderedEditor | undefined)?.cell !== cell) {
      this.chosen = undefined;
      this.dropCell();
    }
  }

  /** The module's td over an empty cell (the one selected or edited), placed where that cell is now */
  private showCell(at: CellRef): HTMLTableCellElement | undefined {
    const widget = this.over.widget;
    const info = widget && this.host.infoOf(widget);
    const box = widget && info && this.cellBox(widget, info, at);
    if (!box) {
      this.dropCell();
      return undefined;
    }
    let element = this.cell?.element;
    if (!element) {
      element = this.host.doc.createElement("td");
      element.className = "swt-sheet-cell";
      this.grid.append(element);
    }
    this.cell = { element, at };
    Object.assign(element.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    return element;
  }

  private dropCell(): void {
    this.cell?.element.remove();
    this.cell = undefined;
  }

  private hide(): void {
    this.chosen = undefined;
    this.pendingPress = undefined;
    this.after = undefined;
    if (this.cell && this.host.editing?.cell === this.cell.element) this.host.cancelEditing();
    this.dropCell();
    this.grid.remove();
    this.letters.classList.remove("swt-visible");
    this.layout = undefined;
  }

  /** Where the box's content starts, in the viewport: what the grid's places are measured from */
  private origin(widget: HTMLElement): { x: number; y: number } {
    const box = widget.getBoundingClientRect();
    return { x: box.left + widget.clientLeft - widget.scrollLeft, y: box.top + widget.clientTop - widget.scrollTop };
  }

  /** The empty rows below the table, numbered on beside them */
  private rowsPast(widget: HTMLElement): RowsPast | undefined {
    const layout = this.layout;
    if (!layout) return undefined;
    return { top: this.origin(widget).y + layout.bottom, height: layout.rowHeight, count: layout.rows };
  }

  /**
   * The empty cells' areas around the table as it is laid out now, enough of
   * them to fill the view and more; then the letters and the numbers, which
   * follow them. Everything is measured before anything is changed.
   */
  private place(): void {
    const widget = this.over.widget;
    // Rendered anew, not enhanced yet: placed once it is (what is selected or comes next kept meanwhile)
    const info = widget?.isConnected ? this.host.infoOf(widget) : undefined;
    if (!widget || !info) return;
    const origin = this.origin(widget);
    const view = this.host.innerBox(widget);
    const table = info.table.getBoundingClientRect();
    const left = table.left - origin.x;
    const top = table.top - origin.y;
    const right = table.right - origin.x;
    const bottom = table.bottom - origin.y;
    const headBottom = top + (info.table.tHead?.offsetHeight ?? info.table.rows[0]?.offsetHeight ?? 0);
    // The body rows as shown, those in view measured (from the first in view on)
    const body = this.host.shownRows(info).filter((tr) => this.host.rowOf(info, tr) > 0 && tr.isConnected);
    const rowHeight = body[0]?.offsetHeight || ROW_HEIGHT;
    const rowLines = [headBottom - top];
    for (let i = firstRowBelow(body, view.top); i < body.length; i++) {
      const rect = body[i]!.getBoundingClientRect();
      if (rect.top > view.bottom) break;
      rowLines.push(rect.bottom - origin.y - top);
    }
    const heads = this.headCells(info);
    const columnLines = heads.map((head) => head.right - origin.x - left);
    const columns = Math.max(COLUMNS_BEYOND, Math.ceil((widget.scrollLeft + widget.clientWidth - right) / COLUMN_WIDTH) + COLUMNS_BEYOND);
    const rows = Math.max(ROWS_BEYOND, Math.ceil((widget.scrollTop + widget.clientHeight - bottom) / rowHeight) + ROWS_BEYOND);
    this.layout = { left, top, right, bottom, headBottom, rowHeight, columns, rows };

    if (this.grid.parentElement !== widget) widget.append(this.grid);
    const width = columns * COLUMN_WIDTH;
    Object.assign(this.right.style, { left: `${right}px`, top: `${top}px`, width: `${width}px`, height: `${bottom - top}px` });
    Object.assign(this.below.style, { left: `${left}px`, top: `${bottom}px`, width: `${right - left + width}px`, height: `${rows * rowHeight}px` });
    this.grid.style.setProperty("--swt-sheet-column", `${COLUMN_WIDTH}px`);
    this.grid.style.setProperty("--swt-sheet-row", `${rowHeight}px`);
    this.grid.style.setProperty("--swt-sheet-table-width", `${right - left}px`);
    // The lines no gradient can draw: right of the table along its rows in view (their heights differ), below it
    // along its columns (their widths differ)
    lines(this.right, "swt-sheet-row-line", rowLines, "top");
    lines(this.below, "swt-sheet-column-line", columnLines, "left");
    this.placeLetters(view, info, heads, origin.x + right, columns);
    this.over.placeNumbers();
    // The empty cell selected or edited follows the table (grown, rendered anew)
    if (this.cell) this.showCell(this.cell.at);
    const pending = this.pendingPress;
    if (pending && !this.host.editing) {
      this.pendingPress = undefined;
      this.press(pending.x, pending.y);
    }
    if (this.after?.ready && !this.host.editing) void this.goOn(info);
  }

  /** The table's columns where its header cells are, in the viewport */
  private headCells(info: WidgetInfo): { column: number; left: number; right: number }[] {
    const heads: { column: number; left: number; right: number }[] = [];
    for (const cell of Array.from(info.table.rows[0]?.cells ?? [])) {
      const ref = this.host.cellRef(info, cell);
      if (!ref) continue;
      const rect = cell.getBoundingClientRect();
      heads.push({ column: ref.column, left: rect.left, right: rect.right });
    }
    return heads;
  }

  /**
   * Every column's letter in view, in the room above the header: the header's
   * own letters (in its cells) go with the table, which scrolls away as the
   * box scrolls down past it
   */
  private placeLetters(
    box: { left: number; right: number; top: number },
    info: WidgetInfo,
    heads: readonly { column: number; left: number; right: number }[],
    right: number,
    columns: number,
  ): void {
    const layer = this.letters;
    layer.style.left = `${box.left}px`;
    layer.style.width = `${Math.max(0, box.right - box.left)}px`;
    // Over the room above the header (STICKY_GAP), which it covers: rows scroll under it
    layer.style.top = `${box.top}px`;
    layer.style.height = `${STICKY_GAP}px`;
    layer.classList.add("swt-visible");
    const places = heads.map((head) => ({ column: head.column, left: head.left, width: head.right - head.left }));
    for (let j = 0; j < columns; j++) places.push({ column: info.columns + j, left: right + j * COLUMN_WIDTH, width: COLUMN_WIDTH });
    let shown = 0;
    for (const place of places) {
      if (place.left >= box.right || place.left + place.width <= box.left) continue;
      let letter = layer.children[shown] as HTMLElement | undefined;
      if (!letter) {
        letter = this.host.doc.createElement("span");
        layer.append(letter);
      }
      letter.hidden = false;
      letter.textContent = columnLetters(place.column);
      letter.style.left = `${place.left - box.left}px`;
      letter.style.width = `${place.width}px`;
      shown++;
    }
    for (let i = shown; i < layer.children.length; i++) (layer.children[i] as HTMLElement).hidden = true;
  }

  /** The empty cell at a point of the viewport, if one is there */
  private cellAt(widget: HTMLElement, info: WidgetInfo, clientX: number, clientY: number): CellRef | undefined {
    const layout = this.layout;
    if (!layout) return undefined;
    const origin = this.origin(widget);
    const x = clientX - origin.x;
    const y = clientY - origin.y;
    if (x < layout.right && y < layout.bottom) return undefined;
    // Right of the table: an empty column; below it, the column of the header cell over the point
    const column =
      x >= layout.right
        ? info.columns + Math.floor((x - layout.right) / COLUMN_WIDTH)
        : this.headCells(info).find((head) => head.left <= clientX && clientX < head.right)?.column;
    if (column === undefined) return undefined;
    if (y >= layout.bottom) return { row: info.rows + Math.floor((y - layout.bottom) / layout.rowHeight), column };
    if (y < layout.headBottom) return { row: 0, column };
    // Right of the table: the row shown at the point
    const tr = this.host.shownRows(info).find((r) => {
      if (this.host.rowOf(info, r) === 0 || !r.isConnected) return false;
      const rect = r.getBoundingClientRect();
      return rect.top <= clientY && clientY < rect.bottom;
    });
    return tr && { row: this.host.rowOf(info, tr), column };
  }

  /** Where an empty cell is in the box's content, as the table is laid out now */
  private cellBox(widget: HTMLElement, info: WidgetInfo, at: CellRef): { left: number; top: number; width: number; height: number } | undefined {
    const layout = this.layout;
    if (!layout || (at.row < info.rows && at.column < info.columns)) return undefined;
    const origin = this.origin(widget);
    let left = layout.right + (at.column - info.columns) * COLUMN_WIDTH;
    let width = COLUMN_WIDTH;
    if (at.column < info.columns) {
      const head = this.headCells(info).find((h) => h.column === at.column);
      if (!head) return undefined;
      left = head.left - origin.x;
      width = head.right - head.left;
    }
    if (at.row >= info.rows) return { left, top: layout.bottom + (at.row - info.rows) * layout.rowHeight, width, height: layout.rowHeight };
    if (at.row === 0) return { left, top: layout.top, width, height: layout.headBottom - layout.top };
    const row = this.host.cellAt(info, { row: at.row, column: 0 })?.parentElement;
    if (!row?.isConnected) return undefined;
    const rect = row.getBoundingClientRect();
    return { left, top: rect.top - origin.y, width, height: rect.height };
  }
}

/** Lines across an area at these offsets (`side`: from its top or its left), as many elements as there are lines */
function lines(area: HTMLElement, className: string, offsets: readonly number[], side: "top" | "left"): void {
  const doc = area.ownerDocument;
  const existing = Array.from(area.children).filter((child) => child.classList.contains(className)) as HTMLElement[];
  offsets.forEach((offset, i) => {
    let line = existing[i];
    if (!line) {
      line = doc.createElement("div");
      line.className = `${UI_CLASS} ${className}`;
      area.append(line);
    }
    line.style[side] = `${Math.round(offset) - 1}px`;
  });
  for (let i = offsets.length; i < existing.length; i++) existing[i]!.remove();
}
