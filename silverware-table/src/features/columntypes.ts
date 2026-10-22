// Column types in the table: a column whose header has a type's hashtag
// (`| Price #currency |`) shows its cells as that type (columntypes/), hides that
// hashtag, and marks the cells that are not values of the type. The markdown
// keeps the values as written: sorting, filters and copying use them.
import { type CellEditor, type CellLook, type CellRef, type Feature, HEADER_ICON_ORDER, type HeaderLook, type Panel, type TableHost, type TableLooks, type WidgetInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import type { MenuDetail, MenuEntry } from "../menu.ts";
import { setCell } from "../ops.ts";
import { escapeCell, parseTable, type Table, unescapeCell } from "../markdown.ts";
import { withoutTags } from "../tags.ts";
import {
  type Choice,
  type ColumnType,
  columnTypeOf,
  type TypedColumn,
  typeOfTag,
  allTypes,
  typeTagPatterns,
  withColumnType,
} from "../columntypes/index.ts";

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
 * What a type's method gives for a column, or why it failed: a custom type is
 * the user's code, and one that throws (or gives what a type does not) marks
 * the cell instead of breaking the table
 */
function attempt<T>(typed: TypedColumn, call: () => T): T | string {
  try {
    return call();
  } catch (e) {
    return `#${typed.tag} failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** The values the open cell editor offers: the type's, those shown for what is typed, the one the arrows are on */
type Picking = {
  readonly editor: CellEditor;
  readonly choices: readonly Choice[];
  shown: readonly Choice[];
  active: number;
};

export class ColumnTypes implements Feature {
  // A list of the type's values under the cell editor (a datalist would offer
  // only the values that start with what the field holds: none to change to)
  private readonly picker: Panel;
  private picking: Picking | undefined;

  constructor(private readonly host: TableHost) {
    // The type hashtags of headers hidden from the start (a table shows before its looks apply)
    host.hideHeaderTags("types", typeTagPatterns());
    this.picker = host.panel("swt-choices");
    this.picker.element.setAttribute("role", "listbox");
  }

  stop(): void {
    this.picker.remove();
  }

  /** Custom types were defined anew: their hashtags are hidden too (tables rendered from now on show them typed) */
  tablesChanged(): void {
    this.host.hideHeaderTags("types", typeTagPatterns());
  }

  // ---- the column menu ----------------------------------------------------------

  /** "Type: …" in a column's menu (first in its section of sorting and filtering): picks the column's type, written as a hashtag in its header */
  columnMenuLeadEntries(
    _widget: HTMLElement,
    info: WidgetInfo,
    column: number,
    open: (title: string, entries: readonly MenuEntry[]) => void,
  ): MenuEntry[] {
    const header = parseTable(info.source).rows[0]?.cells[column] ?? "";
    const current = columnTypeOf(unescapeCell(header));
    const setType = (tag: string | undefined) => () =>
      void this.host.writeTable(this.host.tableFor(info.key) ?? info, (t) => setCell(t, 0, column, withColumnType(t.rows[0]?.cells[column] ?? "", tag)));
    const choices: MenuEntry[] = [
      { kind: "item", label: "No type", icon: ICONS.clear, checked: !current, run: setType(undefined) },
      { kind: "separator" },
      ...allTypes().map((type): MenuEntry => {
        // The type's first form where it names the type (#unit-kg: #unit needs its unit; a
        // custom type's syntax is free text), else its name; the same type keeps its parameters
        const first = type.syntax.split(",")[0]!.trim().replace(/^#/, "");
        const tag = typeOfTag(first)?.type === type ? first : type.name;
        return {
          kind: "item",
          label: typeLabel(type.name),
          icon: iconOf(type),
          checked: current?.type === type,
          detail: typeDetail(type),
          run: setType(current?.type === type ? current.tag : tag),
        };
      }),
    ];
    // As Filter: the type's name after Type, its icon opening the list of types, a × removing it
    return [
      {
        kind: "segmented",
        label: current ? `Type: ${typeLabel(current.type.name)}` : "Type",
        options: [
          {
            icon: current ? iconOf(current.type) : ICONS.columnType,
            title: current ? `Change the column's type (${typeLabel(current.type.name)})` : "Choose how the column's cells show",
            run: () => open("Column type", choices),
          },
          {
            icon: ICONS.clear,
            title: "Remove the column's type",
            run: setType(undefined),
            ...(current ? {} : { disabled: "The column has no type" }),
          },
        ],
      },
    ];
  }

  // ---- the cell editor ------------------------------------------------------------

  /** A header is edited as the column's name: its type's hashtag is the menu's business */
  editorText(info: WidgetInfo, cell: CellRef, original: string): string | undefined {
    if (cell.row !== 0 || !columnTypeOf(unescapeCell(original))) return undefined;
    return unescapeCell(withoutTags(withColumnType(original, undefined)));
  }

  /** The type of the edited cell's column, if any (header cells have none) */
  private typeOfEdited(editor: CellEditor): TypedColumn | undefined {
    if (editor.row === 0) return undefined;
    const header = parseTable(this.host.tableFor(editor.key)?.source ?? "").rows[0]?.cells[editor.column];
    return header === undefined ? undefined : columnTypeOf(unescapeCell(header));
  }

  /** A type with values to offer: a list of them under the cell, picked with the mouse or the arrows and Enter */
  editorOpened(editor: CellEditor): void {
    const typed = this.typeOfEdited(editor);
    const choices = typed && attempt(typed, () => typed.type.choices?.(typed.params));
    if (!choices || typeof choices === "string" || !choices.length) return;
    this.picking = { editor, choices, shown: [], active: -1 };
    this.showChoices();
  }

  editorInput(editor: CellEditor): void {
    if (this.picking?.editor === editor) this.showChoices();
  }

  editorClosed(): void {
    this.picking = undefined;
    this.picker.hide();
  }

  /** Arrows move along the list, Enter takes the value they are on (and then saves as Enter does) */
  editorKeyDown(e: KeyboardEvent, editor: CellEditor): boolean {
    const picking = this.picking;
    if (!picking || picking.editor !== editor || !this.picker.shown) return false;
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    const count = picking.shown.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      picking.active = e.key === "ArrowDown" ? (picking.active + 1) % count : (picking.active - 1 + count) % count;
      this.renderChoices();
      return true;
    }
    if (e.key === "Enter" && !e.shiftKey && picking.active >= 0) editor.setText(picking.shown[picking.active]!.value);
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
    const text = picking.editor.text;
    const typed = text.trim().toLowerCase();
    const isChoice = picking.choices.some((c) => c.value.toLowerCase() === typed);
    picking.shown =
      typed === "" || isChoice || text === picking.editor.initial
        ? picking.choices
        : picking.choices.filter((c) => c.value.toLowerCase().includes(typed) || c.label.toLowerCase().includes(typed));
    // The arrows start from the cell's value: ↓ is the next one
    picking.active = picking.shown.findIndex((c) => c.value.toLowerCase() === typed);
    // A formula is not one of the values: its own help shows there
    if (!picking.shown.length || typed.startsWith("=")) {
      this.picker.hide();
      return;
    }
    this.renderChoices();
    // Under the cell, or above it where the window has no room below
    this.picker.show({ kind: "editor" }, { minWidth: "anchor" });
  }

  private renderChoices(): void {
    const picking = this.picking;
    if (!picking) return;
    const typed = picking.editor.text.trim().toLowerCase();
    const list = this.picker.element;
    list.replaceChildren(
      ...picking.shown.map((choice, index) => {
        const option = this.host.doc.createElement("div");
        option.className = "swt-choice";
        option.setAttribute("role", "option");
        option.textContent = choice.label;
        option.classList.toggle("swt-current", choice.value.toLowerCase() === typed);
        option.classList.toggle("swt-active", index === picking.active);
        option.setAttribute("aria-selected", String(index === picking.active));
        // Picking saves the value as Enter would
        option.addEventListener("click", () => {
          if (this.picking !== picking) return;
          this.picker.hide();
          picking.editor.setText(choice.value);
          picking.editor.commit();
        });
        return option;
      }),
    );
    // The value the arrows are on stays in the list's view (the list alone scrolls, not the page)
    const active = list.querySelector<HTMLElement>(".swt-active");
    if (active && active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
    else if (active && active.offsetTop + active.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = active.offsetTop + active.offsetHeight - list.clientHeight;
    }
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
    const error = attempt(column, () => column.type.check(text, column.params));
    if (error) void this.host.bridge.flash(`Silverware Table: ${error} (#${column.tag}); saved as typed`, "info");
    return undefined;
  }

  // A header renamed by a paste keeps its type's hashtag, as one renamed in its editor
  headerRenamed(name: string, original: string): string | undefined {
    const kept = columnTypeOf(unescapeCell(original));
    return kept && name.trim() !== "" ? withColumnType(name, kept.tag) : undefined;
  }

  /**
   * A typed column: its header without the type's hashtag, the type's icon
   * after its name; its cells shown as the type formats them (their value for
   * sorting the type's), those that are not values of the type marked with why
   */
  looks(info: WidgetInfo, table: Table): TableLooks | undefined {
    const headers: ({ column: number } & HeaderLook)[] = [];
    const cells: (CellRef & CellLook)[] = [];
    table.rows[0]?.cells.forEach((name, column) => {
      const typed = columnTypeOf(unescapeCell(name));
      if (!typed) return;
      headers.push({
        column,
        hidesTag: (tag) => !!typeOfTag(tag),
        icons: [{ svg: iconOf(typed.type), title: `${typeLabel(typed.type.name)} (#${typed.tag}): ${typed.type.description}`, className: "swt-type-icon", order: HEADER_ICON_ORDER.kind }],
      });
      table.rows.forEach((r, row) => {
        const raw = r.cells[column];
        if (row === 0 || raw === undefined) return;
        // The cell's text: a formula's result, without the hidden tags
        const text = unescapeCell(withoutTags(raw)).trim();
        // Only plain values: a cell with markup (a link, emphasis) is left as it is
        if (text === "" || this.host.shownText(info, { row, column }) !== text) return;
        const { type, params } = typed;
        // What the cell shows, or why it is not a value of the type (or why the type failed on it)
        const shown = attempt(typed, () => {
          const error = type.check(text, params);
          return error === undefined ? { value: type.sortValue?.(text, params) ?? text, shown: type.format(text, params) } : error;
        });
        if (typeof shown === "string") cells.push({ row, column, value: text, marks: ["type-invalid"], title: shown });
        else cells.push({ row, column, value: shown.value, display: shown.shown });
      });
    });
    return headers.length ? { headers, cells } : undefined;
  }
}
