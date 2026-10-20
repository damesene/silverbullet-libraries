// The widths module: a column's width is set by dragging the right edge of its
// header (a handle there), reset to automatic by double-clicking it or with
// "Auto width" in its menu. With the metadata setting it is stored in the
// table (width.price="180", meta.ts), which follows the column through renames
// and moves (metadataAfterEdit); without it, it holds for the view only.
// "Reset column widths" in the table's menu makes every column automatic.
//
// While dragging, the width is the width at the press plus how far the pointer
// moved since, never measured again: a scrollbar showing or going, or the
// table moving as it gets narrower, cannot feed back into it.
import type { Feature, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { OUT_OF_LINE_CLASS, UI_CLASS } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { columnMeta, withColumnMeta } from "../meta.ts";

// The narrowest a column can be dragged to, in pixels
const MIN_WIDTH = 40;

export class Widths implements Feature {
  // Widths set for the view only (no metadata stored), by table and column; undefined: automatic
  private readonly viewed = new Map<string, Map<number, number | undefined>>();
  private drag:
    | { readonly key: string; readonly column: number; readonly startX: number; readonly startWidth: number; readonly padding: number; width: number }
    | undefined;
  private stopDrag: (() => void) | undefined;

  constructor(private readonly host: TableHost) {}

  stop(): void {
    this.stopDrag?.();
  }

  pointerBusy(): "drag" | undefined {
    return this.drag ? "drag" : undefined;
  }

  /** The widths of a table's columns: those set for the view, else those stored */
  private widthsOf(info: WidgetInfo): Map<number, number> {
    const widths = new Map<number, number>();
    for (const [column, value] of columnMeta(parseTable(info.source), "width")) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) widths.set(column, Math.max(MIN_WIDTH, Math.round(n)));
    }
    for (const [column, width] of this.viewed.get(info.key) ?? []) {
      if (width === undefined) widths.delete(column);
      else widths.set(column, width);
    }
    return widths;
  }

  // ---- the handles and the widths shown ----------------------------------------

  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    Array.from(info.table.rows[0]!.cells).forEach((cell, column) => {
      const handle = this.host.doc.createElement("span");
      handle.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-col-resize`;
      handle.dataset.tpColumn = String(column);
      handle.title = "Drag to set the column's width; double-click for automatic";
      cell.append(handle);
    });
  }

  // After the cells are laid out (their content boxes made): the widths set
  viewApplied(_widget: HTMLElement, info: WidgetInfo): void {
    const widths = this.widthsOf(info);
    for (let column = 0; column < info.columns; column++) this.apply(info, column, widths.get(column));
  }

  /**
   * A column `width` pixels wide (undefined: automatic): every cell of it, and
   * the content box of every body cell sized to fit inside (it is otherwise as
   * wide as its text, up to the maximum column width)
   */
  private apply(info: WidgetInfo, column: number, width: number | undefined, padding = this.paddingOf(info, column)): void {
    for (const tr of [info.table.rows[0]!, ...this.host.bodyRows(info)]) {
      const cell = tr.cells[column];
      if (!cell || cell.classList.contains("tp-editing")) continue;
      cell.classList.toggle("tp-sized", width !== undefined);
      cell.style.boxSizing = width === undefined ? "" : "border-box";
      cell.style.width = width === undefined ? "" : `${width}px`;
      cell.style.minWidth = width === undefined ? "" : `${width}px`;
      cell.style.maxWidth = width === undefined ? "" : `${width}px`;
      // The content's box: a body cell's, the header's line (its name cut where the icons need the room)
      const box = cell.querySelector<HTMLElement>(":scope > .tp-cell-content, :scope > .tp-head");
      if (box) {
        box.style.width = width === undefined ? "" : `${Math.max(0, width - padding)}px`;
        box.style.maxWidth = width === undefined ? "" : "none";
      }
    }
  }

  /** A cell's padding left and right (the same in the column's header and body cells) */
  private paddingOf(info: WidgetInfo, column: number): number {
    const header = info.table.rows[0]!.cells[column];
    if (!header) return 0;
    const style = this.host.doc.defaultView!.getComputedStyle(header);
    return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  }

  // ---- dragging -----------------------------------------------------------------

  mouseDown(e: MouseEvent): boolean {
    const handle = e.target instanceof Element ? e.target.closest<HTMLElement>(".tp-col-resize") : null;
    const hit = handle && this.host.enhancedWidgetOf(handle);
    if (!handle || !hit || e.button !== 0) return false;
    e.preventDefault();
    e.stopPropagation();
    // One drag at a time (a release outside the window may have left one)
    this.stopDrag?.();
    // A cell being edited is saved first, as a press elsewhere would (the press here keeps the focus)
    const editing = this.host.editing;
    if (editing) (editing.field as HTMLElement).blur();
    const [, info] = hit;
    const column = Number(handle.dataset.tpColumn);
    const header = info.table.rows[0]!.cells[column];
    if (!header) return true;
    const startWidth = Math.round(header.getBoundingClientRect().width);
    this.drag = { key: info.key, column, startX: e.clientX, startWidth, padding: this.paddingOf(info, column), width: startWidth };
    handle.classList.add("tp-active");
    const doc = this.host.doc;
    doc.body.classList.add("tp-resizing");
    const win = doc.defaultView!;
    // The widths applied once per frame, however many moves came
    let frame = 0;
    const show = () => {
      frame = 0;
      const drag = this.drag;
      const now = drag && this.current(drag.key);
      if (!drag || !now) return;
      this.apply(now[1], drag.column, drag.width, drag.padding);
      this.host.tableResized(now[1]);
    };
    const move = (ev: MouseEvent) => {
      const drag = this.drag;
      if (!drag) return;
      // Released where no mouseup came (outside the window): ended there
      if (ev.buttons === 0) {
        end(ev);
        return;
      }
      ev.preventDefault();
      // From the press, never from what is measured now
      drag.width = Math.max(MIN_WIDTH, Math.round(drag.startWidth + ev.clientX - drag.startX));
      if (!frame) frame = win.requestAnimationFrame ? win.requestAnimationFrame(show) : (show(), 0);
    };
    const end = (ev: MouseEvent) => {
      const drag = this.drag;
      if (frame && win.cancelAnimationFrame) win.cancelAnimationFrame(frame);
      this.stopDrag?.();
      const now = drag && this.current(drag.key);
      if (!drag || !now) return;
      const [current, nowInfo] = now;
      if (drag.width !== drag.startWidth) {
        void this.set(current, nowInfo, drag.column, drag.width);
        return;
      }
      // Not moved: a double-click makes the column automatic again; a click shows it as it was
      if (ev.detail >= 2) void this.set(current, nowInfo, drag.column, undefined);
      else {
        this.viewApplied(current, nowInfo);
        this.host.tableResized(nowInfo);
      }
    };
    this.stopDrag = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", end, true);
      handle.classList.remove("tp-active");
      doc.body.classList.remove("tp-resizing");
      this.drag = undefined;
      this.stopDrag = undefined;
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", end, true);
    return true;
  }

  /** The table with `key` as rendered now: a write renders it anew */
  private current(key: string): [HTMLElement, WidgetInfo] | undefined {
    const widget = this.host.widgetForKey(key);
    const info = widget && this.host.infoOf(widget);
    return widget && info ? [widget, info] : undefined;
  }

  /** A column's width set (undefined: automatic) */
  private set(widget: HTMLElement, info: WidgetInfo, column: number, width: number | undefined): Promise<void> {
    return this.setAll(widget, info, new Map([[column, width]]));
  }

  /** Columns' widths set (undefined: automatic): stored in the table where they can be, else for the view */
  private async setAll(widget: HTMLElement, info: WidgetInfo, set: ReadonlyMap<number, number | undefined>): Promise<void> {
    const view = this.viewed.get(info.key) ?? new Map<number, number | undefined>();
    for (const [column, width] of set) view.set(column, width);
    this.viewed.set(info.key, view);
    this.viewApplied(widget, info);
    this.host.tableResized(info);
    // Reset column widths offered or not
    this.host.toolbarChanged();
    if (!(info.metaRow || this.host.metadataEnabled)) return;
    const result = await this.host.write(widget, (t) => {
      const widths = columnMeta(t, "width");
      for (const [column, width] of set) {
        if (width === undefined) widths.delete(column);
        else widths.set(column, String(width));
      }
      return withColumnMeta(t, "width", widths);
    });
    // Stored (or already so): the table's metadata has them now
    if (result !== "failed") for (const column of set.keys()) this.viewed.get(info.key)?.delete(column);
  }

  /** Columns moved, inserted or deleted: the widths set for the view go with them */
  columnsMoved(key: string, map: (column: number) => number | undefined): void {
    const view = this.viewed.get(key);
    if (!view) return;
    const moved = new Map<number, number | undefined>();
    for (const [column, width] of view) {
      const target = map(column);
      if (target !== undefined) moved.set(target, width);
    }
    this.viewed.set(key, moved);
  }

  // ---- the menus --------------------------------------------------------------------

  // Before Remove metadata (the widths module comes before it), which would remove them too
  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const widths = this.widthsOf(info);
    if (!widths.size) return [];
    return [
      {
        label: "Reset column widths",
        icon: ICONS.columnWidth,
        danger: true,
        title: widths.size === 1 ? "Make the column with a width set as wide as its text again" : `Make the ${widths.size} columns with a width set as wide as their text again`,
        run: () => {
          // As rendered now (the menu stays open across a write)
          const [w, now] = this.current(info.key) ?? [widget, info];
          void this.setAll(w, now, new Map(Array.from(this.widthsOf(now).keys(), (column) => [column, undefined])));
        },
      },
    ];
  }

  columnMenuEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    const width = this.widthsOf(info).get(column);
    if (width === undefined) return [];
    return [
      {
        kind: "item",
        label: "Auto width",
        icon: ICONS.columnWidth,
        hint: `The column is ${width}px wide: make it as wide as its text`,
        run: () => void this.set(widget, info, column, undefined),
      },
    ];
  }
}
