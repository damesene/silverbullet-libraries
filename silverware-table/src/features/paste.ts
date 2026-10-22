// The clipboard's cell menu and pasting cells into a table. Copy, Cut, Paste
// and Paste as new rows in the cell menu (a touch screen has no Ctrl+C,
// Ctrl+X, Ctrl+V); Ctrl+X; and cells copied from a spreadsheet pasted from
// the cell being edited (or selected: its editor opens for the paste): over
// the cells there (Ctrl+V) or as new rows (Ctrl+Shift+V). Cells copied or
// cut are outlined, as a spreadsheet marks them, until a paste (a change of
// them, Esc or another copy ends it too); cut cells move when pasted into
// their table, and once the cut has ended what is pasted is a copy. Ctrl+C is the selection
// module's (the core tells of the copy: the cells are outlined here). Reading the
// clipboard's text and planning the paste is paste.ts; this is the editor's
// and the menu's side.
import { clipboardHtml, clipboardText, writeClipboard } from "../clipboard.ts";
import {
  CELL_MENU_ORDER,
  type CellEditor,
  type CellMenuGroup,
  type CellRef,
  type ClipboardData,
  type Feature,
  type OutlineLayer,
  type TableHost,
  type WidgetInfo,
} from "../core/feature.ts";
import type { MenuEntry } from "../menu.ts";
import { cellMoveRules, growTo, moveRowsTo } from "../core/structure.ts";
import { ICONS } from "../icons.ts";
import { parseTable } from "../markdown.ts";
import { moveCells, parseClipboardCells, pasteCells, planPaste } from "../paste.ts";

const PASTE_BLOCKED = "Clear sorting and filters to paste cells: the rows shown are not where they would go";

// Without the Clipboard API (a page over http) a page cannot read the clipboard: only the browser's own paste can
const NO_CLIPBOARD = "The browser lets a page read the clipboard only over https: paste with Ctrl+V, or into a cell's editor";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** A clipboard text as compared with what was cut: line breaks as \n, none at the end (a spreadsheet, an OS adds them) */
function sameText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

/** Cells copied or cut (`moves`): their table and its shape, the cells (rows as shown, columns left to right), what they held then, the text copied */
type Cut = {
  readonly moves: boolean;
  readonly key: string;
  readonly shape: string;
  readonly cells: readonly (readonly CellRef[])[];
  readonly held: readonly (readonly string[])[];
  readonly text: string;
};

export class Paste implements Feature {
  // The paste on its way was asked for with Ctrl+Shift+V: as new rows
  private inserts = false;
  // What the clipboard holds, where the page may read it without asking (Chrome, the permission granted); else unknown
  private clipboard: "unknown" | "empty" | "text" = "unknown";
  private readable = false;
  // The clipboard's reads in order: a later one's result wins; the permission watched, until stop
  private reads = 0;
  private permission: { status: PermissionStatus; update: () => void } | undefined;
  private stopped = false;
  // Cells copied or cut (waiting to be moved by a paste); their outline
  private cut: Cut | undefined;
  private readonly edges: OutlineLayer;

  constructor(private readonly host: TableHost) {
    this.edges = host.outlineLayer("cut", (sides) => [`swt-cut-edge ${sides.map((side) => `swt-cut-${side}`).join(" ")}`]);
  }

  /**
   * Where the browser says the page may read the clipboard without asking,
   * what it holds is read again when the page comes back to the front (copied
   * in another application: Excel) and on every press (copied in this page),
   * so Paste in the cell menu shows disabled when there is nothing to paste
   */
  start(): void {
    const win = this.host.doc.defaultView!;
    if (!win.navigator.clipboard?.readText) return;
    win.addEventListener("focus", this.refresh);
    win.addEventListener("pointerdown", this.refresh, true);
    this.host.doc.addEventListener("visibilitychange", this.refresh);
    void win.navigator.permissions
      ?.query({ name: "clipboard-read" as PermissionName })
      .then((status) => {
        if (this.stopped) return;
        const update = () => {
          this.readable = status.state === "granted";
          if (!this.readable) this.clipboard = "unknown";
          this.refresh();
        };
        status.addEventListener("change", update);
        this.permission = { status, update };
        update();
      })
      // The browser knows no such permission (Firefox, Safari): what the clipboard holds stays unknown
      .catch(() => {});
  }

