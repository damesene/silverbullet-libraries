// Column types in the table: a column whose header has a type's hashtag
// (`| Price #currency |`) shows its cells as that type (types/), hides that
// hashtag, and marks the cells that are not values of the type. The markdown
// keeps the values as written: sorting, filters and copying use them.
import type { CellEditor, CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { cellText, TYPE_TAG_CLASS, UI_CLASS } from "../dom.ts";
import { ICONS } from "../icons.ts";
import type { MenuEntry } from "../menu.ts";
import { setCell } from "../ops.ts";
import { formulaOf } from "../formula/index.ts";
import { escapeCell, parseTable, unescapeCell } from "../markdown.ts";
import { columnTypeOf, type Shown, type TypedColumn, typeOfTag, TYPES, typeTagPatterns, withColumnType } from "../types/index.ts";

/** A type's name for menus: stars is Stars */
function typeLabel(name: string): string {
  return name[0]!.toUpperCase() + name.slice(1);
}

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
  // The values the open cell editor offers, and how many such lists were made (for their ids)
  private choices: HTMLDataListElement | undefined;
  private lists = 0;

  constructor(private readonly host: TableHost) {
    this.style = host.doc.createElement("style");
    this.style.dataset.tablePlus = "types";
    this.style.textContent = hiddenTagsCss();
    host.doc.head.append(this.style);
  }

  stop(): void {
    this.style.remove();
    this.choices?.remove();
  }

  // ---- the column menu ----------------------------------------------------------

  /** "Type: …" in a column's menu: picks the column's type, written as a hashtag in its header */
  columnMenuEntries(
    widget: HTMLElement,
    info: WidgetInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[] {
    const header = parseTable(info.source).rows[0]?.cells[column] ?? "";
    const current = columnTypeOf(unescapeCell(header));
    const setType = (tag: string | undefined) => () =>
      void this.host.write(widget, (t) => setCell(t, 0, column, withColumnType(t.rows[0]?.cells[column] ?? "", tag)));
    const choices: MenuEntry[] = [
      { kind: "item", label: "No type", icon: ICONS.clear, checked: !current, run: setType(undefined) },
      { kind: "separator" },
      ...Array.from(TYPES.values()).map((type): MenuEntry => {
        // The type's first form (#unit-kg: #unit needs its unit); the same type keeps its parameter
        const first = type.syntax.split(",")[0]!.trim();
        return {
          kind: "item",
          label: typeLabel(type.name),
          icon: ICONS.columnType,
          checked: current?.type === type,
          hint: `${type.syntax}: ${type.description}`,
          run: setType(current?.type === type ? current.tag : first.slice(1)),
        };
      }),
    ];
    return [
      {
        kind: "item",
        label: current ? `Type: ${typeLabel(current.type.name)}` : "Type",
        icon: ICONS.columnType,
        hint: current ? `#${current.tag}: ${current.type.description}` : "How the column's cells show",
        run: () => open("Column type", choices),
      },
    ];
  }

  // ---- the cell editor ------------------------------------------------------------

  /** A header is edited as the column's name: its type's hashtag is the menu's business */
  editorText(info: WidgetInfo, cell: CellRef, original: string): string | undefined {
    if (cell.row !== 0 || !columnTypeOf(unescapeCell(original))) return undefined;
    return unescapeCell(withColumnType(original, undefined));
  }

  /** The type of the edited cell's column, if any (header cells have none) */
  private typeOfEdited(editor: CellEditor): TypedColumn | undefined {
    if (editor.row === 0) return undefined;
    const header = parseTable(this.host.infoOf(editor.widget)?.source ?? "").rows[0]?.cells[editor.column];
    return header === undefined ? undefined : columnTypeOf(unescapeCell(header));
  }

  /** A type with values to offer: the field suggests them as it is typed in (a datalist) */
  editorOpened(editor: CellEditor): void {
    const typed = this.typeOfEdited(editor);
    const choices = typed?.type.choices?.(typed.param);
    if (!choices?.length) return;
    const list = this.host.doc.createElement("datalist");
    list.id = `tp-choices-${++this.lists}`;
    for (const choice of choices) {
      const option = this.host.doc.createElement("option");
      option.value = choice.value;
      option.label = choice.label;
      list.append(option);
    }
    this.host.doc.body.append(list);
    editor.field.setAttribute("list", list.id);
    this.choices = list;
  }

  editorClosed(): void {
    this.choices?.remove();
    this.choices = undefined;
  }

  /**
   * A header keeps its type's hashtag after the name typed (an emptied name
   * stays the old one: a column needs a name). A value that is not of the
   * column's type is saved as typed, and said so.
   */
  editorValue(editor: CellEditor, typed: string): string | undefined {
    if (editor.row === 0) {
      const kept = columnTypeOf(unescapeCell(editor.original));
      return kept && typed.trim() !== "" ? withColumnType(escapeCell(typed), kept.tag) : undefined;
    }
    const column = this.typeOfEdited(editor);
    const text = typed.trim();
    if (!column || text === "" || text.startsWith("=")) return undefined;
    const error = column.type.check(text, column.param);
    if (error) void this.host.bridge.flash(`Table Plus: ${error} (#${column.tag}); saved as typed`, "info");
    return undefined;
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
