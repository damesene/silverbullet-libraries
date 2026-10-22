// The adapter to SilverBullet's rendered tables (core/adapter.ts): what the
// core asks of the rendering, done on the DOM SilverBullet renders tables to.
// Everything assumed about that DOM is in ../../dom.ts and in this folder.
import { UI_CLASS, WIDGET_SELECTOR } from "../../dom.ts";
import { EVERYWHERE, heldBounds, innerBox, intersect, isEmpty, scrollNearEdge, shownPart, shownRect, viewBounds } from "../geometry.ts";
import { dragLines } from "./linedrag.ts";
import { Overlays } from "./overlays.ts";
import { parseMetaRow, type TableMeta } from "../../markdown.ts";
import type { TableAdapter } from "../adapter.ts";
import type { CellRef, HandlePlace, HeaderRow, LineDrag, PointerTarget, Rect, Side, TableLook, TablePreview, WidgetInfo } from "../feature.ts";
import { type MergedLooks, refKey } from "../looks.ts";
import type { TableRows } from "../rows.ts";
import { applyCellLook, applyHeaderLook, renderedText } from "./looks.ts";

// The attributes of a table's look put on each widget (data-swt-<name>), to take back
const lookKeys = new WeakMap<HTMLElement, readonly string[]>();

/** A whole table's look on its widget: data-swt-<name> for each attribute set, those set before and no more removed */
export function markTable(widget: HTMLElement, look: TableLook): void {
  const keys = Object.keys(look).filter((name) => look[name] !== undefined);
  for (const name of lookKeys.get(widget) ?? []) if (!keys.includes(name)) delete widget.dataset[dataName(name)];
  for (const name of keys) {
    const value = look[name]!;
    if (widget.dataset[dataName(name)] !== value) widget.dataset[dataName(name)] = value;
  }
  lookKeys.set(widget, keys);
}

const dataName = (name: string) => `swt${name[0]!.toUpperCase()}${name.slice(1)}`;

/**
 * The metadata row of a table SilverBullet just rendered, before it is laid
 * out: the attributes of its <meta> (SilverBullet keeps them, verified), its last row's
 */
export function renderedMeta(rows: readonly HTMLTableRowElement[]): TableMeta | undefined {
  const meta = rows[rows.length - 1]?.querySelector("meta");
  if (!meta) return undefined;
  return parseMetaRow(`| ${meta.outerHTML} |`);
}

/** What the adapter needs to know of the core: which tables it enhanced, and a row taken out of the document put back (largeTables) */
export type AdapterContext = {
  infoOf(widget: HTMLElement): WidgetInfo | undefined;
  rowNeeded(info: WidgetInfo, row: HTMLTableRowElement): void;
  holdInDocument(info: WidgetInfo, row: HTMLTableRowElement | undefined): void;
  floating(className: string): HTMLElement;
  place(element: HTMLElement, left: number, top: number): void;
};

export class SilverBulletAdapter implements TableAdapter {
  private readonly overlays: Overlays;
  // The styles hiding hashtags in headers, by who asked
  private readonly tagStyles = new Map<string, HTMLStyleElement>();
  // The cells each mark is on, by table as rendered
  private readonly marked = new WeakMap<HTMLTableElement, Map<string, HTMLTableCellElement[]>>();
  // The rows of features' own UI under each table's header, by their place among them
  private readonly headerRows = new WeakMap<HTMLTableElement, (HTMLTableRowElement | undefined)[]>();

  constructor(
    private readonly doc: Document,
    // Each table's rows as SilverBullet rendered them, in the document or not
    private readonly rows: TableRows,
    private readonly context: AdapterContext,
  ) {
    this.overlays = new Overlays(doc, rows);
  }

  applyLooks(info: WidgetInfo, looks: MergedLooks, editing: CellRef | undefined): void {
    Array.from(info.table.rows[0]?.cells ?? []).forEach((cell, column) => applyHeaderLook(cell, column, looks.headers.get(column)));
    for (const tr of this.rows.bodyRows(info)) {
      const row = this.rows.rowOf(info, tr);
      Array.from(tr.cells).forEach((cell, column) =>
        applyCellLook(cell, looks.cells.get(refKey({ row, column })), editing !== undefined && editing.row === row && editing.column === column),
      );
    }
  }

  renderedText(info: WidgetInfo, ref: CellRef): string | undefined {
    const cell = this.rows.cellAt(info, ref, true);
    return cell && renderedText(cell);
  }

  applyTableLook(info: WidgetInfo, look: TableLook): void {
    const widget = info.table.closest<HTMLElement>(WIDGET_SELECTOR);
    if (widget) markTable(widget, look);
  }

