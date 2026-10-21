// The formulas module. Formulas in cells, while they are edited: a formula
// cell opens as its formula, the formula is fixed and its column references
// keyed when saved; its references are outlined in the table, can be dragged
// or pointed at, and function names complete with Tab. Formula cells are
// marked, and a table with results out of date offers to recalculate. Every
// write recalculates the table written (its write step), its references
// following moved rows and columns, and the tables of the page referring to it
// (otherTablesWritten). (Evaluating formulas and keeping them through edits is
// formula/; this is the module around it.) Turned off, nothing is
// recalculated: results stay as written.

import { columnIdOf } from "../columns.ts";
import { editorRect } from "../core/feature.ts";
import type { CellEditor, CellField, CellMenuGroup, CellRef, Feature, MetadataPart, TableHost, ToolbarButton, WidgetInfo, WriteEdit } from "../core/feature.ts";
import { WIDGET_SELECTOR } from "../dom.ts";
import {
  type Area,
  areaText,
  autofixFormula,
  callsCustomFunctions,
  columnRefText,
  formulaCell,
  formulaCount,
  formulaErrors,
  formulaHelp,
  formulaOf,
  formulasAfterEdit,
  followTable,
  functionChoices,
  nameTyped,
  needsOperator,
  type FormulaHelp,
  type FunctionChoices,
  isErrorText,
  isFormulaInput,
  type PointedSpan,
  recalculate,
  type Reference,
  referencedColumn,
  referredCellNames,
  referredPages,
  referredTableNames,
  references,
  referenceSlot,
  type TableSource,
  withColumnKeys,
} from "../formulas/index.ts";
import { addAffected, affectedBy, isAffected, pageTables, referredBy } from "../formulas/page.ts";
import { functionNamed } from "../formulas/registry.ts";
import { FunctionDialog } from "./functiondialog.ts";
import { ICONS } from "../icons.ts";
import { escapeCell, type PageTable, pageTablesOf, parseTable, type Table, unescapeCell } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { metaName } from "../meta.ts";
import { namedRows } from "../names.ts";
import { insertColumn, setCell } from "../ops.ts";
import { insertColumnAt } from "../pins.ts";
import { withoutTags } from "../tags.ts";

// New formulas are stored in the table (a <meta f> tag), as other metadata
export const FORMULAS_NEED_METADATA =
  "Formulas are stored in the table: turn on the Store table metadata setting to add them (existing ones keep working)";

// Colors of the references of the formula being edited, in the order they are written
const REFERENCE_COLORS = ["#3b6fd4", "#d0453a", "#8a55c9", "#2f9a4a", "#d9771c", "#1c9c9c"];

export class Formulas implements Feature {
  private readonly formulaHint: HTMLElement;
  private referenceMarks: HTMLElement[] = [];
  private stopReferenceDrag: (() => void) | undefined;
  // The reference last inserted by pointing at the table, and the cell its range started at
  private pointed: (PointedSpan & { readonly field: CellField; readonly anchor?: CellRef }) | undefined;
  private stopPointing: (() => void) | undefined;
  // The functions offered for the name typed (a list under the cell): which one is picked, for which name
  // typed where (`key`), and the name Esc closed the list for (it opens again once the name changes)
  private choosing: { readonly key: string; index: number } | undefined;
  private dismissed: string | undefined;
  // Every function, to find one by what it does and insert it (fx, Shift+F3, Insert function…)
  private readonly functions: FunctionDialog;
  // Tables whose formula cells show results from before a change made outside Table Plus
  private readonly stale = new WeakSet<HTMLTableElement>();
  // Tables (as rendered) with formulas: their toolbar can recalculate them
  private readonly withFormulas = new WeakSet<HTMLTableElement>();
  // The page's tables for formulas, as of the page's text and the other pages read
  private source: { readonly key: string; readonly source: TableSource } | undefined;

  constructor(private readonly host: TableHost) {
    this.formulaHint = host.floating("div", "tp-formula-hint");
    this.functions = new FunctionDialog(host);
  }

  /** The page's tables (as last read) formulas can refer to by name, and those of the other pages read */
  private tableSource(): TableSource {
    const { pageText, currentPage } = this.host;
    const others = this.host.otherPages();
    const key = `${others?.version ?? -1}\u0000${currentPage}\u0000${pageText}`;
    if (this.source?.key !== key) {
      this.source = { key, source: pageTables(() => pageTablesOf(pageText), currentPage, undefined, others) };
    }
    return this.source.source;
  }

  // ---- writing --------------------------------------------------------------------

  /**
   * The write step: calculated columns fill new rows, references follow moved
   * rows and columns, and the results are recalculated, other tables of the
   * page (the written one as edited) and of other pages read seen
   */
  writeStep(before: Table, after: Table, edit: WriteEdit): Table {
    const { page } = edit;
    const tables = pageTables(() => page.tables, this.host.currentPage, { from: page.from, table: after }, this.host.otherPages());
    return formulasAfterEdit(before, after, { ...edit, tables });
  }

