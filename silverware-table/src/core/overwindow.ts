// A table shown over the whole window (not the browser's full screen), for
// the modules that show one so (full screen, the sheet view): its widget is
// marked `swt-over-window` and with the module's own class, and CSS lays its
// box over the window, so its scroll, sticky header and Silverware Table's
// controls work as in a table with its own box. SilverBullet renders the table
// anew after every edit: the table shown so (by its key) is shown so again, at
// once when it is put into the page (before it is laid out), confirmed once it
// is enhanced. One table is over the window at a time: another shown so ends it.
//
// The room above the header and left of the rows (for the toolbar, the grips
// and the +) shows the columns' letters and the rows' numbers, as formulas
// count them (A1: the first row under the header). The letters are in the
// header's cells (CSS puts them above), so they move with it; the numbers are
// a layer over the room at the left, placed by the rows shown after each
// scroll (in the frame the core updates what follows the layout), and go on
// past the table where its module shows rows there (`past`).
import { OUT_OF_LINE_CLASS, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";
import { columnLetters } from "../formulas/index.ts";
import type { TableHost, WidgetInfo } from "./feature.ts";
import { oncePerFrame } from "./frame.ts";
import { firstRowBelow } from "./geometry.ts";
import { STICKY_GAP } from "./layout.ts";

export const OVER_WINDOW_CLASS = "swt-over-window";
const LETTER_CLASS = "swt-col-letter";

/** Rows shown past a table's last one, numbered on: the first's top (in the viewport), each one's height, how many */
export type RowsPast = { readonly top: number; readonly height: number; readonly count: number };

export type OverWindowOptions = {
  // The module's class on the widget, beside OVER_WINDOW_CLASS
  readonly className: string;
  // Shown or ended (the module's toolbar icon shows which)
  readonly changed: () => void;
  // Rows the module shows past the table, numbered on
  readonly past?: (widget: HTMLElement, info: WidgetInfo) => RowsPast | undefined;
};

// The table over the window in each document, whichever module shows it
const current = new WeakMap<Document, OverWindow>();

export class OverWindow {
  // The table shown over the window (its key) and its widget as rendered now
  private shownKey: string | undefined;
  private shownWidget: HTMLElement | undefined;
  // The table rendered anew taken for it before it was enhanced (tableAdded)
  private guessed: HTMLElement | undefined;
  // The rows' numbers, over the room left of the rows
  private readonly numbers: HTMLElement;
  private readonly queueNumbers: () => void;

  constructor(
    private readonly host: TableHost,
    private readonly options: OverWindowOptions,
  ) {
    this.queueNumbers = oncePerFrame(host.doc, () => this.placeNumbers());
    this.numbers = host.floating("div", "swt-over-window-rows");
    this.numbers.setAttribute("aria-hidden", "true");
  }

  /** The key of the table shown over the window, if any */
  get key(): string | undefined {
    return this.shownKey;
  }

  /** Its widget as rendered now */
  get widget(): HTMLElement | undefined {
    return this.shownWidget;
  }

  stop(): void {
    this.end();
    this.numbers.remove();
  }

  begin(widget: HTMLElement, info: WidgetInfo): void {
    const other = current.get(this.host.doc);
    if (other && other !== this) other.end();
    current.set(this.host.doc, this);
    if (this.shownWidget && this.shownWidget !== widget) this.unmark(this.shownWidget);
    this.shownKey = info.key;
    this.mark(widget);
    this.options.changed();
    this.host.tableResized(info);
  }

  end(): void {
    if (this.shownKey === undefined && !this.shownWidget) return;
    const widget = this.shownWidget;
    this.shownKey = undefined;
    this.shownWidget = undefined;
    if (current.get(this.host.doc) === this) current.delete(this.host.doc);
    if (widget) this.unmark(widget);
    this.numbers.classList.remove("swt-visible");
    this.options.changed();
    const info = widget && this.host.infoOf(widget);
    if (info) this.host.tableResized(info);
  }

  // Each header cell's letter (shown only over the window, by the CSS)
  decorate(info: WidgetInfo): void {
    Array.from(info.table.rows[0]?.cells ?? []).forEach((cell, column) => {
      if (cell.querySelector(`:scope > .${LETTER_CLASS}`)) return;
      const letter = this.host.doc.createElement("span");
      letter.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} ${LETTER_CLASS}`;
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = columnLetters(column);
      cell.append(letter);
    });
  }

  private mark(widget: HTMLElement): void {
    this.shownWidget = widget;
    widget.classList.add(OVER_WINDOW_CLASS, this.options.className);
    this.numbers.classList.add("swt-visible");
    this.queueNumbers();
  }

  private unmark(widget: HTMLElement): void {
    widget.classList.remove(OVER_WINDOW_CLASS, this.options.className);
  }

  // Rendered anew (an edit): the replacement of the table shown over the window shows so at once, before it is laid out
  // (the one starting where the table taken out started, data-pos: an edit in a table does not move its start;
  // the page may render every table anew)
  tableAdded(widget: HTMLElement, table: HTMLTableElement): void {
    const old = this.shownWidget;
    if (this.shownKey === undefined || !old || old.isConnected || this.guessed?.isConnected) return;
    if (table.dataset.pos !== old.querySelector("table")?.dataset.pos) return;
    this.guessed = widget;
    widget.classList.add(OVER_WINDOW_CLASS, this.options.className);
  }

  // Enhanced: shown over the window if it is that table, else not (tableAdded may have guessed wrong)
  enhanced(widget: HTMLElement, info: WidgetInfo): void {
    if (info.key === this.shownKey) this.mark(widget);
    else if (widget.classList.contains(this.options.className)) this.unmark(widget);
    // The table shown so is gone from the page (another page opened): it ends
    if (this.shownKey !== undefined && this.shownWidget && !this.shownWidget.isConnected && !this.host.widgetForKey(this.shownKey)) this.end();
  }

  // Its rows sorted, filtered or put back into the document: their numbers follow
  viewApplied(widget: HTMLElement): void {
    if (widget === this.shownWidget) this.queueNumbers();
  }

  rowsAttached(info: WidgetInfo): void {
    if (info.table === this.shownWidget?.querySelector("table")) this.queueNumbers();
  }

  // Esc closes it, unless something else takes the key first (a cell editor, a selection, a field, a menu)
  keyDown(e: KeyboardEvent): boolean {
    if (e.key !== "Escape" || this.shownKey === undefined || this.host.editing) return false;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false;
    e.preventDefault();
    e.stopPropagation();
    this.end();
    return true;
  }

  /**
   * After a scroll or a change of the layout (in a frame): the numbers follow
   * the rows (unless `numbers` is false: the module places what they are
   * placed by first, then calls placeNumbers); another page shown: it ends.
   * Whether a table is still shown so.
   */
  layoutChanged(numbers = true): boolean {
    if (this.shownKey === undefined) return false;
    if (!this.shownWidget?.isConnected && !this.host.doc.querySelector(`${WIDGET_SELECTOR}.${this.options.className}`)) {
      this.end();
      return false;
    }
    if (numbers) this.placeNumbers();
    return true;
  }

  /** A number beside each row in view, below the header (held or not), above the box's bottom, and the rows past the table's */
  placeNumbers(): void {
    const widget = this.shownWidget;
    const info = widget?.isConnected ? this.host.infoOf(widget) : undefined;
    if (!widget || !info) return;
    const box = this.host.innerBox(widget);
    // Below the header, or below the room above it where the box scrolled past the table (the rows past it shown)
    const top = Math.max(info.table.rows[0]!.getBoundingClientRect().bottom, box.top + STICKY_GAP);
    const bottom = box.bottom;
    const layer = this.numbers;
    layer.style.top = `${top}px`;
    layer.style.height = `${Math.max(0, bottom - top)}px`;
    // The rows as shown (in their order, their tops going down), from the first in view
    const rows = this.host.shownRows(info).filter((tr) => this.host.rowOf(info, tr) > 0 && tr.isConnected);
    const low = firstRowBelow(rows, top);
    let shown = 0;
    const label = (text: string, rowTop: number, height: number) => {
      let span = layer.children[shown] as HTMLElement | undefined;
      if (!span) {
        span = this.host.doc.createElement("span");
        layer.append(span);
      }
      span.hidden = false;
      span.textContent = text;
      span.style.top = `${rowTop - top}px`;
      span.style.height = `${height}px`;
      shown++;
    };
    let full = false;
    for (let i = low; i < rows.length; i++) {
      const rect = rows[i]!.getBoundingClientRect();
      if (rect.top >= bottom) {
        full = true;
        break;
      }
      label(String(this.host.rowOf(info, rows[i]!)), rect.top, rect.height);
    }
    const past = full ? undefined : this.options.past?.(widget, info);
    if (past && past.height > 0) {
      // Numbered on from the row after the table's last (its body rows: as many as its rows less the header)
      const first = Math.max(0, Math.floor((top - past.top) / past.height));
      for (let k = first; k < past.count; k++) {
        const rowTop = past.top + k * past.height;
        if (rowTop >= bottom) break;
        label(String(info.rows + k), rowTop, past.height);
      }
    }
    for (let i = shown; i < layer.children.length; i++) (layer.children[i] as HTMLElement).hidden = true;
  }
}
