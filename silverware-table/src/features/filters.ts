// The filters module: a field per column filters the table's rows (filter.ts
// says what a field's text matches). Typed in the filter row under the header
// (the toolbar's filter icon shows or hides it; hidden, the filters still
// apply) or, for one column, in a bubble under its header (its filter mark,
// the column menu's Filter), which moves nothing in the table. Under the field
// being typed in, what it understands and, for a column with a few values,
// those values to tick. The module owns the filters: the core only asks which
// rows to hide (hiddenRows). With the metadata setting they are stored in the
// table (filter.status="=open|blocked", meta.ts) once the fields are left;
// turned off, the module is not loaded, and filters stored stay as they are.
//
// A table's filters are those stored in its markdown as it is now, unless
// filters were typed that are not stored (yet, or the setting is off): so an
// undo of the metadata (Ctrl+Z after Remove metadata, after a store) shows
// what the markdown has again.
import {
  CELL_MENU_ORDER,
  HEADER_ICON_ORDER,
  type CellEditor,
  type CellRef,
  type Feature,
  type HeaderRow,
  type MarkLayer,
  type Panel,
  type PanelAnchor,
  type PanelOptions,
  type ModelHost,
  type TableLooks,
  type ToolbarButton,
  type TableInfo,
} from "../core/feature.ts";
import { el } from "../elements.ts";
import { type FilterOptions, normalizeForFilter, parseFilter } from "../filter.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { columnMeta, withColumnMeta } from "../meta.ts";
import { asNumber } from "../view.ts";
import type { TableKey } from "../core/feature.ts";

// A column with at most this many different values offers them to tick
const MAX_VALUES = 12;

// What a field understands, each a click away: what clicking does to the field's text
type Hint = { readonly code: string; readonly text: string; readonly apply: (value: string) => string };

const OPERATOR_RE = /^(!|=|>=|<=|>|<)\s*/;
const bare = (value: string) => value.replace(OPERATOR_RE, "");
const NUMBER_HINTS: readonly Hint[] = [
  { code: ">10", text: "above", apply: (v) => `>${bare(v)}` },
  { code: "<10", text: "below", apply: (v) => `<${bare(v)}` },
  { code: ">=10", text: "at least", apply: (v) => `>=${bare(v)}` },
];
const TEXT_HINTS: readonly Hint[] = [
  { code: "=text", text: "exactly", apply: (v) => `=${bare(v)}` },
  { code: "!text", text: "not", apply: (v) => (v.startsWith("!") ? v : `!${v}`) },
  { code: "a|b", text: "either", apply: (v) => (v === "" || v.endsWith("|") ? v : `${v}|`) },
  { code: "/^a.*z$/", text: "regular expression", apply: (v) => (v.startsWith("/") ? v : `/${bare(v)}/`) },
];

/** A field of the filter row: the element in the row's cell, its input */
type RowField = { readonly element: HTMLElement; readonly input: HTMLInputElement };

// The bubble under a field of the filter row (from the field's box), under a header on its own
const BUBBLE_PLACE: PanelOptions = { gap: 6, offsetX: -6 };
const POPOVER_PLACE: PanelOptions = { gap: 6 };

/** A column's different values (as filters see them), each with what it shows and how many cells have it */
type ColumnValue = { readonly value: string; readonly label: string; readonly count: number };

/**
 * A column's filter with `values` added to its list of whole values: `=a|b`
 * (`prefix` "=") or `!=a|b` (none of them), what it lists of that kind kept.
 * An empty value is an empty alternative (`=|a`; alone `=|`).
 */
export function withValues(current: string, prefix: "=" | "!=", values: readonly string[]): string {
  const text = current.trim();
  const listed = text.startsWith(prefix) && (prefix === "!=" || !text.startsWith("!")) ? text.slice(prefix.length).split("|").map((v) => v.trim()) : [];
  const all = [...listed];
  for (const value of values) if (!all.some((v) => normalizeForFilter(v) === normalizeForFilter(value))) all.push(value);
  return `${prefix}${all.length === 1 && all[0] === "" ? "|" : all.join("|")}`;
}

