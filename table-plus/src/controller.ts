// Enhances SilverBullet's rendered markdown tables in place: sorting, filtering,
// inline cell editing and row/column editing. Every change to the markdown is
// one `editor.replaceRange`, so undo works as for any other edit.
import type { Bridge } from "./bridge.ts";
import {
  caretTextOffset,
  cellText,
  EDITOR_SELECTOR,
  INTERACTIVE_SELECTOR,
  NATIVE_ACTION_SELECTOR,
  positionHint,
  renderedTable,
  UI_CLASS,
  WIDGET_SELECTOR,
} from "./dom.ts";
import {
  type Align,
  cellSourceOffset,
  escapeCell,
  locateBySource,
  locateByShape,
  minimalEdit,
  parseTable,
  serializeTable,
  type Table,
  unescapeCell,
} from "./markdown.ts";
import {
  columnAfterMove,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  setAlign,
  setCell,
} from "./ops.ts";
import {
  cycleSort,
  DEFAULT_VIEW,
  isRearranged,
  remapColumns,
  resetView,
  type ViewState,
  visibleRows,
  withFilter,
  withoutSort,
  withSort,
} from "./view.ts";

type WidgetInfo = {
  readonly table: HTMLTableElement;
  // The table's markdown when it was rendered: the editor only reuses a
  // rendered table while its markdown stays exactly the same
  readonly source: string;
  readonly hint: number;
  readonly key: string;
  readonly columns: number;
};

type ActiveEditor = {
  readonly widget: HTMLElement;
  readonly cell: HTMLTableCellElement;
  readonly row: number;
  readonly column: number;
  readonly original: string;
  readonly textarea: HTMLTextAreaElement;
  readonly kept: DocumentFragment;
};

type CellRef = { readonly row: number; readonly column: number };

type WriteResult = "written" | "unchanged" | "failed";

type MenuItem =
  | { readonly heading: string }
  | {
      readonly label: string;
      readonly run: () => void;
      readonly danger?: boolean;
      readonly checked?: boolean;
    };

const STOPPED_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "paste",
  "cut",
  "copy",
  "compositionstart",
  "compositionupdate",
  "compositionend",
] as const;

const SORT_GLYPH = { asc: "▲", desc: "▼", none: "⇅" } as const;
const MENU_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';
const GRIP_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

const NOT_SAVED = "Table Plus: the table changed in the meantime, nothing was saved";

export class Controller {
  private readonly infos = new WeakMap<HTMLElement, WidgetInfo>();
  private readonly enhancing = new WeakSet<HTMLElement>();
  private readonly views = new Map<string, ViewState>();
  private editor: ActiveEditor | undefined;
  private pendingFocus: (CellRef & { key: string; until: number }) | undefined;
  private hoverWidget: HTMLElement | undefined;
  private hoverCell: HTMLTableCellElement | undefined;
  private menu: HTMLElement | undefined;
  private dragging = false;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private scanQueued = false;
  private warnedIncompatible = false;
  private observer: MutationObserver | undefined;
  private readonly bar: HTMLElement;
  private readonly cellHandle: HTMLButtonElement;
  private readonly rowGrip: HTMLButtonElement;
  private readonly columnGrip: HTMLButtonElement;

  constructor(
    private readonly doc: Document,
    private bridge: Bridge,
  ) {
    this.bar = this.floating("div", "tp-bar");
    this.cellHandle = this.floatingButton("tp-handle", "Row and column actions", MENU_ICON);
    this.rowGrip = this.floatingButton("tp-handle tp-grip", "Drag to move the row", GRIP_ICON);
    this.columnGrip = this.floatingButton(
      "tp-handle tp-grip tp-grip-column",
      "Drag to move the column",
      GRIP_ICON,
    );
  }

  setBridge(bridge: Bridge): void {
    this.bridge = bridge;
  }

  start(): void {
    const win = this.doc.defaultView!;
    win.addEventListener("mousedown", this.onMouseDown, true);
    win.addEventListener("click", this.onClick, true);
    win.addEventListener("dblclick", this.onDoubleClick, true);
    win.addEventListener("scroll", this.onScroll, true);
    win.addEventListener("keydown", this.onKeyDown, true);
    this.doc.addEventListener("mousemove", this.onMouseMove, { passive: true });

    this.cellHandle.addEventListener("click", this.onCellHandleClick);
    this.rowGrip.addEventListener("pointerdown", (e) => this.startDrag(e, "row"));
    this.columnGrip.addEventListener("pointerdown", (e) => this.startDrag(e, "column"));

    this.observer = new MutationObserver(() => this.queueScan());
    this.observer.observe(this.doc.body, { childList: true, subtree: true });
    this.scan();
  }

