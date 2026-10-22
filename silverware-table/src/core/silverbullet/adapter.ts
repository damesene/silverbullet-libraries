// The adapter to SilverBullet's rendered tables (core/adapter.ts): what the
// core asks of the rendering, done on the DOM SilverBullet renders tables to.
// Everything assumed about that DOM is in ../../dom.ts and in this folder.
import { WIDGET_SELECTOR } from "../../dom.ts";
import { shownPart } from "../geometry.ts";
import { parseMetaRow, type TableMeta } from "../../markdown.ts";
import type { TableAdapter } from "../adapter.ts";
import type { CellRef, Rect, TableLook, TablePreview, WidgetInfo } from "../feature.ts";
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