/** Values as a menu item names them: a few, "empty" for an empty one */
function valuesLabel(values: readonly string[]): string {
  const named = values.map((v) => (v === "" ? "empty" : v.length > 20 ? `${v.slice(0, 19)}…` : v));
  return named.length > 3 ? `${named.slice(0, 3).join(", ")} and ${named.length - 3} more` : named.join(", ");
}

/** Whether two tables' filters (by column, "" none) are the same */
function sameFilters(a: readonly string[], b: readonly string[]): boolean {
  for (let column = 0; column < Math.max(a.length, b.length); column++) {
    if ((a[column] ?? "").trim() !== (b[column] ?? "").trim()) return false;
  }
  return true;
}

export class Filters implements Feature {
  // By table key: filters typed that the table does not store (as typed, by column)
  private readonly typed = new Map<string, string[]>();
  // By table key: the filters stored in the table, read from its markdown (as of `source`)
  private readonly stored = new Map<string, { readonly source: string; readonly filters: readonly string[] }>();
  // Tables whose filter row is shown
  private readonly shown = new Set<string>();
  // By table key: the filter row's fields, one per column (made once, given to the core each time the view applies)
  private readonly rows = new Map<string, readonly RowField[]>();
  private readonly storeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Tables whose filters are stored once the cell editor in them closes, or
  // they are rendered again (a write renders a table anew)
  private readonly storesWaiting = new Set<string>();
  private options: FilterOptions = { smart: true };
  // The headers of the columns filtering
  private readonly filtering: MarkLayer;
  // The bubble under the field being typed in, or (popover) a column's filter on its own
  private readonly panel: Panel;
  private bubble:
    | {
        readonly body: HTMLElement;
        readonly input: HTMLInputElement;
        readonly key: TableKey;
        readonly column: number;
        readonly anchor: PanelAnchor;
        readonly popover: boolean;
      }
    | undefined;

  constructor(private readonly host: ModelHost) {
    this.filtering = host.markLayer("filtered");
    this.panel = host.panel("swt-filter-bubble");
  }

  start(): void {
    void this.readOptions();
  }

  stop(): void {
    for (const timer of this.storeTimers.values()) clearTimeout(timer);
    this.hideBubble();
    this.panel.remove();
    this.filtering.clear();
  }

  /** The smart filters setting; when it changed, every table shown is filtered anew */
  private async readOptions(): Promise<void> {
    const smart = (await this.host.setting("smartFilters")) === true;
    if (smart === this.options.smart) return;
    this.options = { smart };
    for (const info of this.host.shownTables()) this.host.viewChangedFor(info.key);
  }

  /** The filters stored in the table (filter.*), by column */
  private storedFilters(info: TableInfo): readonly string[] {
    const known = this.stored.get(info.key);
    if (known?.source === info.source) return known.filters;
    const filters: string[] = [];
    for (const [column, value] of columnMeta(parseTable(info.source), "filter")) {
      while (filters.length < column) filters.push("");
      filters[column] = value;
    }
    this.stored.set(info.key, { source: info.source, filters });
    return filters;
  }

  /** The table's filters, by column: those typed, else those stored */
  private filtersOf(info: TableInfo): readonly string[] {
    return this.typed.get(info.key) ?? this.storedFilters(info);
  }

  /** The filters that filter, by column */
  private matchers(info: TableInfo): Map<number, (value: string) => boolean> {
    const matchers = new Map<number, (value: string) => boolean>();
    this.filtersOf(info).forEach((filter, column) => {
      const match = parseFilter(filter, this.options).match;
      if (match) matchers.set(column, match);
    });
    return matchers;
  }

