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
import type { CellEditor, Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { cellText, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";
import { type FilterOptions, normalizeForFilter, parseFilter } from "../filter.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { columnMeta, withColumnMeta } from "../meta.ts";
import { asNumber } from "../view.ts";

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

/** A column's different values (as filters see them), each with what it shows and how many cells have it */
type ColumnValue = { readonly value: string; readonly label: string; readonly count: number };

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
  private readonly storeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Tables whose filters are stored once the cell editor in them closes, or
  // they are rendered again (a write renders a table anew)
  private readonly storesWaiting = new Set<string>();
  private options: FilterOptions = { smart: true };
  // The bubble under the field being typed in, or (popover) a column's filter on its own
  private bubble:
    | {
        readonly element: HTMLElement;
        readonly body: HTMLElement;
        readonly input: HTMLInputElement;
        readonly key: string;
        readonly column: number;
        readonly anchor: () => HTMLElement | undefined;
        readonly popover: boolean;
      }
    | undefined;

  constructor(private readonly host: TableHost) {}

  start(): void {
    void this.readOptions();
  }

  stop(): void {
    for (const timer of this.storeTimers.values()) clearTimeout(timer);
    this.hideBubble();
  }

  /** Whether a node is the bubble's */
  owns(node: Node): boolean {
    return !!this.bubble?.element.contains(node);
  }

  /** The smart filters setting; when it changed, every table shown is filtered anew */
  private async readOptions(): Promise<void> {
    const smart = (await this.host.setting("smartFilters")) === true;
    if (smart === this.options.smart) return;
    this.options = { smart };
    for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR))) {
      const info = this.host.infoOf(widget);
      if (info) this.host.viewChanged(widget, info);
    }
  }

  /** The table with `key` as rendered now: a write renders a table anew */
  private table(key: string): [HTMLElement, WidgetInfo] | undefined {
    const widget = this.host.widgetForKey(key);
    const info = widget && this.host.infoOf(widget);
    return widget && info ? [widget, info] : undefined;
  }

  /** The filters stored in the table (filter.*), by column */
  private storedFilters(info: WidgetInfo): readonly string[] {
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
  private filtersOf(info: WidgetInfo): readonly string[] {
    return this.typed.get(info.key) ?? this.storedFilters(info);
  }

  /** The filters that filter, by column */
  private matchers(info: WidgetInfo): Map<number, (value: string) => boolean> {
    const matchers = new Map<number, (value: string) => boolean>();
    this.filtersOf(info).forEach((filter, column) => {
      const match = parseFilter(filter, this.options).match;
      if (match) matchers.set(column, match);
    });
    return matchers;
  }

  hiddenRows(info: WidgetInfo, values: readonly (readonly string[])[]): ReadonlySet<number> | undefined {
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

  hidesRows(info: WidgetInfo): boolean {
    return this.matchers(info).size > 0;
  }

  /** A filter mark in each header, shown while its column filters (also with the filter row hidden) */
  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    Array.from(info.table.rows[0]!.cells).forEach((cell, column) => {
      if (cell.querySelector(".tp-filter-mark")) return;
      const mark = this.host.doc.createElement("span");
      mark.className = `${UI_CLASS} tp-filter-mark`;
      mark.title = "Filtered: click to change the filter";
      mark.dataset.tpAction = "filter";
      mark.dataset.tpColumn = String(column);
      mark.innerHTML = ICONS.filter;
      cell.insertBefore(mark, cell.querySelector(".tp-sort"));
    });
  }

  viewApplied(_widget: HTMLElement, info: WidgetInfo): void {
    const matchers = this.matchers(info);
    Array.from(info.table.rows[0]!.cells).forEach((cell, column) => cell.classList.toggle("tp-filtered", matchers.has(column)));
    this.syncRow(info);
  }

  /** The filter icon at the toolbar's right; while filtered, "3 of 10 rows", its × clearing the filters */
  toolbarButtons(_widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const { key } = info;
    const buttons: ToolbarButton[] = [];
    if (this.hidesRows(info)) {
      const rows = this.host.bodyRows(info);
      const shown = rows.filter((tr) => !tr.classList.contains("tp-hidden")).length;
      buttons.push({
        label: `${shown} of ${rows.length} rows`,
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
        const table = this.table(key);
        if (table) this.host.viewChanged(...table);
        // A field taken away with the row loses its focus without a blur event
        this.scheduleStore(key);
      },
    });
    return buttons;
  }

  /** "Filter" in a column's menu: its filter in a bubble under its header */
  columnMenuEntries(_widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    return [{ kind: "item", label: "Filter", icon: ICONS.filter, run: () => this.openFilter(info, column) }];
  }

  action(name: string, element: HTMLElement, _widget: HTMLElement, info: WidgetInfo): boolean {
    const column = Number(element.dataset.tpColumn);
    if (name === "filter") this.openFilter(info, column);
    else if (name === "clear-filter") this.clear(info, column);
    else return false;
    return true;
  }

  /** Filters typed move with their columns; stored ones follow them in the markdown (meta.ts) */
  columnsMoved(key: string, map: (column: number) => number | undefined): void {
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
  }

  /** Remove metadata: what is typed goes too, the table shows what its markdown has */
  viewForgotten(key: string): void {
    this.typed.delete(key);
    this.storesWaiting.delete(key);
  }

  /** The filter row as the filters are: shown with them, or gone */
  private syncRow(info: WidgetInfo): void {
    let row = info.table.querySelector<HTMLTableRowElement>("tr.tp-filter-row");
    // A column's bubble follows its header, which a write renders anew
    if (this.bubble?.popover && this.bubble.key === info.key) this.placeBubble();
    if (!this.shown.has(info.key)) {
      if (row && this.bubble && row.contains(this.bubble.input)) this.hideBubble();
      row?.remove();
      return;
    }
    if (!row) {
      row = this.host.doc.createElement("tr");
      row.className = `${UI_CLASS} tp-filter-row`;
      for (let column = 0; column < info.columns; column++) row.append(this.field(info.key, column));
      info.table.rows[0]!.after(row);
    }
    const filters = this.filtersOf(info);
    for (const input of Array.from(row.querySelectorAll<HTMLInputElement>("input.tp-filter"))) {
      const value = filters[Number(input.dataset.tpColumn)] ?? "";
      if (input.value !== value && this.host.doc.activeElement !== input) input.value = value;
      // A filter that cannot be used filters nothing; the field says why
      const { match, error } = parseFilter(input.value, this.options);
      input.classList.toggle("tp-invalid", !!error);
      input.title = error ?? "";
      const cell = input.closest("td")!;
      cell.classList.toggle("tp-filter-active", !!match);
      cell.classList.toggle("tp-filter-typed", input.value !== "");
    }
  }

  // ---- storing ------------------------------------------------------------------

  /**
   * Stores a table's filters in its metadata row (the metadata setting, or a
   * table that has the row) once none of its filter fields is typed in and no
   * cell of it is edited: a write renders the table anew, which would take a
   * field's focus or close the cell editor
   */
  private scheduleStore(key: string): void {
    clearTimeout(this.storeTimers.get(key));
    this.storeTimers.set(
      key,
      setTimeout(() => {
        this.storeTimers.delete(key);
        const active = this.host.doc.activeElement;
        const table = this.table(key);
        if (active instanceof HTMLInputElement && active.classList.contains("tp-filter")) {
          // Its blur stores again
          if (this.bubble?.input === active ? this.bubble.key === key : !!table && table[1].table.contains(active)) return;
        }
        const editing = this.host.editing;
        if (!table || (editing && this.host.infoOf(editing.widget)?.key === key)) {
          this.storesWaiting.add(key);
          return;
        }
        void this.store(key);
      }, 0),
    );
  }

  /** A cell editor closed: filters waiting for it are stored */
  editorClosed(editor: CellEditor): void {
    const key = this.host.infoOf(editor.widget)?.key;
    if (key && this.storesWaiting.delete(key)) this.scheduleStore(key);
  }

  /** A table rendered again: filters waiting for it are stored */
  enhanced(_widget: HTMLElement, info: WidgetInfo): void {
    if (this.storesWaiting.delete(info.key)) this.scheduleStore(info.key);
  }

  private async store(key: string): Promise<void> {
    const table = this.table(key);
    const typed = this.typed.get(key);
    if (!table || !typed) return;
    const [widget, info] = table;
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
    const result = await this.host.write(widget, (t) => withColumnMeta(t, "filter", filters));
    // Stored: the table's markdown has them now
    if (result !== "failed" && sameFilters(this.typed.get(key) ?? [], written)) this.typed.delete(key);
  }

  // ---- typing ---------------------------------------------------------------------

  /** A column's field in the filter row: the filter icon, the field, its clear button */
  private field(key: string, column: number): HTMLTableCellElement {
    const cell = this.host.doc.createElement("td");
    const { box, input } = this.filterBox(key, column);
    input.addEventListener("focus", () => {
      void this.readOptions();
      if (this.bubble?.input !== input) {
        this.showBubble(key, column, input, () => (input.isConnected ? input : undefined));
      }
    });
    input.addEventListener("blur", (e) => this.left(key, input, e));
    cell.append(box);
    return cell;
  }

  /** A filter field with the filter icon before it and its clear button after it */
  private filterBox(key: string, column: number): { box: HTMLElement; input: HTMLInputElement } {
    const { doc } = this.host;
    const box = doc.createElement("div");
    box.className = "tp-filter-box";
    const icon = doc.createElement("span");
    icon.className = "tp-filter-icon";
    icon.innerHTML = ICONS.filter;
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "tp-filter";
    // Its natural width (20 characters) would widen the column: it fills the cell instead (CSS)
    input.size = 1;
    input.placeholder = "Filter";
    input.spellcheck = false;
    input.dataset.tpColumn = String(column);
    this.host.isolate(input);
    input.addEventListener("input", () => this.setFilter(key, column, input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        input.blur();
      }
    });
    const clear = doc.createElement("button");
    clear.type = "button";
    clear.tabIndex = -1;
    clear.className = "tp-filter-clear";
    clear.title = "Clear this filter";
    clear.setAttribute("aria-label", clear.title);
    clear.innerHTML = ICONS.clear;
    // In the table, a click reaches the controller only, which hands its
    // actions over (clear()); in the column's bubble, outside it, the button's own
    clear.dataset.tpAction = "clear-filter";
    clear.dataset.tpColumn = String(column);
    // The field keeps the focus (and its bubble) when it is cleared while typed in
    clear.addEventListener("mousedown", (e) => e.preventDefault());
    clear.addEventListener("click", (e) => {
      e.preventDefault();
      this.type(key, input, column, "");
    });
    box.append(icon, input, clear);
    return { box, input };
  }

  /** A field's clear button in the filter row */
  private clear(info: WidgetInfo, column: number): void {
    const input = info.table.querySelector<HTMLInputElement>(`.tp-filter-row input.tp-filter[data-tp-column="${column}"]`);
    if (input) this.type(info.key, input, column, "");
    this.scheduleStore(info.key);
  }

  /** The toolbar chip's ×: no filter any more */
  private clearAll(key: string): void {
    this.typed.set(key, []);
    const table = this.table(key);
    for (const input of Array.from(table?.[1].table.querySelectorAll<HTMLInputElement>("input.tp-filter") ?? [])) input.value = "";
    if (this.bubble?.key === key) this.hideBubble();
    if (table) this.host.viewChanged(...table);
    this.scheduleStore(key);
  }

  private setFilter(key: string, column: number, value: string): void {
    const table = this.table(key);
    if (table) {
      const filters = [...this.filtersOf(table[1])];
      while (filters.length <= column) filters.push("");
      filters[column] = value;
      this.typed.set(key, filters);
      this.host.viewChanged(...table);
    }
    const bubble = this.bubble;
    if (bubble && bubble.key === key && bubble.column === column) {
      bubble.element.classList.toggle("tp-filter-typed", value !== "");
      this.renderBubble();
    }
  }

  /** Puts `value` in the field as if typed */
  private type(key: string, input: HTMLInputElement, column: number, value: string): void {
    input.value = value;
    input.closest("td")?.classList.toggle("tp-filter-typed", value !== "");
    this.setFilter(key, column, value);
  }

  // ---- the bubble -------------------------------------------------------------

  /**
   * A column's filter alone, floating under its header (its filter mark, the
   * column menu's Filter): nothing in the table moves. Asked again for the same
   * column, it closes.
   */
  private openFilter(info: WidgetInfo, column: number): void {
    const { key } = info;
    if (this.bubble?.popover && this.bubble.key === key && this.bubble.column === column) {
      this.hideBubble();
      return;
    }
    void this.readOptions();
    const { box, input } = this.filterBox(key, column);
    input.value = this.filtersOf(info)[column] ?? "";
    input.addEventListener("blur", (e) => this.left(key, input, e));
    // Under the header as rendered now: a write renders the table anew
    const anchor = () => this.table(key)?.[1].table.rows[0]?.cells[column];
    this.showBubble(key, column, input, anchor, box);
    this.bubble?.element.classList.toggle("tp-filter-typed", input.value !== "");
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private showBubble(key: string, column: number, input: HTMLInputElement, anchor: () => HTMLElement | undefined, head?: HTMLElement): void {
    this.hideBubble();
    const { doc } = this.host;
    const element = doc.createElement("div");
    element.className = `${UI_CLASS} tp-floating tp-filter-bubble`;
    if (head) element.classList.add("tp-filter-popover");
    // Clicks in it keep the focus in the field
    element.addEventListener("mousedown", (e) => {
      if (e.target !== input) e.preventDefault();
    });
    const body = doc.createElement("div");
    body.className = "tp-filter-bubble-body";
    if (head) element.append(head);
    element.append(body);
    doc.body.append(element);
    this.bubble = { element, body, input, key, column, anchor, popover: !!head };
    this.renderBubble();
  }

  /**
   * A field lost the focus: its bubble goes, unless the focus went into it (a
   * value ticked), and the filters are stored once no field has it
   */
  private left(key: string, input: HTMLInputElement, e: FocusEvent): void {
    const bubble = this.bubble;
    if (bubble?.input === input && e.relatedTarget instanceof Node && bubble.element.contains(e.relatedTarget)) return;
    if (bubble?.input === input) this.hideBubble();
    this.scheduleStore(key);
  }

  private hideBubble(): void {
    this.bubble?.element.remove();
    this.bubble = undefined;
  }

  /** The bubble's content for the field's text now, under what it belongs to */
  private renderBubble(): void {
    const bubble = this.bubble;
    const info = bubble && this.table(bubble.key)?.[1];
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
      const list = doc.createElement("div");
      list.className = "tp-filter-hints";
      for (const hint of hints) {
        const b = doc.createElement("button");
        b.type = "button";
        b.tabIndex = -1;
        b.className = "tp-filter-hint";
        const code = doc.createElement("code");
        code.textContent = hint.code;
        b.append(code, ` ${hint.text}`);
        b.addEventListener("click", (e) => {
          e.preventDefault();
          this.type(key, input, column, hint.apply(input.value.trim()));
          input.focus({ preventScroll: true });
          input.setSelectionRange(input.value.length, input.value.length);
        });
        list.append(b);
      }
      parts.push(list);
      // A few values: ticked into an =a|b filter
      const pickable = values.filter((v) => !v.value.includes("|"));
      if (pickable.length > 0 && pickable.length <= MAX_VALUES && values.length <= MAX_VALUES) {
        parts.push(this.valueList(key, input, column, pickable));
      }
    }
    bubble.body.replaceChildren(...parts);
    // Under a field of the filter row, only when it has something to say
    bubble.element.classList.toggle("tp-visible", parts.length > 0 || bubble.popover);
    this.placeBubble();
  }

  /** Under what the bubble belongs to (the field, the header), inside the window */
  private placeBubble(): void {
    const bubble = this.bubble;
    const anchor = bubble?.anchor();
    if (!bubble || !anchor) return;
    const win = this.host.doc.defaultView!;
    const r = anchor.getBoundingClientRect();
    const m = bubble.element.getBoundingClientRect();
    const left = Math.max(4, Math.min(r.left - (bubble.popover ? 0 : 6), win.innerWidth - m.width - 4));
    const top = r.bottom + 6 + m.height > win.innerHeight - 4 ? Math.max(4, r.top - m.height - 6) : r.bottom + 6;
    bubble.element.style.left = `${Math.round(left)}px`;
    bubble.element.style.top = `${Math.round(top)}px`;
  }

  /** The column's values to tick: ticked are those the field's =a|b names */
  private valueList(key: string, input: HTMLInputElement, column: number, values: readonly ColumnValue[]): HTMLElement {
    const { doc } = this.host;
    const text = input.value.trim();
    const ticked = new Set(text.startsWith("=") ? text.slice(1).split("|").map((v) => normalizeForFilter(v.trim())) : []);
    const list = doc.createElement("div");
    list.className = "tp-filter-values";
    for (const value of values) {
      const normalized = normalizeForFilter(value.value);
      const item = doc.createElement("label");
      item.className = "tp-filter-value";
      const box = doc.createElement("input");
      box.type = "checkbox";
      box.tabIndex = -1;
      box.checked = ticked.has(normalized);
      const label = doc.createElement("span");
      label.className = "tp-filter-value-label";
      label.textContent = value.label || "(empty)";
      const count = doc.createElement("span");
      count.className = "tp-filter-value-count";
      count.textContent = String(value.count);
      item.append(box, label, count);
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
  private columnValues(info: WidgetInfo, column: number): ColumnValue[] {
    const { top, bottom } = info.pins;
    const rows = this.host.bodyRows(info);
    const found = new Map<string, { value: string; label: string; count: number }>();
    rows.forEach((tr, i) => {
      if (i < top || i >= rows.length - bottom) return;
      const cell = tr.cells[column];
      if (!cell) return;
      const value = this.host.cellValue(cell).trim();
      const normalized = normalizeForFilter(value);
      const known = found.get(normalized);
      if (known) known.count++;
      else found.set(normalized, { value, label: cellText(cell).trim() || value, count: 1 });
    });
    return Array.from(found.values());
  }
}
