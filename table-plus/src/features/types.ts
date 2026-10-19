// Column types in the table: a column whose header has a type's hashtag
// (`| Price #currency |`) shows its cells as that type (types/), hides that
// hashtag, and marks the cells that are not values of the type. The markdown
// keeps the values as written: sorting, filters and copying use them.
import type { Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { cellText, TYPE_TAG_CLASS, UI_CLASS } from "../dom.ts";
import { formulaOf } from "../formula/index.ts";
import { parseTable, unescapeCell } from "../markdown.ts";
import { columnTypeOf, type Shown, typeOfTag, typeTagPatterns } from "../types/index.ts";

/**
 * CSS that hides the type hashtags of headers from the start: SilverBullet
 * renders a table before Table Plus decorates it, and the hashtag would show
 * for a moment. Names with a parameter match by prefix (#stars-…).
 */
function hiddenTagsCss(): string {
  const { exact, prefixes } = typeTagPatterns();
  const selectors = [
    ...exact.map((tag) => `.sb-table-widget thead [data-tag-name="${tag}" i]`),
    ...prefixes.map((prefix) => `.sb-table-widget thead [data-tag-name^="${prefix}" i]`),
  ];
  return `${selectors.join(",\n")} {\n  display: none;\n}\n`;
}

export class ColumnTypes implements Feature {
  private readonly style: HTMLStyleElement;

  constructor(private readonly host: TableHost) {
    this.style = host.doc.createElement("style");
    this.style.dataset.tablePlus = "types";
    this.style.textContent = hiddenTagsCss();
    host.doc.head.append(this.style);
  }

  stop(): void {
    this.style.remove();
  }

  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    const model = parseTable(info.source);
    const header = info.table.rows[0];
    model.rows[0]?.cells.forEach((name, column) => {
      const typed = columnTypeOf(unescapeCell(name));
      if (!typed) return;
      // The type's hashtag is not part of the column's name as Table Plus shows it
      for (const tag of Array.from(header?.cells[column]?.querySelectorAll<HTMLElement>("[data-tag-name]") ?? [])) {
        if (typeOfTag(tag.dataset.tagName ?? "")) tag.classList.add(TYPE_TAG_CLASS);
      }
      for (const tr of Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]"))) {
        const raw = model.rows[Number(tr.dataset.tpRow)]?.cells[column];
        const cell = tr.cells[column];
        if (raw === undefined || !cell) continue;
        // A formula's result, else the cell's text
        const text = unescapeCell(formulaOf(raw)?.value ?? raw).trim();
        // Only plain values: a cell with markup (a link, emphasis) is left as it is
        if (text === "" || cellText(cell) !== text) continue;
        const { type, param } = typed;
        const error = type.check(text, param);
        cell.dataset.tpValue = error ? text : (type.sortValue?.(text, param) ?? text);
        if (error) {
          cell.classList.add("tp-type-invalid");
          cell.title = cell.title ? `${cell.title}\n${error}` : error;
          continue;
        }
        this.show(cell, type.format(text, param));
      }
    });
  }

  /** Puts what a typed cell shows in place of its text, Table Plus' own elements kept */
  private show(cell: HTMLTableCellElement, shown: Shown): void {
    for (const node of Array.from(cell.childNodes)) {
      if (!(node instanceof Element && node.classList.contains(UI_CLASS))) node.remove();
    }
    if (typeof shown === "string") {
      cell.prepend(this.host.doc.createTextNode(shown));
      return;
    }
    const link = this.host.doc.createElement("a");
    link.href = shown.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = shown.text;
    cell.prepend(link);
  }
}