  // ---- discovering rendered tables --------------------------------------

  private queueScan(): void {
    if (this.scanQueued) return;
    this.scanQueued = true;
    const run = () => {
      this.scanQueued = false;
      this.scan();
    };
    const win = this.doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  /** Enhances every rendered table that is not enhanced yet */
  scan(): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const widget of Array.from(this.doc.querySelectorAll<HTMLElement>(WIDGET_SELECTOR))) {
      const table = renderedTable(widget);
      if (!table || table.rows.length === 0) continue;
      if (this.infos.get(widget)?.table === table || widget.dataset.tpUnsupported) continue;
      pending.push(this.enhance(widget, table));
    }
    return Promise.all(pending).then(() => undefined);
  }

  private async enhance(widget: HTMLElement, table: HTMLTableElement): Promise<void> {
    if (this.enhancing.has(widget)) return;
    this.enhancing.add(widget);
    try {
      const hint = positionHint(table);
      if (hint === undefined) {
        this.markUnsupported(widget, true);
        return;
      }
      const header = table.rows[0]!;
      const shape = {
        rows: table.rows.length,
        columns: header.cells.length,
        headers: Array.from(header.cells).map(cellText),
      };
      const text = await this.bridge.getText();
      if (renderedTable(widget) !== table) return;
      const range = locateByShape(text, hint, shape);
      if (!range) {
        // e.g. a table in a block quote: it stays a plain SilverBullet table
        this.markUnsupported(widget, false);
        return;
      }
      const page = await this.bridge.getCurrentPage();
      const info: WidgetInfo = {
        table,
        source: range.text,
        hint: range.from,
        key: `${page}#${range.ordinal}`,
        columns: shape.columns,
      };
      this.infos.set(widget, info);
      this.decorate(widget, info);
      this.applyView(widget, info);
      this.takePendingFocus(widget, info);
    } catch (e) {
      console.error("Table Plus: could not enhance a table", e);
    } finally {
      this.enhancing.delete(widget);
    }
  }

  private markUnsupported(widget: HTMLElement, incompatible: boolean): void {
    widget.dataset.tpUnsupported = "true";
    if (!incompatible || this.warnedIncompatible) return;
    this.warnedIncompatible = true;
    const message =
      "Table Plus is inactive: this SilverBullet version renders tables differently than expected";
    console.warn(message);
    void this.bridge.flash(message, "error");
  }

  private decorate(widget: HTMLElement, info: WidgetInfo): void {
    widget.classList.add("tp-table");
    const rows = Array.from(info.table.rows);
    rows.slice(1).forEach((tr, i) => {
      tr.dataset.tpRow = String(i + 1);
    });
    Array.from(rows[0]!.cells).forEach((cell, column) => {
      const button = this.doc.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.className = `${UI_CLASS} tp-sort`;
      button.dataset.tpAction = "sort";
      button.dataset.tpColumn = String(column);
      cell.append(button);
    });
  }

  // ---- view: sort and filter --------------------------------------------

  private viewOf(info: WidgetInfo): ViewState {
    return this.views.get(info.key) ?? DEFAULT_VIEW;
  }

  private setView(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    this.views.set(info.key, view);
    this.applyView(widget, info);
  }

  private bodyRows(info: WidgetInfo): HTMLTableRowElement[] {
    return Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]")).sort(
      (a, b) => Number(a.dataset.tpRow) - Number(b.dataset.tpRow),
    );
  }

  private applyView(widget: HTMLElement, info: WidgetInfo): void {
    const view = this.viewOf(info);
    const rows = this.bodyRows(info);
    const values = rows.map((tr) => Array.from(tr.cells).map(cellText));
    const order = visibleRows(values, view);
    const shown = new Set(order);
    const parent = rows[0]?.parentElement;
    if (parent) {
      for (const i of order) parent.append(rows[i]!);
      rows.forEach((tr, i) => {
        tr.classList.toggle("tp-hidden", !shown.has(i));
        if (!shown.has(i)) parent.append(tr);
      });
    }

    const header = info.table.rows[0]!;
    Array.from(header.cells).forEach((cell, column) => {
      const direction = view.sort?.column === column ? view.sort.direction : undefined;
      const button = cell.querySelector<HTMLElement>(".tp-sort");
      if (button) {
        button.textContent = SORT_GLYPH[direction ?? "none"];
        button.classList.toggle("tp-active", !!direction);
        button.title = direction === "asc" ? "Sorted ascending" : direction === "desc" ? "Sorted descending" : "Sort";
      }
      if (direction) cell.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
      else cell.removeAttribute("aria-sort");
    });

    this.applyFilterRow(widget, info, view);
    widget.classList.toggle("tp-rearranged", isRearranged(view));
    if (this.hoverWidget === widget) this.renderBar(widget, info);
  }

  private applyFilterRow(widget: HTMLElement, info: WidgetInfo, view: ViewState): void {
    let row = info.table.querySelector<HTMLTableRowElement>("tr.tp-filter-row");
    if (!view.showFilters) {
      row?.remove();
      return;
    }
    if (!row) {
      row = this.doc.createElement("tr");
      row.className = `${UI_CLASS} tp-filter-row`;
      for (let column = 0; column < info.columns; column++) {
        const cell = this.doc.createElement("td");
        const input = this.doc.createElement("input");
        input.type = "search";
        input.className = "tp-filter";
        input.placeholder = "Filter";
        input.dataset.tpColumn = String(column);
        this.isolate(input);
        input.addEventListener("input", () => {
          const current = this.infos.get(widget);
          if (current) this.setView(widget, current, withFilter(this.viewOf(current), column, input.value));
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            input.blur();
          }
        });
        cell.append(input);
        row.append(cell);
      }
      info.table.rows[0]!.after(row);
    }
    for (const input of Array.from(row.querySelectorAll<HTMLInputElement>("input"))) {
      const value = view.filters[Number(input.dataset.tpColumn)] ?? "";
      if (input.value !== value && this.doc.activeElement !== input) input.value = value;
    }
  }

  // ---- event routing -----------------------------------------------------

  // Keyboard and input events from Table Plus' own fields must not reach the editor
  private isolate(element: HTMLElement): void {
    for (const type of STOPPED_EVENTS) element.addEventListener(type, (e) => e.stopPropagation());
  }

  private enhancedWidgetOf(target: EventTarget | null): [HTMLElement, WidgetInfo] | undefined {
    if (!(target instanceof Element)) return undefined;
    const widget = target.closest<HTMLElement>(WIDGET_SELECTOR);
    const info = widget && this.infos.get(widget);
    return widget && info && renderedTable(widget) === info.table ? [widget, info] : undefined;
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (this.menu && !(e.target instanceof Node && this.menu.contains(e.target))) this.closeMenu();
    if (e.button !== 0) return;
    if (e.altKey) {
      this.onAltMouseDown(e);
      return;
    }
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const target = e.target as Element;
    if (target.closest(NATIVE_ACTION_SELECTOR)) return;
    // Keep SilverBullet from moving the cursor into the table, which shows its markdown
    e.stopPropagation();
    if (target.closest("[data-tp-action]")) {
      e.preventDefault();
      return;
    }
    if (target.closest(".tp-cell-editor, .tp-filter-row") || target.closest(INTERACTIVE_SELECTOR)) {
      return;
    }
    e.preventDefault();
    const cell = target.closest<HTMLTableCellElement>("td, th");
    if (!cell || cell.closest("table") !== info.table || cell.parentElement?.classList.contains("tp-filter-row")) {
      return;
    }
    if (this.editor?.cell === cell) return;
    this.closeMenu();
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    if (this.editor) void this.finishEditing(true, { widget, ...ref });
    else this.openEditor(widget, info, cell);
  };

  /**
   * Alt+click shows the markdown, as in SilverBullet, but with the cursor in
   * the clicked cell instead of at the start of the table
   */
  private onAltMouseDown(e: MouseEvent): void {
    const hit = this.enhancedWidgetOf(e.target);
    const cell = hit && this.tableCellOf(hit[1], e.target);
    if (!hit || !cell) return;
    e.preventDefault();
    e.stopPropagation();
    const info = hit[1];
    if (this.editor) {
      void this.finishEditing(true, undefined, false);
      return;
    }
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    // Within a plain-text cell, the clicked character; otherwise the cell start
    const source = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    const within = cellText(cell) === source ? caretTextOffset(cell, e.clientX, e.clientY) : undefined;
    void this.showMarkdown(info, { ...ref, within: within ?? 0 });
  }

  private tableCellOf(info: WidgetInfo, target: EventTarget | null): HTMLTableCellElement | undefined {
    if (!(target instanceof Element)) return undefined;
    const cell = target.closest<HTMLTableCellElement>("td, th");
    if (!cell || cell.closest("table") !== info.table) return undefined;
    return cell.parentElement?.classList.contains("tp-filter-row") ? undefined : cell;
  }

  private onClick = (e: MouseEvent): void => {
    if (e.altKey) {
      const hit = this.enhancedWidgetOf(e.target);
      if (hit && this.tableCellOf(hit[1], e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const hit = this.enhancedWidgetOf(e.target);
    if (!hit) return;
    const [widget, info] = hit;
    const target = e.target as Element;
    if (target.closest(NATIVE_ACTION_SELECTOR)) return;
    e.stopPropagation();
    const action = target.closest<HTMLElement>("[data-tp-action]");
    if (action?.dataset.tpAction === "sort") {
      e.preventDefault();
      this.setView(widget, info, cycleSort(this.viewOf(info), Number(action.dataset.tpColumn)));
    }
  };

  private onDoubleClick = (e: MouseEvent): void => {
    if (e.altKey) return;
    const hit = this.enhancedWidgetOf(e.target);
    if (hit && !(e.target as Element).closest(NATIVE_ACTION_SELECTOR)) e.stopPropagation();
  };

  private onScroll = (): void => {
    if (this.dragging) return;
    this.closeMenu();
    this.hideFloating();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.menu) {
      e.preventDefault();
      e.stopPropagation();
      this.closeMenu();
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.dragging || this.menu) return;
    const target = e.target;
    if (target instanceof Node && this.isFloating(target)) {
      this.cancelHide();
      return;
    }
    const hit = this.enhancedWidgetOf(target);
    if (!hit) {
      this.scheduleHide();
      return;
    }
    const [widget, info] = hit;
    this.cancelHide();
    if (this.hoverWidget !== widget) {
      this.hoverWidget = widget;
      this.renderBar(widget, info);
    }
    const cell = (target as Element).closest<HTMLTableCellElement>("td, th");
    if (
      !cell ||
      this.editor ||
      cell.closest("table") !== info.table ||
      cell.parentElement?.classList.contains("tp-filter-row")
    ) {
      this.hideHandles();
      return;
    }
    if (cell !== this.hoverCell) this.showHandles(info, cell);
  };

  // ---- cell editing ------------------------------------------------------

  private cellRef(info: WidgetInfo, cell: HTMLTableCellElement): CellRef | undefined {
    const tr = cell.parentElement as HTMLTableRowElement | null;
    if (!tr) return undefined;
    const row = tr === info.table.rows[0] ? 0 : Number(tr.dataset.tpRow);
    return Number.isInteger(row) ? { row, column: cell.cellIndex } : undefined;
  }

  private cellAt(info: WidgetInfo, ref: CellRef): HTMLTableCellElement | undefined {
    const tr =
      ref.row === 0
        ? info.table.rows[0]
        : info.table.querySelector<HTMLTableRowElement>(`tr[data-tp-row="${ref.row}"]`);
    if (!tr || tr.classList.contains("tp-hidden")) return undefined;
    return tr.cells[ref.column];
  }

  private openEditor(widget: HTMLElement, info: WidgetInfo, cell: HTMLTableCellElement): void {
    const ref = this.cellRef(info, cell);
    if (!ref || this.editor) return;
    const original = parseTable(info.source).rows[ref.row]?.cells[ref.column] ?? "";
    const textarea = this.doc.createElement("textarea");
    textarea.className = `${UI_CLASS} tp-cell-editor`;
    textarea.rows = 1;
    textarea.value = unescapeCell(original);
    const kept = this.doc.createDocumentFragment();
    while (cell.firstChild) kept.append(cell.firstChild);
    cell.classList.add("tp-editing");
    cell.append(textarea);
    this.editor = { widget, cell, ...ref, original, textarea, kept };
    this.hideHandles();

    const fit = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    this.isolate(textarea);
    textarea.addEventListener("input", fit);
    textarea.addEventListener("blur", () => {
      // Focus went elsewhere on purpose: save, but leave the focus there
      if (this.editor?.textarea === textarea) void this.finishEditing(true, undefined, false);
    });
    textarea.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        void this.finishEditing(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        void this.finishEditing(true);
      } else if (e.key === "Tab") {
        e.preventDefault();
        void this.step(e.shiftKey ? -1 : 1);
      }
    });
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fit();
  }

  /** Puts the rendered cell back; returns what was being edited */
  private closeEditor(): (ActiveEditor & { value: string }) | undefined {
    const active = this.editor;
    if (!active) return undefined;
    this.editor = undefined;
    const value = escapeCell(active.textarea.value);
    active.textarea.remove();
    active.cell.classList.remove("tp-editing");
    active.cell.append(active.kept);
    return { ...active, value };
  }

  /**
   * Ends editing, saving the cell if asked and changed, then opens `next`
   * (a cell of the same or another table) or hands the keyboard back to the editor.
   */
  private async finishEditing(
    save: boolean,
    next?: CellRef & { widget: HTMLElement },
    refocus = true,
  ): Promise<void> {
    const closed = this.closeEditor();
    if (!closed) return;
    const changed = save && closed.value !== closed.original;
    const sameTable = next?.widget === closed.widget;
    let result: WriteResult = "unchanged";
    if (changed) {
      result = await this.write(
        closed.widget,
        (t) => this.withCellEdit(t, closed),
        sameTable ? next : undefined,
      );
    }
    if (next && (result === "unchanged" || !sameTable)) {
      // The other table was not re-rendered by this edit unless they share text
      const info = this.infos.get(next.widget);
      const cell = info && this.cellAt(info, next);
      if (info && cell) this.openEditor(next.widget, info, cell);
      return;
    }
    if (!next && refocus) this.focusEditor(closed.widget);
  }

  private withCellEdit(
    table: Table,
    edit: { row: number; column: number; original: string; value: string },
  ): Table | undefined {
    if ((table.rows[edit.row]?.cells[edit.column] ?? "") !== edit.original) return undefined;
    return setCell(table, edit.row, edit.column, edit.value);
  }

  /** Tab / Shift+Tab: save and move to the next / previous shown cell */
  private async step(direction: 1 | -1): Promise<void> {
    const active = this.editor;
    const info = active && this.infos.get(active.widget);
    if (!active || !info) return;
    const shown = [
      info.table.rows[0]!,
      ...Array.from(info.table.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")),
    ];
    const rowIndex = shown.indexOf(active.cell.parentElement as HTMLTableRowElement);
    let r = rowIndex;
    let column = active.column + direction;
    if (column >= info.columns) {
      column = 0;
      r++;
    } else if (column < 0) {
      column = info.columns - 1;
      r--;
    }
    if (r < 0) {
      await this.finishEditing(true);
      return;
    }
    const target = shown[r];
    if (target) {
      const ref = this.cellRef(info, target.cells[column] ?? target.cells[0]!);
      if (ref) await this.finishEditing(true, { widget: active.widget, ...ref });
      return;
    }
    // Tab on the last cell adds a row
    const closed = this.closeEditor()!;
    const rowsBefore = parseTable(info.source).rows.length;
    await this.write(
      closed.widget,
      (t) => {
        const edited = closed.value !== closed.original ? this.withCellEdit(t, closed) : t;
        return edited && insertRow(edited, edited.rows.length);
      },
      { row: rowsBefore, column: 0 },
    );
  }

  private takePendingFocus(widget: HTMLElement, info: WidgetInfo): void {
    const pending = this.pendingFocus;
    if (!pending || pending.key !== info.key) return;
    this.pendingFocus = undefined;
    if (Date.now() > pending.until || this.editor) return;
    const cell = this.cellAt(info, pending);
    if (cell) this.openEditor(widget, info, cell);
  }

  private focusEditor(widget: HTMLElement): void {
    widget.closest<HTMLElement>(EDITOR_SELECTOR)?.focus({ preventScroll: true });
  }

  // ---- writing markdown --------------------------------------------------

  /**
   * Re-reads the table from the page, applies `change` and writes the result
   * back as one edit. `change` returns undefined to abort.
   */
  private async write(
    widget: HTMLElement,
    change: (table: Table) => Table | undefined,
    focus?: CellRef,
    columnMap?: (column: number) => number | undefined,
  ): Promise<WriteResult> {
    const info = this.infos.get(widget);
    if (!info) return "failed";
    try {
      const text = await this.bridge.getText();
      const range = locateBySource(text, info.hint, info.source);
      const changed = range && change(parseTable(range.text));
      if (!range || !changed) {
        void this.bridge.flash(NOT_SAVED, "error");
        return "failed";
      }
      const markdown = serializeTable(changed);
      if (markdown === range.text) return "unchanged";
      if (columnMap) this.views.set(info.key, remapColumns(this.viewOf(info), columnMap));
      if (focus) this.pendingFocus = { key: info.key, ...focus, until: Date.now() + 3000 };
      const edit = minimalEdit(range.text, markdown);
      await this.bridge.replaceRange(range.from + edit.from, range.from + edit.to, edit.insert);
      return "written";
    } catch (e) {
      this.pendingFocus = undefined;
      console.error("Table Plus: could not save the table", e);
      void this.bridge.flash(`Table Plus: could not save the table (${String(e)})`, "error");
      return "failed";
    }
  }

  /** Shows the table's markdown by moving the cursor into it: to its start, or into a cell */
  private async showMarkdown(
    info: WidgetInfo,
    at?: CellRef & { within: number },
  ): Promise<void> {
    const range = locateBySource(await this.bridge.getText(), info.hint, info.source);
    if (!range) {
      void this.bridge.flash(NOT_SAVED.replace(", nothing was saved", ""), "error");
      return;
    }
    this.hideFloating();
    this.closeMenu();
    const offset = at ? cellSourceOffset(range.text, at.row, at.column, at.within) : 0;
    await this.bridge.moveCursor(range.from + offset);
  }

  // ---- floating UI: toolbar, handles, menu, drag -------------------------

  private floating<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
  ): HTMLElementTagNameMap[K] {
    const element = this.doc.createElement(tag);
    element.className = `tp-floating ${className}`;
    element.addEventListener("mousedown", (e) => {
      // keep the focus where it is (e.g. in a filter field)
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
    this.doc.body.append(element);
    return element;
  }

  private floatingButton(className: string, title: string, icon: string): HTMLButtonElement {
    const button = this.floating("button", className);
    button.type = "button";
    button.tabIndex = -1;
    button.title = title;
    button.innerHTML = icon;
    return button;
  }

  private isFloating(node: Node): boolean {
    return (
      [this.bar, this.cellHandle, this.rowGrip, this.columnGrip].some((el) => el.contains(node)) ||
      !!this.menu?.contains(node)
    );
  }

  private place(element: HTMLElement, left: number, top: number): void {
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
    element.classList.add("tp-visible");
  }

  private cancelHide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  private scheduleHide(): void {
    if (!this.hoverWidget || this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.hideFloating();
    }, 300);
  }

  private hideHandles(): void {
    for (const el of [this.cellHandle, this.rowGrip, this.columnGrip]) el.classList.remove("tp-visible");
    this.hoverCell = undefined;
  }

  private hideFloating(): void {
    this.hideHandles();
    this.bar.classList.remove("tp-visible");
    this.hoverWidget = undefined;
  }

  private renderBar(widget: HTMLElement, info: WidgetInfo): void {
    const view = this.viewOf(info);
    const bar = this.bar;
    bar.replaceChildren();
    if (isRearranged(view)) {
      const rows = this.bodyRows(info);
      const shown = rows.filter((tr) => !tr.classList.contains("tp-hidden")).length;
      const status = this.doc.createElement("span");
      status.className = "tp-status";
      const parts: string[] = [];
      if (view.sort) {
        const name = cellText(info.table.rows[0]!.cells[view.sort.column]!) || `column ${view.sort.column + 1}`;
        parts.push(`Sorted by ${name} ${view.sort.direction === "asc" ? "↑" : "↓"}`);
      }
      if (shown !== rows.length) parts.push(`${shown} of ${rows.length} rows`);
      status.textContent = parts.join(" · ");
      bar.append(status);
    }
    const button = (label: string, title: string, run: () => void, pressed?: boolean) => {
      const b = this.doc.createElement("button");
      b.type = "button";
      b.tabIndex = -1;
      b.textContent = label;
      b.title = title;
      if (pressed !== undefined) b.setAttribute("aria-pressed", String(pressed));
      b.addEventListener("click", (e) => {
        e.preventDefault();
        run();
      });
      bar.append(b);
    };
    button("Filter", "Show or hide the filter row", () => {
      // Hidden filters would hide rows without a visible reason, so hiding clears them
      const current = this.viewOf(info);
      this.setView(
        widget,
        info,
        current.showFilters
          ? { ...current, filters: [], showFilters: false }
          : { ...current, showFilters: true },
      );
    }, view.showFilters);
    if (isRearranged(view)) {
      button("Original order", "Clear sorting and filters: show the rows as written", () =>
        this.setView(widget, info, resetView(this.viewOf(info))),
      );
    }
    button("Edit markdown", "Show this table as markdown", () => void this.showMarkdown(info));

    const rect = widget.getBoundingClientRect();
    bar.classList.add("tp-visible");
    const height = bar.offsetHeight;
    const width = bar.offsetWidth;
    const above = rect.top - height - 14;
    this.place(bar, Math.max(4, rect.right - width), above >= 4 ? above : rect.bottom + 4);
  }

  private showHandles(info: WidgetInfo, cell: HTMLTableCellElement): void {
    this.hoverCell = cell;
    const tr = cell.parentElement as HTMLTableRowElement;
    const cellRect = cell.getBoundingClientRect();
    const tableRect = info.table.getBoundingClientRect();
    // Centered on the cell's right border, over the padding, so it covers no text
    this.place(this.cellHandle, cellRect.right - 9, cellRect.top + (cellRect.height - 18) / 2);

    const rearranged = isRearranged(this.viewOf(info));
    if (tr !== info.table.rows[0] && !rearranged) {
      const rowRect = tr.getBoundingClientRect();
      this.place(this.rowGrip, tableRect.left - 20, rowRect.top + (rowRect.height - 18) / 2);
    } else {
      this.rowGrip.classList.remove("tp-visible");
    }
    const headerCell = info.table.rows[0]!.cells[cell.cellIndex];
    if (headerCell) {
      const h = headerCell.getBoundingClientRect();
      this.place(this.columnGrip, h.left + (h.width - 18) / 2, h.top - 9);
    }
  }

  private onCellHandleClick = (e: MouseEvent): void => {
    e.preventDefault();
    const cell = this.hoverCell;
    const hit = cell && this.enhancedWidgetOf(cell);
    if (!cell || !hit) return;
    const [widget, info] = hit;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    const rect = this.cellHandle.getBoundingClientRect();
    this.openMenu(widget, info, ref, rect.right, rect.bottom + 2);
  };

  private menuItems(widget: HTMLElement, info: WidgetInfo, ref: CellRef): MenuItem[] {
    const { row, column } = ref;
    const rows = parseTable(info.source).rows.length;
    const view = this.viewOf(info);
    const rearranged = isRearranged(view);
    const header = row === 0;
    const run =
      (change: (t: Table) => Table | undefined, focus?: CellRef, columnMap?: (c: number) => number | undefined) =>
      () => {
        this.closeMenu();
        void this.write(widget, change, focus, columnMap);
      };
    const items: (MenuItem | false)[] = [
      { heading: "Row" },
      !header && { label: "Insert row above", run: run((t) => insertRow(t, row), { row, column }) },
      { label: "Insert row below", run: run((t) => insertRow(t, row + 1), { row: row + 1, column }) },
      !header && !rearranged && row > 1 && { label: "Move row up", run: run((t) => moveRow(t, row, row - 1)) },
      !header &&
        !rearranged &&
        row < rows - 1 && { label: "Move row down", run: run((t) => moveRow(t, row, row + 1)) },
      !header && { label: "Delete row", danger: true, run: run((t) => deleteRow(t, row)) },
      { heading: "Column" },
      {
        label: "Insert column left",
        run: run((t) => insertColumn(t, column), { row: 0, column }, (c) => (c >= column ? c + 1 : c)),
      },
      {
        label: "Insert column right",
        run: run((t) => insertColumn(t, column + 1), { row: 0, column: column + 1 }, (c) =>
          c > column ? c + 1 : c,
        ),
      },
      column > 0 && {
        label: "Move column left",
        run: run((t) => moveColumn(t, column, column - 1), undefined, (c) => columnAfterMove(c, column, column - 1)),
      },
      column < info.columns - 1 && {
        label: "Move column right",
        run: run((t) => moveColumn(t, column, column + 1), undefined, (c) => columnAfterMove(c, column, column + 1)),
      },
      info.columns > 1 && {
        label: "Delete column",
        danger: true,
        run: run((t) => deleteColumn(t, column), undefined, (c) => (c === column ? undefined : c > column ? c - 1 : c)),
      },
      { heading: "Sort (view only)" },
      {
        label: "Sort ascending",
        checked: view.sort?.column === column && view.sort.direction === "asc",
        run: () => {
          this.closeMenu();
          this.setView(widget, info, withSort(this.viewOf(info), column, "asc"));
        },
      },
      {
        label: "Sort descending",
        checked: view.sort?.column === column && view.sort.direction === "desc",
        run: () => {
          this.closeMenu();
          this.setView(widget, info, withSort(this.viewOf(info), column, "desc"));
        },
      },
      !!view.sort && {
        label: "Original order",
        run: () => {
          this.closeMenu();
          this.setView(widget, info, withoutSort(this.viewOf(info)));
        },
      },
      { heading: "Align column" },
    ];
    const current = parseTable(info.source).align[column] ?? "";
    const aligns: [string, Align][] = [
      ["Default", ""],
      ["Left", "left"],
      ["Center", "center"],
      ["Right", "right"],
    ];
    for (const [label, align] of aligns) {
      items.push({ label, checked: align === current, run: run((t) => setAlign(t, column, align)) });
    }
    return items.filter((item): item is MenuItem => !!item);
  }

  private openMenu(widget: HTMLElement, info: WidgetInfo, ref: CellRef, x: number, y: number): void {
    this.closeMenu();
    const menu = this.floating("div", "tp-menu");
    menu.setAttribute("role", "menu");
    for (const item of this.menuItems(widget, info, ref)) {
      if ("heading" in item) {
        const heading = this.doc.createElement("div");
        heading.className = "tp-menu-heading";
        heading.textContent = item.heading;
        menu.append(heading);
        continue;
      }
      const button = this.doc.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = item.label;
      if (item.danger) button.classList.add("tp-danger");
      if (item.checked) button.classList.add("tp-checked");
      button.addEventListener("click", (e) => {
        e.preventDefault();
        item.run();
      });
      menu.append(button);
    }
    this.menu = menu;
    const win = this.doc.defaultView!;
    menu.classList.add("tp-visible");
    const rect = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(x - rect.width, win.innerWidth - rect.width - 4));
    const top = y + rect.height > win.innerHeight - 4 ? Math.max(4, y - rect.height - 24) : y;
    this.place(menu, left, top);
    this.cellHandle.classList.add("tp-visible");
  }

  private closeMenu(): void {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = undefined;
    this.hideHandles();
  }

  private startDrag(e: PointerEvent, axis: "row" | "column"): void {
    const cell = this.hoverCell;
    const hit = cell && this.enhancedWidgetOf(cell);
    if (e.button !== 0 || !cell || !hit) return;
    e.preventDefault();
    const [widget, info] = hit;
    const ref = this.cellRef(info, cell);
    if (!ref) return;
    if (axis === "row" && (ref.row === 0 || isRearranged(this.viewOf(info)))) return;
    const from = axis === "row" ? ref.row : ref.column;
    const table = info.table;
    const header = table.rows[0]!;
    const bodyRows = this.bodyRows(info);
    const carried =
      axis === "row"
        ? [cell.parentElement as HTMLElement]
        : [header, ...bodyRows].map((tr) => tr.cells[from]).filter((c): c is HTMLTableCellElement => !!c);
    carried.forEach((el) => el.classList.add("tp-dragged"));
    const line = this.floating("div", "tp-drop tp-visible");
    this.doc.body.classList.add("tp-dragging");
    this.dragging = true;
    let slot = from;

    // A slot is "before item i"; the item count means "at the end"
    const move = (ev: PointerEvent) => {
      const tableRect = table.getBoundingClientRect();
      if (axis === "row") {
        slot = bodyRows.length + 1;
        for (let i = 0; i < bodyRows.length; i++) {
          const r = bodyRows[i]!.getBoundingClientRect();
          if (ev.clientY < r.top + r.height / 2) {
            slot = i + 1;
            break;
          }
        }
        const y = slot <= bodyRows.length ? bodyRows[slot - 1]!.getBoundingClientRect().top : tableRect.bottom;
        Object.assign(line.style, {
          left: `${tableRect.left}px`,
          top: `${y - 1}px`,
          width: `${tableRect.width}px`,
          height: "2px",
        });
      } else {
        const cells = Array.from(header.cells);
        slot = cells.length;
        for (let i = 0; i < cells.length; i++) {
          const r = cells[i]!.getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) {
            slot = i;
            break;
          }
        }
        const x = slot < cells.length ? cells[slot]!.getBoundingClientRect().left : tableRect.right;
        Object.assign(line.style, {
          left: `${x - 1}px`,
          top: `${tableRect.top}px`,
          width: "2px",
          height: `${tableRect.height}px`,
        });
      }
    };
    const win = this.doc.defaultView!;
    const finish = (commit: boolean) => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", up);
      win.removeEventListener("keydown", escape, true);
      carried.forEach((el) => el.classList.remove("tp-dragged"));
      line.remove();
      this.doc.body.classList.remove("tp-dragging");
      this.dragging = false;
      this.hideHandles();
      const to = slot > from ? slot - 1 : slot;
      if (!commit || to === from) return;
      if (axis === "row") void this.write(widget, (t) => moveRow(t, from, to));
      else void this.write(widget, (t) => moveColumn(t, from, to), undefined, (c) => columnAfterMove(c, from, to));
    };
    const up = () => finish(true);
    const escape = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };
    move(e);
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
    win.addEventListener("keydown", escape, true);
  }
}
