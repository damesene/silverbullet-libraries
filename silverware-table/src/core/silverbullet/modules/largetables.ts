// The largeTables module: a table with many rows (silverware.table.modules.largeTables.minRows)
// scrolls in a box of its own (the Maximum table height setting, else the
// window's height), and only the rows in and around its view are in the
// document; the others are kept out of it, in their order, with an empty row
// above and below standing in for their height. The browser then lays out a
// few dozen rows, not thousands, each time the table is rendered (every edit).
//
// SilverBullet renders every row: the rows past the first ones are taken out
// as soon as the table is put into the page (tableAdded, before the browser
// lays it out), and the core keeps them all (bodyRows, shownRows, cellAt), so
// the other modules read them as before. The view's rows are placed here
// (placeRows), as the box scrolls, and put back when a row is needed
// (rowNeeded: a cell edited or selected out of view).
import { SETTINGS } from "../../../bridge.ts";
import { type AdapterFeature, type TableHost, tablePartsOf, type WidgetInfo } from "../../feature.ts";
import { UI_CLASS } from "../../../dom.ts";
import type { TableKey } from "../../tables.ts";

const LARGE_CLASS = "swt-large-table";
const SPACER_CLASS = "swt-large-spacer";
// Rows placed above and below the ones in view, so a scroll by a little needs no new rows
const MARGIN_ROWS = 30;
// A row's height before any was measured (a line of text with the cell's padding)
const ROW_HEIGHT = 36;

type State = {
  readonly widget: HTMLElement;
  readonly table: HTMLTableElement;
  key: TableKey | undefined;
  info: WidgetInfo | undefined;
  // The body rows shown, in their order (the view's), and those of them in the document
  shown: readonly HTMLTableRowElement[];
  from: number;
  to: number;
  rowHeight: number;
  readonly above: HTMLTableRowElement;
  readonly below: HTMLTableRowElement;
  // Between a row held in the document (a row being dragged) out of the rows in view and those
  readonly between: HTMLTableRowElement;
  queued: boolean;
  widthsKept: boolean;
};

/**
 * What a table keeps across its renderings (the module's part for it,
 * core/parts.ts): where its box was scrolled to and its rows' height as
 * measured, so the same scroll shows the same rows once it is rendered anew
 */
class LargeTable {
  scrollTop: number | undefined;
  rowHeight: number | undefined;
}

export class LargeTables implements AdapterFeature {
  private minRows: number = SETTINGS.largeTablesMinRows.default;
  private maxHeight = 0;
  private readonly states = new WeakMap<HTMLTableElement, State>();
  readonly tableParts = tablePartsOf(LargeTable, () => new LargeTable());
  // The height last measured, for a table not measured yet
  private lastHeight = ROW_HEIGHT;

  constructor(private readonly host: TableHost) {}

  /** What a table keeps across its renderings */
  private kept(key: TableKey): LargeTable | undefined {
    return this.host.tablePart<LargeTable>(this, key);
  }

  start(): void {
    void this.readSettings();
  }

  enhanced(): void {
    void this.readSettings();
  }

  private async readSettings(): Promise<void> {
    this.minRows = await this.host.setting("largeTablesMinRows");
    this.maxHeight = await this.host.setting("maxHeight");
  }

  // ---- taking the rows out before the browser lays the table out ------------------

  tableAdded(widget: HTMLElement, table: HTMLTableElement, rows: readonly HTMLTableRowElement[]): void {
    // The header, the body rows (and maybe a metadata row)
    const body = table.tBodies[0];
    if (!body || rows.length - 1 < this.minRows) return;
    const state = this.stateOf(widget, table);
    widget.classList.add(LARGE_CLASS);
    // The first rows only, the rest out of the document until the view places them
    const count = this.rowsInView(state);
    const bodyRows = rows.slice(1);
    state.shown = bodyRows;
    state.from = 0;
    state.to = Math.min(bodyRows.length, count);
    for (const tr of bodyRows.slice(state.to)) tr.remove();
    this.setSpacers(state);
    body.prepend(state.above);
    body.append(state.below);
  }

  private stateOf(widget: HTMLElement, table: HTMLTableElement): State {
    let state = this.states.get(table);
    if (state) return state;
    const spacer = () => {
      const tr = this.host.doc.createElement("tr");
      tr.className = `${UI_CLASS} ${SPACER_CLASS}`;
      tr.setAttribute("aria-hidden", "true");
      const td = this.host.doc.createElement("td");
      td.colSpan = Math.max(1, table.rows[0]?.cells.length ?? 1);
      tr.append(td);
      return tr;
    };
    state = {
      widget,
      table,
      key: undefined,
      info: undefined,
      shown: [],
      from: 0,
      to: 0,
      rowHeight: this.lastHeight,
      above: spacer(),
      below: spacer(),
      between: spacer(),
      queued: false,
      widthsKept: false,
    };
    this.states.set(table, state);
    widget.addEventListener("scroll", () => this.scrolled(state!), { passive: true });
    return state;
  }

  /** How many rows a view of the box holds, with the margins above and below */
  private rowsInView(state: State): number {
    // No layout read: the window's height, else the box's maximum height (neither needs the table laid out)
    const win = this.host.doc.defaultView!;
    const box = this.maxHeight > 0 ? Math.min(this.maxHeight, win.innerHeight) : win.innerHeight;
    return Math.ceil(box / state.rowHeight) + 2 * MARGIN_ROWS;
  }

  private setSpacers(state: State): void {
    const height = (rows: number) => `${Math.round(rows * state.rowHeight)}px`;
    (state.above.cells[0] as HTMLElement).style.height = height(state.from);
    (state.below.cells[0] as HTMLElement).style.height = height(state.shown.length - state.to);
    state.above.hidden = state.from === 0;
    state.below.hidden = state.to >= state.shown.length;
  }