  hiddenRows(info: TableInfo, values: readonly (readonly string[])[]): ReadonlySet<number> | undefined {
    const matchers = this.matchers(info);
    if (matchers.size === 0) return undefined;
    const hidden = new Set<number>();
    values.forEach((row, i) => {
      for (const [column, match] of matchers) {
        if (!match(row[column] ?? "")) {
          hidden.add(i);
          return;
        }
      }
    });
    return hidden;
  }

  hidesRows(info: TableInfo): boolean {
    return this.matchers(info).size > 0;
  }

  /** A filter mark in each header, shown while its column filters (also with the filter row hidden): a click changes the filter */
  looks(info: TableInfo): TableLooks {
    const mark = { svg: ICONS.filter, title: "Filtered: click to change the filter", className: "swt-filter-mark", order: HEADER_ICON_ORDER.state, action: "filter" };
    return { headers: Array.from({ length: info.columns }, (_, column) => ({ column, icons: [mark] })) };
  }

  // The headers of the columns filtering marked; a column's bubble follows its header, which a write renders anew
  viewApplied(info: TableInfo): void {
    this.filtering.set(info.key, [...this.matchers(info).keys()].map((column) => ({ row: 0, column })));
    if (this.bubble?.popover && this.bubble.key === info.key) this.panel.show(this.bubble.anchor, POPOVER_PLACE);
  }

  /** The filter row while it is shown: a field per column, as the filters are */
  headerRow(info: TableInfo): HeaderRow | undefined {
    if (!this.shown.has(info.key)) {
      // A field taken away with the row: its bubble goes too
      if (this.bubble && !this.bubble.popover && this.bubble.key === info.key) this.hideBubble();
      return undefined;
    }
    let fields = this.rows.get(info.key);
    if (fields?.length !== info.columns) {
      fields = Array.from({ length: info.columns }, (_, column) => this.rowField(info.key, column));
      this.rows.set(info.key, fields);
    }
    const filters = this.filtersOf(info);
    for (const [column, { element, input }] of fields.entries()) {
      const value = filters[column] ?? "";
      if (input.value !== value && this.host.doc.activeElement !== input) input.value = value;
      // A filter that cannot be used filters nothing; the field says why
      const { match, error } = parseFilter(input.value, this.options);
      input.classList.toggle("swt-invalid", !!error);
      input.title = error ?? "";
      element.classList.toggle("swt-filter-active", !!match);
      element.classList.toggle("swt-filter-typed", input.value !== "");
    }
    return { className: "swt-filter-row", cells: fields.map((field) => field.element) };
  }

  /** The filter icon at the toolbar's right; while filtered, "3 of 10 rows", its × clearing the filters */
  toolbarButtons(info: TableInfo): ToolbarButton[] {
    const { key } = info;
    const buttons: ToolbarButton[] = [];
    if (this.hidesRows(info)) {
      const rows = info.rows - 1;
      let shown = 0;
      for (let row = 1; row <= rows; row++) if (!this.host.rowHidden(info, row)) shown++;
      buttons.push({
        label: `${shown} of ${rows} rows`,
        title: "Clear the filters",
        place: "chip",
        icon: ICONS.filter,
        run: () => this.clearAll(key),
      });
    }
    buttons.push({
      label: "Filter",
      title: "Show or hide the filter row (hidden, the filters still apply: the toolbar and the headers show them)",
      place: "icon",
      icon: ICONS.filter,
      pressed: this.shown.has(key),
      run: () => {
        if (this.shown.has(key)) this.shown.delete(key);
        else this.shown.add(key);
        this.host.viewChangedFor(key);
        // A field taken away with the row loses its focus without a blur event
        this.scheduleStore(key);
      },
    });
    return buttons;
  }