  stop(): void {
    const win = this.host.doc.defaultView!;
    win.removeEventListener("focus", this.refresh);
    win.removeEventListener("pointerdown", this.refresh, true);
    this.host.doc.removeEventListener("visibilitychange", this.refresh);
    this.permission?.status.removeEventListener("change", this.permission.update);
    this.stopped = true;
    this.readable = false;
    this.endCut();
  }

  private refresh = (): void => {
    const clipboard = this.host.doc.defaultView!.navigator.clipboard;
    // Read only while the page has the focus (else the browser refuses)
    if (!this.readable || !clipboard?.readText || !this.host.doc.hasFocus()) return;
    const read = ++this.reads;
    const set = (state: "unknown" | "empty" | "text") => {
      if (read === this.reads) this.clipboard = state;
    };
    clipboard.readText().then(
      (text) => set(text ? "text" : "empty"),
      () => set("unknown"),
    );
  };

  // The paste event does not tell Shift; the key may come before the editor opens (Ctrl+V on a selected cell). Esc ends a copy's or cut's outline.
  keyDown(e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") this.inserts = e.shiftKey;
    if (e.key === "Escape") this.endCut();
    return false;
  }

  /** Cells copied from a spreadsheet go into the table, cells cut move there; a single value into the field */
  editorPaste(editor: CellEditor, text: string): boolean {
    const insert = this.inserts;
    this.inserts = false;
    const info = this.host.tableFor(editor.key);
    if (!info) return false;
    // Cells cut move into an editor opened for the paste (its text selected whole: Ctrl+V on a selected cell), not one being typed in
    const [from, to] = editor.selection;
    const whole = from === 0 && to === editor.text.length;
    const own = this.cut?.cells.some((row) => row.some((ref) => ref.row === editor.row && ref.column === editor.column));
    const cut = insert || !whole || own ? undefined : this.cutFor(info, text);
    const data = parseClipboardCells(text);
    // A single value into the field: pasted, the outline goes
    if (!cut && !data) {
      this.endCut();
      return false;
    }
    void this.paste(info, editor, data ?? [[text]], insert, true, cut);
    return true;
  }

  // A table rendered anew: the cells copied or cut outlined again, or the outline (and a cut) ended where they changed
  enhanced(_widget: HTMLElement, info: WidgetInfo): void {
    if (this.cut?.key !== info.key) return;
    if (this.clipFor(info)) this.markCut(info);
    else this.endCut();
  }

  /** Copy, Cut, Paste and Paste as new rows in the cell menu, a bar of icons first (pasted from the first cell) */
  cellMenuEntries(_widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): CellMenuGroup | undefined {
    const at = cells[0];
    if (!at) return undefined;
    const name = cells.length > 1 ? `${cells.length} cells` : "";
    const header = cells.some((ref) => ref.row === 0);
    const bar = this.clipboardBar(info, {
      copied: cells,
      cut: header ? undefined : cells,
      cutBlocked: "A header keeps its name: cut the cells under it",
      at,
      name,
      asRows: true,
      fromHeader: false,
    });
    // First: the clipboard's bar heads the menu
    return { order: CELL_MENU_ORDER.clipboard, entries: [bar] };
  }