  cellRect(info: WidgetInfo, ref: CellRef): Rect | undefined {
    const cell = this.rows.cellAt(info, ref);
    const widget = info.table.closest<HTMLElement>(WIDGET_SELECTOR);
    if (!cell || !widget) return undefined;
    const rect = cell.getBoundingClientRect();
    // Not laid out (in tests): where it is
    if (rect.width === 0 && rect.height === 0) return rect;
    return shownPart(widget, info, cell);
  }

  /**
   * CSS that hides the hashtags from the start: SilverBullet renders a table
   * before Silverware Table decorates it, and the hashtag would show for a
   * moment. Names with a parameter match by prefix (#stars-…).
   */
  hideHeaderTags(owner: string, tags: { readonly exact: readonly string[]; readonly prefixes: readonly string[] }): void {
    let style = this.tagStyles.get(owner);
    if (!style) {
      style = this.doc.createElement("style");
      style.dataset.silverwareTable = owner;
      this.doc.head.append(style);
      this.tagStyles.set(owner, style);
    }
    const selectors = [
      ...tags.exact.map((tag) => `${WIDGET_SELECTOR} thead [data-tag-name="${tag}" i]`),
      ...tags.prefixes.map((prefix) => `${WIDGET_SELECTOR} thead [data-tag-name^="${prefix}" i]`),
    ];
    style.textContent = selectors.length ? `${selectors.join(",\n")} {\n  display: none;\n}\n` : "";
  }

  stop(): void {
    for (const style of this.tagStyles.values()) style.remove();
    this.tagStyles.clear();
    this.overlays.stop();
  }

  showOutline(name: string, info: WidgetInfo, rows: readonly number[], columns: readonly [number, number], pieces: (sides: readonly Side[]) => readonly string[]): void {
    this.overlays.showOutline(name, info, rows, columns, pieces);
  }

  hideOutline(name: string): void {
    this.overlays.hideOutline(name);
  }

  outlineShown(name: string): boolean {
    return this.overlays.outlineShown(name);
  }

  placeHandles(name: string, info: WidgetInfo, handles: readonly HandlePlace[]): void {
    this.overlays.placeHandles(name, info, handles);
  }

  hideHandles(name: string): void {
    this.overlays.hideHandles(name);
  }

  targetOf(element: Element): PointerTarget | undefined {
    const overlay = this.overlays.targetOf(element);
    if (overlay) return overlay;
    const widget = element.closest<HTMLElement>(WIDGET_SELECTOR);
    const info = widget && this.context.infoOf(widget);
    const cell = element.closest<HTMLTableCellElement>("td, th");
    if (!info || !cell || cell.closest("table") !== info.table) return undefined;
    // Rows Silverware Table adds (a feature's: the filter row) and the metadata row are no table cells
    const row = cell.parentElement?.classList;
    if (row?.contains(UI_CLASS) || row?.contains("swt-meta-row")) return undefined;
    const ref = this.rows.cellRef(info, cell);
    return ref ? { kind: "cell", key: info.key, ...ref } : undefined;
  }

  elementAt(x: number, y: number): Element | null {
    return this.doc.elementFromPoint?.(x, y) ?? null;
  }

  /** The row (as shown, measured where in the document) the point is in, or the first or last; the column by the header's cells */
  cellNear(info: WidgetInfo, x: number, y: number): CellRef | undefined {
    const shown = this.rows.shownRows(info);
    const rects = shown.map((tr) => (tr.isConnected ? tr.getBoundingClientRect() : undefined));
    let at = rects.findIndex((r) => r && y >= r.top && y < r.bottom);
    if (at < 0) {
      const measured = rects.map((r, i) => ({ r, i })).filter((m) => m.r);
      if (measured.length === 0) return undefined;
      at = y < measured[0]!.r!.top ? measured[0]!.i : measured[measured.length - 1]!.i;
    }
    const cells = Array.from(info.table.rows[0]?.cells ?? []).map((c) => c.getBoundingClientRect());
    let column = cells.findIndex((r) => x >= r.left && x < r.right);
    if (column < 0) column = cells.length && x < cells[0]!.left ? 0 : cells.length - 1;
    return { row: this.rows.rowOf(info, shown[at]!), column };
  }

  scrollNear(info: WidgetInfo, x: number, y: number, sideways: boolean): void {
    const widget = info.table.closest<HTMLElement>(WIDGET_SELECTOR);
    if (widget) scrollNearEdge(widget, x, y, sideways);
  }

