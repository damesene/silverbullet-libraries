// The widths module: a column's width is set by dragging the right edge of its
// header (a handle there), reset to automatic by double-clicking it or with
// "Auto width" in its menu. With the metadata setting it is stored in the
// table (width.price="180", meta.ts), which follows the column through renames
// and moves (metadataAfterEdit); without it, it holds for the view only.
// "Reset column widths" in the table's menu makes every column automatic.
//
// Where a feature lays the table out on a grid of its own (TableHost.addressFrame:
// the sheet view), the columns are the grid's: a handle sets the grid's column
// (for every table in it), the table's own widths give way.
//
// While dragging, the width is the width at the press plus how far the pointer
// moved since, never measured again: a scrollbar showing or going, or the
// table moving as it gets narrower, cannot feed back into it. The widths are
// the module's (columnWidths); the core shows them, and the handles (a handle
// layer per table, as every table's headers have them).
import { type Feature, type HandleLayer, type ModelHost, type PartTable, type TableInfo, type TableKey, tablePartsOf, type ToolbarButton } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { columnMeta, withColumnMeta } from "../meta.ts";

// The narrowest a column can be dragged to, in pixels
const MIN_WIDTH = 40;

// The handles' layers, one per table
const LAYER = "width:";
const HANDLE_CLASS = "swt-col-resize";
const HANDLE_TITLE = "Drag to set the column's width; double-click for automatic";

/** One table's widths (the module's part for it, core/parts.ts): those set for the view, those stored, its handles */
class TableWidths {
  // Widths set for the view only (no metadata stored), by column; undefined: automatic
  private viewed = new Map<number, number | undefined>();
  // The widths stored in the table as last read (parsing a large table for its metadata row on every view is slow)
  private stored: { readonly source: string; readonly widths: ReadonlyMap<number, number> } | undefined;
  // Its handles
  private readonly handles: HandleLayer;

  constructor(
    private readonly table: PartTable,
    private readonly host: ModelHost,
  ) {
    this.handles = host.handleLayer(`${LAYER}${table.key}`);
  }

  stop(): void {
    this.handles.hide();
  }

  /** Its columns' widths: those set for the view, else those stored */
  widthsOf(info: TableInfo): Map<number, number> {
    if (this.stored?.source !== info.source) {
      const read = new Map<number, number>();
      for (const [column, value] of columnMeta(parseTable(info.source), "width")) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) read.set(column, Math.max(MIN_WIDTH, Math.round(n)));
      }
      this.stored = { source: info.source, widths: read };
    }
    const widths = new Map(this.stored.widths);
    for (const [column, width] of this.viewed) {
      if (width === undefined) widths.delete(column);
      else widths.set(column, width);
    }
    return widths;
  }

  columnWidths(info: TableInfo): ReadonlyMap<number, number> {
    // Laid out on a grid of a feature's: its columns' widths, not the table's own
    return this.host.addressFrame(info) ? new Map() : this.widthsOf(info);
  }

  /** A handle on each header cell's right edge (shown by CSS while the header is hovered, selected or edited) */
  enhanced(info: TableInfo): void {
    this.placeHandles(info, undefined);
  }

  placeHandles(info: TableInfo, active: number | undefined): void {
    this.handles.place(
      info.key,
      Array.from({ length: info.columns }, (_, column) => ({
        // One handle per column (a layer's handles are told apart by their classes), the one dragged lit
        className: `${HANDLE_CLASS} ${HANDLE_CLASS}-${column}`,
        active: column === active,
        row: 0,
        column,
        title: HANDLE_TITLE,
      })),
    );
  }

  /** A column's width set (undefined: automatic): the grid's, where a feature lays the table out on one */
  set(info: TableInfo, column: number, width: number | undefined): Promise<void> {
    const grid = this.host.addressFrame(info);
    return grid ? grid.setColumnWidth(column, width) : this.setAll(info, new Map([[column, width]]));
  }

  /** Columns' widths set (undefined: automatic): stored in the table where they can be, else for the view */
  private async setAll(info: TableInfo, set: ReadonlyMap<number, number | undefined>): Promise<void> {
    for (const [column, width] of set) this.viewed.set(column, width);
    for (const column of set.keys()) this.host.showColumnWidth(info, column, undefined);
    // Reset column widths offered or not
    this.host.toolbarChanged();
    if (!(info.metaRow || this.host.metadataEnabled)) return;
    const result = await this.host.writeTable(info, (t) => {
      const widths = columnMeta(t, "width");
      for (const [column, width] of set) {
        if (width === undefined) widths.delete(column);
        else widths.set(column, String(width));
      }
      return withColumnMeta(t, "width", widths);
    });
    // Stored (or already so): the table's metadata has them now
    if (result !== "failed") for (const column of set.keys()) this.viewed.delete(column);
  }

  /** Columns moved, inserted or deleted: the widths set for the view go with them */
  columnsMoved(_key: TableKey, map: (column: number) => number | undefined): void {
    const moved = new Map<number, number | undefined>();
    for (const [column, width] of this.viewed) {
      const target = map(column);
      if (target !== undefined) moved.set(target, width);
    }
    this.viewed = moved;
  }

  // Before Remove metadata (the widths module comes before it), which would remove them too
  toolbarButtons(info: TableInfo): ToolbarButton[] {
    const widths = this.widthsOf(info);
    // On a grid of a feature's the table's own widths do not show: nothing to reset there
    if (!widths.size || this.host.addressFrame(info)) return [];
    return [
      {
        label: "Reset column widths",
        icon: ICONS.columnWidth,
        danger: true,
        title: widths.size === 1 ? "Make the column with a width set as wide as its text again" : `Make the ${widths.size} columns with a width set as wide as their text again`,
        run: () => {
          // As rendered now (the menu stays open across a write)
          const now = this.table.current() ?? info;
          void this.setAll(now, new Map(Array.from(this.widthsOf(now).keys(), (column) => [column, undefined])));
        },
      },
    ];
  }

  columnMenuEntries(info: TableInfo, column: number): MenuEntry[] {
    const grid = this.host.addressFrame(info);
    const width = grid ? grid.columnWidth(column) : this.widthsOf(info).get(column);
    if (width === undefined) return [];
    return [
      {
        kind: "item",
        label: "Auto width",
        icon: ICONS.columnWidth,
        hint: `The column is ${width}px wide: make it as wide as its text`,
        run: () => void this.set(this.table.current() ?? info, column, undefined),
      },
    ];
  }
}