  /**
   * The tables of the page whose formulas refer to the written one (by its
   * name before or after the edit, or to its named cells), or in turn to those:
   * their results for it as written, their references to it following its
   * moved rows and columns and its new name. Other tables are left as they are.
   */
  otherTablesWritten(before: Table, after: Table, edit: WriteEdit): readonly PageTable[] {
    const { page } = edit;
    const now = pageTables(() => page.tables, this.host.currentPage, { from: page.from, table: after }, this.host.otherPages());
    // Its name and the names of its cells, before and after the edit, and in turn those of the tables that refer to them
    const affected = affectedBy(before, after);
    const oldName = metaName(before)?.toLowerCase();
    // What each other table refers to, read once for all the passes below
    const others = page.tables.filter((other) => other.range.from !== page.from).map((other) => ({ ...other, referred: referredBy(other.table) }));
    const written: PageTable[] = [];
    for (let found = true; found; ) {
      found = false;
      for (let i = others.length - 1; i >= 0; i--) {
        const { range, table, referred } = others[i]!;
        if (!isAffected(referred, affected)) continue;
        others.splice(i, 1);
        found = true;
        addAffected(affected, table);
        // Its references to this table follow the edit: moved rows and columns, a new name
        const followed = oldName && referred.tables.has(oldName) ? followTable(table, before, after, edit.rowMap, edit.columnMap) : table;
        const recalculated = recalculate(followed, now);
        if (recalculated !== table) written.push({ range, table: recalculated });
      }
    }
    return written;
  }

