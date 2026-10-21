// The autofill module: the fill handle, a small square at the bottom right
// corner of the cells selected. Dragged down or up (right or left), the cells
// dragged over go on from the selected ones, column by column (row by row):
// 1, 2 → 3, 4; Mon, Tue → Wed; Item 1 → Item 2; formulas with their references
// moved (another module's copy: TableHost.fillCell); else the values repeat.
// While dragging, what is filled is outlined, the handle goes to its corner and
// the value the last cell will get shows by the pointer; the cells are written
// as the drag ends, in one edit; Esc cancels. A double click fills down as far
// as the column beside has values. Within the table only (no rows or columns
// are added), and within the zone of pinned rows or columns the selection is
// in. Not while the table is sorted or filtered, where the rows shown are not
// where the cells would go.
//
// The handle and the outline are elements in the cells, out of their text's
// line as the pin mark is, placed by CSS: they move with the table as it
// scrolls and go under its held header, with nothing measured.
import { cellValue, type Cell, type FillLine, filled, fillLine } from "../autofill/index.ts";
import type { CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { OUT_OF_LINE_CLASS, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";

/** The cells selected: their table, their rows as shown (body rows, top to bottom) and columns */
type Selected = {
  readonly widget: HTMLElement;
  readonly info: WidgetInfo;
  // The body rows as shown, and where the selection is among them
  readonly rows: readonly HTMLTableRowElement[];
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  // How far a fill may go: the pinned rows' (columns') zone the selection is in, as shown
  readonly rowZone: readonly [number, number];
  readonly columnZone: readonly [number, number];
};

/** Rows as shown (body rows) and columns, from the first to the last */
type Area = { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };

/** How far a drag fills: down or up to a row (as shown), or right or left to a column */
type Extent = { readonly axis: "rows" | "columns"; readonly to: number };

export class AutoFill implements Feature {
  private readonly handle: HTMLElement;
  private readonly tip: HTMLElement;
  // The outline of what a drag fills: a piece in each cell on its edge
  private edges: HTMLElement[] = [];
  private outlined = "";
  // Ends the drag (Esc: without filling)
  private endDrag: ((apply: boolean) => void) | undefined;

  constructor(private readonly host: TableHost) {
    this.handle = host.doc.createElement("div");
    this.handle.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-fill-handle`;
    this.handle.title = "Drag to fill the cells after these (1, 2 → 3, 4; Mon → Tue), double-click to fill down";
    this.tip = host.floating("div", "tp-fill-tip");
    // A touch or a pen; a mouse's press is taken in mouseDown, as the controller hands presses to features
    this.handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.drag();
    });
  }

  stop(): void {
    this.endDrag?.(false);
    this.handle.remove();
    this.tip.remove();
  }

  owns(node: Node): boolean {
    return this.handle.contains(node) || this.tip.contains(node);
  }

  /** A press on the handle is the handle's, not its cell's: a drag, or with a double click a fill down */
  mouseDown(e: MouseEvent): boolean {
    if (!(e.target instanceof Node) || !this.handle.contains(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return true;
    // The second press of a double click (the controller keeps dblclick events from the table)
    if (e.detail === 2) this.fillDown();
    else if (e.detail < 2) this.drag();
    return true;
  }

  // Esc while dragging cancels the fill (before the selection module takes Esc: the cells stay selected)
  keyDown(e: KeyboardEvent): boolean {
    if (e.key !== "Escape" || !this.endDrag) return false;
    e.preventDefault();
    e.stopPropagation();
    this.endDrag(false);
    return true;
  }

  selectionChanged(): void {
    this.placeHandle();
  }

  // A table rendered anew (the selection shown again), sorted or filtered, or rows back in the document
  enhanced(): void {
    this.placeHandle();
  }

  viewApplied(): void {
    this.placeHandle();
  }

  rowsAttached(): void {
    this.placeHandle();
  }

  editorOpened(): void {
    this.handle.remove();
  }

  /** The cells selected in a table shown, if they are body cells of a table shown as written */
  private selection(): Selected | undefined {
    for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      const refs = info ? this.host.selectedCells(info) : [];
      if (!info || refs.length === 0) continue;
      if (refs.some((ref) => ref.row === 0) || this.host.rearranged(info)) return undefined;
      const rows = this.host.shownRows(info).slice(1);
      const index = new Map(rows.map((tr, i) => [Number(tr.dataset.tpRow), i]));
      let [top, bottom, left, right] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const ref of refs) {
        const at = index.get(ref.row);
        if (at === undefined) return undefined;
        [top, bottom, left, right] = [Math.min(top, at), Math.max(bottom, at), Math.min(left, ref.column), Math.max(right, ref.column)];
      }
      // Rows pinned to the top or bottom, columns to the left or right, are zones of their own (totals): a fill stays in the selection's
      const { pins } = info;
      const zone = (at: number, first: number, last: number, before: number, after: number): [number, number] =>
        at < first + before ? [first, first + before - 1] : at > last - after ? [last - after + 1, last] : [first + before, last - after];
      return {
        widget,
        info,
        rows,
        top,
        bottom,
        left,
        right,
        rowZone: zone(bottom, 0, rows.length - 1, pins.top, pins.bottom),
        columnZone: zone(right, 0, info.columns - 1, pins.left, pins.right),
      };
    }
    return undefined;
  }

  /** The markdown's row (the header 0) of a body row as shown */
  private rowOf(selected: Selected, shown: number): number {
    return Number(selected.rows[shown]!.dataset.tpRow);
  }

  /** The cell of a body row as shown, while it is in the document */
  private cellOf(selected: Selected, shown: number, column: number): HTMLTableCellElement | undefined {
    const cell = this.host.cellAt(selected.info, { row: this.rowOf(selected, shown), column });
    return cell?.isConnected ? cell : undefined;
  }

  /** The handle in the bottom right cell of the selection (none while a cell is edited, or a drag places it) */
  private placeHandle(): void {
    if (this.endDrag) return;
    const selected = this.host.editing ? undefined : this.selection();
    this.handleAt(selected && this.cellOf(selected, selected.bottom, selected.right));
  }

  private handleAt(cell: HTMLTableCellElement | undefined): void {
    if (!cell) this.handle.remove();
    else if (this.handle.parentElement !== cell) cell.append(this.handle);
  }

  /** The selection with the cells a drag fills */
  private areaOf(selected: Selected, extent: Extent | undefined): Area {
    const { top, bottom, left, right } = selected;
    if (!extent) return { top, bottom, left, right };
    return extent.axis === "rows"
      ? { top: Math.min(top, extent.to), bottom: Math.max(bottom, extent.to), left, right }
      : { top, bottom, left: Math.min(left, extent.to), right: Math.max(right, extent.to) };
  }

  /** An area outlined: a piece in each of its cells on an edge, marked with the sides it draws */
  private outline(selected: Selected, area: Area | undefined): void {
    const key = area ? `${area.top},${area.bottom},${area.left},${area.right}` : "";
    if (key === this.outlined) return;
    this.outlined = key;
    for (const edge of this.edges) edge.remove();
    this.edges = [];
    if (!area) return;
    const piece = (shown: number, column: number) => {
      const cell = this.cellOf(selected, shown, column);
      if (!cell) return;
      const sides = [
        shown === area.top && "tp-fill-top",
        shown === area.bottom && "tp-fill-bottom",
        column === area.left && "tp-fill-left",
        column === area.right && "tp-fill-right",
      ].filter(Boolean);
      const edge = this.host.doc.createElement("span");
      edge.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-fill-edge ${sides.join(" ")}`;
      cell.append(edge);
      this.edges.push(edge);
    };
    for (let shown = area.top; shown <= area.bottom; shown++) {
      if (shown === area.top || shown === area.bottom) for (let column = area.left; column <= area.right; column++) piece(shown, column);
      else {
        piece(shown, area.left);
        if (area.right !== area.left) piece(shown, area.right);
      }
    }
  }

  /**
   * How far the pointer at x, y fills: along the axis it went further out of
   * the selection on, to the row or column under it, within the selection's zone
   */
  private extentAt(selected: Selected, x: number, y: number): Extent | undefined {
    const rects = selected.rows.map((tr) => (tr.isConnected ? tr.getBoundingClientRect() : undefined));
    let row = rects.findIndex((r) => r && y >= r.top && y < r.bottom);
    if (row < 0) {
      const measured = rects.map((r, i) => ({ r, i })).filter((m) => m.r);
      if (measured.length === 0) return undefined;
      row = y < measured[0]!.r!.top ? measured[0]!.i : measured[measured.length - 1]!.i;
    }
    const cells = Array.from(selected.rows[selected.bottom]?.cells ?? []).map((c) => c.getBoundingClientRect());
    let column = cells.findIndex((r) => x >= r.left && x < r.right);
    if (column < 0) column = cells.length && x < cells[0]!.left ? 0 : cells.length - 1;
    const down = row > selected.bottom ? row - selected.bottom : row < selected.top ? selected.top - row : 0;
    const across = column > selected.right ? column - selected.right : column < selected.left ? selected.left - column : 0;
    if (down === 0 && across === 0) return undefined;
    const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, n));
    if (down >= across) {
      const to = clamp(row, selected.rowZone);
      return to > selected.bottom || to < selected.top ? { axis: "rows", to } : undefined;
    }
    const to = clamp(column, selected.columnZone);
    return to > selected.right || to < selected.left ? { axis: "columns", to } : undefined;
  }

  /** The lines a fill writes: each column (row) of the selection, its cells selected and those dragged over, nearest first */
  private lines(selected: Selected, extent: Extent): FillLine[] {
    const { top, bottom, left, right } = selected;
    const cell = (shown: number, column: number): Cell => ({ row: this.rowOf(selected, shown), column });
    const span = (from: number, to: number) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => (from <= to ? from + i : from - i));
    if (extent.axis === "rows") {
      const backward = extent.to < top;
      const targets = backward ? span(top - 1, extent.to) : span(bottom + 1, extent.to);
      return span(left, right).map((column) => ({
        sources: span(top, bottom).map((r) => cell(r, column)),
        targets: targets.map((r) => cell(r, column)),
        backward,
      }));
    }
    const backward = extent.to < left;
    const targets = backward ? span(left - 1, extent.to) : span(right + 1, extent.to);
    return span(top, bottom).map((r) => ({
      sources: span(left, right).map((column) => cell(r, column)),
      targets: targets.map((column) => cell(r, column)),
      backward,
    }));
  }

  private fillCells(info: WidgetInfo) {
    return {
      claim: (cell: string, from: Cell, to: Cell) => this.host.fillCell(info, cell, from, to),
      keepTags: (value: string, from: string) => this.host.keepTags(value, from),
    };
  }

  /** The handle dragged: what it fills outlined, the handle at its corner, the last value by the pointer; written as it is let go */
  private drag(): void {
    const selected = this.selection();
    if (!selected) return;
    const win = this.host.doc.defaultView!;
    const table = this.host.tableOf(selected.info);
    let extent: Extent | undefined;
    this.host.doc.body.classList.add("tp-filling");
    const move = (ev: PointerEvent) => {
      extent = this.extentAt(selected, ev.clientX, ev.clientY);
      const area = this.areaOf(selected, extent);
      this.outline(selected, extent && area);
      this.handleAt(this.cellOf(selected, area.bottom, area.right));
      this.showTip(selected, extent, table, ev.clientX, ev.clientY);
    };
    const finish = (apply: boolean) => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", cancel, true);
      win.removeEventListener("blur", cancel);
      this.endDrag = undefined;
      this.host.doc.body.classList.remove("tp-filling");
      this.outline(selected, undefined);
      this.tip.classList.remove("tp-visible");
      if (apply && extent) void this.apply(selected, extent);
      else this.placeHandle();
    };
    const up = () => finish(true);
    // The pointer taken away (a touch gesture of the system, the window left): no fill
    const cancel = () => finish(false);
    this.endDrag = finish;
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
    win.addEventListener("pointercancel", cancel, true);
    win.addEventListener("blur", cancel);
  }

  /** By the pointer: the value the farthest cell filled gets (else how many cells are filled) */
  private showTip(selected: Selected, extent: Extent | undefined, table: ReturnType<TableHost["tableOf"]>, x: number, y: number): void {
    if (!extent) {
      this.tip.classList.remove("tp-visible");
      return;
    }
    const lines = this.lines(selected, extent);
    const cells = lines[0] ? fillLine(table, lines[0], this.fillCells(selected.info)) : [];
    const value = cells.length ? cellValue(cells[cells.length - 1]!) : "";
    const count = lines.reduce((n, l) => n + l.targets.length, 0);
    this.tip.textContent = value || `${count} ${count === 1 ? "cell" : "cells"}`;
    this.host.place(this.tip, x + 14, y + 14);
  }

  /** Double click: down as far as the column beside the selection (left, else right) has values */
  private fillDown(): void {
    const selected = this.selection();
    if (!selected) return;
    const table = this.host.tableOf(selected.info);
    const columns = table.rows[0]?.cells.length ?? 0;
    const beside = [selected.left - 1, selected.right + 1].filter((c) => c >= 0 && c < columns);
    const last = selected.rowZone[1];
    const filledBeside = (column: number, shown: number) =>
      shown <= last && cellValue(table.rows[this.rowOf(selected, shown)]?.cells[column] ?? "") !== "";
    let to = selected.bottom;
    for (const column of beside) {
      if (!filledBeside(column, selected.bottom + 1)) continue;
      while (filledBeside(column, to + 1)) to++;
      break;
    }
    if (to > selected.bottom) void this.apply(selected, { axis: "rows", to });
  }

  /**
   * The cells filled, in one edit, and selected with the ones they were
   * filled from: selected before the write (the table rendered anew shows the
   * selection again), the selection put back when nothing is written
   */
  private async apply(selected: Selected, extent: Extent): Promise<void> {
    const { info, widget } = selected;
    const lines = this.lines(selected, extent);
    const area = this.areaOf(selected, extent);
    const corner = (shown: number, column: number): CellRef => ({ row: this.rowOf(selected, shown), column });
    this.host.selectCells(info, corner(area.top, area.left), corner(area.bottom, area.right));
    const result = await this.host.write(widget, (t) => filled(t, lines, this.fillCells(info)));
    if (result === "written") return;
    const now = this.host.widgetForKey(info.key);
    const nowInfo = now && this.host.infoOf(now);
    if (nowInfo) this.host.selectCells(nowInfo, corner(selected.top, selected.left), corner(selected.bottom, selected.right));
  }
}