/** The widths module: its parts are the tables' widths (TableWidths); itself, the one drag of a handle on the page */
export class Widths implements Feature {
  private drag: { readonly key: TableKey; readonly column: number } | undefined;
  private stopDrag: (() => void) | undefined;
  readonly tableParts = tablePartsOf(TableWidths, (table) => new TableWidths(table, this.host));

  constructor(private readonly host: ModelHost) {}

  stop(): void {
    this.stopDrag?.();
  }

  pointerBusy(): "drag" | undefined {
    return this.drag ? "drag" : undefined;
  }

  mouseDown(e: MouseEvent): boolean {
    const target = this.host.targetOf(e.target);
    if (target.kind !== "handle" || !target.layer.startsWith(LAYER) || e.button !== 0) return false;
    const info = this.host.tableFor(target.key);
    const widths = this.host.tablePart<TableWidths>(this, target.key);
    e.preventDefault();
    e.stopPropagation();
    if (!info || !widths) return true;
    // One drag at a time (a release outside the window may have left one)
    this.stopDrag?.();
    // A cell being edited is saved first, as a press elsewhere would (the press here keeps the focus)
    if (this.host.editing) void this.host.saveEditing();
    const { column } = target;
    const header = this.host.rectOf(info, { column });
    if (!header) return true;
    const startWidth = Math.round(header.right - header.left);
    const startX = e.clientX;
    // The second press of a double click: the column automatic again (unless it moves)
    const double = e.detail >= 2;
    let width = startWidth;
    this.drag = { key: info.key, column };
    widths.placeHandles(info, column);
    const win = this.host.doc.defaultView!;
    // The width shown once per frame, however many moves came
    let frame = 0;
    const show = () => {
      frame = 0;
      const now = this.host.tableFor(info.key);
      const grid = now && this.host.addressFrame(now);
      if (this.drag && grid) grid.previewColumnWidth(column, width);
      else if (this.drag && now) this.host.showColumnWidth(now, column, width);
    };
    const stop = this.host.drag(e, {
      key: info.key,
      events: "mouse",
      pageMark: "resizing",
      onMove: (at) => {
        // From the press, never from what is measured now
        width = Math.max(MIN_WIDTH, Math.round(startWidth + at.x - startX));
        if (!frame) frame = win.requestAnimationFrame ? win.requestAnimationFrame(show) : (show(), 0);
      },
      onEnd: () => {
        if (frame && win.cancelAnimationFrame) win.cancelAnimationFrame(frame);
        this.stopDrag?.();
        const now = this.host.tableFor(info.key);
        if (!now) return;
        if (width !== startWidth) {
          void widths.set(now, column, width);
          return;
        }
        // Not moved: a double-click makes the column automatic again; a click shows it as it was
        if (double) void widths.set(now, column, undefined);
        else if (this.host.addressFrame(now)) this.host.addressFrame(now)!.previewColumnWidth(column, undefined);
        else this.host.showColumnWidth(now, column, undefined);
      },
    });
    this.stopDrag = () => {
      stop();
      this.drag = undefined;
      this.stopDrag = undefined;
      const now = this.host.tableFor(info.key);
      if (now) widths.placeHandles(now, undefined);
    };
    return true;
  }
}