  pageMark(mark: string, on: boolean): void {
    this.doc.body.classList.toggle(`swt-${mark}`, on);
  }

  tableMark(info: WidgetInfo, mark: string, on: boolean): void {
    info.table.closest<HTMLElement>(WIDGET_SELECTOR)?.classList.toggle(`swt-${mark}`, on);
  }

  revealCell(info: WidgetInfo, ref: CellRef): void {
    const cell = this.rows.cellAt(info, ref);
    if (!cell) return;
    if (ref.row > 0) this.context.rowNeeded(info, cell.parentElement as HTMLTableRowElement);
    cell.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  owns(node: Node): boolean {
    return this.overlays.owns(node);
  }

  rectOf(info: WidgetInfo, part: { readonly row: number; readonly column: number } | { readonly row: number } | { readonly column: number } | "table"): Rect | undefined {
    if (part === "table") {
      const widget = info.table.closest<HTMLElement>(WIDGET_SELECTOR);
      return widget ? shownRect(widget, info) : undefined;
    }
    const element =
      "row" in part && "column" in part
        ? this.rows.cellAt(info, part, true)
        : "row" in part
          ? part.row === 0
            ? info.table.rows[0]
            : this.rows.bodyRows(info)[part.row - 1]
          : info.table.rows[0]?.cells[part.column];
    return element?.isConnected ? element.getBoundingClientRect() : undefined;
  }

  areaRect(info: WidgetInfo, first: CellRef, last: CellRef): Rect | undefined {
    const widget = info.table.closest<HTMLElement>(WIDGET_SELECTOR);
    const a = this.rows.cellAt(info, first, true);
    const b = this.rows.cellAt(info, last, true);
    if (!widget || !a?.isConnected || !b?.isConnected) return undefined;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    // Body rows scroll under the header held at the top and the rows pinned to the bottom
    const held = heldBounds(info);
    const area = intersect(
      { left: Math.min(ra.left, rb.left), top: Math.min(ra.top, rb.top), right: Math.max(ra.right, rb.right), bottom: Math.max(ra.bottom, rb.bottom) },
      innerBox(widget),
      viewBounds(widget),
      { ...EVERYWHERE, top: a.closest("tbody") ? held.top : -Infinity, bottom: b.closest("tbody") ? held.bottom : Infinity },
    );
    return isEmpty(area) ? undefined : area;
  }

  cellAtPoint(info: WidgetInfo, x: number, y: number): CellRef | undefined {
    for (const tr of this.rows.shownRows(info)) {
      if (!tr.isConnected) continue;
      const rect = tr.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom) continue;
      const column = Array.from(tr.cells).findIndex((cell) => {
        const r = cell.getBoundingClientRect();
        return x >= r.left && x <= r.right;
      });
      return column < 0 ? undefined : { row: this.rows.rowOf(info, tr), column };
    }
    return undefined;
  }

  // The columns given a width in each table as rendered (a write renders it anew): those to make automatic again
  private readonly sized = new WeakMap<HTMLTableElement, Set<number>>();

  // Only the columns with a width, or that had one: touching every cell's
  // style (or reading styles between writes) would make the browser compute
  // the whole table's styles and layout again, for every table shown
  applyColumnWidths(info: WidgetInfo, widths: ReadonlyMap<number, number>): void {
    const sized = this.sized.get(info.table);
    const columns = Array.from({ length: info.columns }, (_, column) => column).filter((column) => widths.has(column) || sized?.has(column));
    if (!columns.length) return;
    // Read before writing: one style computation
    const paddings = columns.map((column) => (widths.has(column) ? this.paddingOf(info, column) : 0));
    const rows = [info.table.rows[0]!, ...this.rows.bodyRows(info)];
    columns.forEach((column, i) => this.applyWidth(info, column, widths.get(column), paddings[i]!, rows));
  }

  applyColumnWidth(info: WidgetInfo, column: number, width: number | undefined): void {
    this.applyWidth(info, column, width, width === undefined ? 0 : this.paddingOf(info, column), [info.table.rows[0]!, ...this.rows.bodyRows(info)]);
  }