  /**
   * Copy, Cut and Paste in the menu of rows (columns): their cells; a column's
   * with its header, but cut without it (a column keeps its name). Pasted from
   * their first cell (a column's header: a column copied names it), rows also
   * as new rows.
   */
  lineMenuEntries(_widget: HTMLElement, info: WidgetInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[] {
    const first = Math.min(...lines);
    if (!Number.isFinite(first)) return [];
    const rows = axis === "row" ? lines : this.host.shownOrder(info);
    const columns = axis === "row" ? Array.from({ length: info.columns }, (_, c) => c) : [...lines].sort((a, b) => a - b);
    const cells = rows.flatMap((row) => columns.map((column) => ({ row, column })));
    const body = cells.filter((ref) => ref.row > 0);
    const name = `${lines.length > 1 ? `${lines.length} ` : ""}${axis === "row" ? "row" : "column"}${lines.length > 1 ? "s" : ""}`;
    // A column's from its header: a column copied with it names it, anything else goes under it (pasteFromMenu)
    const at = axis === "row" ? { row: first, column: 0 } : { row: 0, column: first };
    return [
      this.clipboardBar(info, {
        copied: cells,
        cut: body.length ? body : undefined,
        cutBlocked: "No cells under the header to cut",
        at,
        name,
        asRows: axis === "row",
        fromHeader: axis === "column",
      }),
    ];
  }

  /**
   * The clipboard's bar: Copy, Cut, Paste (Paste as new rows) as icons with a
   * caption, their full names (Copy 3 rows) as tooltips; Paste from `at`
   */
  private clipboardBar(
    info: WidgetInfo,
    o: {
      readonly copied: readonly CellRef[];
      readonly cut: readonly CellRef[] | undefined;
      readonly cutBlocked: string;
      readonly at: CellRef;
      // What is copied, after the action's name ("3 rows"; "" for a cell)
      readonly name: string;
      readonly asRows: boolean;
      readonly fromHeader: boolean;
    },
  ): MenuEntry {
    const cut = this.cutFor(info);
    const clipboard = this.host.doc.defaultView!.navigator.clipboard;
    // Cells cut move without reading the clipboard: possible over http too
    const disabled = this.host.rearranged(info)
      ? PASTE_BLOCKED
      : cut
        ? undefined
        : !clipboard?.readText
          ? NO_CLIPBOARD
          : this.clipboard === "empty"
            ? "The clipboard holds no text to paste"
            : undefined;
    // Rows cut whole move as new rows (where the clipboard cannot be read too); other cells cut paste as a copy
    const rowsCut = cut && this.cutRows(info, cut);
    const named = (action: string) => (o.name ? `${action} ${o.name}` : action);
    const options: Extract<MenuEntry, { kind: "actions" }>["options"][number][] = [
      { icon: ICONS.copy, caption: "Copy", title: named("Copy"), run: () => void this.copy(info, o.copied, false) },
      {
        icon: ICONS.cut,
        caption: "Cut",
        title: named("Cut"),
        run: () => void this.copy(info, o.cut ?? [], true),
        ...(o.cut ? {} : { disabled: o.cutBlocked }),
      },
      {
        icon: ICONS.paste,
        caption: "Paste",
        title: cut ? `Paste (move ${plural(cut.cells.length * (cut.cells[0]?.length ?? 0), "cell")})` : "Paste",
        run: () => void this.pasteFromMenu(info, o.at, false, o.fromHeader),
        ...(disabled ? { disabled } : {}),
      },
    ];
    if (o.asRows) {
      options.push({
        icon: ICONS.pasteRows,
        caption: "+ Rows",
        title: rowsCut ? "Paste as new rows (move the rows cut)" : "Paste as new rows",
        run: () => void this.pasteFromMenu(info, o.at, true),
        ...(rowsCut ? (this.host.rearranged(info) ? { disabled: PASTE_BLOCKED } : {}) : !clipboard?.readText ? { disabled: NO_CLIPBOARD } : disabled && !cut ? { disabled } : {}),
      });
    }
    return { kind: "actions", options };
  }

  /** The cells selected, in rows as shown, of the table they are in */
  private selection(): { info: WidgetInfo; cells: CellRef[] } | undefined {
    for (const info of this.host.shownTables()) {
      const cells = this.host.selectedCells(info);
      if (cells.length) return { info, cells: [...cells] };
    }
    return undefined;
  }

  /** Cells as rows (as shown), and their values as Ctrl+C copies them */
  private valuesOf(info: WidgetInfo, cells: readonly CellRef[]): { rows: CellRef[][]; values: string[][] } {
    const byRow = new Map<number, CellRef[]>();
    for (const ref of cells) byRow.set(ref.row, [...(byRow.get(ref.row) ?? []), ref]);
    const rows = Array.from(byRow.values());
    const values = rows.map((row) => row.map((ref) => this.host.shownValue(info, ref) ?? ""));
    return { rows, values };
  }

  /** Copy (Cut) in the menu: the cells onto the clipboard, as Ctrl+C puts them; cut, they are marked to move */
  private async copy(info: WidgetInfo, cells: readonly CellRef[], cutting: boolean): Promise<void> {
    const { rows, values } = this.valuesOf(info, cells);
    const text = clipboardText(values);
    this.endCut();
    try {
      await writeClipboard(this.host.doc, text, clipboardHtml(values));
    } catch (e) {
      void this.host.bridge.flash(`Silverware Table: could not copy (${String(e)})`, "error");
      return;
    }
    const size = `${values.length} × ${values[0]?.length ?? 0} cells`;
    if (cutting && this.host.rearranged(info)) {
      void this.host.bridge.flash(`Silverware Table: copied ${size} (sorted or filtered, cells are not cut: the rows shown are not where they are)`, "info");
      return;
    }
    this.startCut(info, rows, text, cutting);
    void this.host.bridge.flash(cutting ? `Silverware Table: cut ${size}: paste them where they go` : `Silverware Table: copied ${size}`, "info");
  }

  /**
   * Ctrl+X with cells selected (not in a field: there it cuts text, the
   * core's): the cells onto the clipboard as Ctrl+C puts them, marked to move
   * when pasted; with the header in them, only copied (a column keeps its name)
   */
  clipboardData(kind: "copy" | "cut"): ClipboardData | undefined {
    const selected = kind === "cut" ? this.selection() : undefined;
    if (!selected) return undefined;
    const { rows, values } = this.valuesOf(selected.info, selected.cells);
    const text = clipboardText(values);
    this.cutCells(selected.info, selected.cells, rows, values, text);
    return { text, html: clipboardHtml(values) };
  }

  /** The cells cut marked to move, said so (or why they are only copied) */
  private cutCells(info: WidgetInfo, cells: readonly CellRef[], rows: CellRef[][], values: readonly (readonly string[])[], text: string): void {
    this.endCut();
    const size = `${values.length} × ${values[0]?.length ?? 0} cells`;
    if (cells.some((ref) => ref.row === 0)) {
      void this.host.bridge.flash(`Silverware Table: copied ${size} (a header keeps its name: cut the cells under it)`, "info");
      return;
    }
    if (this.host.rearranged(info)) {
      void this.host.bridge.flash(`Silverware Table: copied ${size} (sorted or filtered, cells are not cut: the rows shown are not where they are)`, "info");
      return;
    }
    this.startCut(info, rows, text, true);
    void this.host.bridge.flash(`Silverware Table: cut ${size}: paste them where they go`, "info");
  }

  /**
   * Another copy: Ctrl+C on cells selected (the selection module puts them on
   * the clipboard) outlines them, as a spreadsheet does; a copy of text ends
   * the outline and a cut (what the clipboard holds is no longer those cells).
   * A menu's copy outlines its cells itself.
   */
  copied(kind: "copy" | "cut", data: ClipboardData | undefined): void {
    if (kind === "cut") {
      // Text cut from a field: what the clipboard holds is no longer the cells
      if (!data) this.endCut();
      return;
    }
    this.endCut();
    const selected = data ? this.selection() : undefined;
    // Sorted or filtered: the rows shown are not the markdown's, no outline to follow them
    if (!selected || this.host.rearranged(selected.info)) return;
    const { rows, values } = this.valuesOf(selected.info, selected.cells);
    this.startCut(selected.info, rows, clipboardText(values), false);
  }

  private startCut(info: WidgetInfo, cells: CellRef[][], text: string, moves: boolean): void {
    const table = this.host.tableOf(info);
    const held = cells.map((row) => row.map((ref) => table.rows[ref.row]?.cells[ref.column] ?? ""));
    this.cut = { moves, key: info.key, shape: this.shapeOf(table), cells, held, text: sameText(text) };
    this.markCut(info);
  }

  /** Cells cut to move, if they are this table's and still hold what they held (and the text pasted, given, is theirs) */
  private cutFor(info: WidgetInfo, text?: string): Cut | undefined {
    const cut = this.clipFor(info, text);
    return cut?.moves ? cut : undefined;
  }

  /**
   * The cells copied or cut, if they are this table's and hold what they held
   * then (and, given the text pasted, that text is what was copied)
   */
  private clipFor(info: WidgetInfo, text?: string): Cut | undefined {
    const cut = this.cut;
    if (!cut || cut.key !== info.key) return undefined;
    if (text !== undefined && sameText(text) !== cut.text) return undefined;
    const table = this.host.tableOf(info);
    // Rows or columns added or deleted: the cells are not where they were (one of the same value would be taken for them)
    if (this.shapeOf(table) !== cut.shape) return undefined;
    const same = cut.cells.every((row, i) => row.every((ref, j) => (table.rows[ref.row]?.cells[ref.column] ?? "") === cut.held[i]![j]));
    return same ? cut : undefined;
  }

  private shapeOf(table: ReturnType<TableHost["tableOf"]>): string {
    return `${table.rows.length}×${table.align.length}`;
  }

  /** The cells copied or cut outlined, dashed, as a spreadsheet marks them */
  private markCut(info: WidgetInfo): void {
    const cut = this.cut;
    const first = cut?.cells[0];
    if (!cut || !first?.length) {
      this.unmarkCut();
      return;
    }
    this.edges.show(info.key, cut.cells.map((row) => row[0]!.row), [first[0]!.column, first[first.length - 1]!.column]);
  }

  private unmarkCut(): void {
    this.edges.hide();
  }

  private endCut(): void {
    this.cut = undefined;
    this.unmarkCut();
  }

  /** The clipboard read (the browser may ask, or show its own Paste button), pasted from the cell; cells cut move there */
  /** The markdown rows `first`..`last` the cells cut are, when they are whole rows following each other; else nothing */
  private cutRows(info: WidgetInfo, cut: Cut): { first: number; last: number } | undefined {
    const rows = cut.cells.map((row) => row[0]?.row ?? 0);
    const whole = cut.cells.every((row) => row.length === info.columns && row.every((ref, j) => ref.column === j));
    const first = Math.min(...rows);
    const last = Math.max(...rows);
    return whole && rows.length > 0 && last - first + 1 === rows.length ? { first, last } : undefined;
  }

  /**
   * `fromHeader`: pasted from a column's menu, at its header: a column copied
   * with its header (what Copy column copies) goes there and names it; other
   * text (a spreadsheet's cells, cells cut) goes under it, the name kept
   */
  private async pasteFromMenu(shownInfo: WidgetInfo, at: CellRef, insert: boolean, fromHeader = false): Promise<void> {
    const clipboard = this.host.doc.defaultView!.navigator.clipboard;
    const cutBefore = this.cutFor(shownInfo);
    let text: string | undefined;
    if (clipboard?.readText) {
      try {
        text = await clipboard.readText();
      } catch (e) {
        // Cells cut move without it
        if (!cutBefore) {
          void this.host.bridge.flash(`Silverware Table: could not read the clipboard (${String(e)})`, "error");
          return;
        }
      }
    }
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    // What the clipboard holds now decides: the cells cut, if it is still their text (or the clipboard cannot be read)
    const cut = this.cutFor(info, text);
    const rows = cut && insert ? this.cutRows(info, cut) : undefined;
    if (rows) {
      // Rows cut whole, pasted as new rows: moved there (a spreadsheet's Insert cut cells), as one edit
      const count = rows.last - rows.first + 1;
      const to = at.row > rows.last ? at.row - count : Math.max(1, at.row);
      this.endCut();
      if (to !== rows.first) await moveRowsTo(this.host, info, rows.first, rows.last, to);
      return;
    }
    if (cut && !insert) {
      await this.paste(info, fromHeader && at.row === 0 ? { ...at, row: 1 } : at, cut.held.map((row) => row.map(() => "")), false, false, cut);
      return;
    }
    if (!text) {
      // Known to stay so only where it is read again without asking (else a copy later would find Paste disabled)
      if (text === "" && this.readable) this.clipboard = "empty";
      void this.host.bridge.flash("Silverware Table: the clipboard holds no text to paste", "info");
      return;
    }
    // A single value (a line break at its end, as a spreadsheet copies one cell, left out) is one cell
    const data = parseClipboardCells(text) ?? [[text.replace(/\r?\n$/, "")]];
    // At a column's header only a column copied with its header (this page's copy, from its first cell, the header)
    const named = this.cut?.cells[0]?.[0]?.row === 0 && sameText(text) === this.cut.text;
    await this.paste(info, fromHeader && at.row === 0 && !named ? { ...at, row: 1 } : at, data, insert);
  }

  /**
   * Pastes the cells from a cell, as one edit: over the cells there (insert
   * false), or as new rows at the cell's row. Cells with formulas keep them.
   * Cells cut move instead: written as they are over what is there, emptied
   * where they were. From the cell editor, what it holds is saved in the same
   * edit. Not while the table is sorted or filtered: the rows shown are not
   * where the cells would go.
   */
  private async paste(
    info: WidgetInfo,
    at: CellRef,
    data: string[][],
    insert: boolean,
    fromEditor = false,
    cut?: Cut,
  ): Promise<void> {
    if (this.host.rearranged(info)) {
      void this.host.bridge.flash(`Silverware Table: ${PASTE_BLOCKED.toLowerCase()}`, "info");
      return;
    }
    if (cut && at.row === 0) {
      void this.host.bridge.flash("Silverware Table: cells cut move into the rows under the header: paste them on a cell there", "info");
      return;
    }
    // A cell past the table (the sheet view's empty cell): the table grown to it first, in the same edit
    const growth = at.row >= info.rows || at.column >= info.columns ? growTo(info, at) : undefined;
    const source = parseTable(info.source);
    const base = growth ? growth.grow(source) : source;
    if (!base) return;
    const plan = planPaste(base, info.pins, growth ? growth.cell : at, cut ? cut.held : data, insert);
    if ("error" in plan) {
      void this.host.bridge.flash(`Silverware Table: cannot paste here: ${plan.error}`, "error");
      return;
    }
    const closed = fromEditor ? this.host.takeEditor() : undefined;
    let skipped: ReadonlyMap<string, number> = new Map();
    const { newRows, newColumns } = plan;
    const result = await this.host.writeTable(
      info,
      (t) => {
        const saved = closed ? closed.save(t) : t;
        const edited = saved && growth ? growth.grow(saved) : saved;
        if (!edited) return undefined;
        if (cut) return moveCells(edited, cut.cells, plan, cellMoveRules(this.host));
        const pasted = pasteCells(edited, plan, data, {
          keptBy: (cell) => this.host.cellKeptBy(cell),
          keepTags: (value, from) => this.host.keepTags(value, from),
          headerRenamed: (name, from) => this.host.headerRenamed(name, from),
        });
        skipped = pasted.skipped;
        return pasted.table;
      },
      {
        columnMap: newColumns.count || growth ? (c) => after(growth ? growth.columnMap(c) : c, newColumns) : undefined,
        pins: plan.pins,
        rowMap: newRows.count || growth ? (r) => after(growth ? growth.rowMap(r) : r, newRows) : undefined,
      },
    );
    if (result !== "written") {
      // Nothing changed: every cell pasted onto kept its own (a formula's): said so
      if (skipped.size) void this.host.bridge.flash(`Silverware Table: nothing pasted: ${Array.from(skipped, ([what, count]) => `kept ${plural(count, what)}`).join(", ")}`, "info");
      return;
    }
    const size = cut ? cut.held : data;
    const width = Math.max(...size.map((r) => r.length));
    // Pasted: the outline goes (a copy's too), and a cut is done
    this.endCut();
    const added = [
      ...(newRows.count && !insert ? [`added ${plural(newRows.count, "row")}`] : []),
      ...(newColumns.count ? [`added ${plural(newColumns.count, "column")}`] : []),
      ...Array.from(skipped, ([what, count]) => `kept ${plural(count, what)}`),
    ];
    const what = cut ? `moved ${size.length} × ${width} cells` : insert ? `pasted ${plural(data.length, "new row")}` : `pasted ${data.length} × ${width} cells`;
    void this.host.bridge.flash(`Silverware Table: ${what}${added.length ? ` (${added.join(", ")})` : ""}`, "info");
    if (closed) this.host.focusPage();
  }
}

/** Where a row or column is once `added` were inserted (a paste's new rows or columns) */
function after(index: number | undefined, added: { readonly at: number; readonly count: number }): number | undefined {
  return index === undefined || index < added.at ? index : index + added.count;
}
