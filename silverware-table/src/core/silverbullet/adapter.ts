// The adapter to SilverBullet's rendered tables (core/adapter.ts): what the
// core asks of the rendering, done on the DOM SilverBullet renders tables to.
// Everything assumed about that DOM is in ../../dom.ts and in this folder.
import { UI_CLASS, WIDGET_SELECTOR } from "../../dom.ts";
import { shownPart } from "../geometry.ts";
import { parseMetaRow, type TableMeta } from "../../markdown.ts";
import type { TableAdapter } from "../adapter.ts";
import type { CellRef, HeaderRow, Rect, TableLook, TablePreview, WidgetInfo } from "../feature.ts";
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

export class SilverBulletAdapter implements TableAdapter {
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
  ) {}

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
