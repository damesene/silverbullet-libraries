// Selecting cells by dragging across them, Shift+click (from the cell edited or
// the selection's first cell) and Shift+arrows (or whole rows and columns with
// their grips); in select mode (the table menu's Edit mode off) a click selects
// a cell and a second click edits it. Typing on a selected cell edits it, its
// text replaced; Enter or F2 edit it, arrows move it. Cells selected are copied
// for a spreadsheet (Ctrl+C) or
// empty them (Delete); whole rows or columns already empty, Delete deletes
// them. Copy, Clear and Delete rows / columns in the menu of a cell or of the
// cells selected. On a touch screen, handles at the selection's corners are
// dragged to select more (whole rows and columns stay whole), and a tap on a
// selection of several cells opens their menu. The cells selected move by
// their edge, dragged with a mouse (with Ctrl: copied), or with Move to… in
// their menu and a click (a tap) on the cell to move them to.
//
// All of it in model terms (docs/silverware-table-isolation.md): the cells
// selected are marks the core keeps (markLayer), their handles and the band
// on their edge are the core's (handleLayer, outlineLayer), drags are the
// core's (drag), what a pointer is on too (targetOf).
import {
  CELL_MENU_ORDER,
  type CellMenuGroup,
  type CellRef,
  type ClipboardData,
  type DragPoint,
  type Feature,
  type HandleLayer,
  type MarkLayer,
  type OutlineLayer,
  PAGE_ROWS,
  type Panel,
  type ModelHost,
  type ToolbarButton,
  type TableInfo,
} from "../core/feature.ts";
import { watchPress } from "../core/press.ts";
import { clipboardHtml, clipboardText, writeClipboard } from "../clipboard.ts";
import {
  columnBlockTo,
  deleteColumnsAt,
  deleteRowsAt,
  MOVE_BLOCKED,
  moveCellsTo,
  moveColumnsTo,
  moveRowsTo,
  rowBlockTo,
} from "../core/structure.ts";
import { lineAfterBlockMove } from "../ops.ts";
import { columnLetters } from "../formulas/index.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { withoutTags } from "../tags.ts";
import type { Table } from "../markdown.ts";
import { setCell } from "../ops.ts";

// Ctrl+Alt + these keys move the rows (up, down, 10 rows) or columns (left, right, to the first or last) selected, as in the cell editor
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

const EDIT_MODE_KEY = "silverware.table.editMode";

// The layers of the core this module draws with
const EDGE_LAYER = "select-edge";
const TARGET_LAYER = "move-target";
const HANDLE_LAYER = "select";
const START_HANDLE = "swt-select-handle swt-select-start";
const END_HANDLE = "swt-select-handle swt-select-end";

/** The cells selected: their table, its rows (of the markdown) as shown, and the columns from left to right */
type Area = { readonly info: TableInfo; readonly rows: readonly number[]; readonly left: number; readonly right: number };

/** The cells selected, to move: their place among the rows shown (`order`, `top`), their size and the cells by row */
type Block = Area & {
  readonly order: readonly number[];
  readonly top: number;
  readonly height: number;
  readonly width: number;
  readonly cells: readonly (readonly CellRef[])[];
};

/** Edit mode as this browser keeps it (off: select mode, the default) */
function readEditMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(EDIT_MODE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeEditMode(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(EDIT_MODE_KEY, on ? "on" : "off");
  } catch {
    // Not kept: it stays for this page
  }
}

// What arrows move the selection's last cell by: rows (as shown), columns
const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

const same = (a: CellRef, b: CellRef) => a.row === b.row && a.column === b.column;

export class Selection implements Feature {
  // The cells selected (rows of the markdown, header 0), in the table with this key
  private selection: { readonly key: string; readonly anchor: CellRef; focus: CellRef } | undefined;
  private stopSelecting: (() => void) | undefined;
  // The selection when a press came: the press itself ends it first
  private pressed: { readonly key: string; readonly anchor: CellRef; readonly focus: CellRef } | undefined;
  // A touch on cells selected, until it is a tap (their menu) or not
  private stopTap: (() => void) | undefined;
  // The cells selected, and the one selected alone (the next click edits it)
  private readonly selectedMarks: MarkLayer;
  private readonly alone: MarkLayer;
  // The band on the selection's edge a mouse drags it by; the outline where it goes, and its address
  private readonly edges: OutlineLayer;
  private readonly targetEdges: OutlineLayer;
  private readonly tip: Panel;
  // The handles at the selection's first and last cell, shown by CSS after a touch (html[data-swt-pointer="touch"])
  private readonly handles: HandleLayer;
  // Move to…: the table whose cells selected move to the cell pressed next
  private moving: string | undefined;
  // Where Move to… outlined the cells last
  private moveAt: { row: number; column: number } | undefined;
  // Edit mode: a click edits a cell; off (select mode, the default) a click selects it. Kept in this browser.
  private editMode = readEditMode();