  /**
   * A column `width` pixels wide (undefined: automatic): every cell of it, and
   * the content box of every body cell sized to fit inside (it is otherwise as
   * wide as its text, up to the maximum column width)
   */
  private applyWidth(info: WidgetInfo, column: number, width: number | undefined, padding: number, rows: readonly HTMLTableRowElement[]): void {
    const sized = this.sized.get(info.table) ?? new Set<number>();
    this.sized.set(info.table, sized);
    if (width === undefined) sized.delete(column);
    else sized.add(column);
    for (const tr of rows) {
      const cell = tr.cells[column];
      if (!cell || cell.classList.contains("swt-editing")) continue;
      cell.classList.toggle("swt-sized", width !== undefined);
      cell.style.boxSizing = width === undefined ? "" : "border-box";
      cell.style.width = width === undefined ? "" : `${width}px`;
      cell.style.minWidth = width === undefined ? "" : `${width}px`;
      cell.style.maxWidth = width === undefined ? "" : `${width}px`;
      // The content's box: a body cell's, the header's line (its name cut where the icons need the room)
      const box = cell.querySelector<HTMLElement>(":scope > .swt-cell-content, :scope > .swt-head");
      if (box) {
        box.style.width = width === undefined ? "" : `${Math.max(0, width - padding)}px`;
        box.style.maxWidth = width === undefined ? "" : "none";
      }
    }
  }

  /** A cell's padding left and right (the same in the column's header and body cells) */
  private paddingOf(info: WidgetInfo, column: number): number {
    const header = info.table.rows[0]!.cells[column];
    if (!header) return 0;
    const style = this.doc.defaultView!.getComputedStyle(header);
    return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }

  pageView(info: WidgetInfo | undefined): Rect {
    const widget = info?.table.closest<HTMLElement>(WIDGET_SELECTOR);
    return viewBounds(widget ?? this.doc.body);
  }

  dragLines(info: WidgetInfo, axis: "row" | "column", block: { readonly first: number; readonly last: number }, pressedAt: number, blockTo: (asked: number) => number): LineDrag | undefined {
    const { context } = this;
    return dragLines(
      { doc: this.doc, rows: this.rows, floating: context.floating, place: context.place, rowNeeded: context.rowNeeded, holdInDocument: context.holdInDocument },
      info,
      axis,
      block,
      pressedAt,
      blockTo,
    );
  }

  markCells(info: WidgetInfo, mark: string, cells: readonly CellRef[]): void {
    let marks = this.marked.get(info.table);
    if (!marks) this.marked.set(info.table, (marks = new Map()));
    const name = `swt-${mark}`;
    const next = cells.flatMap((ref) => this.rows.cellAt(info, ref, true) ?? []);
    const now = new Set(next);
    for (const cell of marks.get(mark) ?? []) if (!now.has(cell)) cell.classList.remove(name);
    for (const cell of next) cell.classList.add(name);
    marks.set(mark, next);
  }

  /**
   * Each feature's row right under the header (and the others before), in a
   * row of its own (UI_CLASS: no table row, events in it are its elements'); an
   * element already in its cell is not moved, so a field keeps its focus
   */
  placeHeaderRows(info: WidgetInfo, rows: readonly (HeaderRow | undefined)[]): void {
    const placed = this.headerRows.get(info.table) ?? [];
    let after: HTMLTableRowElement = info.table.rows[0]!;
    rows.forEach((spec, i) => {
      let tr = placed[i];
      if (!spec) {
        tr?.remove();
        placed[i] = undefined;
        return;
      }
      if (!tr) {
        tr = this.doc.createElement("tr");
        placed[i] = tr;
      }
      tr.className = `${UI_CLASS} ${spec.className}`;
      spec.cells.forEach((element, column) => {
        const td = tr!.cells[column] ?? tr!.insertCell();
        if (td.firstChild !== element || td.childNodes.length !== 1) td.replaceChildren(element);
      });
      while (tr.cells.length > spec.cells.length) tr.deleteCell(-1);
      if (after.nextSibling !== tr) after.after(tr);
      after = tr;
    });
    this.headerRows.set(info.table, placed);
  }

  /** A table in SilverBullet's widget's form (the page's tables' CSS applies), not one of the page's: in a floating element, the core leaves it */
  previewTable(header: readonly string[], rows: readonly (readonly string[])[], look: TableLook): TablePreview {
    const doc = this.doc;
    const widget = doc.createElement("div");
    widget.className = "sb-table-widget swt-table-preview";
    widget.setAttribute("aria-hidden", "true");
    const table = doc.createElement("table");
    const row = (section: HTMLTableSectionElement, cells: readonly string[]) => {
      const tr = section.insertRow();
      for (const text of cells) tr.insertCell().textContent = text;
    };
    row(table.createTHead(), header);
    const body = table.createTBody();
    for (const cells of rows) row(body, cells);
    widget.append(table);
    markTable(widget, look);
    return { element: widget, setLook: (next) => markTable(widget, next) };
  }
}
