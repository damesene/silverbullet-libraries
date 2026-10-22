// The fullScreen module: a toolbar icon shows the table over the whole window
// (not the browser's full screen); the same icon (Exit full screen) or Esc
// closes it. The table stays where SilverBullet rendered it; CSS
// (swt-fullscreen) lays its box over the window, so its scroll, sticky header
// and Silverware Table's controls work as in a table with its own box. SilverBullet
// renders the table anew after every edit: the table shown so (by its key) is
// shown so again, at once when it is put into the page (before it is laid
// out), confirmed once it is enhanced.
//
// The room above the header and left of the rows (for the toolbar, the grips
// and the +) shows the columns' letters and the rows' numbers, as formulas
// count them (A1: the first row under the header). The letters are in the
// header's cells (CSS puts them above), so they move with it; the numbers are
// a layer over the room at the left, placed by the rows shown after each
// scroll (in the frame the core updates what follows the layout).
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { oncePerFrame } from "../core/frame.ts";
import { OUT_OF_LINE_CLASS, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";
import { columnLetters } from "../formulas/index.ts";
import { ICONS } from "../icons.ts";

const FULL_CLASS = "swt-fullscreen";
const OPEN_CLASS = "swt-fullscreen-open";
const LETTER_CLASS = "swt-col-letter";

export class FullScreen implements Feature {
  // The table shown over the window (its key) and its widget as rendered now
  private key: string | undefined;
  private widget: HTMLElement | undefined;
  // The table rendered anew taken for it before it was enhanced (tableAdded)
  private guessed: HTMLElement | undefined;
  // The rows' numbers, over the room left of the rows
  private readonly numbers: HTMLElement;
  private readonly queueNumbers: () => void;

  constructor(private readonly host: TableHost) {
    this.queueNumbers = oncePerFrame(host.doc, () => this.placeNumbers());
    this.numbers = host.floating("div", "swt-fullscreen-rows");
    this.numbers.setAttribute("aria-hidden", "true");
  }

  stop(): void {
    this.end();
    this.numbers.remove();
  }

  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const on = this.key === info.key;
    return [
      {
        label: on ? "Exit full screen" : "Full screen",
        title: on ? "Show the table in the page again (Esc)" : "Show the table over the whole window",
        place: "icon",
        icon: on ? ICONS.exitFullScreen : ICONS.fullScreen,
        pressed: on,
        run: () => (on ? this.end() : this.begin(widget, info)),
      },
    ];
  }

  // Each header cell's letter (shown only over the window, by the CSS)
  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    Array.from(info.table.rows[0]?.cells ?? []).forEach((cell, column) => {
      if (cell.querySelector(`:scope > .${LETTER_CLASS}`)) return;
      const letter = this.host.doc.createElement("span");
      letter.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} ${LETTER_CLASS}`;
      letter.setAttribute("aria-hidden", "true");
      letter.textContent = columnLetters(column);
      cell.append(letter);
    });
  }

  private begin(widget: HTMLElement, info: WidgetInfo): void {
    if (this.widget && this.widget !== widget) this.unmark(this.widget);
    this.key = info.key;
    this.mark(widget);
    this.host.toolbarChanged();
    this.host.tableResized(info);
  }

  private end(): void {
    const widget = this.widget;
    this.key = undefined;
    this.widget = undefined;
    if (widget) this.unmark(widget);
    this.host.doc.body.classList.remove(OPEN_CLASS);
    this.numbers.classList.remove("swt-visible");
    this.host.toolbarChanged();
    const info = widget && this.host.infoOf(widget);
    if (info) this.host.tableResized(info);
  }

  private mark(widget: HTMLElement): void {
    this.widget = widget;
    widget.classList.add(FULL_CLASS);
    this.host.doc.body.classList.add(OPEN_CLASS);
    this.numbers.classList.add("swt-visible");
    this.queueNumbers();
  }

  private unmark(widget: HTMLElement): void {
    widget.classList.remove(FULL_CLASS);
  }

  // Rendered anew (an edit): the replacement of the table shown over the window shows so at once, before it is laid out
  // (the one starting where the table taken out started, data-pos: an edit in a table does not move its start;
  // the page may render every table anew)
  tableAdded(widget: HTMLElement, table: HTMLTableElement): void {
    const old = this.widget;
    if (this.key === undefined || !old || old.isConnected || this.guessed?.isConnected) return;
    if (table.dataset.pos !== old.querySelector("table")?.dataset.pos) return;
    this.guessed = widget;
    widget.classList.add(FULL_CLASS);
  }

  // Enhanced: shown over the window if it is that table, else not (tableAdded may have guessed wrong)
  enhanced(widget: HTMLElement, info: WidgetInfo): void {
    if (info.key === this.key) this.mark(widget);
    else if (widget.classList.contains(FULL_CLASS)) this.unmark(widget);
    // The table shown so is gone from the page (another page opened): it ends
    if (this.key !== undefined && this.widget && !this.widget.isConnected && !this.host.widgetForKey(this.key)) this.end();
  }

  // Its rows sorted, filtered or put back into the document: their numbers follow
  viewApplied(widget: HTMLElement): void {
    if (widget === this.widget) this.queueNumbers();
  }

  rowsAttached(info: WidgetInfo): void {
    if (info.table === this.widget?.querySelector("table")) this.queueNumbers();
  }

  // Esc closes it, unless something else takes the key first (a cell editor, a selection, a field, a menu)
  keyDown(e: KeyboardEvent): boolean {
    if (e.key !== "Escape" || this.key === undefined || this.host.editing) return false;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return false;
    e.preventDefault();
    e.stopPropagation();
    this.end();
    return true;
  }

  // After a scroll or a change of the layout (in a frame): the numbers follow the rows; another page shown: it ends
  layoutChanged(): void {
    if (this.key === undefined) return;
    if (!this.widget?.isConnected && !this.host.doc.querySelector(`${WIDGET_SELECTOR}.${FULL_CLASS}`)) {
      this.end();
      return;
    }
    this.placeNumbers();
  }

  /** A number beside each row in view, below the header (held or not), above the box's bottom */
  private placeNumbers(): void {
    const widget = this.widget;
    const info = widget?.isConnected ? this.host.infoOf(widget) : undefined;
    if (!widget || !info) return;
    const top = info.table.rows[0]!.getBoundingClientRect().bottom;
    const bottom = this.host.innerBox(widget).bottom;
    const layer = this.numbers;
    layer.style.top = `${top}px`;
    layer.style.height = `${Math.max(0, bottom - top)}px`;
    // The rows as shown (in their order, their tops going down): the first in view found by halving
    const rows = this.host.shownRows(info).filter((tr) => this.host.rowOf(info, tr) > 0 && tr.isConnected);
    let low = 0;
    let high = rows.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (rows[mid]!.getBoundingClientRect().bottom <= top) low = mid + 1;
      else high = mid;
    }
    let shown = 0;
    for (let i = low; i < rows.length; i++) {
      const rect = rows[i]!.getBoundingClientRect();
      if (rect.top >= bottom) break;
      let label = layer.children[shown] as HTMLElement | undefined;
      if (!label) {
        label = this.host.doc.createElement("span");
        layer.append(label);
      }
      label.hidden = false;
      label.textContent = String(this.host.rowOf(info, rows[i]!));
      label.style.top = `${rect.top - top}px`;
      label.style.height = `${rect.height}px`;
      shown++;
    }
    for (let i = shown; i < layer.children.length; i++) (layer.children[i] as HTMLElement).hidden = true;
  }
}
