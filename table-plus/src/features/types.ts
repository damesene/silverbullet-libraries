// Column types in the table: a column whose header has a type's hashtag
// (`| Price #currency |`) shows its cells as that type (types/), hides that
// hashtag, and marks the cells that are not values of the type. The markdown
// keeps the values as written: sorting, filters and copying use them.
import type { CellEditor, CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { cellText, TYPE_TAG_CLASS, UI_CLASS } from "../dom.ts";
import { ICONS } from "../icons.ts";
import type { MenuDetail, MenuEntry } from "../menu.ts";
import { setCell } from "../ops.ts";
import { formulaOf } from "../formula/index.ts";
import { escapeCell, parseTable, unescapeCell } from "../markdown.ts";
import {
  type Choice,
  type ColumnType,
  columnTypeOf,
  type Shown,
  type TypedColumn,
  typeOfTag,
  TYPES,
  typeTagPatterns,
  withColumnType,
} from "../types/index.ts";

/** A type's icon, or a tag for a type without one */
function iconOf(type: ColumnType): string {
  return type.icon ?? ICONS.columnType;
}

/** A type's name for menus: stars is Stars */
function typeLabel(name: string): string {
  return name[0]!.toUpperCase() + name.slice(1);
}

/** A type in the menu's bubble: how it is written, what it shows, and MdTableRender's hashtags for it */
function typeDetail(type: ColumnType, tag?: string): MenuDetail {
  const aliases = Object.keys(type.aliases ?? {}).map((alias) => `#${alias}`);
  return {
    title: tag ? `${typeLabel(type.name)}: #${tag}` : typeLabel(type.name),
    code: type.syntax.split(",").map((form) => form.trim()),
    text: type.description,
    notes: aliases.length ? [`Also written as ${aliases.join(", ")}`] : undefined,
  };
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

/** The values the open cell editor offers: the type's, those shown for what is typed, the one the arrows are on */
type Picking = {
  readonly editor: CellEditor;
  readonly choices: readonly Choice[];
  shown: readonly Choice[];
  active: number;
};

export class ColumnTypes implements Feature {
  private readonly style: HTMLStyleElement;
  // A list of the type's values under the cell editor (a datalist would offer
  // only the values that start with what the field holds: none to change to)
  private readonly picker: HTMLElement;
  private picking: Picking | undefined;

  constructor(private readonly host: TableHost) {
    this.style = host.doc.createElement("style");
    this.style.dataset.tablePlus = "types";
    this.style.textContent = hiddenTagsCss();
    host.doc.head.append(this.style);
    this.picker = host.floating("div", "tp-choices");
    this.picker.setAttribute("role", "listbox");
  }

  stop(): void {
    this.style.remove();
    this.picker.remove();
  }

  owns(node: Node): boolean {
    return this.picker.contains(node);
  }

  layoutChanged(): void {
    if (this.picking && this.picker.classList.contains("tp-visible")) this.placePicker(this.picking.editor);
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
          icon: iconOf(type),
          checked: current?.type === type,
          detail: typeDetail(type),
          run: setType(current?.type === type ? current.tag : first.slice(1)),
        };
      }),
    ];
    return [
      {
        kind: "item",
        // The same icon whatever the type, so the item is easy to find; the type's own after its name
        label: "Type",
        icon: ICONS.columnType,
        ...(current ? { value: { text: typeLabel(current.type.name), icon: iconOf(current.type) } } : {}),
        ...(current ? { detail: typeDetail(current.type, current.tag) } : { hint: "How the column's cells show" }),
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

  /** A type with values to offer: a list of them under the cell, picked with the mouse or the arrows and Enter */
  editorOpened(editor: CellEditor): void {
    const typed = this.typeOfEdited(editor);
    const choices = typed?.type.choices?.(typed.param);
    if (!choices?.length) return;
    this.picking = { editor, choices, shown: [], active: -1 };
    editor.field.addEventListener("input", () => {
      if (this.picking?.editor === editor) this.showChoices();
    });
    this.showChoices();
  }

  editorClosed(): void {
    this.picking = undefined;
    this.picker.classList.remove("tp-visible");
  }

  /** Arrows move along the list, Enter takes the value they are on (and then saves as Enter does) */
  editorKeyDown(e: KeyboardEvent, editor: CellEditor): boolean {
    const picking = this.picking;
    if (!picking || picking.editor !== editor || !this.picker.classList.contains("tp-visible")) return false;
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const count = picking.shown.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      picking.active = e.key === "ArrowDown" ? (picking.active + 1) % count : (picking.active - 1 + count) % count;
      this.renderChoices();
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey && picking.active >= 0) editor.field.value = picking.shown[picking.active]!.value;
    return false;
  }

  /**
   * The values for what the field holds: all of them while it holds what the
   * cell had (even a value not of the type), is empty or is one of them (to
   * change it to another), else those that contain what is typed
   */
  private showChoices(): void {
    const picking = this.picking;
    if (!picking) return;
    const field = picking.editor.field;
    const typed = field.value.trim().toLowerCase();
    const isChoice = picking.choices.some((c) => c.value.toLowerCase() === typed);
    picking.shown =
      typed === "" || isChoice || field.value === picking.editor.initial
        ? picking.choices
        : picking.choices.filter((c) => c.value.toLowerCase().includes(typed) || c.label.toLowerCase().includes(typed));
    // The arrows start from the cell's value: ↓ is the next one
    picking.active = picking.shown.findIndex((c) => c.value.toLowerCase() === typed);
    // A formula is not one of the values: its own help shows there
    if (!picking.shown.length || typed.startsWith("=")) {
      this.picker.classList.remove("tp-visible");
      return;
    }
    this.renderChoices();
    this.placePicker(picking.editor);
  }

  private renderChoices(): void {
    const picking = this.picking;
    if (!picking) return;
    const typed = picking.editor.field.value.trim().toLowerCase();
    this.picker.replaceChildren(
      ...picking.shown.map((choice, index) => {
        const option = this.host.doc.createElement("div");
        option.className = "tp-choice";
        option.setAttribute("role", "option");
        option.textContent = choice.label;
        option.classList.toggle("tp-current", choice.value.toLowerCase() === typed);
        option.classList.toggle("tp-active", index === picking.active);
        option.setAttribute("aria-selected", String(index === picking.active));
        // Picking saves the value as Enter would
        option.addEventListener("click", () => {
          if (this.picking !== picking) return;
          picking.editor.field.value = choice.value;
          this.picker.classList.remove("tp-visible");
          picking.editor.field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        });
        return option;
      }),
    );
    // The value the arrows are on stays in the list's view (the list alone scrolls, not the page)
    const active = this.picker.querySelector<HTMLElement>(".tp-active");
    if (active && active.offsetTop < this.picker.scrollTop) this.picker.scrollTop = active.offsetTop;
    else if (active && active.offsetTop + active.offsetHeight > this.picker.scrollTop + this.picker.clientHeight) {
      this.picker.scrollTop = active.offsetTop + active.offsetHeight - this.picker.clientHeight;
    }
  }

  /** Under the cell, or above it where the window has no room below */
  private placePicker(editor: CellEditor): void {
    const rect = editor.cell.getBoundingClientRect();
    this.picker.style.minWidth = `${Math.round(rect.width)}px`;
    this.host.place(this.picker, rect.left, rect.bottom + 2);
    const viewHeight = this.host.doc.defaultView!.innerHeight;
    const height = this.picker.offsetHeight;
    if (rect.bottom + 2 + height > viewHeight && rect.top - 2 - height >= 0) this.host.place(this.picker, rect.left, rect.top - 2 - height);
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
      // The type's hashtag is not part of the column's name as Table Plus shows it;
      // the type's icon goes after the name instead, before Table Plus' own controls
      const headerCell = header?.cells[column];
      for (const tag of Array.from(headerCell?.querySelectorAll<HTMLElement>("[data-tag-name]") ?? [])) {
        if (typeOfTag(tag.dataset.tagName ?? "")) tag.classList.add(TYPE_TAG_CLASS);
      }
      if (headerCell && !headerCell.querySelector(".tp-type-icon")) {
        const icon = this.host.doc.createElement("span");
        icon.className = `${UI_CLASS} tp-type-icon`;
        icon.title = `${typeLabel(typed.type.name)} (#${typed.tag}): ${typed.type.description}`;
        icon.innerHTML = iconOf(typed.type);
        headerCell.insertBefore(icon, headerCell.querySelector(`:scope > .${UI_CLASS}`));
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
