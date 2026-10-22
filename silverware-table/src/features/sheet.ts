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
import type { CellEditor, CellRef, Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { oncePerFrame } from "../core/frame.ts";
import { STICKY_GAP } from "../core/layout.ts";
import { firstRowBelow } from "../core/geometry.ts";
import { OverWindow, type RowsPast } from "../core/overwindow.ts";
import { UI_CLASS } from "../dom.ts";
import { columnLetters } from "../formulas/index.ts";
import { ICONS } from "../icons.ts";

// An empty column's width, an empty row's height when the table has no body row to take it from
const COLUMN_WIDTH = 100;
const ROW_HEIGHT = 32;
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

export class Sheet implements Feature {
  private readonly over: OverWindow;
  // The empty cells, in the table's box: right of the table and below it
  private readonly grid: HTMLElement;
  private readonly right: HTMLElement;
  private readonly below: HTMLElement;
  // The empty columns' letters, over the room above the header
  private readonly letters: HTMLElement;
  private readonly queuePlace: () => void;
  private layout: Layout | undefined;
  // The cell laid for the cell editor, while it edits an empty cell
  private cell: HTMLTableCellElement | undefined;

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

  owns(node: Node): boolean {
    return this.letters.contains(node);
  }

  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
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

  enhanced(widget: HTMLElement, info: WidgetInfo): void {
    this.over.enhanced(widget, info);
    if (widget === this.over.widget) this.queuePlace();
  }

  viewApplied(widget: HTMLElement): void {
    this.over.viewApplied(widget);
    if (widget === this.over.widget) this.queuePlace();
  }

  rowsAttached(info: WidgetInfo): void {
    this.over.rowsAttached(info);
  }

  keyDown(e: KeyboardEvent): boolean {
    return this.over.keyDown(e);
  }

  // The numbers past the table follow the empty rows: placed after them (place)
  layoutChanged(): void {
    if (this.over.layoutChanged(false)) this.place();
  }

  /** A press on an empty cell edits it; with another cell being edited, that one is saved first (the press does no more) */
  mouseDown(e: MouseEvent): boolean {
    const target = e.target;
    if (!(target instanceof Element) || !this.grid.contains(target) || target.closest(".swt-cell-editor")) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return true;
    if (this.host.editing) {
      void this.host.saveEditing();
      return true;
    }
    const widget = this.over.widget;
    const info = widget && this.host.infoOf(widget);
    const hit = info && this.cellAt(widget, info, e.clientX, e.clientY);
    if (!widget || !info || !hit) return true;
    const cell = this.host.doc.createElement("td");
    cell.className = "swt-sheet-cell";
    Object.assign(cell.style, { left: `${hit.left}px`, top: `${hit.top}px`, width: `${hit.width}px`, height: `${hit.height}px` });
    this.grid.append(cell);
    this.cell = cell;
    this.host.editBeyond(widget, info, hit.at, cell);
    // (Read again: the editor opened, or did not)
    if ((this.host.editing as CellEditor | undefined)?.cell !== cell) this.dropCell();
    return true;
  }

  editorClosed(editor: CellEditor): void {
    if (editor.cell === this.cell) this.dropCell();
  }

  private dropCell(): void {
    this.cell?.remove();
    this.cell = undefined;
  }

  private hide(): void {
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
    const info = widget?.isConnected ? this.host.infoOf(widget) : undefined;
    if (!widget || !info) {
      this.hide();
      return;
    }
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

  /** The empty cell at a point of the viewport (its place in the box's content), if one is there */
  private cellAt(
    widget: HTMLElement,
    info: WidgetInfo,
    clientX: number,
    clientY: number,
  ): { at: CellRef; left: number; top: number; width: number; height: number } | undefined {
    const layout = this.layout;
    if (!layout) return undefined;
    const origin = this.origin(widget);
    const x = clientX - origin.x;
    const y = clientY - origin.y;
    if (x < layout.right && y < layout.bottom) return undefined;
    let column: number;
    let left: number;
    let width = COLUMN_WIDTH;
    if (x >= layout.right) {
      const j = Math.floor((x - layout.right) / COLUMN_WIDTH);
      column = info.columns + j;
      left = layout.right + j * COLUMN_WIDTH;
    } else {
      // Below the table: the column of the header cell over the point
      const head = Array.from(info.table.rows[0]?.cells ?? []).find((cell) => {
        const rect = cell.getBoundingClientRect();
        return rect.left <= clientX && clientX < rect.right && this.host.cellRef(info, cell);
      });
      const ref = head && this.host.cellRef(info, head);
      if (!head || !ref) return undefined;
      const rect = head.getBoundingClientRect();
      column = ref.column;
      left = rect.left - origin.x;
      width = rect.width;
    }
    let row: number;
    let top: number;
    let height = layout.rowHeight;
    if (y >= layout.bottom) {
      const k = Math.floor((y - layout.bottom) / layout.rowHeight);
      row = info.rows + k;
      top = layout.bottom + k * layout.rowHeight;
    } else if (y < layout.headBottom) {
      row = 0;
      top = layout.top;
      height = layout.headBottom - layout.top;
    } else {
      // Right of the table: the row shown at the point
      const tr = this.host.shownRows(info).find((r) => {
        if (this.host.rowOf(info, r) === 0 || !r.isConnected) return false;
        const rect = r.getBoundingClientRect();
        return rect.top <= clientY && clientY < rect.bottom;
      });
      if (!tr) return undefined;
      const rect = tr.getBoundingClientRect();
      row = this.host.rowOf(info, tr);
      top = rect.top - origin.y;
      height = rect.height;
    }
    return { at: { row, column }, left, top, width, height };
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