  // ---- placing the rows of the view -------------------------------------------------

  placeRows(widget: HTMLElement, info: WidgetInfo, body: HTMLTableSectionElement, shown: readonly HTMLTableRowElement[]): boolean {
    if (this.host.bodyRows(info).length < this.minRows) return false;
    const state = this.stateOf(widget, info.table);
    widget.classList.add(LARGE_CLASS);
    // Rendered anew: the rows' height measured before, so the scroll shows the same rows
    const kept = this.kept(info.key);
    if (state.key === undefined) state.rowHeight = kept?.rowHeight ?? state.rowHeight;
    state.key = info.key;
    state.info = info;
    state.shown = shown;
    // Where the box was scrolled to before the table was rendered anew (the core scrolls it back there)
    const top = kept?.scrollTop ?? widget.scrollTop;
    this.windowAt(state, Math.floor(top / state.rowHeight));
    this.place(state, body);
    return true;
  }

  /** The rows from `first` (the first in view) and the margins around them */
  private windowAt(state: State, first: number): void {
    const count = this.rowsInView(state);
    state.from = Math.max(0, Math.min(first - MARGIN_ROWS, state.shown.length - count));
    state.to = Math.min(state.shown.length, state.from + count);
  }

  private place(state: State, body = state.table.tBodies[0]): void {
    if (!body) return;
    const before = new Set(Array.from(body.rows));
    const rows = state.shown.slice(state.from, state.to);
    this.setSpacers(state);
    // A row held in the document (being dragged) out of those in view: in its place, empty rows standing in for the others around it
    const held = state.info && this.host.heldInDocument(state.info);
    const at = held ? state.shown.indexOf(held) : -1;
    const height = (count: number) => `${Math.round(Math.max(0, count) * state.rowHeight)}px`;
    if (at >= 0 && at < state.from) {
      (state.above.cells[0] as HTMLElement).style.height = height(at);
      (state.between.cells[0] as HTMLElement).style.height = height(state.from - at - 1);
      state.above.hidden = at === 0;
      body.replaceChildren(state.above, held!, state.between, ...rows, state.below);
    } else if (at >= state.to) {
      (state.between.cells[0] as HTMLElement).style.height = height(at - state.to);
      (state.below.cells[0] as HTMLElement).style.height = height(state.shown.length - at - 1);
      state.below.hidden = at === state.shown.length - 1;
      body.replaceChildren(state.above, ...rows, state.between, held!, state.below);
    } else body.replaceChildren(state.above, ...rows, state.below);
    const attached = rows.filter((tr) => !before.has(tr));
    if (state.info && attached.length) this.host.rowsAttached(state.info, attached);
    this.queueMeasure(state);
  }

  private scrolled(state: State): void {
    const kept = state.key && this.kept(state.key);
    if (kept) kept.scrollTop = state.widget.scrollTop;
    if (state.queued) return;
    state.queued = true;
    const win = this.host.doc.defaultView!;
    win.requestAnimationFrame(() => {
      state.queued = false;
      if (!state.widget.isConnected) return;
      const first = Math.floor(state.widget.scrollTop / state.rowHeight);
      const last = first + Math.ceil(state.widget.clientHeight / state.rowHeight);
      // Still within the rows placed, with some margin left (or the table's own end): nothing to do
      const roomAbove = state.from === 0 || first - state.from >= MARGIN_ROWS / 3;
      const roomBelow = state.to >= state.shown.length || state.to - last >= MARGIN_ROWS / 3;
      if (roomAbove && roomBelow) return;
      this.windowAt(state, first);
      this.place(state);
    });
  }

  /**
   * Once laid out: the rows' real height for the empty rows standing in for
   * the others, and the columns' widths kept, so they do not change as other
   * rows come into the document while the box scrolls
   */
  private queueMeasure(state: State): void {
    const win = this.host.doc.defaultView!;
    win.requestAnimationFrame(() => {
      if (!state.widget.isConnected) return;
      const rows = state.shown.slice(state.from, state.to).filter((tr) => tr.isConnected);
      const first = rows[0];
      const last = rows[rows.length - 1];
      if (first && last && rows.length > 1) {
        const height = (last.getBoundingClientRect().bottom - first.getBoundingClientRect().top) / rows.length;
        if (height > 0 && Math.abs(height - state.rowHeight) > 0.01) {
          // The rows in view stay where they are: the empty row above them changes its height, the scroll as much
          const above = state.from * state.rowHeight;
          state.rowHeight = height;
          this.setSpacers(state);
          if (state.from > 0) state.widget.scrollTop += state.from * height - above;
        }
        if (height > 0) {
          this.lastHeight = height;
          const kept = state.key && this.kept(state.key);
          if (kept) kept.rowHeight = height;
        }
      }
      if (!state.widthsKept) {
        state.widthsKept = true;
        const header = state.table.rows[0];
        const widths = Array.from(header?.cells ?? [], (cell) => cell.getBoundingClientRect().width);
        Array.from(header?.cells ?? []).forEach((cell, i) => {
          if (!cell.style.minWidth && widths[i]) cell.style.minWidth = `${Math.round(widths[i]!)}px`;
        });
      }
    });
  }

  rowNeeded(info: WidgetInfo, row: HTMLTableRowElement): void {
    const state = this.states.get(info.table);
    const at = state ? state.shown.indexOf(row) : -1;
    if (!state || at < 0) return;
    this.windowAt(state, at - Math.floor(this.rowsInView(state) / 2) + MARGIN_ROWS);
    this.place(state);
  }
}
