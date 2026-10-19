// Filters as they are typed: the filter row under a table's header (a field
// per column, with a clear button, marked while it filters), and a column's
// filter on its own in a bubble under its header (its filter mark, the column
// menu's Filter), which moves nothing in the table. Under the field being typed
// in, what it understands and, for a column with a few values, those values to
// tick. The filters themselves are the view's (view.ts).
import { cellText, UI_CLASS } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { asNumber, type FilterOptions, normalizeForFilter, parseFilter, type ViewState, withFilter } from "../view.ts";
import type { WidgetInfo } from "./feature.ts";

/** What the filter row needs of the controller */
export type FilterHost = {
  readonly doc: Document;
  viewOf(info: WidgetInfo): ViewState;
  setView(widget: HTMLElement, info: WidgetInfo, view: ViewState): void;
  infoOf(widget: HTMLElement): WidgetInfo | undefined;
  // Keyboard and input events from the field must not reach SilverBullet's editor
  isolate(element: HTMLElement): void;
  filterOptions(): FilterOptions;
  // A filter was typed: the settings it depends on may have changed meanwhile
  filterTyped(): void;
  // The body rows as rendered, in the order of the markdown
  bodyRows(info: WidgetInfo): HTMLTableRowElement[];
  // A cell's value as sorting and filtering see it
  cellValue(cell: HTMLTableCellElement): string;
};

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

export class FilterRow {
  // The bubble under the field being typed in, or (popover) a column's filter on its own
  private bubble:
    | {
        readonly element: HTMLElement;
        readonly body: HTMLElement;
        readonly input: HTMLInputElement;
        readonly widget: HTMLElement;
        readonly column: number;
        readonly anchor: () => HTMLElement;
        readonly popover: boolean;
      }
    | undefined;

  constructor(private readonly host: FilterHost) {}

  /** Whether a node is the bubble's */
  owns(node: Node): boolean {
    return !!this.bubble?.element.contains(node);
  }

  stop(): void {
    this.hideBubble();
  }

  /** The filter row as the view has it: shown with the view's filters, or gone */
  apply(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    let row = info.table.querySelector<HTMLTableRowElement>("tr.tp-filter-row");
    // A column's bubble follows its header, which a write renders anew
    if (this.bubble?.popover && this.bubble.widget === widget) this.placeBubble();
    if (!view.showFilters) {
      if (row && this.bubble && row.contains(this.bubble.input)) this.hideBubble();
      row?.remove();
      return;
    }
    if (!row) {
      row = this.host.doc.createElement("tr");
      row.className = `${UI_CLASS} tp-filter-row`;
      for (let column = 0; column < info.columns; column++) row.append(this.field(widget, column));
      info.table.rows[0]!.after(row);
    }
    const options = this.host.filterOptions();
    for (const input of Array.from(row.querySelectorAll<HTMLInputElement>("input.tp-filter"))) {
      const value = view.filters[Number(input.dataset.tpColumn)] ?? "";
      if (input.value !== value && this.host.doc.activeElement !== input) input.value = value;
      // A filter that cannot be used filters nothing; the field says why
      const { match, error } = parseFilter(input.value, options);
      input.classList.toggle("tp-invalid", !!error);
      input.title = error ?? "";
      const cell = input.closest("td")!;
      cell.classList.toggle("tp-filter-active", !!match);
      cell.classList.toggle("tp-filter-typed", input.value !== "");
    }
  }

  /** A column's field in the filter row: the filter icon, the field, its clear button */
  private field(widget: HTMLElement, column: number): HTMLTableCellElement {
    const cell = this.host.doc.createElement("td");
    const { box, input } = this.filterBox(widget, column);
    input.addEventListener("focus", () => {
      if (this.bubble?.input !== input) this.showBubble(widget, column, input, () => input);
    });
    input.addEventListener("blur", (e) => this.left(input, e));
    cell.append(box);
    return cell;
  }