  /**
   * In the menu of body cells of one column: Filter = their values (only
   * rows with one of them) and Filter ≠ their values (rows with none); added
   * to a list of that kind the column filters by already
   */
  cellMenuEntries(info: TableInfo, cells: readonly CellRef[]): { order: number; entries: MenuEntry[] } | undefined {
    const body = cells.filter((ref) => ref.row > 0);
    const column = body[0]?.column;
    if (column === undefined || body.some((ref) => ref.column !== column)) return undefined;
    const values: string[] = [];
    for (const ref of body) {
      const value = (this.host.shownValue(info, ref) ?? "").trim();
      if (!values.some((v) => normalizeForFilter(v) === normalizeForFilter(value))) values.push(value);
    }
    // A value with a | cannot be listed
    if (values.some((v) => v.includes("|"))) return undefined;
    const { key } = info;
    const apply = (prefix: "=" | "!=") => () => {
      const now = this.host.tableFor(key);
      if (!now) return;
      this.setFilter(key, column, withValues(this.filtersOf(now)[column] ?? "", prefix, values));
      this.scheduleStore(key);
    };
    const label = valuesLabel(values);
    return {
      order: CELL_MENU_ORDER.viewing,
      entries: [
        { kind: "item", label: `Filter: = ${label}`, icon: ICONS.filter, hint: "Show only the rows with this value here", run: apply("=") },
        { kind: "item", label: `Filter: ≠ ${label}`, icon: ICONS.filter, hint: "Hide the rows with this value here", run: apply("!=") },
      ],
    };
  }

  /** "Filter" in a column's menu: its filter in a bubble under its header, and a × removing it */
  columnMenuEntries(info: TableInfo, column: number): MenuEntry[] {
    const filtered = (this.filtersOf(info)[column] ?? "").trim() !== "";
    return [
      {
        kind: "segmented",
        label: "Filter",
        options: [
          { icon: ICONS.filter, title: "Filter this column", run: () => this.openFilter(info, column) },
          {
            icon: ICONS.clear,
            title: "Remove this column's filter",
            run: () => this.clear(info, column),
            ...(filtered ? {} : { disabled: "This column is not filtered" }),
          },
        ],
      },
    ];
  }

  action(name: string, info: TableInfo, column: number | undefined): boolean {
    if (column === undefined) return false;
    if (name === "filter") this.openFilter(info, column);
    else if (name === "clear-filter") this.clear(info, column);
    else return false;
    return true;
  }

  /** Filters typed move with their columns; stored ones follow them in the markdown (meta.ts) */
  columnsMoved(key: TableKey, map: (column: number) => number | undefined): void {
    const typed = this.typed.get(key);
    if (!typed) return;
    const moved: string[] = [];
    typed.forEach((value, column) => {
      const target = map(column);
      if (target === undefined || value === "") return;
      while (moved.length <= target) moved.push("");
      moved[target] = value;
    });
    this.typed.set(key, moved);
    // The fields are made anew for the columns where they are now
    this.rows.delete(key);
  }

  /** Remove metadata: what is typed goes too, the table shows what its markdown has */
  viewForgotten(key: TableKey): void {
    this.typed.delete(key);
    this.storesWaiting.delete(key);
  }

  // ---- storing ------------------------------------------------------------------

  /** Whether one of a table's filter fields (of its row, or its bubble) is typed in */
  private typingIn(key: TableKey): boolean {
    const active = this.host.doc.activeElement;
    if (!(active instanceof HTMLInputElement)) return false;
    if (this.bubble?.input === active) return this.bubble.key === key;
    return (this.rows.get(key) ?? []).some((field) => field.input === active);
  }

  /**
   * Stores a table's filters in its metadata row (the metadata setting, or a
   * table that has the row) once none of its filter fields is typed in and no
   * cell of it is edited: a write renders the table anew, which would take a
   * field's focus or close the cell editor
   */
  private scheduleStore(key: TableKey): void {
    clearTimeout(this.storeTimers.get(key));
    this.storeTimers.set(
      key,
      setTimeout(() => {
        this.storeTimers.delete(key);
        // Its blur stores again
        if (this.typingIn(key)) return;
        const editing = this.host.editing;
        if (!this.host.tableFor(key) || editing?.key === key) {
          this.storesWaiting.add(key);
          return;
        }
        void this.store(key);
      }, 0),
    );
  }

