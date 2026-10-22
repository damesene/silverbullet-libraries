// The autofill module: the fill handle, a small square at the bottom right
// corner of the cells selected. Dragged down or up (right or left), the cells
// dragged over go on from the selected ones, column by column (row by row):
// 1, 2 → 3, 4; Mon, Tue → Wed; Item 1 → Item 2; formulas with their references
// moved (another module's copy: TableHost.fillCell); else the values repeat.
// While dragging, what is filled is outlined, the handle goes to its corner and
// the value the last cell will get shows by the pointer; the cells are written
// as the drag ends, in one edit; Esc cancels. A double click fills down as far
// as the column beside has values. AutoFill to… in the cell menu does the
// same without dragging (a touch screen, where the corner selects, or a long
// way): a click (a tap) on a cell then fills to it. Within the table only (no
// rows or columns are added), and within the zone of pinned rows or columns
// the selection is in. Not while the table is sorted or filtered, where the
// rows shown are not where the cells would go.
//
// The handle and the outline are elements in the cells, out of their text's
// line as the pin mark is, placed by CSS: they move with the table as it
// scrolls and go under its held header, with nothing measured.
import { cellValue, type Cell, type FillLine, filled, fillLine } from "../autofill/index.ts";
import type { CellMenuGroup, CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { Outline } from "../core/outline.ts";
import { watchPress } from "../core/press.ts";
import { OUT_OF_LINE_CLASS, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";
import { ICONS } from "../icons.ts";

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
  // The outline of what a drag fills
  private readonly edges: Outline;
  private outlined = "";
  // The extent the tip's value is for, in the drag going on
  private tipFor = "";
  // Ends the drag (Esc: without filling)
  private endDrag: ((apply: boolean) => void) | undefined;
  // AutoFill to…: the table whose cells selected fill to the cell clicked next, and those cells (as the markdown has them)
  private picking: string | undefined;
  private pickingFrom = "";
  // A touch while picking, until it is a tap or not
  private stopTap: (() => void) | undefined;

  constructor(private readonly host: TableHost) {
    this.edges = new Outline(host.doc, (sides) => [`swt-fill-edge ${sides.map((side) => `swt-fill-${side}`).join(" ")}`]);
    this.handle = host.doc.createElement("div");
    this.handle.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} swt-fill-handle`;
    this.handle.title = "Drag to fill the cells after these (1, 2 → 3, 4; Mon → Tue), double-click to fill down";
    this.tip = host.floating("div", "swt-fill-tip");
    // A touch or a pen; a mouse's press is taken in mouseDown, as the controller hands presses to features
    this.handle.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.drag();
    });
  }

  start(): void {
    this.host.doc.defaultView!.addEventListener("pointerdown", this.onTouch, true);
  }

  stop(): void {
    this.host.doc.defaultView!.removeEventListener("pointerdown", this.onTouch, true);
    this.stopTap?.();
    this.endDrag?.(false);
    this.endPicking();
    this.handle.remove();
    this.tip.remove();
  }

  owns(node: Node): boolean {
    return this.handle.contains(node) || this.tip.contains(node);
  }

  /**
   * A press on the handle is the handle's, not its cell's: a drag, or with a
   * double click a fill down. While picking where to fill to, a press on a
   * cell of the table fills to it (before the selection ends: the press is
   * taken), a press elsewhere ends picking.
   */
  mouseDown(e: MouseEvent): boolean {
    if (this.picking) return this.picked(e);
    if (!(e.target instanceof Node) || !this.handle.contains(e.target)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return true;
    // The second press of a double click (the controller keeps dblclick events from the table)
    if (e.detail === 2) this.fillDown();
    else if (e.detail < 2) this.drag();
    return true;
  }

  // Esc while dragging or picking cancels the fill (before the selection module takes Esc: the cells stay selected)
  keyDown(e: KeyboardEvent): boolean {
    if (e.key !== "Escape" || (!this.endDrag && !this.picking)) return false;
    e.preventDefault();
    e.stopPropagation();
    this.endDrag?.(false);
    this.endPicking();
    return true;
  }

  // Other cells selected: what was picking for them is over (the same shown again, the table rendered anew, goes on)
  selectionChanged(): void {
    if (this.picking && this.selectedNow() !== this.pickingFrom) this.endPicking();
    this.placeHandle();
  }

  // The cell menu opened (a long press): picking ends, the menu is for the cells
  cellMenuOpened(): void {
    this.endPicking();
  }

  /** The cells selected, as the markdown has them, with their table ("": none to fill from) */
  private selectedNow(): string {
    const selected = this.selection();
    if (!selected) return "";
    return `${selected.info.key} ${this.rowOf(selected, selected.top)}-${this.rowOf(selected, selected.bottom)} ${selected.left}-${selected.right}`;
  }

  /** AutoFill to… in the menu of the cells selected (body cells: a header is no value to go on from) */
  cellMenuEntries(widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): CellMenuGroup | undefined {
    if (cells.some((ref) => ref.row === 0)) return undefined;
    const label = "AutoFill to…";
    if (this.host.rearranged(info)) {
      const disabled = "Not while the table is sorted or filtered: the rows shown are not where the cells would go";
      return { order: 1.5, entries: [{ kind: "item", label, icon: ICONS.autofill, disabled, run: () => {} }] };
    }
    const selected = this.selection();
    if (!selected || selected.info.key !== info.key) return undefined;
    const press = this.host.pressedWith === "touch" ? "tap" : "click";
    return {
      // After copying and clearing: it changes the cells selected too
      order: 1.5,
      entries: [
        {
          kind: "item",
          label,
          icon: ICONS.autofill,
          hint: `Then ${press} the last cell to fill: the cells up to it go on from these, as dragging the fill handle fills them`,
          run: () => this.startPicking(widget, info, press),
        },
      ],
    };
  }

  // While picking, the cells a click would fill are outlined
  cellHovered(_widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    if (this.picking !== info.key) return;
    const selected = this.selection();
    const ref = this.host.cellRef(info, cell);
    const extent = selected && ref ? this.extentTo(selected, ref) : undefined;
    if (selected) this.outline(selected, extent && this.areaOf(selected, extent));
  }

  hoverEnded(): void {
    if (this.picking) this.clearOutline();
  }

  // A table rendered anew (the selection shown again; picking goes on there), sorted or filtered, or rows back in the document
  enhanced(widget: HTMLElement, info: WidgetInfo): void {
    if (this.picking === info.key) widget.classList.add("swt-fill-picking");
    this.placeHandle();
  }

  viewApplied(): void {
    this.placeHandle();
  }

  rowsAttached(): void {
    this.placeHandle();
  }

  editorOpened(): void {
    this.endPicking();
    this.handle.remove();
  }

  private startPicking(widget: HTMLElement, info: WidgetInfo, press: string): void {
    this.picking = info.key;
    this.pickingFrom = this.selectedNow();
    // The crosshair on that table's cells
    (this.host.widgetForKey(info.key) ?? widget).classList.add("swt-fill-picking");
    const cancel = press === "tap" ? "a tap outside the table cancels" : "Esc cancels";
    void this.host.bridge.flash(`Silverware Table: ${press} the last cell to fill to; ${cancel}`, "info");
  }

  private endPicking(): void {
    if (!this.picking) return;
    this.picking = undefined;
    for (const widget of Array.from(this.host.doc.querySelectorAll(".swt-fill-picking"))) widget.classList.remove("swt-fill-picking");
    this.clearOutline();
  }

  /** A press while picking: on a cell of the table, the fill to it (taken); elsewhere, picking ends and the press goes on */
  private picked(e: MouseEvent): boolean {
    if (e.button !== 0) {
      this.endPicking();
      return false;
    }
    const taken = this.pick(e.target);
    if (taken) {
      e.preventDefault();
      e.stopPropagation();
      // Its click would follow a link in the cell, tick a task
      this.host.takePress();
    }
    return taken;
  }

  /**
   * A touch while picking: a tap is a press (told by its pointer events: a
   * browser may fire no mouse events for a tap after scrolling); a touch that
   * moves scrolls the page, picking goes on
   */
  private onTouch = (e: PointerEvent): void => {
    this.stopTap?.();
    // One finger: a second one is another gesture (a pinch)
    if (!this.picking || e.pointerType !== "touch" || e.button !== 0 || !e.isPrimary) return;
    const target = e.target;
    this.stopTap = watchPress(this.host.doc.defaultView!, e, {
      // Its mouse events would select the cell tapped: the fill selects what it filled
      tap: () => {
        if (this.pick(target)) this.host.takePress();
      },
    });
  };

  /** Picking ends; on a body cell of the table, the fill to it (true: the press is taken; a header's goes on: its sorting, its filter) */
  private pick(target: EventTarget | null): boolean {
    const key = this.picking;
    this.endPicking();
    const ref = key === undefined ? undefined : this.host.cellUnder(target, key)?.ref;
    if (!ref || ref.row === 0) return false;
    const selected = this.selection();
    const extent = selected && selected.info.key === key ? this.extentTo(selected, ref) : undefined;
    if (selected && extent) void this.apply(selected, extent);
    else void this.host.bridge.flash("Silverware Table: nothing to fill there: pick a cell below, above or beside the cells selected", "info");
    return true;
  }

  /** The cells selected in a table shown, if they are body cells of a table shown as written */
  private selection(): Selected | undefined {
    for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.swt-table`))) {
      const info = this.host.infoOf(widget);
      const refs = info ? this.host.selectedCells(info) : [];
      if (!info || refs.length === 0) continue;
      if (refs.some((ref) => ref.row === 0) || this.host.rearranged(info)) return undefined;
      const rows = this.host.shownRows(info).slice(1);
      const index = new Map(rows.map((tr, i) => [this.host.rowOf(info, tr), i]));
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
    return this.host.rowOf(selected.info, selected.rows[shown]!);
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
    if (selected) this.handleAt(selected, selected.bottom, selected.right);
    else this.handle.remove();
  }

  /**
   * The handle in a cell, on its corner; inside it on the table's last row or
   * column, where the table's box would cut the part past its edge (a box
   * that scrolls: its clip cannot be widened) and leave it half to grab
   */
  private handleAt(selected: Selected, shown: number, column: number): void {
    const cell = this.cellOf(selected, shown, column);
    if (!cell) {
      this.handle.remove();
      return;
    }
    this.handle.classList.toggle("swt-fill-last-row", shown === selected.rows.length - 1);
    this.handle.classList.toggle("swt-fill-last-column", column === selected.info.columns - 1);
    if (this.handle.parentElement !== cell) cell.append(this.handle);
  }

  /** The selection with the cells a drag fills */
  private areaOf(selected: Selected, extent: Extent | undefined): Area {
    const { top, bottom, left, right } = selected;
    if (!extent) return { top, bottom, left, right };
    return extent.axis === "rows"
      ? { top: Math.min(top, extent.to), bottom: Math.max(bottom, extent.to), left, right }
      : { top, bottom, left: Math.min(left, extent.to), right: Math.max(right, extent.to) };
  }

  /** An area outlined (again only when it changed) */
  private outline(selected: Selected, area: Area | undefined): void {
    const key = area ? `${area.top},${area.bottom},${area.left},${area.right}` : "";
    if (key === this.outlined) return;
    this.clearOutline();
    this.outlined = key;
    if (!area) return;
    this.edges.show(area.bottom - area.top + 1, area.right - area.left + 1, (i, j) => this.cellOf(selected, area.top + i, area.left + j));
  }

  private clearOutline(): void {
    this.edges.clear();
    this.outlined = "";
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
    return this.extentFor(selected, row, column);
  }

  /** How far a fill to a cell goes (none for a header cell, nor one in the selection) */
  private extentTo(selected: Selected, ref: CellRef): Extent | undefined {
    const row = selected.rows.findIndex((tr) => this.host.rowOf(selected.info, tr) === ref.row);
    return row < 0 ? undefined : this.extentFor(selected, row, ref.column);
  }

  /**
   * How far a fill to a row (as shown) and column goes: along the axis it is
   * further out of the selection on, within the selection's zone
   */
  private extentFor(selected: Selected, row: number, column: number): Extent | undefined {
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
    this.tipFor = "";
    this.host.doc.body.classList.add("swt-filling");
    const move = (ev: PointerEvent) => {
      extent = this.extentAt(selected, ev.clientX, ev.clientY);
      const area = this.areaOf(selected, extent);
      this.outline(selected, extent && area);
      this.handleAt(selected, area.bottom, area.right);
      this.showTip(selected, extent, table, ev.clientX, ev.clientY);
    };
    const finish = (apply: boolean) => {
      win.removeEventListener("pointermove", move, true);
      win.removeEventListener("pointerup", up, true);
      win.removeEventListener("pointercancel", cancel, true);
      win.removeEventListener("blur", cancel);
      this.endDrag = undefined;
      this.host.doc.body.classList.remove("swt-filling");
      this.outline(selected, undefined);
      this.tip.classList.remove("swt-visible");
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
      this.tip.classList.remove("swt-visible");
      return;
    }
    // Worked out again only when the pointer reaches another row or column (a series matches its values each time)
    const key = `${extent.axis} ${extent.to}`;
    if (key !== this.tipFor) {
      this.tipFor = key;
      const lines = this.lines(selected, extent);
      const cells = lines[0] ? fillLine(table, lines[0], this.fillCells(selected.info)) : [];
      const value = cells.length ? cellValue(cells[cells.length - 1]!) : "";
      const count = lines.reduce((n, l) => n + l.targets.length, 0);
      this.tip.textContent = value || `${count} ${count === 1 ? "cell" : "cells"}`;
    }
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
