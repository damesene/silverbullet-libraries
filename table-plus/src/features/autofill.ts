// The autofill module: the fill handle, a small square at the bottom right
// corner of the cells selected. Dragged down or up (right or left), the cells
// dragged over go on from the selected ones, column by column (row by row):
// 1, 2 → 3, 4; Mon, Tue → Wed; Item 1 → Item 2; formulas with their references
// moved (another module's copy: TableHost.fillCell); else the values repeat.
// The value the last cell will get shows by the pointer while dragging, and
// the cells are written as the drag ends, in one edit; Esc cancels. A double
// click fills down as far as the column beside has values. Within the table
// only: no rows or columns are added. Not while the table is sorted or
// filtered, where the rows shown are not where the cells would go.
import { cellValue, type Cell, type FillLine, filled, fillLine } from "../autofill/index.ts";
import type { CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { WIDGET_SELECTOR } from "../dom.ts";

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
};

/** How far a drag fills: down or up to a row (as shown), or right or left to a column */
type Extent = { readonly axis: "rows" | "columns"; readonly to: number };

export class AutoFill implements Feature {
  private readonly handle: HTMLElement;
  private readonly outline: HTMLElement;
  private readonly tip: HTMLElement;
  private dragging = false;
  // Ends the drag (Esc: without filling)
  private endDrag: ((apply: boolean) => void) | undefined;

  constructor(private readonly host: TableHost) {
    this.handle = host.floating("div", "tp-fill-handle");
    this.handle.title = "Drag to fill the cells after these (1, 2 → 3, 4; Mon → Tue), double-click to fill down";
    this.outline = host.floating("div", "tp-fill-outline");
    this.tip = host.floating("div", "tp-fill-tip");
    this.handle.addEventListener("pointerdown", (e) => this.drag(e));
    this.handle.addEventListener("dblclick", (e) => {
      e.preventDefault();
      this.fillDown();
    });
  }

  stop(): void {
    for (const el of [this.handle, this.outline, this.tip]) el.remove();
  }

  owns(node: Node): boolean {
    return [this.handle, this.outline, this.tip].some((el) => el.contains(node));
  }

  selectionChanged(): void {
    this.placeHandle();
  }

  layoutChanged(): void {
    if (!this.dragging) this.placeHandle();
  }

  // Esc while dragging cancels the fill (before the selection module takes Esc: the cells stay selected)
  keyDown(e: KeyboardEvent): boolean {
    if (e.key !== "Escape" || !this.endDrag) return false;
    e.preventDefault();
    e.stopPropagation();
    this.endDrag(false);
    return true;
  }

  editorOpened(): void {
    this.handle.classList.remove("tp-visible");
  }