  /** A cell editor closed: filters waiting for it are stored */
  editorClosed(editor: CellEditor): void {
    if (this.storesWaiting.delete(editor.key)) this.scheduleStore(editor.key);
  }

  /** A table rendered again: filters waiting for it are stored */
  enhanced(info: TableInfo): void {
    if (this.storesWaiting.delete(info.key)) this.scheduleStore(info.key);
  }

  private async store(key: TableKey): Promise<void> {
    const info = this.host.tableFor(key);
    const typed = this.typed.get(key);
    if (!info || !typed) return;
    if (sameFilters(typed, this.storedFilters(info))) {
      this.typed.delete(key);
      return;
    }
    if (!(info.metaRow || this.host.metadataEnabled)) return;
    // What is written: filters typed meanwhile are stored with the next blur
    const written = [...typed];
    const filters = new Map<number, string>();
    written.forEach((filter, column) => {
      if (filter.trim() !== "") filters.set(column, filter.trim());
    });
    const result = await this.host.writeTable(info, (t) => withColumnMeta(t, "filter", filters));
    // Stored: the table's markdown has them now
    if (result !== "failed" && sameFilters(this.typed.get(key) ?? [], written)) this.typed.delete(key);
  }

  // ---- typing ---------------------------------------------------------------------

  /** A column's field in the filter row: the filter icon, the field, its clear button */
  private rowField(key: TableKey, column: number): RowField {
    const { box, input } = this.filterBox(key, column);
    const element = el(this.host.doc, "div", "swt-filter-field", box);
    input.addEventListener("focus", () => {
      void this.readOptions();
      if (this.bubble?.input !== input) this.showBubble(key, column, input, { kind: "element", element: input });
    });
    input.addEventListener("blur", (e) => this.left(key, input, e));
    return { element, input };
  }

