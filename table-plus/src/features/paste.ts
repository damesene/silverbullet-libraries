// The clipboard's cell menu and pasting cells into a table. Copy, Cut, Paste
// and Paste as new rows in the cell menu (a touch screen has no Ctrl+C,
// Ctrl+X, Ctrl+V); Ctrl+X; and cells copied from a spreadsheet pasted from
// the cell being edited (or selected: its editor opens for the paste): over
// the cells there (Ctrl+V) or as new rows (Ctrl+Shift+V). Cells copied or
// cut are outlined, as a spreadsheet marks them (a change of them, Esc or
// another copy ends it); cut cells move when pasted into their table, and
// once the cut has ended what is pasted is a copy. Ctrl+C is the selection
// module's (its copy event outlines the cells here). Reading the
// clipboard's text and planning the paste is paste.ts; this is the editor's
// and the menu's side.
import { clipboardHtml, clipboardText, copyingFromMenu, writeClipboard } from "../clipboard.ts";
import type { CellEditor, CellMenuGroup, CellRef, Feature, TableHost, WidgetInfo } from "../core/feature.ts";
import { cellValue, OUT_OF_LINE_CLASS, UI_CLASS, WIDGET_SELECTOR } from "../dom.ts";
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

/** Cells copied or cut (`moves`): their table, the cells (rows as shown, columns left to right), what they held then, the text copied */
type Cut = {
  readonly moves: boolean;
  readonly key: string;
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
  private edges: HTMLElement[] = [];

  constructor(private readonly host: TableHost) {}

  /**
   * Where the browser says the page may read the clipboard without asking,
   * what it holds is read again when the page comes back to the front (copied
   * in another application: Excel) and on every press (copied in this page),
   * so Paste in the cell menu shows disabled when there is nothing to paste
   */
  start(): void {
    const win = this.host.doc.defaultView!;
    win.addEventListener("cut", this.onCut, true);
    win.addEventListener("copy", this.onCopy, true);
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
    win.removeEventListener("cut", this.onCut, true);
    win.removeEventListener("copy", this.onCopy, true);
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

  editorOpened(editor: CellEditor): void {
    const field = editor.field;
    // Cells copied from a spreadsheet go into the table, cells cut move there; a single value into the field
    (field as HTMLElement).addEventListener("paste", (e) => {
      const insert = this.inserts;
      this.inserts = false;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      const active = this.host.editing;
      const info = active && this.host.infoOf(active.widget);
      if (!active || !info || active.field !== field) return;
      const cut = insert ? undefined : this.cutFor(info, text);
      const data = parseClipboardCells(text);
      if (!cut && !data) return;
      e.preventDefault();
      void this.paste(active.widget, info, active, data ?? [[text]], insert, true, cut);
    });
  }

  // A table rendered anew: the cells copied or cut outlined again, or the outline (and a cut) ended where they changed
  enhanced(_widget: HTMLElement, info: WidgetInfo): void {
    if (this.cut?.key !== info.key) return;
    if (this.clipFor(info)) this.markCut(info);
    else this.endCut();
  }

  /** Copy, Cut, Paste and Paste as new rows in the cell menu */
  cellMenuEntries(widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): CellMenuGroup | undefined {
    const at = cells[0];
    if (!at) return undefined;
    const many = cells.length > 1 ? ` ${cells.length} cells` : "";
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
    const header = cells.some((ref) => ref.row === 0);
    return {
      // Before clearing: copy, cut and paste first
      order: 0.9,
      entries: [
        {
          kind: "item",
          label: `Copy${many}`,
          icon: ICONS.duplicate,
          hint: "Copy as Ctrl+C does: a spreadsheet pastes it into cells",
          run: () => void this.copy(info, cells, false),
        },
        {
          kind: "item",
          label: `Cut${many}`,
          icon: ICONS.cut,
          hint: "Copy and mark the cells, as Ctrl+X does: pasted into this table they move there",
          run: () => void this.copy(info, cells, true),
          ...(header ? { disabled: "A header keeps its name: cut the cells under it" } : {}),
        },
        {
          kind: "item",
          label: cut ? `Paste (move ${plural(cut.cells.length * (cut.cells[0]?.length ?? 0), "cell")})` : "Paste",
          icon: ICONS.paste,
          hint: cut ? "Move the cells cut here, as Ctrl+V does" : "Paste what the clipboard holds from this cell, over the cells there, as Ctrl+V does",
          run: () => void this.pasteFromMenu(widget, info, at, false),
          ...(disabled ? { disabled } : {}),
        },
        {
          kind: "item",
          label: "Paste as new rows",
          icon: ICONS.paste,
          hint: "Paste the clipboard's rows as new rows at this row, as Ctrl+Shift+V does",
          run: () => void this.pasteFromMenu(widget, info, at, true),
          ...(!clipboard?.readText ? { disabled: NO_CLIPBOARD } : disabled && !cut ? { disabled } : {}),
        },
      ],
    };
  }

  /** The cells selected, in rows as shown, of the table they are in */
  private selection(): { widget: HTMLElement; info: WidgetInfo; cells: CellRef[] } | undefined {
    for (const widget of Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = this.host.infoOf(widget);
      const cells = info ? this.host.selectedCells(info) : [];
      if (info && cells.length) return { widget, info, cells: [...cells] };
    }
    return undefined;
  }

  /** Cells as rows (as shown), and their values as Ctrl+C copies them */
  private valuesOf(info: WidgetInfo, cells: readonly CellRef[]): { rows: CellRef[][]; values: string[][] } {
    const byRow = new Map<number, CellRef[]>();
    for (const ref of cells) byRow.set(ref.row, [...(byRow.get(ref.row) ?? []), ref]);
    const rows = Array.from(byRow.values());
    const values = rows.map((row) =>
      row.map((ref) => {
        const cell = this.host.cellAt(info, ref, true);
        return cell ? cellValue(cell) : "";
      }),
    );
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
      void this.host.bridge.flash(`Table Plus: could not copy (${String(e)})`, "error");
      return;
    }
    this.startCut(info, rows, text, cutting);
    const size = `${values.length} × ${values[0]?.length ?? 0} cells`;
    void this.host.bridge.flash(cutting ? `Table Plus: cut ${size}: paste them where they go` : `Table Plus: copied ${size}`, "info");
  }

  /**
   * Ctrl+X with cells selected (not in a field: there it cuts text): the cells
   * onto the clipboard as Ctrl+C puts them, marked to move when pasted; with
   * the header in them, only copied (a column keeps its name)
   */
  private onCut = (e: ClipboardEvent): void => {
    const active = this.host.doc.activeElement;
    if (copyingFromMenu() || !e.clipboardData || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    const selected = this.selection();
    if (!selected) return;
    const { rows, values } = this.valuesOf(selected.info, selected.cells);
    const text = clipboardText(values);
    e.clipboardData.setData("text/plain", text);
    e.clipboardData.setData("text/html", clipboardHtml(values));
    e.preventDefault();
    e.stopImmediatePropagation();
    this.endCut();
    const size = `${values.length} × ${values[0]?.length ?? 0} cells`;
    if (selected.cells.some((ref) => ref.row === 0)) {
      void this.host.bridge.flash(`Table Plus: copied ${size} (a header keeps its name: cut the cells under it)`, "info");
      return;
    }
    this.startCut(selected.info, rows, text, true);
    void this.host.bridge.flash(`Table Plus: cut ${size}: paste them where they go`, "info");
  };

  /**
   * Another copy: Ctrl+C on cells selected (the selection module puts them on
   * the clipboard) outlines them, as a spreadsheet does; a copy of text ends
   * the outline and a cut (what the clipboard holds is no longer those cells).
   * A menu's copy outlines its cells itself.
   */
  private onCopy = (): void => {
    if (copyingFromMenu()) return;
    this.endCut();
    const active = this.host.doc.activeElement;
    const inField = (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && active.selectionStart !== active.selectionEnd;
    const selected = inField ? undefined : this.selection();
    if (!selected) return;
    const { rows, values } = this.valuesOf(selected.info, selected.cells);
    this.startCut(selected.info, rows, clipboardText(values), false);
  };

  private startCut(info: WidgetInfo, cells: CellRef[][], text: string, moves: boolean): void {
    const table = this.host.tableOf(info);
    const held = cells.map((row) => row.map((ref) => table.rows[ref.row]?.cells[ref.column] ?? ""));
    this.cut = { moves, key: info.key, cells, held, text: sameText(text) };
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
    const same = cut.cells.every((row, i) => row.every((ref, j) => (table.rows[ref.row]?.cells[ref.column] ?? "") === cut.held[i]![j]));
    return same ? cut : undefined;
  }

  /** The cells copied or cut outlined, dashed, as a spreadsheet marks them: a piece in each cell on the area's edge */
  private markCut(info: WidgetInfo): void {
    this.unmarkCut();
    const cut = this.cut;
    if (!cut) return;
    const last = cut.cells.length - 1;
    cut.cells.forEach((row, i) =>
      row.forEach((ref, j) => {
        const sides = [i === 0 && "top", i === last && "bottom", j === 0 && "left", j === row.length - 1 && "right"].filter(Boolean);
        const cell = sides.length ? this.host.cellAt(info, ref, true) : undefined;
        if (!cell) return;
        const edge = this.host.doc.createElement("span");
        edge.className = `${UI_CLASS} ${OUT_OF_LINE_CLASS} tp-cut-edge ${sides.map((s) => `tp-cut-${s}`).join(" ")}`;
        cell.append(edge);
        this.edges.push(edge);
      }),
    );
  }

  private unmarkCut(): void {
    for (const edge of this.edges) edge.remove();
    this.edges = [];
  }

  private endCut(): void {
    this.cut = undefined;
    this.unmarkCut();
  }

  /** The clipboard read (the browser may ask, or show its own Paste button), pasted from the cell; cells cut move there */
  private async pasteFromMenu(shownWidget: HTMLElement, shownInfo: WidgetInfo, at: CellRef, insert: boolean): Promise<void> {
    const clipboard = this.host.doc.defaultView!.navigator.clipboard;
    const cutBefore = insert ? undefined : this.cutFor(shownInfo);
    let text: string | undefined;
    if (clipboard?.readText) {
      try {
        text = await clipboard.readText();
      } catch (e) {
        // Cells cut move without it
        if (!cutBefore) {
          void this.host.bridge.flash(`Table Plus: could not read the clipboard (${String(e)})`, "error");
          return;
        }
      }
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    // What the clipboard holds now decides: the cells cut, if it is still their text (or the clipboard cannot be read)
    const cut = insert ? undefined : this.cutFor(info, text);
    if (cut) {
      await this.paste(widget, info, at, cut.held.map((row) => row.map(() => "")), false, false, cut);
      return;
    }
    if (!text) {
      // Known to stay so only where it is read again without asking (else a copy later would find Paste disabled)
      if (text === "" && this.readable) this.clipboard = "empty";
      void this.host.bridge.flash("Table Plus: the clipboard holds no text to paste", "info");
      return;
    }
    // A single value (a line break at its end, as a spreadsheet copies one cell, left out) is one cell
    const data = parseClipboardCells(text) ?? [[text.replace(/\r?\n$/, "")]];
    await this.paste(widget, info, at, data, insert);
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
    widget: HTMLElement,
    info: WidgetInfo,
    at: CellRef,
    data: string[][],
    insert: boolean,
    fromEditor = false,
    cut?: Cut,
  ): Promise<void> {
    if (this.host.rearranged(info)) {
      void this.host.bridge.flash(`Table Plus: ${PASTE_BLOCKED.toLowerCase()}`, "info");
      return;
    }
    const plan = planPaste(parseTable(info.source), info.pins, at, cut ? cut.held : data, insert);
    if ("error" in plan) {
      void this.host.bridge.flash(`Table Plus: cannot paste here: ${plan.error}`, "error");
      return;
    }
    const closed = fromEditor ? this.host.takeEditor() : undefined;
    let skipped: ReadonlyMap<string, number> = new Map();
    const { newRows, newColumns } = plan;
    const result = await this.host.write(
      closed?.widget ?? widget,
      (t) => {
        const edited = closed ? closed.save(t) : t;
        if (!edited) return undefined;
        if (cut) return moveCells(edited, cut.cells, plan);
        const pasted = pasteCells(edited, plan, data, {
          keptBy: (cell) => this.host.cellKeptBy(cell),
          keepTags: (value, from) => this.host.keepTags(value, from),
          headerRenamed: (name, from) => this.host.headerRenamed(name, from),
        });
        skipped = pasted.skipped;
        return pasted.table;
      },
      {
        columnMap: newColumns.count ? (c) => (c >= newColumns.at ? c + newColumns.count : c) : undefined,
        pins: plan.pins,
        rowMap: newRows.count ? (r) => (r >= newRows.at ? r + newRows.count : r) : undefined,
      },
    );
    if (result !== "written") {
      // Nothing changed: every cell pasted onto kept its own (a formula's): said so
      if (skipped.size) void this.host.bridge.flash(`Table Plus: nothing pasted: ${Array.from(skipped, ([what, count]) => `kept ${plural(count, what)}`).join(", ")}`, "info");
      return;
    }
    const size = cut ? cut.held : data;
    const width = Math.max(...size.map((r) => r.length));
    if (cut) this.endCut();
    const added = [
      ...(newRows.count && !insert ? [`added ${plural(newRows.count, "row")}`] : []),
      ...(newColumns.count ? [`added ${plural(newColumns.count, "column")}`] : []),
      ...Array.from(skipped, ([what, count]) => `kept ${plural(count, what)}`),
    ];
    const what = cut ? `moved ${size.length} × ${width} cells` : insert ? `pasted ${plural(data.length, "new row")}` : `pasted ${data.length} × ${width} cells`;
    void this.host.bridge.flash(`Table Plus: ${what}${added.length ? ` (${added.join(", ")})` : ""}`, "info");
    if (closed) this.host.focusEditor(closed.widget);
  }
}