  /**
   * "Insert numbered column left" in a column's menu: a column "#" with =ROW()
   * in every row, a calculated column (rows added later get it too). As many
   * as wanted. New formulas need the metadata setting.
   */
  columnMenuInsertEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    const insert = insertColumnAt(info.pins, info.columns, column);
    const blocked = !this.host.metadataEnabled
      ? FORMULAS_NEED_METADATA
      : insert.at > column
        ? "Columns pinned to the left stay at the left"
        : insert.at < column
          ? "Columns pinned to the right stay at the right"
          : undefined;
    return [
      {
        kind: "item",
        label: "Insert numbered column left",
        icon: ICONS.columnLeft,
        hint: "A column numbering the rows: =ROW() in each",
        disabled: blocked,
        run: () => void this.insertNumbered(widget, info, column),
      },
    ];
  }

  private insertNumbered(widget: HTMLElement, info: WidgetInfo, column: number): Promise<unknown> {
    const insert = insertColumnAt(info.pins, info.columns, column);
    return this.host.write(
      widget,
      (t) => {
        let table = setCell(insertColumn(t, insert.at), 0, insert.at, "#");
        // The write step calculates them
        for (let row = 1; row < table.rows.length; row++) table = setCell(table, row, insert.at, formulaCell("", "=ROW()"));
        return table;
      },
      { columnMap: (c) => (c >= insert.at ? c + 1 : c), pins: insert.pins },
    );
  }

  /** Remove metadata removes the formulas: their cells keep their results */
  metadataPart(tables: readonly Table[]): MetadataPart | undefined {
    const count = tables.reduce((n, table) => n + formulaCount(table), 0);
    return count ? { count, what: "formula", note: "those cells keep their current results as plain values", tags: ["f"] } : undefined;
  }

  stop(): void {
    this.stopPointing?.();
    this.hideFormulaUi();
    this.formulaHint.remove();
  }

  // ---- the cell editor ----------------------------------------------------------

  /** The formula tag (<meta f>) is the module's: edited, it is what editorValue writes */
  takesTags(): readonly string[] {
    return ["f"];
  }

  /** A formula cell's value is its formula's: pasting leaves it */
  keepsCell(cell: string): string | undefined {
    return formulaOf(cell) ? "formula cell" : undefined;
  }

  /** A formula cell is edited as its formula; a text starting with "=" as '=…, so it stays text */
  editorText(_info: WidgetInfo, cell: CellRef, original: string): string | undefined {
    if (cell.row === 0) return undefined;
    const stored = formulaOf(original);
    if (stored) return stored.formula;
    const text = unescapeCell(withoutTags(original));
    return text.startsWith("=") ? `'${text}` : undefined;
  }

  editorOpened(editor: CellEditor): void {
    const field = editor.field;
    // The formula's references are shown in the table, its function explained under the cell
    for (const type of ["input", "keyup", "click", "focus"]) {
      field.addEventListener(type, () => {
        if (this.host.editing?.field === field && !this.stopReferenceDrag) this.updateFormulaUi();
      });
    }
    // Typing makes the reference just pointed at part of the formula: pointing no longer replaces it
    (field as HTMLElement).addEventListener("keydown", (e) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) this.pointed = undefined;
    });
    this.updateFormulaUi();
  }

  /**
   * While a function name is typed, the list of the functions it may be takes
   * the keys: ↑ / ↓ pick one, Tab or Enter insert it, Esc closes the list
   * (the editor stays)
   */
  editorKeyDown(e: KeyboardEvent, editor: CellEditor): boolean {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    // Shift+F3, as in a spreadsheet: every function, to find one and insert it
    if (e.key === "F3" && e.shiftKey && editor.row > 0 && this.allowed(editor)) {
      this.openFunctions(editor);
      return true;
    }
    const choices = this.choicesNow(editor);
    if (!choices || !this.choosing) return false;
    const { index } = this.choosing;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        this.choosing.index = Math.max(0, Math.min(choices.names.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
        this.updateFormulaUi();
        return true;
      case "Tab":
      case "Enter":
        if (e.shiftKey) return false;
        this.insertFunction(editor, choices, index);
        return true;
      case "Escape":
        this.dismissed = this.choosing.key;
        this.choosing = undefined;
        this.updateFormulaUi();
        return true;
      default:
        return false;
    }
  }

  owns(node: Node): boolean {
    return this.formulaHint.contains(node);
  }

  /**
   * Whether the edited cell may hold a formula: with the metadata setting on,
   * or when it holds one already (a table with formulas keeps using them, as
   * one with a metadata row keeps its sorting)
   */
  private allowed(editor: CellEditor): boolean {
    return this.host.metadataEnabled || formulaOf(editor.original) !== undefined;
  }

  /**
   * What a typed formula is saved as: fixed where only one fix is possible
   * (said so), its column references written by the columns' keys, as a
   * formula cell whose result the write fills in. A text typed as '=… is that
   * text, and so is a formula where formulas are not allowed (said so).
   * Undefined for anything else.
   */
  editorValue(editor: CellEditor, typed: string): string | undefined {
    if (editor.row === 0) return undefined;
    if (isFormulaInput(typed) && !this.allowed(editor)) {
      void this.host.bridge.flash(`Table Plus: ${FORMULAS_NEED_METADATA}; saved as text`, "info");
      return escapeCell(typed);
    }
    if (isFormulaInput(typed)) {
      const { formula, fixes } = autofixFormula(typed.trim());
      if (fixes.length) void this.host.bridge.flash(`Table Plus: formula fixed: ${fixes.join(", ")}`, "info");
      const headers = parseTable(this.host.infoOf(editor.widget)?.source ?? "").rows[0]?.cells ?? [];
      return formulaCell("", withColumnKeys(formula, headers));
    }
    return typed.startsWith("'=") ? escapeCell(typed.slice(1)) : undefined;
  }

  editorClosed(): void {
    this.functions.close();
    this.stopPointing?.();
    this.pointed = undefined;
    this.choosing = undefined;
    this.dismissed = undefined;
    this.hideFormulaUi();
  }

  // While a formula waits for a reference, a press in its table inserts one
  beforeCellPress(widget: HTMLElement, info: WidgetInfo, cell: CellRef, e: MouseEvent): boolean {
    return this.pointReference(widget, info, cell, e);
  }

  // The outlines follow the table when it scrolls or moves
  layoutChanged(): void {
    if (this.host.editing && !this.stopReferenceDrag) this.updateFormulaUi();
  }

  // ---- formula cells in the table -------------------------------------------------

  /** Formula cells show that they hold one, and their formula (or error) on hover */
  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    const model = parseTable(info.source);
    if (formulaCount(model) === 0) return;
    this.withFormulas.add(info.table);
    const tables = this.tableSource();
    if (recalculate(model, tables) !== model) this.stale.add(info.table);
    this.markCells(info, model, tables);
  }

  /** Insert function… in a body cell's menu: the cell edited (its formula, or a new one) and the Functions dialog for it */
  cellMenuEntries(_widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): CellMenuGroup | undefined {
    const [cell] = cells;
    if (cells.length !== 1 || !cell || cell.row === 0) return undefined;
    const hasFormula = formulaOf(parseTable(info.source).rows[cell.row]?.cells[cell.column] ?? "") !== undefined;
    const allowed = this.host.metadataEnabled || hasFormula;
    return {
      order: 0,
      entries: [
        {
          kind: "item",
          label: "Insert function…",
          icon: ICONS.function,
          ...(allowed
            ? { hint: hasFormula ? "Edit the cell's formula with a function found by its name or what it does" : "Start a formula in the cell with a function found by its name or what it does" }
            : { disabled: FORMULAS_NEED_METADATA }),
          run: () => {
            this.host.editCell(info, cell, hasFormula ? undefined : "replace");
            const active = this.host.editing;
            if (!active || active.row !== cell.row || active.column !== cell.column) return;
            const field = active.field;
            if (!hasFormula) field.value = "=";
            field.setSelectionRange(field.value.length, field.value.length);
            this.updateFormulaUi();
            this.openFunctions(active);
          },
        },
      ],
    };
  }

  /** Formula cells marked, with their formulas and the reasons of their errors as their titles */
  private markCells(info: WidgetInfo, model: Table, tables: TableSource): void {
    // The reasons of errors evaluate the table again: only once a cell shows one
    let errors: Map<string, string> | undefined;
    for (const tr of this.host.bodyRows(info)) {
      const row = Number(tr.dataset.tpRow);
      model.rows[row]?.cells.forEach((raw, column) => {
        const stored = formulaOf(raw);
        const cell = tr.cells[column];
        if (!stored || !cell) return;
        const error = isErrorText(stored.value) ? (errors ??= formulaErrors(model, tables)).get(`${row},${column}`) : undefined;
        cell.classList.add("tp-formula");
        cell.classList.toggle("tp-formula-error", !!error);
        cell.title = error ? `${stored.formula}\n${error}` : stored.formula;
      });
    }
  }

  /**
   * A table rendered anew (it changed) may be one that others refer to: their
   * results are checked again, as SilverBullet keeps their widgets as they were
   */
  enhanced(widget: HTMLElement): void {
    this.recheck(widget, false);
  }

  /** Another page whose tables formulas read was changed, or the custom functions were defined anew */
  tablesChanged(): void {
    this.recheck(undefined, true);
  }

  /**
   * Checks again whether the tables that refer to other tables (but `except`)
   * are out of date; `withCustom`: those that call custom functions too (they
   * were defined anew, which an edit of a table does not do)
   */
  private recheck(except: HTMLElement | undefined, withCustom: boolean): void {
    const tables = this.tableSource();
    for (const other of Array.from(this.host.doc.querySelectorAll<HTMLElement>(`${WIDGET_SELECTOR}.tp-table`))) {
      const info = other === except ? undefined : this.host.infoOf(other);
      if (!info || !this.withFormulas.has(info.table)) continue;
      const model = parseTable(info.source);
      const refersElsewhere = referredTableNames(model).size > 0 || referredPages(model).size > 0 || referredCellNames(model).size > 0;
      if (!refersElsewhere && !(withCustom && callsCustomFunctions(model))) continue;
      if (recalculate(model, tables) !== model) this.stale.add(info.table);
      else this.stale.delete(info.table);
      // An error's reason may have changed (another page read)
      this.markCells(info, model, tables);
    }
    this.host.toolbarChanged();
  }

  /** Recalculate, first in the toolbar of a table with formulas; highlighted when results are out of date */
  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    if (!this.withFormulas.has(info.table)) return [];
    const stale = this.stale.has(info.table);
    return [
      {
        label: "Recalculate",
        place: "icon",
        icon: ICONS.recalculate,
        attention: stale,
        title: stale
          ? "Recalculate: some formula results are out of date (the table was changed outside Table Plus, TODAY() moved on, or a custom function changed)"
          : "Recalculate the formulas (their results are up to date)",
        // A write recalculates: an edit that changes nothing else
        run: () => void this.host.write(this.host.widgetForKey(info.key) ?? widget, (t) => t),
      },
    ];
  }

  // ---- help and references while a formula is edited ------------------------

  /**
   * While a formula is edited: the help for what is typed under the cell, and
   * each reference outlined in the table in its own color, as in a spreadsheet.
   * An outline's edge moves the reference, its corner resizes a range.
   */
  private updateFormulaUi(): void {
    const active = this.host.editing;
    const info = active && this.host.infoOf(active.widget);
    const formula = active?.field.value ?? "";
    if (!active || !info || active.row === 0 || !formula.trimStart().startsWith("=")) {
      this.hideFormulaUi();
      return;
    }
    if (!this.allowed(active)) {
      // No outlines, no pointing: only why the formula will be text
      this.hideFormulaUi();
      this.formulaHint.replaceChildren(
        Object.assign(this.host.doc.createElement("div"), { className: "tp-formula-help", textContent: FORMULAS_NEED_METADATA }),
      );
      const rect = editorRect(active);
      this.host.place(this.formulaHint, rect.left, rect.bottom + 4);
      return;
    }
    const refs = references(formula);
    // Where a reference can go, the table shows that cells can be pointed at
    active.widget.classList.toggle("tp-pointing", this.pointingSlot(active) !== undefined);
    this.showFormulaHint(active, formula, refs);
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
    const table = parseTable(info.source);
    refs.forEach((ref, index) => {
      const area = this.referenceArea(info, table, ref, active.row - 1);
      if (!area) return;
      const color = REFERENCE_COLORS[index % REFERENCE_COLORS.length]!;
      const boxes = this.areaBoxes(active.widget, info, area);
      boxes.forEach((box, b) => {
        const mark = this.host.floating("div", "tp-ref-mark");
        mark.style.setProperty("--tp-ref-color", color);
        Object.assign(mark.style, {
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.right - box.left}px`,
          height: `${box.bottom - box.top}px`,
        });
        for (const side of ["top", "right", "bottom", "left"]) {
          const edge = this.host.doc.createElement("div");
          edge.className = `tp-ref-edge tp-ref-${side}`;
          edge.title = "Drag to move the reference";
          edge.addEventListener("pointerdown", (e) => this.dragReference(e, index, "move"));
          mark.append(edge);
        }
        // The corner is the area's last cell: on the last box when sorting splits the area
        if (ref.kind === "area" && b === boxes.length - 1) {
          const corner = this.host.doc.createElement("div");
          corner.className = "tp-ref-corner";
          corner.title = "Drag to resize the range";
          corner.addEventListener("pointerdown", (e) => this.dragReference(e, index, "resize"));
          mark.append(corner);
        }
        mark.classList.add("tp-visible");
        this.referenceMarks.push(mark);
      });
    });
  }

  /**
   * Pointing, as in a spreadsheet: while a formula is edited and its caret is
   * where a reference can go, a click on a cell of the same table inserts the
   * cell (A1), a drag the range (A1:B3), a click on a header the column
   * ([Qty]). Pointing again replaces the reference just inserted. Returns
   * whether the click was taken.
   */
  private pointReference(widget: HTMLElement, info: WidgetInfo, cell: CellRef, e: MouseEvent): boolean {
    const active = this.host.editing;
    if (!active || active.widget !== widget) return false;
    const slot = this.pointingSlot(active);
    if (!slot) return false;
    this.stopPointing?.();
    const field = active.field;
    let span = slot;
    const put = (text: string, anchor?: CellRef) => {
      this.replaceInField(field, span.from, span.to, text);
      span = { from: span.from, to: span.from + text.length };
      field.setSelectionRange(span.to, span.to);
      this.pointed = { field, ...span, text, anchor };
      this.updateFormulaUi();
    };
    if (cell.row === 0) {
      const headers = parseTable(info.source).rows[0]?.cells ?? [];
      const text = columnRefText(columnIdOf(headers, cell.column), false);
      // A header whose name cannot be a reference: the click is taken, but inserts nothing
      if (text) put(text);
      return true;
    }
    // Shift+click extends the range just pointed at, from the cell it started at
    const last = this.pointed;
    const anchor =
      e.shiftKey && last?.field === field && last.anchor && last.from === slot.from
        ? last.anchor
        : { row: cell.row - 1, column: cell.column };
    const areaTo = (to: CellRef): Area => ({
      top: Math.min(anchor.row, to.row),
      left: Math.min(anchor.column, to.column),
      bottom: Math.max(anchor.row, to.row),
      right: Math.max(anchor.column, to.column),
    });
    put(areaText(areaTo({ row: cell.row - 1, column: cell.column })), anchor);
    // Dragging with the button held makes it a range; it ends with the button,
    // a key, the window losing focus or the editor closing
    const win = this.host.doc.defaultView!;
    const end = () => {
      win.removeEventListener("mousemove", move, true);
      win.removeEventListener("mouseup", up, true);
      win.removeEventListener("keydown", end, true);
      win.removeEventListener("blur", end);
      this.stopPointing = undefined;
    };
    const move = (ev: MouseEvent) => {
      if (this.host.editing?.field !== field || ev.buttons === 0) {
        end();
        return;
      }
      const to = this.bodyCellAt(info, ev.clientX, ev.clientY);
      const text = to && areaText(areaTo(to));
      if (text && text !== field.value.slice(span.from, span.to)) put(text, anchor);
    };
    const up = () => {
      end();
      if (this.host.editing?.field === field) field.focus({ preventScroll: true });
    };
    win.addEventListener("mousemove", move, true);
    win.addEventListener("mouseup", up, true);
    win.addEventListener("keydown", end, true);
    win.addEventListener("blur", end);
    this.stopPointing = end;
    return true;
  }

  /**
   * The functions the name typed right before the caret may be, while the
   * list of them is not closed for that name; keeps which one is picked
   */
  private choicesNow(active: CellEditor): FunctionChoices | undefined {
    if (active.row === 0 || !this.allowed(active)) return undefined;
    const field = active.field;
    const length = field.value.length;
    const choices = functionChoices(field.value, field.selectionStart ?? length, field.selectionEnd ?? length);
    if (!choices) return undefined;
    // A name typed in full that a cell on the page has is that cell, not the start of a function
    const typed = field.value.slice(choices.from, choices.to);
    if (this.tableSource().cell?.(typed)) return undefined;
    const key = `${choices.from}:${typed}`;
    if (this.dismissed === key) return undefined;
    if (this.choosing?.key !== key) this.choosing = { key, index: 0 };
    return choices;
  }

  /** Puts a function offered in place of the name typed, with its "(": the help for its arguments follows */
  private insertFunction(active: CellEditor, choices: FunctionChoices, index: number): void {
    const text = `${choices.names[index]}(`;
    this.replaceInField(active.field, choices.from, choices.to, text);
    const caret = choices.from + text.length;
    active.field.setSelectionRange(caret, caret);
    this.choosing = undefined;
    this.updateFormulaUi();
  }

  /**
   * The Functions dialog for the cell edited: the function picked goes where
   * the caret was, in place of the name typed there, after a "+" where it
   * would follow an operand (as a spreadsheet does); into a text that is no
   * formula yet, as the formula's start (=NAME()
   */
  private openFunctions(active: CellEditor): void {
    const field = active.field;
    const length = field.value.length;
    const start = field.selectionStart ?? length;
    const end = field.selectionEnd ?? length;
    const value = field.value;
    const shown = value.trimStart().startsWith("=") ? `${value.slice(0, start)}▌${value.slice(end)}` : "=▌";
    this.functions.open(shown, (name) => {
      if (this.host.editing !== active) return;
      const text = `${name}(`;
      if (!field.value.trimStart().startsWith("=")) {
        this.replaceInField(field, 0, field.value.length, `=${text}`);
        field.setSelectionRange(field.value.length, field.value.length);
      } else {
        const typed = nameTyped(field.value, start, end) ?? { from: start, to: end };
        const inserted = needsOperator(field.value, typed.from) ? `+${text}` : text;
        this.replaceInField(field, typed.from, typed.to, inserted);
        field.setSelectionRange(typed.from + inserted.length, typed.from + inserted.length);
      }
      this.choosing = undefined;
      this.updateFormulaUi();
    });
  }

  /** Where a reference pointed at in the table would go in the edited formula, if anywhere */
  private pointingSlot(active: CellEditor): { from: number; to: number } | undefined {
    if (active.row === 0 || !this.allowed(active)) return undefined;
    const field = active.field;
    const length = field.value.length;
    const pointed = this.pointed?.field === field ? this.pointed : undefined;
    return referenceSlot(field.value, field.selectionStart ?? length, field.selectionEnd ?? length, pointed);
  }

  /**
   * Replaces part of the field's text, as typing would where the browser
   * allows it (so Ctrl+Z in the field undoes it), else directly
   */
  private replaceInField(field: CellField, from: number, to: number, text: string): void {
    const expected = field.value.slice(0, from) + text + field.value.slice(to);
    field.setSelectionRange(from, to);
    try {
      if (typeof this.host.doc.execCommand === "function") this.host.doc.execCommand("insertText", false, text);
    } catch {
      // Not supported: set directly below
    }
    if (field.value !== expected) field.value = expected;
  }

  /** The formula with its references in their colors, and help for what is typed */
  private showFormulaHint(active: CellEditor, formula: string, refs: readonly Reference[]): void {
    const { doc } = this.host;
    const hint = this.formulaHint;
    // fx at the hint's edge by the cell, the formula and its help beside it
    const body = doc.createElement("div");
    body.className = "tp-formula-hint-body";
    hint.replaceChildren(this.functionsButton(active), body);
    if (refs.length) {
      const line = doc.createElement("div");
      line.className = "tp-formula-preview";
      let at = 0;
      refs.forEach((ref, index) => {
        line.append(formula.slice(at, ref.from));
        const span = doc.createElement("span");
        span.style.color = REFERENCE_COLORS[index % REFERENCE_COLORS.length]!;
        span.textContent = formula.slice(ref.from, ref.to);
        line.append(span);
        at = ref.to;
      });
      line.append(formula.slice(at));
      body.append(line);
    }
    const choices = this.choicesNow(active);
    if (choices && this.choosing) {
      body.append(this.choiceList(active, choices, this.choosing.index));
      const picked = functionNamed(choices.names[this.choosing.index]!)!;
      body.append(this.helpLine({ syntax: picked.syntax, description: picked.description }));
      body.append(Object.assign(doc.createElement("div"), { className: "tp-formula-tab", textContent: "Tab or Enter: insert · ↑ ↓: pick · Esc: close" }));
    } else {
      const help = formulaHelp(formula, active.field.selectionStart ?? formula.length);
      if (help) body.append(this.helpLine(help));
    }
    // Its cell scrolled out of view (the field with it, or the popup cut so): no help either
    const info = this.host.infoOf(active.widget);
    const cell = active.cell.getBoundingClientRect();
    if (info && (cell.width > 0 || cell.height > 0) && !this.host.shownPart(active.widget, info, active.cell)) {
      hint.classList.remove("tp-visible");
      return;
    }
    const rect = editorRect(active);
    hint.classList.remove("tp-above");
    this.host.place(hint, rect.left, rect.bottom + 4);
    // The list made anew: the one picked scrolled into its view (the list's own scroll, not the page's)
    const list = hint.querySelector<HTMLElement>(".tp-formula-choices");
    const picked = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && picked) list.scrollTop = Math.max(0, picked.offsetTop + picked.offsetHeight - list.clientHeight);
    // The page in view, cut to what an on-screen keyboard leaves: not fitting below the cell, above it where there is more room
    const view = this.host.viewBounds(active.widget);
    const below = view.bottom - (rect.bottom + 4);
    const above = rect.top - 4 - view.top;
    if (hint.offsetHeight > below && above > below) {
      // Above the cell: fx at its bottom, by the cell again
      hint.classList.add("tp-above");
      this.host.place(hint, rect.left, rect.top - 4 - hint.offsetHeight);
    }
  }

  /** The functions a name typed may be, the one picked marked; a click inserts one */
  private choiceList(active: CellEditor, choices: FunctionChoices, index: number): HTMLElement {
    const { doc } = this.host;
    const list = doc.createElement("div");
    list.className = "tp-formula-choices";
    list.setAttribute("role", "listbox");
    choices.names.forEach((name, i) => {
      const option = doc.createElement("div");
      option.className = "tp-formula-choice";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(i === index));
      const code = doc.createElement("code");
      code.textContent = name;
      const description = doc.createElement("span");
      // Its first sentence: the rest shows under the list for the one picked
      description.textContent = (functionNamed(name)?.description ?? "").split(/(?<=\.)\s/)[0]!;
      option.append(code, description);
      // The field keeps the focus (the editor stays open)
      option.addEventListener("mousedown", (e) => e.preventDefault());
      option.addEventListener("click", () => {
        if (this.host.editing === active) this.insertFunction(active, choices, i);
      });
      list.append(option);
    });
    return list;
  }

  /** fx: every function, in the Functions dialog */
  private functionsButton(active: CellEditor): HTMLElement {
    const more = this.host.doc.createElement("button");
    more.type = "button";
    more.className = "tp-formula-functions";
    more.title = "Functions: find one by its name or what it does (Shift+F3)";
    more.setAttribute("aria-label", more.title);
    more.innerHTML = ICONS.function;
    // The field keeps the focus until the dialog takes it (the editor stays open)
    more.addEventListener("mousedown", (e) => e.preventDefault());
    more.addEventListener("click", () => {
      if (this.host.editing === active) this.openFunctions(active);
    });
    return more;
  }

  /** A function's syntax, the argument the caret is in marked, and what it does */
  private helpLine(help: FormulaHelp): HTMLElement {
    const { doc } = this.host;
    const item = doc.createElement("div");
    item.className = "tp-formula-help";
    const syntax = doc.createElement("code");
    const { argument } = help;
    if (argument) {
      const current = doc.createElement("b");
      current.className = "tp-formula-argument";
      current.textContent = help.syntax.slice(argument.from, argument.to);
      syntax.append(help.syntax.slice(0, argument.from), current, help.syntax.slice(argument.to));
    } else {
      syntax.textContent = help.syntax;
    }
    const description = doc.createElement("span");
    description.textContent = help.description;
    item.append(syntax, description);
    return item;
  }

  private hideFormulaUi(): void {
    this.stopReferenceDrag?.();
    for (const widget of Array.from(this.host.doc.querySelectorAll(".tp-pointing"))) widget.classList.remove("tp-pointing");
    this.formulaHint.classList.remove("tp-visible");
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
  }

  /** The body rows and columns a reference covers, within the table; undefined if none */
  private referenceArea(info: WidgetInfo, table: Table, ref: Reference, row: number): Area | undefined {
    // Another table's cells are not outlined in this one
    if (ref.table) return undefined;
    const lastRow = info.rows - 2;
    const lastColumn = info.columns - 1;
    if (ref.kind === "column") {
      const column = referencedColumn(table.rows[0]?.cells ?? [], ref.name);
      if (column === undefined || lastRow < 0) return undefined;
      // A named row's cell: that one cell
      if (ref.row) {
        const named = namedRows(table).get(ref.row.toLowerCase());
        return named === undefined ? undefined : { top: named - 1, left: column, bottom: named - 1, right: column };
      }
      return ref.thisRow
        ? { top: row, left: column, bottom: row, right: column }
        : { top: 0, left: column, bottom: lastRow, right: column };
    }
    const { top, left, bottom, right } = ref.area;
    if (top > lastRow || left > lastColumn) return undefined;
    return { top, left, bottom: Math.min(bottom, lastRow), right: Math.min(right, lastColumn) };
  }

  /** The body rows as shown (header and filter row excluded), with their row in the markdown minus one */
  private shownBodyRows(info: WidgetInfo): { tr: HTMLTableRowElement; row: number }[] {
    return this.host
      .shownRows(info)
      .filter((tr) => tr.dataset.tpRow !== undefined)
      .map((tr) => ({ tr, row: Number(tr.dataset.tpRow) - 1 }));
  }

  /**
   * Screen boxes outlining an area: one per run of its rows that are shown
   * next to each other (sorting and filters can split an area), clipped to
   * the table's visible box
   */
  private areaBoxes(widget: HTMLElement, info: WidgetInfo, area: Area): { left: number; top: number; right: number; bottom: number }[] {
    // The table's box, cut to the page in view (a table taller than the view scrolls with the page)
    const box = this.host.innerBox(widget);
    const view = this.host.viewBounds(widget);
    const clip = {
      left: Math.max(box.left, view.left),
      top: Math.max(box.top, view.top),
      right: Math.min(box.right, view.right),
      bottom: Math.min(box.bottom, view.bottom),
    };
    // Body rows scroll under the header held at the top and the rows pinned to the bottom
    const { tHead: head, tFoot: foot } = info.table;
    const under = head ? head.getBoundingClientRect().bottom : -Infinity;
    const over = foot?.rows.length ? foot.getBoundingClientRect().top : Infinity;
    const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
    let run: HTMLTableRowElement[] = [];
    const flush = () => {
      const first = run[0]?.cells[area.left];
      const last = run[run.length - 1]?.cells[area.right];
      run = [];
      if (!first || !last) return;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      const top = first.closest("tbody") ? Math.max(clip.top, under) : clip.top;
      const bottom = last.closest("tbody") ? Math.min(clip.bottom, over) : clip.bottom;
      const outline = {
        left: Math.max(Math.min(a.left, b.left), clip.left),
        top: Math.max(Math.min(a.top, b.top), top),
        right: Math.min(Math.max(a.right, b.right), clip.right),
        bottom: Math.min(Math.max(a.bottom, b.bottom), bottom),
      };
      if (outline.right > outline.left && outline.bottom > outline.top) boxes.push(outline);
    };
    for (const { tr, row } of this.shownBodyRows(info)) {
      if (row >= area.top && row <= area.bottom) run.push(tr);
      else flush();
    }
    flush();
    return boxes;
  }

  /** The body cell (row in the markdown minus one, column) under a point, if any */
  private bodyCellAt(info: WidgetInfo, x: number, y: number): { row: number; column: number } | undefined {
    for (const { tr, row } of this.shownBodyRows(info)) {
      const rect = tr.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom) continue;
      const column = Array.from(tr.cells).findIndex((cell) => {
        const r = cell.getBoundingClientRect();
        return x >= r.left && x <= r.right;
      });
      return column < 0 ? undefined : { row, column };
    }
    return undefined;
  }

  /**
   * Dragging an outline's edge moves the reference to the cells under the
   * pointer (a column reference to another column); dragging a range's corner
   * resizes it. The formula in the editor changes as the pointer moves; Esc
   * puts it back.
   */
  private dragReference(e: PointerEvent, index: number, mode: "move" | "resize"): void {
    const active = this.host.editing;
    const info = active && this.host.infoOf(active.widget);
    if (e.button !== 0 || !active || !info) return;
    // Not prevented: the mousedown that follows is (tp-floating), which keeps the focus in the field
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    const field = active.field;
    const originalFormula = field.value;
    const ref = references(originalFormula)[index];
    const table = parseTable(info.source);
    const headers = table.rows[0]?.cells ?? [];
    const start = this.bodyCellAt(info, e.clientX, e.clientY);
    const startArea = ref && this.referenceArea(info, table, ref, active.row - 1);
    if (!ref || !start || !startArea) return;
    const lastRow = info.rows - 2;
    const lastColumn = info.columns - 1;
    const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));
    this.stopReferenceDrag?.();
    this.host.doc.body.classList.add("tp-ref-dragging");

    const textFor = (cell: { row: number; column: number }): string | undefined => {
      const dRow = cell.row - start.row;
      const dColumn = cell.column - start.column;
      if (ref.kind === "column") {
        const column = clamp(startArea.left + dColumn, lastColumn);
        return columnRefText(columnIdOf(headers, column), ref.thisRow);
      }
      if (mode === "resize") {
        return areaText({
          top: Math.min(startArea.top, cell.row),
          left: Math.min(startArea.left, cell.column),
          bottom: Math.max(startArea.top, cell.row),
          right: Math.max(startArea.left, cell.column),
        });
      }
      const height = startArea.bottom - startArea.top;
      const width = startArea.right - startArea.left;
      const top = clamp(startArea.top + dRow, lastRow - height);
      const left = clamp(startArea.left + dColumn, lastColumn - width);
      return areaText({ top, left, bottom: top + height, right: left + width });
    };

    const win = this.host.doc.defaultView!;
    const move = (ev: PointerEvent) => {
      const cell = this.bodyCellAt(info, ev.clientX, ev.clientY);
      const current = references(field.value)[index];
      const text = cell && current && textFor(cell);
      if (!text || !current || field.value.slice(current.from, current.to) === text) return;
      this.replaceInField(field, current.from, current.to, text);
      const caret = current.from + text.length;
      field.setSelectionRange(caret, caret);
      this.updateFormulaUi();
    };
    const escape = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      field.value = originalFormula;
      finish();
    };
    const finish = () => {
      this.stopReferenceDrag?.();
      if (this.host.editing?.field === field) {
        field.focus({ preventScroll: true });
        this.updateFormulaUi();
      }
    };
    // Captured, so the drag ends even when the pointer is released outside the window;
    // a cancelled pointer (touch scroll, context menu) ends it too
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // No active pointer to capture (e.g. a synthetic event): the window listeners suffice
    }
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", finish);
    win.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
    win.addEventListener("keydown", escape, true);
    this.stopReferenceDrag = () => {
      win.removeEventListener("pointermove", move);
      win.removeEventListener("pointerup", finish);
      win.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", finish);
      win.removeEventListener("keydown", escape, true);
      this.host.doc.body.classList.remove("tp-ref-dragging");
      this.stopReferenceDrag = undefined;
    };
  }
}