  constructor(private readonly host: ModelHost) {
    this.selectedMarks = host.markLayer("selected");
    this.alone = host.markLayer("selected-alone");
    this.handles = host.handleLayer(HANDLE_LAYER);
    this.tip = host.panel("swt-move-tip");
    // A band per side, which a mouse drags the cells by
    this.edges = host.outlineLayer(EDGE_LAYER, (sides) => sides.map((side) => `swt-select-edge swt-select-edge-${side}`));
    this.targetEdges = host.outlineLayer(TARGET_LAYER, (sides) => [`swt-move-edge ${sides.map((side) => `swt-move-${side}`).join(" ")}`]);
  }

  start(): void {
    this.showMode();
    this.host.doc.defaultView!.addEventListener("pointerdown", this.onPointerDown, true);
  }

  stop(): void {
    this.host.doc.defaultView!.removeEventListener("pointerdown", this.onPointerDown, true);
    this.stopTap?.();
    this.stopSelecting?.();
    this.unmark();
    this.tip.remove();
    this.endMoving();
    this.host.pageMark("select-mode", false);
  }

  clickSelects(): boolean {
    return !this.editMode;
  }

  /** Select mode on the page, for CSS: a click selects (the default pointer), on a cell selected alone it edits (the text cursor) */
  private showMode(): void {
    this.host.pageMark("select-mode", !this.editMode);
  }

  /**
   * A press on a handle is the handle's (a mouse's, after a touch has shown
   * them): not the cell's. On the selection's edge it drags the cells; while
   * Move to… waits, a press on a cell moves them there.
   */
  mouseDown(e: MouseEvent): boolean {
    if (this.moving) return this.movedBy(e);
    const target = this.host.targetOf(e.target);
    const edge = target.kind === "outline" && target.layer === EDGE_LAYER;
    if (!edge && !(target.kind === "handle" && target.layer === HANDLE_LAYER)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.button === 0 && edge) this.dragCells(e, target);
    return true;
  }

  // Any click ends a selection (one on Silverware Table's own controls, its handles and the band on its edge aside)
  beforeMouseDown(e: MouseEvent): void {
    const selection = this.selection;
    this.pressed = selection && { ...selection };
    const target = this.host.targetOf(e.target).kind;
    if (selection && (target === "cell" || target === "none")) this.clear();
  }

  /**
   * Shift+click on a cell selects the cells from the selection's first cell,
   * else from the cell being edited (saved), else just this cell. In select
   * mode a click selects the cell (dragging on selects more); on the cell
   * selected alone, it edits it (so does a double click).
   */
  beforeCellPress(info: TableInfo, ref: CellRef, e: MouseEvent): boolean {
    const pressed = this.pressed?.key === info.key ? this.pressed : undefined;
    this.pressed = undefined;
    if (!e.shiftKey && (this.editMode || (pressed && same(pressed.anchor, ref) && same(pressed.focus, ref)))) return false;
    const editing = this.host.editing;
    const edited = editing?.key === info.key ? { row: editing.row, column: editing.column } : undefined;
    const anchor = !e.shiftKey ? ref : (pressed?.anchor ?? edited ?? ref);
    // A cell being edited is saved: the press selects now
    void this.host.saveEditing();
    this.selectCells(info, anchor, ref);
    if (!e.shiftKey) this.afterCellPress(info, ref, e);
    return true;
  }

  /** Edit mode, a switch in the toolbar (left of its menu): a click edits a cell; off, a click selects it */
  toolbarButtons(): ToolbarButton[] {
    return [
      {
        label: "Edit mode",
        title: this.editMode
          ? "On: a click edits a cell. Click to select cells first, as in a spreadsheet"
          : "Off: a click selects a cell; a second click, a double click, Enter or typing edits it. Click to edit on the first click",
        icon: ICONS.editMode,
        place: "icon",
        pressed: this.editMode,
        run: () => {
          this.editMode = !this.editMode;
          writeEditMode(this.editMode);
          this.showMode();
          this.host.toolbarChanged();
        },
      },
    ];
  }

  /**
   * After a press on a cell: dragging on to another cell of the table, with
   * the button held, selects the cells between the two as shown (sorting and
   * filters included), and closes the cell editor the press opened, unchanged
   */
  afterCellPress(info: TableInfo, anchor: CellRef, e: MouseEvent): void {
    this.stopSelecting?.();
    const { key } = info;
    this.stopSelecting = this.host.drag(e, {
      key,
      events: "mouse",
      onMove: (at: DragPoint) => {
        const ref = at.cell;
        if (!ref) return;
        const current = this.selection;
        if (!current) {
          if (same(ref, anchor)) return;
          // The press opened the anchor's editor: it goes, nothing was typed in it
          this.host.cancelEditing();
          this.selection = { key, anchor, focus: ref };
        } else if (same(current.focus, ref)) return;
        else current.focus = ref;
        this.show();
      },
      onEnd: () => {
        this.stopSelecting = undefined;
      },
    });
  }

