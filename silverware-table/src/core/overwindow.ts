// A table shown over the whole window (not the browser's full screen), for
// the modules that show one so (full screen, the sheet view): its widget is
// marked `swt-over-window` and with the module's own class, and CSS lays its
// box over the window, so its scroll, sticky header and Silverware Table's
// controls work as in a table with its own box. SilverBullet renders the table
// anew after every edit: the table shown so (by its key) is shown so again, at
// once when it is put into the page (before it is laid out), confirmed once it
// is enhanced. A write of several tables (formulas referring to the one written)
// renders them all anew, and they are enhanced one by one, so the table is not
// gone while it is missing for a moment: it ends when another page is loaded, or
// when no table of its key is back after GONE_MS. One table is over the window
// at a time: another shown so ends it.
//
// The room above the header and left of the rows (for the toolbar, the grips
// and the +) shows the columns' letters and the rows' numbers, as formulas
// count them (A1: the first row under the header). The letters are in the
// header's cells (CSS puts them above), so they move with it; the numbers are
// a layer over the room at the left, placed by the rows shown after each
// scroll (in the frame the core updates what follows the layout), and go on
// past the table where its module shows rows there (`past`). A module may keep
// the same room right of the table (`numbersRight`: full screen), numbered too,
// so the + of a new column and its line are in view, clear of the toolbar.
import { OUT_OF_LINE_CLASS, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";
import { columnLetters } from "../formulas/index.ts";
import type { TableHost, WidgetInfo } from "./feature.ts";
import { oncePerFrame } from "./frame.ts";
import { firstRowBelow } from "./geometry.ts";
import { STICKY_GAP } from "./layout.ts";

export const OVER_WINDOW_CLASS = "swt-over-window";
const LETTER_CLASS = "swt-col-letter";
// How long the table shown so may be missing from the page (rendered anew, not enhanced yet) before it ends
const GONE_MS = 2000;

/** Rows shown past a table's last one, numbered on: the first's top (in the viewport), each one's height, how many */
export type RowsPast = { readonly top: number; readonly height: number; readonly count: number };

export type OverWindowOptions = {
  // The module's class on the widget, beside OVER_WINDOW_CLASS
  readonly className: string;
  // Shown or ended (the module's toolbar icon shows which)
  readonly changed: () => void;
  // Rows the module shows past the table, numbered on
  readonly past?: (widget: HTMLElement, info: WidgetInfo) => RowsPast | undefined;
  // The rows' numbers in a room right of the table too (the CSS keeps it: its module's class)
  readonly numbersRight?: boolean;
  // Which of the widgets of the table's key is shown so (the sheet: the one it drew, not SilverBullet's under it);
  // undefined: any, a table rendered anew in its place too
  readonly shows?: (widget: HTMLElement) => boolean;
};

// The table over the window in each document, whichever module shows it
const current = new WeakMap<Document, OverWindow>();

export class OverWindow {
  // The table shown over the window (its key) and its widget as rendered now
  private shownKey: string | undefined;
  private shownWidget: HTMLElement | undefined;
  // The table rendered anew taken for it before it was enhanced (tableAdded)
  private guessed: HTMLElement | undefined;
  // Its place among the page's tables, which a table rendered anew in its place has too
  private place = -1;
  // Checks whether it is back, once missing
  private goneTimer: ReturnType<typeof setTimeout> | undefined;
  // The rows' numbers, over the room left of the rows (and right of them, numbersRight)
  private readonly numbers: readonly HTMLElement[];
  private readonly queueNumbers: () => void;
  // With `shows`: the page watched while it is shown, for its table of the key being gone (undone, removed)
  private watching: MutationObserver | undefined;
  private readonly queueGoneCheck: () => void;

  constructor(
    private readonly host: TableHost,
    private readonly options: OverWindowOptions,
  ) {
    this.queueNumbers = oncePerFrame(host.doc, () => this.placeNumbers());
    this.queueGoneCheck = oncePerFrame(host.doc, () => void this.missing());
    this.numbers = [host.floating("div", "swt-over-window-rows"), ...(options.numbersRight ? [host.floating("div", "swt-over-window-rows swt-at-right")] : [])];
    for (const layer of this.numbers) layer.setAttribute("aria-hidden", "true");
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
    for (const layer of this.numbers) layer.remove();
  }

  begin(widget: HTMLElement, info: WidgetInfo): void {
    const other = current.get(this.host.doc);
    if (other && other !== this) other.end();
    // The other's table may have gone with it (the sheet's own drawing): the one that stands for the key now
    if (!widget.isConnected) {
      const now = this.host.widgetForKey(info.key);
      const nowInfo = now && this.host.infoOf(now);
      if (!now || !nowInfo) return;
      widget = now;
      info = nowInfo;
    }
    current.set(this.host.doc, this);
    if (this.shownWidget && this.shownWidget !== widget) this.unmark(this.shownWidget);
    this.shownKey = info.key;
    this.mark(widget);
    this.options.changed();
    this.host.tableResized(info);
  }

  end(): void {
    clearTimeout(this.goneTimer);
    this.goneTimer = undefined;
    if (this.shownKey === undefined && !this.shownWidget) return;
    this.watching?.disconnect();
    this.watching = undefined;
    const widget = this.shownWidget;
    this.shownKey = undefined;
    this.shownWidget = undefined;
    if (current.get(this.host.doc) === this) current.delete(this.host.doc);
    if (widget) this.unmark(widget);
    for (const layer of this.numbers) layer.classList.remove("swt-visible");
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
    this.place = this.widgets().indexOf(widget);
    clearTimeout(this.goneTimer);
    this.goneTimer = undefined;
    widget.classList.add(OVER_WINDOW_CLASS, this.options.className);
    for (const layer of this.numbers) layer.classList.add("swt-visible");
    this.queueNumbers();
    if (this.options.shows && !this.watching) {
      // No layout follows a table removed from the page (an undo): its going is seen in the page itself
      this.watching = new MutationObserver(() => this.queueGoneCheck());
      this.watching.observe(this.host.doc.body, { childList: true, subtree: true });
    }
  }

  /**
   * Whether the table shown so is missing (rendered anew, not enhanced yet; with
   * `shows`, the page's own table of its key gone); missing for GONE_MS, the
   * view ends
   */
  private missing(): boolean {
    if (this.shownKey === undefined) return false;
    const missing = !this.shownWidget?.isConnected || (!!this.options.shows && !this.pageTable());
    if (!missing) return false;
    this.goneTimer ??= setTimeout(() => {
      this.goneTimer = undefined;
      if (this.shownKey === undefined) return;
      const gone = this.options.shows ? !this.pageTable() : !this.shownWidget?.isConnected && !this.host.widgetForKey(this.shownKey);
      if (gone) this.end();
    }, GONE_MS);
    return true;
  }

  /** The page's own table of the key shown (one `shows` does not take), enhanced */
  private pageTable(): boolean {
    const shows = this.options.shows;
    return this.widgets().some((widget) => !shows?.(widget) && widget.isConnected && this.host.infoOf(widget)?.key === this.shownKey);
  }

  private unmark(widget: HTMLElement): void {
    widget.classList.remove(OVER_WINDOW_CLASS, this.options.className);
  }

  private widgets(): HTMLElement[] {
    return Array.from(this.host.doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR));
  }

  // Rendered anew (an edit): the replacement of the table shown over the window shows so at once, before it is laid
  // out: the one starting where the table taken out started (data-pos: an edit in a table does not move its start),
  // else the one in its place among the page's tables (a table before it written too moved its start)
  tableAdded(widget: HTMLElement, table: HTMLTableElement): void {
    const old = this.shownWidget;
    if (this.options.shows) return;
    if (this.shownKey === undefined || !old || old.isConnected || this.guessed?.isConnected) return;
    if (table.dataset.pos !== old.querySelector("table")?.dataset.pos && this.widgets().indexOf(widget) !== this.place) return;
    this.guessed = widget;
    widget.classList.add(OVER_WINDOW_CLASS, this.options.className);
  }

  // Enhanced: shown over the window if it is that table, else not (tableAdded may have guessed wrong)
  enhanced(widget: HTMLElement, info: WidgetInfo): void {
    const shows = this.options.shows?.(widget) ?? true;
    if (info.key === this.shownKey && shows) this.mark(widget);
    else if (widget.classList.contains(this.options.className)) this.unmark(widget);
  }

  /** Another page is in the editor: the table shown so is gone */
  pageLoaded(): void {
    this.end();
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
   * placed by first, then calls placeNumbers). Whether the table shown so is
   * in the page (not while it is rendered anew, nor once it is gone: GONE_MS).
   */
  layoutChanged(numbers = true): boolean {
    if (this.shownKey === undefined) return false;
    if (this.missing() && !this.shownWidget?.isConnected) return false;
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
    // The rows as shown (in their order, their tops going down), from the first in view
    const rows = this.host.shownRows(info).filter((tr) => this.host.rowOf(info, tr) > 0 && tr.isConnected);
    const low = firstRowBelow(rows, top);
    const labels: { readonly text: string; readonly top: number; readonly height: number }[] = [];
    const label = (text: string, rowTop: number, height: number) => labels.push({ text, top: rowTop, height });
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
    // The same numbers in each room
    for (const layer of this.numbers) {
      layer.style.top = `${top}px`;
      layer.style.height = `${Math.max(0, bottom - top)}px`;
      labels.forEach((l, i) => {
        let span = layer.children[i] as HTMLElement | undefined;
        if (!span) {
          span = this.host.doc.createElement("span");
          layer.append(span);
        }
        span.hidden = false;
        span.textContent = l.text;
        span.style.top = `${l.top - top}px`;
        span.style.height = `${l.height}px`;
      });
      for (let i = labels.length; i < layer.children.length; i++) (layer.children[i] as HTMLElement).hidden = true;
    }
  }
}