  /** A filter field with the filter icon before it and its clear button after it */
  private filterBox(key: TableKey, column: number): { box: HTMLElement; input: HTMLInputElement } {
    const { doc } = this.host;
    const input = el(doc, "input", {
      class: "swt-filter",
      // Its natural width (20 characters) would widen the column: it fills the cell instead (CSS)
      attrs: { type: "text", size: 1, placeholder: "Filter", spellcheck: "false", "data-swt-column": column },
    });
    this.host.isolate(input);
    input.addEventListener("input", () => this.setFilter(key, column, input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    const clear = el(doc, "button", {
      class: "swt-filter-clear",
      title: "Clear this filter",
      html: ICONS.clear,
      // In the table, a click reaches the controller only, which hands its
      // actions over (clear()); in the column's bubble, outside it, the button's own
      attrs: { tabindex: -1, "aria-label": "Clear this filter", "data-swt-action": "clear-filter", "data-swt-column": column },
      // The field keeps the focus (and its bubble) when it is cleared while typed in
      on: { mousedown: (e) => e.preventDefault() },
      run: () => this.type(key, input, column, ""),
    });
    const box = el(doc, "div", "swt-filter-box", el(doc, "span", { class: "swt-filter-icon", html: ICONS.filter }), input, clear);
    return { box, input };
  }

  /** A column's filter removed: a field's clear button in the filter row, the × in the column's menu */
  private clear(info: TableInfo, column: number): void {
    const input = this.shown.has(info.key) ? this.rows.get(info.key)?.[column]?.input : undefined;
    if (input) this.type(info.key, input, column, "");
    else this.setFilter(info.key, column, "");
    this.scheduleStore(info.key);
  }

  /** The toolbar chip's ×: no filter any more */
  private clearAll(key: TableKey): void {
    this.typed.set(key, []);
    for (const field of this.rows.get(key) ?? []) field.input.value = "";
    if (this.bubble?.key === key) this.hideBubble();
    this.host.viewChangedFor(key);
    this.scheduleStore(key);
  }

  private setFilter(key: TableKey, column: number, value: string): void {
    const info = this.host.tableFor(key);
    if (info) {
      const filters = [...this.filtersOf(info)];
      while (filters.length <= column) filters.push("");
      filters[column] = value;
      this.typed.set(key, filters);
      this.host.viewChangedFor(key);
    }
    const bubble = this.bubble;
    if (bubble && bubble.key === key && bubble.column === column) {
      this.panel.element.classList.toggle("swt-filter-typed", value !== "");
      this.renderBubble();
    }
  }

  /** Puts `value` in the field as if typed */
  private type(key: TableKey, input: HTMLInputElement, column: number, value: string): void {
    input.value = value;
    this.rows.get(key)?.[column]?.element.classList.toggle("swt-filter-typed", value !== "");
    this.setFilter(key, column, value);
  }

  // ---- the bubble -------------------------------------------------------------

  /**
   * A column's filter alone, floating under its header (its filter mark, the
   * column menu's Filter): nothing in the table moves. Asked again for the same
   * column, it closes.
   */
  private openFilter(info: TableInfo, column: number): void {
    const { key } = info;
    if (this.bubble?.popover && this.bubble.key === key && this.bubble.column === column) {
      this.hideBubble();
      return;
    }
    void this.readOptions();
    const { box, input } = this.filterBox(key, column);
    input.value = this.filtersOf(info)[column] ?? "";
    input.addEventListener("blur", (e) => this.left(key, input, e));
    // A × beside the field closes it, as Esc does (the field's own × clears the filter)
    const { doc } = this.host;
    const close = el(doc, "button", {
      class: "swt-filter-close",
      title: "Close",
      html: ICONS.clear,
      attrs: { tabindex: -1, "aria-label": "Close" },
      run: () => {
        // Leaving the field closes it and stores the filters
        input.blur();
        if (this.bubble?.input === input) {
          this.hideBubble();
          this.scheduleStore(key);
        }
      },
    });
    const head = el(doc, "div", "swt-filter-popover-head", box, close);
    // Under the header (as rendered now: a write renders the table anew)
    this.showBubble(key, column, input, { kind: "cell", key, row: 0, column }, head);
    this.panel.element.classList.toggle("swt-filter-typed", input.value !== "");
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private showBubble(key: TableKey, column: number, input: HTMLInputElement, anchor: PanelAnchor, head?: HTMLElement): void {
    this.hideBubble();
    const element = this.panel.element;
    element.classList.toggle("swt-filter-popover", !!head);
    element.classList.remove("swt-filter-typed");
    const body = el(this.host.doc, "div", "swt-filter-bubble-body");
    element.replaceChildren(...(head ? [head] : []), body);
    this.bubble = { body, input, key, column, anchor, popover: !!head };
    this.renderBubble();
  }

  /**
   * A field lost the focus: its bubble goes, unless the focus went into it (a
   * value ticked), and the filters are stored once no field has it
   */
  private left(key: TableKey, input: HTMLInputElement, e: FocusEvent): void {
    const bubble = this.bubble;
    if (bubble?.input === input && e.relatedTarget instanceof Node && this.panel.element.contains(e.relatedTarget)) return;
    if (bubble?.input === input) this.hideBubble();
    this.scheduleStore(key);
  }

  private hideBubble(): void {
    this.bubble = undefined;
    this.panel.hide();
    this.panel.element.replaceChildren();
  }

  /** The bubble's content for the field's text now, under what it belongs to */
  private renderBubble(): void {
    const bubble = this.bubble;
    const info = bubble && this.host.tableFor(bubble.key);
    if (!bubble || !info) return;
    const { key, column, input } = bubble;
    const { doc } = this.host;
    const values = this.columnValues(info, column);
    const parts: HTMLElement[] = [];
    if (this.options.smart) {
      // A column of numbers is filtered by comparing first
      const filled = values.filter((v) => v.value !== "");
      const numeric = filled.length > 0 && filled.filter((v) => asNumber(v.value) !== undefined).length * 2 >= filled.length;
      const hints = numeric ? [...NUMBER_HINTS, ...TEXT_HINTS.slice(0, 3)] : TEXT_HINTS;
      const hint = (h: (typeof hints)[number]) =>
        el(
          doc,
          "button",
          {
            class: "swt-filter-hint",
            attrs: { tabindex: -1 },
            run: () => {
              this.type(key, input, column, h.apply(input.value.trim()));
              input.focus({ preventScroll: true });
              input.setSelectionRange(input.value.length, input.value.length);
            },
          },
          el(doc, "code", { text: h.code }),
          ` ${h.text}`,
        );
      parts.push(el(doc, "div", "swt-filter-hints", ...hints.map(hint)));
      // A few values: ticked into an =a|b filter
      const pickable = values.filter((v) => !v.value.includes("|"));
      if (pickable.length > 0 && pickable.length <= MAX_VALUES && values.length <= MAX_VALUES) {
        parts.push(this.valueList(key, input, column, pickable));
      }
    }
    bubble.body.replaceChildren(...parts);
    // Under a field of the filter row, only when it has something to say
    if (parts.length > 0 || bubble.popover) this.panel.show(bubble.anchor, bubble.popover ? POPOVER_PLACE : BUBBLE_PLACE);
    else this.panel.hide();
  }

  /** The column's values to tick: ticked are those the field's =a|b names */
  private valueList(key: TableKey, input: HTMLInputElement, column: number, values: readonly ColumnValue[]): HTMLElement {
    const { doc } = this.host;
    const text = input.value.trim();
    const ticked = new Set(text.startsWith("=") ? text.slice(1).split("|").map((v) => normalizeForFilter(v.trim())) : []);
    const list = el(doc, "div", "swt-filter-values");
    for (const value of values) {
      const normalized = normalizeForFilter(value.value);
      const box = el(doc, "input", { attrs: { type: "checkbox", tabindex: -1 } });
      box.checked = ticked.has(normalized);
      const item = el(
        doc,
        "label",
        "swt-filter-value",
        box,
        el(doc, "span", { class: "swt-filter-value-label", text: value.label || "(empty)" }),
        el(doc, "span", { class: "swt-filter-value-count", text: String(value.count) }),
      );
      box.addEventListener("change", () => {
        const chosen = values.filter((v) => {
          const n = normalizeForFilter(v.value);
          return n === normalized ? box.checked : ticked.has(n);
        });
        // One empty value alone is "=|", which "=" alone (still being typed) is not
        const filter = chosen.length === 0 ? "" : chosen.length === 1 && chosen[0]!.value === "" ? "=|" : `=${chosen.map((v) => v.value).join("|")}`;
        this.type(key, input, column, filter);
        input.focus({ preventScroll: true });
      });
      list.append(item);
    }
    return list;
  }

  /** A column's different values in its body rows (not the pinned ones), in the order they first come */
  private columnValues(info: TableInfo, column: number): ColumnValue[] {
    const { top, bottom } = info.pins;
    const count = info.rows - 1;
    const found = new Map<string, { value: string; label: string; count: number }>();
    for (let row = 1 + top; row <= count - bottom; row++) {
      const ref = { row, column };
      const value = (this.host.shownValue(info, ref) ?? "").trim();
      const normalized = normalizeForFilter(value);
      const known = found.get(normalized);
      if (known) known.count++;
      else found.set(normalized, { value, label: (this.host.shownText(info, ref) ?? "").trim() || value, count: 1 });
    }
    return Array.from(found.values());
  }
}