  /** The cells selected in a table shown, if they are body cells of a table shown as written */
  private selection(): Selected | undefined {
    for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      const refs = info ? this.host.selectedCells(info) : [];
      if (!info || refs.length === 0) continue;
      if (refs.some((ref) => ref.row === 0) || this.host.rearranged(info)) return undefined;
      const rows = this.host.shownRows(info).slice(1);
      const shown = refs.map((ref) => rows.findIndex((tr) => Number(tr.dataset.tpRow) === ref.row));
      if (shown.some((i) => i < 0)) return undefined;
      const columns = refs.map((ref) => ref.column);
      return {
        widget,
        info,
        rows,
        top: Math.min(...shown),
        bottom: Math.max(...shown),
        left: Math.min(...columns),
        right: Math.max(...columns),
      };
    }
    return undefined;
  }

  /** The markdown's row (the header 0) of a body row as shown */
  private rowOf(selected: Selected, shown: number): number {
    return Number(selected.rows[shown]!.dataset.tpRow);
  }

  /** The handle at the bottom right corner of the cells selected, while that corner is in view */
  private placeHandle(): void {
    const selected = this.host.editing ? undefined : this.selection();
    const cell = selected && this.host.cellAt(selected.info, { row: this.rowOf(selected, selected.bottom), column: selected.right });
    const part = cell && cell.isConnected && this.host.shownPart(selected.widget, selected.info, cell);
    const rect = cell?.getBoundingClientRect();
    if (!part || !rect || part.right < rect.right - 1 || part.bottom < rect.bottom - 1) {
      this.handle.classList.remove("tp-visible");
      return;
    }
    const size = this.handle.offsetWidth || 8;
    this.host.place(this.handle, rect.right - size / 2, rect.bottom - size / 2);
  }

  /**
   * How far the pointer at x, y fills: along the axis it went further out of
   * the selection on, to the row or column under it, within the table
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
    return down >= across ? { axis: "rows", to: row } : { axis: "columns", to: column };
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

  /** The handle dragged: the cells the pointer goes over outlined, the last one's value by the pointer; written as it is let go */
  private drag(e: PointerEvent): void {
    if (e.button !== 0) return;
    const selected = this.selection();
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
    const win = this.host.doc.defaultView!;
    const table = this.host.tableOf(selected.info);
    let extent: Extent | undefined;
    this.dragging = true;
    this.host.doc.body.classList.add("tp-filling");
    const move = (ev: PointerEvent) => {
      extent = this.extentAt(selected, ev.clientX, ev.clientY);
      this.preview(selected, extent, table, ev.clientX, ev.clientY);
    };
    const finish = (apply: boolean) => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      this.endDrag = undefined;
      this.dragging = false;
      this.host.doc.body.classList.remove("tp-filling");
      this.outline.classList.remove("tp-visible");
      this.tip.classList.remove("tp-visible");
      if (apply && extent) void this.apply(selected, extent);
      else this.placeHandle();
    };
    const up = () => finish(true);
    this.endDrag = finish;
    win.addEventListener("pointermove", move, true);
    win.addEventListener("pointerup", up, true);
  }

  /** The cells a drag would fill outlined with the selected ones, the value of the farthest one by the pointer */
  private preview(selected: Selected, extent: Extent | undefined, table: ReturnType<TableHost["tableOf"]>, x: number, y: number): void {
    if (!extent) {
      this.outline.classList.remove("tp-visible");
      this.tip.classList.remove("tp-visible");
      return;
    }
    const rows = extent.axis === "rows" ? [Math.min(selected.top, extent.to), Math.max(selected.bottom, extent.to)] : [selected.top, selected.bottom];
    const columns = extent.axis === "columns" ? [Math.min(selected.left, extent.to), Math.max(selected.right, extent.to)] : [selected.left, selected.right];
    const first = this.host.cellAt(selected.info, { row: this.rowOf(selected, rows[0]!), column: columns[0]! });
    const last = this.host.cellAt(selected.info, { row: this.rowOf(selected, rows[1]!), column: columns[1]! });
    if (first?.isConnected && last?.isConnected) {
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      Object.assign(this.outline.style, {
        left: `${Math.min(a.left, b.left)}px`,
        top: `${Math.min(a.top, b.top)}px`,
        width: `${Math.max(a.right, b.right) - Math.min(a.left, b.left)}px`,
        height: `${Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top)}px`,
      });
      this.outline.classList.add("tp-visible");
    }
    const [line] = this.lines(selected, extent);
    const cells = line ? fillLine(table, line, this.fillCells(selected.info)) : [];
    const value = cells.length ? cellValue(cells[cells.length - 1]!) : "";
    const count = this.lines(selected, extent).reduce((n, l) => n + l.targets.length, 0);
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
    const filledBeside = (column: number, shown: number) => cellValue(table.rows[this.rowOf(selected, shown)]?.cells[column] ?? "") !== "";
    let to = selected.bottom;
    for (const column of beside) {
      if (!filledBeside(column, selected.bottom + 1)) continue;
      while (to + 1 < selected.rows.length && filledBeside(column, to + 1)) to++;
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
    const rows = extent.axis === "rows" ? [Math.min(selected.top, extent.to), Math.max(selected.bottom, extent.to)] : [selected.top, selected.bottom];
    const columns = extent.axis === "columns" ? [Math.min(selected.left, extent.to), Math.max(selected.right, extent.to)] : [selected.left, selected.right];
    const corner = (shown: number, column: number): CellRef => ({ row: this.rowOf(selected, shown), column });
    this.host.selectCells(info, corner(rows[0]!, columns[0]!), corner(rows[1]!, columns[1]!));
    const result = await this.host.write(widget, (t) => filled(t, lines, this.fillCells(info)));
    if (result === "written") return;
    const now = this.host.widgetForKey(info.key);
    const nowInfo = now && this.host.infoOf(now);
    if (nowInfo) this.host.selectCells(nowInfo, corner(selected.top, selected.left), corner(selected.bottom, selected.right));
  }
}