  keyDown(e: KeyboardEvent): boolean {
    if (e.key === "Escape" && this.moving) {
      e.preventDefault();
      this.endMoving();
      return true;
    }
    if (!this.selection) return false;
    if (e.key === "Escape") {
      e.preventDefault();
      this.clear();
      return true;
    }
    // Delete empties the selected cells; in a field (a cell editor, a filter) it deletes text as usual
    const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    // Ctrl+V (Ctrl+Shift+V): pasted from the first cell selected, by its editor opened for it (the paste goes there)
    if (!inField && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "v") {
      // From the top left cell, as a spreadsheet pastes (and Paste in the cell menu)
      const area = this.area();
      const at = area ? { row: area.rows[0]!, column: area.left } : this.selection.anchor;
      const info = area?.info ?? this.host.tableFor(this.selection.key);
      this.clear();
      if (info) this.host.editCell(info, at, "select");
      return false;
    }
    if (!inField && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && MOVE_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      void this.moveLines(e.key);
      return true;
    }
    if (!inField && this.editFromKey(e)) return true;
    // An arrow on a cell selected alone at the table's edge, away from it: a feature may select on past it
    if (!inField && !e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && this.leavesTable(e)) {
      e.preventDefault();
      e.stopPropagation();
      this.clear();
      return true;
    }
    // Keys that move the selection's last cell: Shift extends to it, else the selection is that cell
    const target = !inField && !e.altKey && !e.metaKey ? this.keyTarget(e) : undefined;
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      this.moveTo(target, e.shiftKey);
      return true;
    }
    if (e.key === "Delete" && !inField && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      void this.emptyCells();
      return true;
    }
    return false;
  }

  /**
   * The cells the cell menu is for: the selection when it holds `at`; else
   * `at` is selected (marked, not edited), as a right click selects in a
   * spreadsheet, and stays so for Ctrl+C and Delete
   */
  selectedCells(info: TableInfo, at: CellRef): readonly CellRef[] {
    const refs = this.selection?.key === info.key ? this.refs() : [];
    if (refs.some((ref) => same(ref, at))) return refs;
    // A cell being edited is saved as the menu takes the focus
    this.selection = { key: info.key, anchor: at, focus: at };
    this.show();
    return [at];
  }

  selectCells(info: TableInfo, anchor: CellRef, focus: CellRef): void {
    this.selection = { key: info.key, anchor, focus };
    this.show();
  }

  /**
   * Typing on the cells selected edits the first of them, its text replaced
   * (the key goes on into the editor, so accents typed with dead keys work);
   * Backspace empties it so; Enter and F2 edit it as it is
   */
  private editFromKey(e: KeyboardEvent): boolean {
    const selection = this.selection;
    const info = selection && this.host.tableFor(selection.key);
    if (!selection || !info || e.metaKey || e.isComposing) return false;
    // AltGr comes as Ctrl+Alt: it types
    const typing = (e.key.length === 1 || e.key === "Dead") && e.ctrlKey === e.altKey;
    const plain = !e.ctrlKey && !e.altKey && !e.shiftKey;
    const asIs = plain && (e.key === "Enter" || e.key === "F2");
    const emptied = plain && e.key === "Backspace";
    if (!typing && !asIs && !emptied) return false;
    if (!typing) e.preventDefault();
    e.stopPropagation();
    const at = selection.anchor;
    this.clear();
    this.host.editCell(info, at, asIs ? undefined : "replace");
    return true;
  }

  /** Whether an arrow takes the cell selected alone past the table's edge, a feature selecting on there */
  private leavesTable(e: KeyboardEvent): boolean {
    const selection = this.selection;
    const step = STEPS[e.key];
    const info = selection && this.host.tableFor(selection.key);
    if (!step || !selection || !info) return false;
    const { anchor, focus } = selection;
    if (!same(anchor, focus)) return false;
    const order = this.host.shownOrder(info);
    const at = order.indexOf(focus.row);
    const r = at + step[0];
    const column = focus.column + step[1];
    const inside = r >= 0 && r < order.length && column >= 0 && column < info.columns;
    return at >= 0 && !inside && this.host.selectionLeaves(info, focus, step);
  }

  /**
   * Where a key takes the selection's last cell (rows as shown): arrows (with
   * Ctrl too) a cell, Home / End the row's first / last cell, Ctrl+Home
   * / End the table's first / last cell, PageUp / PageDown 10 rows (PageUp
   * stops at the first body row, as in the cell editor); undefined: not such a key
   */
  private keyTarget(e: KeyboardEvent): CellRef | undefined {
    const selection = this.selection;
    const info = selection && this.host.tableFor(selection.key);
    if (!selection || !info) return undefined;
    const order = this.host.shownOrder(info);
    const at = order.indexOf(selection.focus.row);
    if (at < 0) return undefined;
    const ctrl = e.ctrlKey;
    let r = at;
    let column = selection.focus.column;
    const step = STEPS[e.key];
    if (step) {
      r += step[0];
      column += step[1];
    } else if (e.key === "Home") {
      column = 0;
      if (ctrl) r = 0;
    } else if (e.key === "End") {
      column = info.columns - 1;
      if (ctrl) r = order.length - 1;
    } else if (e.key === "PageUp" && !ctrl) r = r === 0 ? 0 : Math.max(1, r - PAGE_ROWS);
    else if (e.key === "PageDown" && !ctrl) r = r + PAGE_ROWS;
    else return undefined;
    return { row: order[Math.max(0, Math.min(order.length - 1, r))]!, column: Math.max(0, Math.min(info.columns - 1, column)) };
  }

  /** The selection's last cell to `to`; without `extend` the selection is just that cell */
  private moveTo(to: CellRef, extend: boolean): void {
    const selection = this.selection;
    if (!selection) return;
    this.selection = { key: selection.key, anchor: extend ? selection.anchor : to, focus: to };
    this.show();
    // Out of view (a page down): scrolled to
    const info = this.host.tableFor(selection.key);
    if (info) this.host.revealCell(info, to);
  }

  /**
   * Ctrl+Alt+arrows: the rows of the selection move up or down (not while
   * sorted or filtered, nor with the header), its columns left or right, as
   * one edit; the selection goes with them
   */
  private async moveLines(key: string): Promise<void> {
    const selection = this.selection;
    const info = selection && this.host.tableFor(selection.key);
    if (!selection || !info) return;
    const vertical = key === "ArrowUp" || key === "ArrowDown" || key === "PageUp" || key === "PageDown";
    const lines = vertical ? [selection.anchor.row, selection.focus.row] : [selection.anchor.column, selection.focus.column];
    const first = Math.min(...lines);
    const last = Math.max(...lines);
    if (vertical) {
      if (first === 0) return;
      if (this.host.rearranged(info)) {
        void this.host.bridge.flash(`Silverware Table: ${MOVE_BLOCKED.toLowerCase()}`, "info");
        return;
      }
    }
    const asked =
      key === "Home"
        ? 0
        : key === "End"
          ? info.columns - (last - first + 1)
          : key === "PageUp"
            ? first - PAGE_ROWS
            : key === "PageDown"
              ? first + PAGE_ROWS
              : key === "ArrowUp" || key === "ArrowLeft"
                ? first - 1
                : first + 1;
    const to = vertical ? rowBlockTo(info, first, last, asked) : columnBlockTo(info, first, last, asked);
    if (to === first) return;
    // The selection goes with its lines (shown so once the table is rendered again)
    const follow = (ref: CellRef): CellRef =>
      vertical ? { ...ref, row: lineAfterBlockMove(ref.row, first, last, to) } : { ...ref, column: lineAfterBlockMove(ref.column, first, last, to) };
    this.selection = { key: selection.key, anchor: follow(selection.anchor), focus: follow(selection.focus) };
    const result = await (vertical ? moveRowsTo(this.host, info, first, last, to) : moveColumnsTo(this.host, info, first, last, to));
    if (result === "failed" && this.selection?.key === selection.key) {
      this.selection = selection;
      this.show();
      return;
    }
    // Moved out of view: scrolled to
    const now = this.host.tableFor(selection.key);
    const focus = this.selection?.focus;
    if (now && focus) this.host.revealCell(now, focus);
  }

  selected(info: TableInfo): readonly CellRef[] | undefined {
    return this.selection?.key === info.key ? this.refs() : undefined;
  }

  /** Clear in the menu of rows (columns): their cells (a column's header keeps its name), after the clipboard's entries */
  lineMenuEntries(info: TableInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[] {
    const rows = axis === "row" ? lines : Array.from({ length: info.rows - 1 }, (_, i) => i + 1);
    const columns = axis === "row" ? Array.from({ length: info.columns }, (_, c) => c) : lines;
    const cells = rows.flatMap((row) => columns.map((column) => ({ row, column })));
    const name = `${lines.length > 1 ? `${lines.length} ` : ""}${axis}${lines.length > 1 ? "s" : ""}`;
    return [
      {
        kind: "item",
        label: `Clear ${name}`,
        icon: ICONS.clear,
        hint: axis === "row" ? "Empty the cells, formulas included, as Delete does" : "Empty the cells under the header (it keeps its name), as Delete does",
        run: () => void this.empty(info, cells),
      },
    ];
  }

  /** Clear in the menu of a cell or of the cells selected (Copy, Cut and Paste are the paste module's; Copy here when it is off) */
  cellMenuEntries(info: TableInfo, cells: readonly CellRef[]): CellMenuGroup[] {
    const body = cells.filter((ref) => ref.row > 0).length;
    const entries: MenuEntry[] = [];
    if (!this.host.moduleOn("paste")) {
      entries.push({
        kind: "item",
        label: cells.length > 1 ? `Copy ${cells.length} cells` : "Copy",
        icon: ICONS.copy,
        hint: "Copy as Ctrl+C does: a spreadsheet pastes it into cells",
        run: () => void this.copy(info, cells),
      });
    }
    // A header keeps its name: a column needs one
    if (body > 0) {
      entries.push({
        kind: "item",
        label: body > 1 ? `Clear ${body} cells` : "Clear",
        icon: ICONS.clear,
        hint: "Empty the cells, formulas included, as Delete does",
        run: () => void this.empty(info, cells),
      });
    }
    // Cells selected: the rows and the columns they are in, deleted whole, last
    const deleting: MenuEntry[] = [];
    if (cells.length > 1) {
      const rows = [...new Set(cells.map((ref) => ref.row).filter((row) => row > 0))];
      const columns = [...new Set(cells.map((ref) => ref.column))];
      if (rows.length) {
        deleting.push({
          kind: "item",
          label: rows.length > 1 ? `Delete ${rows.length} rows` : "Delete row",
          icon: ICONS.trash,
          danger: true,
          hint: "Delete the rows these cells are in",
          run: () => void this.deleteRows(info, rows),
        });
      }
      deleting.push({
        kind: "item",
        label: columns.length > 1 ? `Delete ${columns.length} columns` : "Delete column",
        icon: ICONS.trash,
        danger: true,
        hint: "Delete the columns these cells are in",
        run: () => void this.deleteColumns(info, columns),
        ...(columns.length >= info.columns ? { disabled: "A table needs at least one column" } : {}),
      });
    }
    // Body cells of a table shown as written move: Move to…, and a press on the cell they go to
    const block = this.block();
    if (block && block.info.key === info.key && cells.length > 0) {
      entries.push({
        kind: "item",
        label: cells.length > 1 ? `Move ${cells.length} cells to…` : "Move to…",
        icon: ICONS.moveCells,
        hint: "Then click (tap) the cell where the first one goes: they move there, as dragging their edge moves them",
        run: () => this.startMoving(info),
      });
    }
    return [
      { order: CELL_MENU_ORDER.editing, entries },
      { order: CELL_MENU_ORDER.deleting, entries: deleting },
    ];
  }

  /** The cells' values in rows as shown, as Ctrl+C copies them */
  private valuesOf(info: TableInfo, cells: readonly CellRef[]): string[][] {
    const rows = new Map<number, string[]>();
    for (const ref of cells) rows.set(ref.row, [...(rows.get(ref.row) ?? []), this.host.shownValue(info, ref) ?? ""]);
    return Array.from(rows.values());
  }

  /** The cells, as values in rows as shown, onto the clipboard as Ctrl+C puts them */
  private async copy(info: TableInfo, cells: readonly CellRef[]): Promise<void> {
    const values = this.valuesOf(info, cells);
    try {
      await writeClipboard(this.host.doc, clipboardText(values), clipboardHtml(values));
      void this.host.bridge.flash(`Silverware Table: copied ${values.length} × ${values[0]?.length ?? 0} cells`, "info");
    } catch (e) {
      void this.host.bridge.flash(`Silverware Table: could not copy (${String(e)})`, "error");
    }
  }

  // A cell's editor opened (also from a + or a menu, which leave the selection): the selection ends
  editorOpened(): void {
    if (this.selection) this.clear();
    if (this.moving) this.endMoving();
  }

  // A table rendered again (after a write) shows the selection again: its rows may be elsewhere now
  enhanced(info: TableInfo): void {
    if (this.selection?.key === info.key) this.show();
  }

  /** The cells selected: rows as shown (the header first), columns left to right */
  private area(): Area | undefined {
    const selection = this.selection;
    const info = selection && this.host.tableFor(selection.key);
    if (!selection || !info) return undefined;
    const rows = this.host.shownBetween(info, selection.anchor.row, selection.focus.row);
    // Within the table's columns: a column selected may be gone (deleted, the last one)
    const left = Math.min(selection.anchor.column, selection.focus.column);
    const right = Math.min(Math.max(selection.anchor.column, selection.focus.column), info.columns - 1);
    return rows.length && left <= right ? { info, rows, left, right } : undefined;
  }

  /** The selected cells as references, rows as shown (the header first), columns left to right */
  private refs(): CellRef[] {
    const area = this.area();
    if (!area) return [];
    return area.rows.flatMap((row) => Array.from({ length: area.right - area.left + 1 }, (_, j) => ({ row, column: area.left + j })));
  }

  private show(): void {
    const area = this.area();
    const key = this.selection?.key;
    this.unmark();
    if (area && key) {
      const refs = this.refs();
      this.selectedMarks.set(key, refs);
      // A cell selected alone: the next click edits it
      this.alone.set(key, refs.length === 1 ? refs : []);
      this.placeHandles(key, area);
      this.placeEdges(key);
    }
    this.host.selectionChanged();
  }

  /**
   * The handles in the selection's first and last cell, on their corners
   * (inside them on the table's edges, the core's); after a touch (the handles
   * show only then), those of whole rows (columns) in the middle of what is in view
   */
  private placeHandles(key: string, area: Area): void {
    const { info, rows, left, right } = area;
    const order = this.host.shownOrder(info);
    const wholeRows = left === 0 && right === info.columns - 1 && rows[0] !== order[0];
    const wholeColumns = rows[0] === order[0] && rows.length === order.length;
    const mid = this.host.pressedWith === "touch" && (wholeRows || wholeColumns) ? (wholeRows ? "row" : "column") : undefined;
    this.handles.place(key, [
      { className: START_HANDLE, row: rows[0]!, column: left, ...(mid ? { mid } : {}) },
      { className: END_HANDLE, row: rows[rows.length - 1]!, column: right, ...(mid ? { mid } : {}) },
    ]);
  }

  // The page or a table scrolled: the handles of whole rows (columns) go on in the middle of what is in view
  layoutChanged(): void {
    const selection = this.selection;
    if (!selection || this.host.pressedWith !== "touch") return;
    const area = this.area();
    if (area) this.placeHandles(selection.key, area);
  }

  /**
   * A handle dragged (a touch): the selection goes from its other corner to
   * the cell under the finger; whole rows (columns) stay whole, so more of
   * them are selected. Near the view's edge the page scrolls, near the edge
   * of a table's box that scrolls sideways the table does.
   */
  private dragHandle(e: PointerEvent, corner: "start" | "end"): void {
    const selection = this.selection;
    const area = this.area();
    if (e.button !== 0 || !selection || !area) return;
    e.preventDefault();
    e.stopPropagation();
    const { info, rows, left, right } = area;
    const startRef = { row: rows[0]!, column: left };
    const endRef = { row: rows[rows.length - 1]!, column: right };
    const [anchor, dragged] = corner === "start" ? [endRef, startRef] : [startRef, endRef];
    const wholeRows = left === 0 && right === info.columns - 1;
    const wholeColumns = startRef.row === 0 && rows.length === this.host.shownOrder(info).length;
    const { key } = selection;
    this.stopSelecting?.();
    this.stopSelecting = this.host.drag(e, {
      key,
      events: "pointer",
      autoscroll: true,
      // A finger held still near an edge: it goes on scrolling, the selection with it
      repeat: true,
      pageMark: "select-dragging",
      onMove: (at) => {
        if (!at.cell) return;
        const focus = { row: wholeColumns ? dragged.row : at.cell.row, column: wholeRows ? dragged.column : at.cell.column };
        const now = this.selection;
        if (now?.key === key && same(now.anchor, anchor) && same(now.focus, focus)) return;
        this.selection = { key, anchor, focus };
        this.show();
      },
      onEnd: () => {
        this.stopSelecting = undefined;
      },
    });
  }

  /**
   * A press: on one of the selection's handles it drags them (a finger's, or a
   * mouse's after a touch showed them); while Move to… waits, a touch picks
   * where; a tap on a cell of a selection of several opens their menu, as in a
   * spreadsheet's app. Told by the pointer events, which always come (the mouse
   * events a browser fires after a tap may not); the core then swallows those,
   * as after a long press.
   */
  private onPointerDown = (e: PointerEvent): void => {
    this.stopTap?.();
    if (this.moving) {
      this.touchMove(e);
      return;
    }
    const target = this.host.targetOf(e.target);
    if (target.kind === "handle" && target.layer === HANDLE_LAYER) {
      this.dragHandle(e, target.className === START_HANDLE ? "start" : "end");
      return;
    }
    const selection = this.selection;
    if (e.pointerType !== "touch" || e.button !== 0 || !selection || target.kind !== "cell" || target.key !== selection.key) return;
    const info = this.host.tableFor(selection.key);
    const ref = { row: target.row, column: target.column };
    const refs = this.refs();
    if (!info || refs.length < 2 || !refs.some((r) => same(r, ref))) return;
    const point = { x: e.clientX, y: e.clientY };
    // A long press opens the menu anyway (the core's): a tap does here
    this.stopTap = watchPress(this.host.doc.defaultView!, e, {
      tap: () => {
        if (!this.host.pressTaken()) this.host.openCellMenu(info, ref, point);
      },
    });
  };

  private clear(): void {
    this.selection = undefined;
    this.unmark();
    this.host.selectionChanged();
  }

  private unmark(): void {
    this.selectedMarks.clear();
    this.alone.clear();
    this.handles.hide();
    this.edges.hide();
  }

  // ---- moving the cells selected ---------------------------------------------

  /** The cells selected as a block that can move: body cells of a table shown as written */
  private block(): Block | undefined {
    const area = this.area();
    if (!area || this.host.rearranged(area.info)) return undefined;
    const order = this.host.shownOrder(area.info);
    const top = order.indexOf(area.rows[0]!);
    if (top < 1) return undefined;
    const width = area.right - area.left + 1;
    const cells = area.rows.map((row) => Array.from({ length: width }, (_, j) => ({ row, column: area.left + j })));
    return { ...area, order, top, height: area.rows.length, width, cells };
  }

  /**
   * The band a mouse drags the cells by: a piece on the outer side of each
   * cell on the selection's edge (CSS shows it for a mouse only, with the move
   * pointer); none where the cells cannot move
   */
  private placeEdges(key: string): void {
    const block = this.block();
    if (block) this.edges.show(key, block.rows, [block.left, block.right]);
    else this.edges.hide();
  }

  /** Where the block goes with its first cell at the row (as shown) and column given, kept within the table's body */
  private placeOf(block: Block, row: number, column: number): { row: number; column: number } {
    return {
      row: Math.max(1, Math.min(block.order.length - block.height, row)),
      column: Math.max(0, Math.min(block.info.columns - block.width, column)),
    };
  }

  /** The cells where the block would go outlined, dashed, and its address (A1 as formulas count rows) by the pointer */
  private showTarget(block: Block, at: { row: number; column: number } | undefined, copy: boolean, x: number, y: number): void {
    if (!at || (at.row === block.top && at.column === block.left)) {
      this.targetEdges.hide();
      this.tip.hide();
      return;
    }
    this.targetEdges.show(block.info.key, block.order.slice(at.row, at.row + block.height), [at.column, at.column + block.width - 1]);
    const name = (row: number, column: number) => `${columnLetters(column)}${row}`;
    const range = block.height * block.width > 1 ? `${name(at.row, at.column)}:${name(at.row + block.height - 1, at.column + block.width - 1)}` : name(at.row, at.column);
    this.tip.element.textContent = copy ? `+ ${range}` : range;
    this.placeTip(x, y);
  }

  /** The tip by the pointer */
  private placeTip(x: number, y: number): void {
    this.tip.show({ kind: "point", x: x + 14, y: y + 14 }, { gap: 0 });
  }

  /**
   * The cells dragged by their edge: the cell under the pointer takes the
   * place of the one pressed, the cells where they go outlined; let go, they
   * move there (with Ctrl, as in a spreadsheet: copied), as one edit. Esc
   * cancels. Within the table's body: no rows or columns added.
   */
  private dragCells(e: MouseEvent, pressed: CellRef): void {
    const block = this.block();
    if (!block) return;
    const pressedRow = block.order.indexOf(pressed.row) - block.top;
    const pressedColumn = pressed.column - block.left;
    let at: { row: number; column: number } | undefined;
    let copy = false;
    let last = { x: e.clientX, y: e.clientY };
    this.host.drag(e, {
      key: block.info.key,
      events: "mouse",
      byPoint: true,
      escape: true,
      pageMark: "moving-cells",
      onMove: (point) => {
        copy = point.ctrl;
        last = point;
        if (point.cell) {
          const row = block.order.indexOf(point.cell.row);
          if (row >= 0) at = this.placeOf(block, row - pressedRow, point.cell.column - pressedColumn);
        }
        this.showTarget(block, at, copy, point.x, point.y);
      },
      // Ctrl pressed or let go on the way changes a move into a copy and back
      onKey: (ev) => {
        if (ev.key !== "Control" && ev.key !== "Meta") return;
        copy = ev.type === "keydown";
        this.showTarget(block, at, copy, last.x, last.y);
      },
      onEnd: (point, cancelled) => {
        if (point) copy = point.ctrl;
        this.showTarget(block, undefined, false, 0, 0);
        if (!cancelled && at && (at.row !== block.top || at.column !== block.left)) void this.moveBlock(block, at, copy);
      },
    });
  }

  /** The block moved (copied) to start at a row as shown and a column; selected there, before the write (shown again once rendered) */
  private async moveBlock(block: Block, at: { row: number; column: number }, copy: boolean): Promise<void> {
    const to = { row: block.order[at.row]!, column: at.column };
    this.selectCells(block.info, to, { row: block.order[at.row + block.height - 1]!, column: at.column + block.width - 1 });
    const result = await moveCellsTo(this.host, block.info, block.cells, to, copy);
    if (result !== "written") this.selectCells(block.info, block.cells[0]![0]!, block.cells[block.cells.length - 1]![block.width - 1]!);
  }

  /** Move to…: the next press on a cell of the table (a click, a tap) moves the cells there */
  private startMoving(info: TableInfo): void {
    this.moving = info.key;
    this.host.pageMark("move-picking", true);
    // Where they would go outlined under the pointer, as while dragging them
    this.host.doc.defaultView!.addEventListener("mousemove", this.showMoveTarget, true);
    const press = this.host.pressedWith === "touch" ? "tap the cell where the first one goes (a tap outside the table cancels)" : "click the cell where the first one goes; Esc cancels";
    void this.host.bridge.flash(`Silverware Table: ${press}`, "info");
  }

  private endMoving(): void {
    this.moving = undefined;
    this.moveAt = undefined;
    this.host.pageMark("move-picking", false);
    this.host.doc.defaultView!.removeEventListener("mousemove", this.showMoveTarget, true);
    this.targetEdges.hide();
    this.tip.hide();
  }

  /** The block's place for a press on a body cell of its table: where its first cell goes */
  private placeAt(block: Block, target: EventTarget | null): { row: number; column: number } | undefined {
    const on = this.host.targetOf(target);
    if (on.kind !== "cell" && on.kind !== "outline") return undefined;
    if (on.key !== block.info.key) return undefined;
    const row = block.order.indexOf(on.row);
    return row >= 1 ? this.placeOf(block, row, on.column) : undefined;
  }

  /**
   * While Move to… waits: the cells where the block would go with its first
   * cell under the pointer, outlined (again only when that place changes: the
   * outline in the cells lays the table out anew); the cells no longer selected
   * as a block, Move to… ends
   */
  private showMoveTarget = (e: MouseEvent): void => {
    const block = this.block();
    if (!block || block.info.key !== this.moving) {
      this.endMoving();
      return;
    }
    const at = this.placeAt(block, e.target);
    const sameAt = at && this.moveAt && at.row === this.moveAt.row && at.column === this.moveAt.column && this.targetEdges.shown;
    this.moveAt = at;
    if (sameAt) this.placeTip(e.clientX, e.clientY);
    else this.showTarget(block, at, false, e.clientX, e.clientY);
  };

  /** A press while Move to… waits: on a body cell of the table the cells move there (the press taken); elsewhere it ends and goes on */
  private movedBy(e: MouseEvent): boolean {
    if (e.button !== 0) {
      this.endMoving();
      return false;
    }
    const taken = this.moveCellsAt(e.target);
    if (taken) {
      e.preventDefault();
      e.stopPropagation();
    }
    return taken;
  }

  /**
   * A touch while Move to… waits: a tap is a press (told by its pointer
   * events: a browser may fire no mouse events for a tap after scrolling); a
   * touch that moves scrolls the page, Move to… goes on
   */
  private touchMove(e: PointerEvent): void {
    if (e.pointerType !== "touch" || e.button !== 0 || !e.isPrimary) return;
    const target = e.target;
    this.stopTap = watchPress(this.host.doc.defaultView!, e, {
      tap: () => {
        if (this.moving) this.moveCellsAt(target);
      },
    });
  }

  /** Move to… ends; on a body cell of the table, the cells move there (true: the press is taken, its mouse events with it) */
  private moveCellsAt(target: EventTarget | null): boolean {
    const key = this.moving;
    this.endMoving();
    const block = this.block();
    if (!block || block.info.key !== key) return false;
    const at = this.placeAt(block, target);
    if (!at) return false;
    // Its click would follow a link in the cell, its mouse events select the cell
    this.host.takePress();
    if (at.row !== block.top || at.column !== block.left) void this.moveBlock(block, at, false);
    return true;
  }

  /**
   * Delete: empties the selected cells (the selection stays). Whole rows (all
   * columns) or whole columns (the header and every row shown) whose cells are
   * empty already are deleted: a first Delete empties them, a second deletes them.
   */
  private async emptyCells(): Promise<void> {
    const area = this.area();
    if (!area) return;
    const { info } = area;
    const refs = this.refs();
    const table = parseTable(info.source);
    const empty = (row: number, column: number) => withoutTags(table.rows[row]?.cells[column] ?? "") === "";
    const rows = [...new Set(refs.map((ref) => ref.row))];
    const columns = [...new Set(refs.map((ref) => ref.column))];
    const body = rows.filter((row) => row > 0);
    const wholeRows = columns.length === info.columns && body.length > 0;
    const wholeColumns = rows.includes(0) && rows.length === this.host.shownOrder(info).length;
    if (wholeRows && body.every((row) => columns.every((column) => empty(row, column)))) {
      this.clear();
      await deleteRowsAt(this.host, info, body);
      return;
    }
    // Every row's cell, also the rows a filter hides: their data would go too
    if (wholeColumns && !wholeRows && columns.every((column) => table.rows.every((_, row) => row === 0 || empty(row, column)))) {
      this.clear();
      await deleteColumnsAt(this.host, info, columns);
      return;
    }
    await this.empty(info, refs);
  }

  private async deleteRows(info: TableInfo, rows: readonly number[]): Promise<void> {
    this.clear();
    await deleteRowsAt(this.host, this.host.tableFor(info.key) ?? info, rows);
  }

  private async deleteColumns(info: TableInfo, columns: readonly number[]): Promise<void> {
    this.clear();
    await deleteColumnsAt(this.host, this.host.tableFor(info.key) ?? info, columns);
  }

  /**
   * Empties cells, formulas included, as one edit; header cells keep their
   * names (a column needs one), cells their hidden tags (names)
   */
  private async empty(info: TableInfo, cells: readonly CellRef[]): Promise<void> {
    const refs = cells.filter((ref) => ref.row > 0);
    const emptied = (table: Table, ref: CellRef) => setCell(table, ref.row, ref.column, this.host.keepTags("", table.rows[ref.row]?.cells[ref.column] ?? ""));
    await this.host.writeTable(this.host.tableFor(info.key) ?? info, (t) => refs.reduce(emptied, t));
  }

  /**
   * Ctrl+C with cells selected copies them as a spreadsheet does: as text with
   * a tab between cells and a line break between rows, and as an HTML table,
   * so Excel and Google Sheets paste them into cells. Cells copy what they
   * show (a formula's result, a link's text), a typed cell its value.
   */
  clipboardData(kind: "copy" | "cut"): ClipboardData | undefined {
    const area = kind === "copy" ? this.area() : undefined;
    if (!area) return undefined;
    const values = this.valuesOf(area.info, this.refs());
    void this.host.bridge.flash(`Silverware Table: copied ${values.length} × ${values[0]?.length ?? 0} cells`, "info");
    return { text: clipboardText(values), html: clipboardHtml(values) };
  }
}