  /** A filter field with the filter icon before it and its clear button after it */
  private filterBox(widget: HTMLElement, column: number): { box: HTMLElement; input: HTMLInputElement } {
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
    input.addEventListener("input", () => {
      this.setFilter(widget, column, input.value);
      this.host.filterTyped();
    });
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
      this.type(widget, input, column, "");
    });
    box.append(icon, input, clear);
    return { box, input };
  }

  /** A field's clear button in the filter row */
  clear(widget: HTMLElement, info: WidgetInfo, column: number): void {
    const input = info.table.querySelector<HTMLInputElement>(`.tp-filter-row input.tp-filter[data-tp-column="${column}"]`);
    if (input) this.type(widget, input, column, "");
  }

  private setFilter(widget: HTMLElement, column: number, value: string): void {
    const info = this.host.infoOf(widget);
    if (info) this.host.setView(widget, info, withFilter(this.host.viewOf(info), column, value));
    const bubble = this.bubble;
    if (bubble && bubble.widget === widget && bubble.column === column) {
      bubble.element.classList.toggle("tp-filter-typed", value !== "");
      this.renderBubble();
    }
  }

  /** Puts `value` in the field as if typed */
  private type(widget: HTMLElement, input: HTMLInputElement, column: number, value: string): void {
    input.value = value;
    input.closest("td")?.classList.toggle("tp-filter-typed", value !== "");
    this.setFilter(widget, column, value);
  }

  // ---- the bubble -------------------------------------------------------------

  /**
   * A column's filter alone, floating under its header (its filter mark, the
   * column menu's Filter): nothing in the table moves. Asked again for the same
   * column, it closes.
   */
  openFilter(widget: HTMLElement, info: WidgetInfo, column: number): void {
    if (this.bubble?.popover && this.bubble.widget === widget && this.bubble.column === column) {
      this.hideBubble();
      return;
    }
    const { box, input } = this.filterBox(widget, column);
    input.value = this.host.viewOf(info).filters[column] ?? "";
    input.addEventListener("blur", (e) => this.left(input, e));
    // Under the header as rendered now: a write renders the table anew
    const anchor = () => {
      const current = this.host.infoOf(widget);
      return current?.table.rows[0]?.cells[column] ?? info.table.rows[0]!.cells[column]!;
    };
    this.showBubble(widget, column, input, anchor, box);
    this.bubble?.element.classList.toggle("tp-filter-typed", input.value !== "");
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }

  private showBubble(widget: HTMLElement, column: number, input: HTMLInputElement, anchor: () => HTMLElement, head?: HTMLElement): void {
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
    this.bubble = { element, body, input, widget, column, anchor, popover: !!head };
    this.renderBubble();
  }

  /** The field lost the focus: its bubble goes, unless the focus went into it (a value ticked) */
  private left(input: HTMLInputElement, e: FocusEvent): void {
    const bubble = this.bubble;
    if (bubble?.input !== input) return;
    if (e.relatedTarget instanceof Node && bubble.element.contains(e.relatedTarget)) return;
    this.hideBubble();
  }

  private hideBubble(): void {
    this.bubble?.element.remove();
    this.bubble = undefined;
  }

  /** The bubble's content for the field's text now, under what it belongs to */
  private renderBubble(): void {
    const bubble = this.bubble;
    const info = bubble && this.host.infoOf(bubble.widget);
    if (!bubble || !info) return;
    const { widget, column, input } = bubble;
    const { doc } = this.host;
    const smart = this.host.filterOptions().smart;
    const values = this.columnValues(info, column);
    const parts: HTMLElement[] = [];
    if (smart) {
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
          this.type(widget, input, column, hint.apply(input.value.trim()));
          input.focus({ preventScroll: true });
          input.setSelectionRange(input.value.length, input.value.length);
        });
        list.append(b);
      }
      parts.push(list);
      // A few values: ticked into an =a|b filter
      const pickable = values.filter((v) => !v.value.includes("|"));
      if (pickable.length > 0 && pickable.length <= MAX_VALUES && values.length <= MAX_VALUES) {
        parts.push(this.valueList(widget, input, column, pickable));
      }
    }
    bubble.body.replaceChildren(...parts);
    // Under a field of the filter row, only when it has something to say
    bubble.element.classList.toggle("tp-visible", parts.length > 0 || bubble.popover);
    this.placeBubble();
  }

  /** Under what the bubble belongs to (the field, the header), inside the window */
  placeBubble(): void {
    const bubble = this.bubble;
    if (!bubble) return;
    const win = this.host.doc.defaultView!;
    const r = bubble.anchor().getBoundingClientRect();
    const m = bubble.element.getBoundingClientRect();
    const left = Math.max(4, Math.min(r.left - (bubble.popover ? 0 : 6), win.innerWidth - m.width - 4));
    const top = r.bottom + 6 + m.height > win.innerHeight - 4 ? Math.max(4, r.top - m.height - 6) : r.bottom + 6;
    bubble.element.style.left = `${Math.round(left)}px`;
    bubble.element.style.top = `${Math.round(top)}px`;
  }

  /** The column's values to tick: ticked are those the field's =a|b names */
  private valueList(widget: HTMLElement, input: HTMLInputElement, column: number, values: readonly ColumnValue[]): HTMLElement {
    const { doc } = this.host;
    const text = input.value.trim();
    const ticked = new Set(text.startsWith("=") ? text.slice(1).split("|").map((v) => normalizeForFilter(v.trim())) : []);
    const list = doc.createElement("div");
    list.className = "tp-filter-values";
    for (const value of values) {
      const key = normalizeForFilter(value.value);
      const item = doc.createElement("label");
      item.className = "tp-filter-value";
      const box = doc.createElement("input");
      box.type = "checkbox";
      box.tabIndex = -1;
      box.checked = ticked.has(key);
      const label = doc.createElement("span");
      label.className = "tp-filter-value-label";
      label.textContent = value.label || "(empty)";
      const count = doc.createElement("span");
      count.className = "tp-filter-value-count";
      count.textContent = String(value.count);
      item.append(box, label, count);
      box.addEventListener("change", () => {
        const chosen = values.filter((v) => {
          const k = normalizeForFilter(v.value);
          return k === key ? box.checked : ticked.has(k);
        });
        // One empty value alone is "=|", which "=" alone (still being typed) is not
        const filter = chosen.length === 0 ? "" : chosen.length === 1 && chosen[0]!.value === "" ? "=|" : `=${chosen.map((v) => v.value).join("|")}`;
        this.type(widget, input, column, filter);
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
      const key = normalizeForFilter(value);
      const known = found.get(key);
      if (known) known.count++;
      else found.set(key, { value, label: cellText(cell).trim() || value, count: 1 });
    });
    return Array.from(found.values());
  }
}
