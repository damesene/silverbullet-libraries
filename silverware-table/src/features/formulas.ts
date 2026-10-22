// The formulas module. Formulas in cells, while they are edited: a formula
// cell opens as its formula, the formula is fixed and its column references
// keyed when saved; its references are outlined in the table, can be dragged
// or pointed at, and names (functions, the page's cells, rows, tables)
// complete with Tab. Formula cells are marked, and a table with results out of
// date offers to recalculate. Every
// write recalculates the table written (its write step), its references
// following moved rows and columns, and the tables of the page referring to it
// (otherTablesWritten). (Evaluating formulas and keeping them through edits is
// formula/; this is the module around it.) Turned off, nothing is
// recalculated: results stay as written.

import { columnIdOf } from "../columns.ts";
import { CELL_MENU_ORDER } from "../core/feature.ts";
import type {
  CellEditor,
  CellMenuGroup,
  CellRef,
  Feature,
  MetadataPart,
  Panel,
  Rect,
  ModelHost,
  TableLooks,
  ToolbarButton,
  TableInfo,
  WriteEdit,
} from "../core/feature.ts";
import {
  type Area,
  areaText,
  autofixFormula,
  callsCustomFunctions,
  columnRefText,
  cycleFixed,
  filledFormula,
  formulaCell,
  formulaCount,
  formulaErrors,
  formulaHelp,
  formulaOf,
  formulasAfterEdit,
  followTable,
  choiceText,
  formulaChoices,
  nameTyped,
  needsOperator,
  type FormulaChoice,
  type FormulaChoices,
  type FormulaHelp,
  isErrorText,
  isFormulaInput,
  type PointedSpan,
  qualifyCellNames,
  recalculate,
  type Reference,
  referencedColumn,
  referredPages,
  referredTableNames,
  references,
  referenceSlot,
  type TableSource,
  withColumnKeys,
} from "../formulas/index.ts";
import { addAffected, affectedBy, isAffected, ownNameChoices, pageNameChoices, pageTables, referredBy } from "../formulas/page.ts";
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

// What a name offered while typing names (the list says so beside it)
const NAME_KINDS: Readonly<Record<Exclude<FormulaChoice["kind"], "function">, string>> = {
  cell: "Named cell of this table",
  row: "Named row of this table",
  table: "Named table",
};

/** The help under the list for the choice picked: a function's syntax and description, a name's use */
function choiceHelp(choice: FormulaChoice): FormulaHelp {
  switch (choice.kind) {
    case "function": {
      const f = functionNamed(choice.name)!;
      return { syntax: f.syntax, description: f.description };
    }
    case "cell":
      return choice.table
        ? { syntax: `${choice.table}!${choice.name}`, description: `The cell named ${choice.name} in the table ${choice.table}.` }
        : { syntax: choice.name, description: "A named cell of this table: its value." };
    case "row":
      return { syntax: `${choice.name}[column]`, description: "A named row of this table: its cell in a column, e.g. pear[price]." };
    case "table":
      return { syntax: `${choice.name}!A1 · ${choice.name}![column]`, description: "A named table of the page: a cell, range or column of it." };
  }
}

// Colors of the references of the formula being edited, in the order they are written
const REFERENCE_COLORS = ["#3b6fd4", "#d0453a", "#8a55c9", "#2f9a4a", "#d9771c", "#1c9c9c"];

export class Formulas implements Feature {
  private readonly formulaHint: Panel;
  private referenceMarks: HTMLElement[] = [];
  private stopReferenceDrag: (() => void) | undefined;
  // The reference last inserted by pointing at the table (in the editor it was typed in), and the cell its range started at
  private pointed: (PointedSpan & { readonly editor: CellEditor; readonly anchor?: CellRef }) | undefined;
  private stopPointing: (() => void) | undefined;
  // The functions and names offered for the name typed (a list under the cell): which one is picked, for which name
  // typed where (`key`), and the name Esc closed the list for (it opens again once the name changes)
  private choosing: { readonly key: string; index: number } | undefined;
  // The page's names offered while a name is typed (its tables and cells), as of the page's text
  private pageNames: { readonly text: string; readonly choices: readonly FormulaChoice[] } | undefined;
  private dismissed: string | undefined;
  // Every function, to find one by what it does and insert it (fx, Shift+F3, Insert function…)
  private readonly functions: FunctionDialog;
  // Tables (by key, as of their markdown) whose formula cells show results from before a change made outside Silverware Table
  private readonly stale = new WeakMap<TableInfo, boolean>();
  // The table whose cells can be pointed at (marked)
  private pointing: string | undefined;
  // The page's tables for formulas, as of the page's text and the other pages read
  private source: { readonly key: string; readonly source: TableSource } | undefined;

  constructor(private readonly host: ModelHost) {
    this.formulaHint = host.panel("swt-formula-hint");
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
  columnMenuInsertEntries(info: TableInfo, column: number): MenuEntry[] {
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
        run: () => void this.insertNumbered(info, column),
      },
    ];
  }

  private insertNumbered(info: TableInfo, column: number): Promise<unknown> {
    const insert = insertColumnAt(info.pins, info.columns, column);
    return this.host.writeTable(
      this.host.tableFor(info.key) ?? info,
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
  editorText(_info: TableInfo, cell: CellRef, original: string): string | undefined {
    if (cell.row === 0) return undefined;
    const stored = formulaOf(original);
    if (stored) return stored.formula;
    const text = unescapeCell(withoutTags(original));
    return text.startsWith("=") ? `'${text}` : undefined;
  }

  // The formula's references are shown in the table, its function explained under the cell
  editorOpened(): void {
    this.updateFormulaUi();
  }

  editorInput(editor: CellEditor): void {
    if (this.host.editing === editor && !this.stopReferenceDrag) this.updateFormulaUi();
  }

  editorCaret(editor: CellEditor): void {
    if (this.host.editing === editor && !this.stopReferenceDrag) this.updateFormulaUi();
  }

  /**
   * While a name is typed, the list of what it may be takes the keys: ↑ / ↓
   * pick one, Tab inserts it, Esc closes the list (the editor stays). Enter is
   * not the list's, as in a spreadsheet: it saves the formula as typed, so a
   * name that is also the start of a function's (a cell `day`, DAY) is saved
   * as it is.
   */
  editorKeyDown(e: KeyboardEvent, editor: CellEditor): boolean {
    // Typing makes the reference just pointed at part of the formula: pointing no longer replaces it
    // (F4 cycles the reference just pointed at: pointing again still replaces it)
    if (!["Shift", "Control", "Alt", "Meta", "F4"].includes(e.key)) this.pointed = undefined;
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    // Shift+F3, as in a spreadsheet: every function, to find one and insert it
    if (e.key === "F3" && e.shiftKey && editor.row > 0 && this.allowed(editor)) {
      this.openFunctions(editor);
      return true;
    }
    // F4: in a formula, the reference the caret is in cycles its $ (A1, $A$1, A$1, $A1)
    if (e.key === "F4" && !e.shiftKey && editor.row > 0 && this.allowed(editor) && isFormulaInput(editor.text)) return this.cycleFixed(editor);
    const choices = this.choicesNow(editor);
    if (!choices || !this.choosing) return false;
    const { index } = this.choosing;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        this.choosing.index = Math.max(0, Math.min(choices.choices.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
        this.updateFormulaUi();
        return true;
      case "Tab": {
        if (e.shiftKey) return false;
        // The name typed in full is the one picked (a cell's): nothing to insert, Tab moves on as elsewhere
        const typed = editor.text.slice(choices.from, choices.to);
        if (choiceText(choices.choices[index]!) === typed) return false;
        this.insertChoice(editor, choices, index);
        return true;
      }
      case "Escape":
        this.dismissed = this.choosing.key;
        this.choosing = undefined;
        this.updateFormulaUi();
        return true;
      default:
        return false;
    }
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
      void this.host.bridge.flash(`Silverware Table: ${FORMULAS_NEED_METADATA}; saved as text`, "info");
      return escapeCell(typed);
    }
    if (isFormulaInput(typed)) {
      const slips = autofixFormula(typed.trim());
      // Names of other tables' cells written bare, as before a name was its table's: prices!vat
      const info = this.host.tableFor(editor.key);
      const names = info ? qualifyCellNames(slips.formula, this.host.tableOf(info), this.tableSource()) : { formula: slips.formula, fixes: [] };
      const formula = names.formula;
      const fixes = [...slips.fixes, ...names.fixes];
      if (fixes.length) void this.host.bridge.flash(`Silverware Table: formula fixed: ${fixes.join(", ")}`, "info");
      const headers = parseTable(info?.source ?? "").rows[0]?.cells ?? [];
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
  beforeCellPress(info: TableInfo, cell: CellRef, e: MouseEvent): boolean {
    return this.pointReference(info, cell, e);
  }

  // The outlines follow the table when it scrolls or moves
  layoutChanged(): void {
    if (this.host.editing && !this.stopReferenceDrag) this.updateFormulaUi();
  }

  // ---- formula cells in the table -------------------------------------------------

  /** Formula cells show that they hold one, and their formula (or error) on hover; a table whose results are out of date is noted */
  looks(info: TableInfo): TableLooks | undefined {
    const model = parseTable(info.source);
    if (formulaCount(model) === 0) return undefined;
    const tables = this.tableSource();
    // Checked for each rendering, not once per text: TODAY() and NOW() move on while the markdown stays
    if (!this.stale.has(info)) this.stale.set(info, recalculate(model, tables) !== model);
    return { cells: this.formulaLooks(model, tables) };
  }

  /**
   * AutoFill: a formula cell copied into another cell, its references moved
   * as far (those fixed with $ not); its result is calculated as it is
   * written. A new formula is metadata: without the setting it is copied as
   * its value.
   */
  fillCell(info: TableInfo, cell: string, from: CellRef, to: CellRef): string | undefined {
    const stored = formulaOf(cell);
    if (!stored || from.row === 0 || to.row === 0 || !this.host.metadataEnabled) return undefined;
    const table = parseTable(info.source);
    const size = { rows: table.rows.length - 1, columns: table.rows[0]?.cells.length ?? 0 };
    return formulaCell("", filledFormula(stored.formula, to.row - from.row, to.column - from.column, size));
  }

  /** Insert function… in a body cell's menu: the cell edited (its formula, or a new one) and the Functions dialog for it */
  cellMenuEntries(info: TableInfo, cells: readonly CellRef[]): CellMenuGroup | undefined {
    const [cell] = cells;
    if (cells.length !== 1 || !cell || cell.row === 0) return undefined;
    const hasFormula = formulaOf(parseTable(info.source).rows[cell.row]?.cells[cell.column] ?? "") !== undefined;
    const allowed = this.host.metadataEnabled || hasFormula;
    return {
      // After clearing and moving: what is written into the cell
      order: CELL_MENU_ORDER.inserting,
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
            if (!hasFormula) active.setText("=");
            else active.select(active.text.length, active.text.length);
            this.updateFormulaUi();
            this.openFunctions(active);
          },
        },
      ],
    };
  }

  /** Formula cells marked, with their formulas and the reasons of their errors as their titles */
  private formulaLooks(model: Table, tables: TableSource): { row: number; column: number; marks: string[]; title: string }[] {
    // The reasons of errors evaluate the table again: only once a cell shows one
    let errors: Map<string, string> | undefined;
    const looks: { row: number; column: number; marks: string[]; title: string }[] = [];
    model.rows.forEach((r, row) => {
      if (row === 0) return;
      r.cells.forEach((raw, column) => {
        const stored = formulaOf(raw);
        if (!stored) return;
        const error = isErrorText(stored.value) ? (errors ??= formulaErrors(model, tables)).get(`${row},${column}`) : undefined;
        looks.push({ row, column, marks: error ? ["formula", "formula-error"] : ["formula"], title: error ? `${stored.formula}\n${error}` : stored.formula });
      });
    });
    return looks;
  }

  /**
   * A table rendered anew (it changed) may be one that others refer to: their
   * results are checked again, as SilverBullet keeps their widgets as they were
   */
  enhanced(info: TableInfo): void {
    this.recheck(info.key, false);
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
  private recheck(except: string | undefined, withCustom: boolean): void {
    const tables = this.tableSource();
    for (const info of this.host.shownTables()) {
      if (info.key === except) continue;
      const model = parseTable(info.source);
      if (formulaCount(model) === 0) continue;
      const refersElsewhere = referredTableNames(model).size > 0 || referredPages(model).size > 0;
      if (!refersElsewhere && !(withCustom && callsCustomFunctions(model))) continue;
      this.stale.set(info, recalculate(model, tables) !== model);
      // An error's reason may have changed (another page read)
      this.host.looksChanged(info);
    }
    this.host.toolbarChanged();
  }

  /** Recalculate, first in the toolbar of a table with formulas; highlighted when results are out of date */
  toolbarButtons(info: TableInfo): ToolbarButton[] {
    if (formulaCount(parseTable(info.source)) === 0) return [];
    const stale = this.stale.get(info) ?? false;
    return [
      {
        label: "Recalculate",
        place: "icon",
        icon: ICONS.recalculate,
        attention: stale,
        title: stale
          ? "Recalculate: some formula results are out of date (the table was changed outside Silverware Table, TODAY() moved on, or a custom function changed)"
          : "Recalculate the formulas (their results are up to date)",
        // A write recalculates: an edit that changes nothing else
        run: () => void this.host.writeTable(this.host.tableFor(info.key) ?? info, (t) => t),
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
    const info = active && this.host.tableFor(active.key);
    const formula = active?.text ?? "";
    if (!active || !info || active.row === 0 || !formula.trimStart().startsWith("=")) {
      this.hideFormulaUi();
      return;
    }
    if (!this.allowed(active)) {
      // No outlines, no pointing: only why the formula will be text
      this.hideFormulaUi();
      this.formulaHint.element.replaceChildren(
        Object.assign(this.host.doc.createElement("div"), { className: "swt-formula-help", textContent: FORMULAS_NEED_METADATA }),
      );
      this.formulaHint.show({ kind: "editor" }, { gap: 4 });
      return;
    }
    const refs = references(formula);
    // Where a reference can go, the table shows that cells can be pointed at
    this.markPointing(this.pointingSlot(active) !== undefined ? info.key : undefined);
    this.showFormulaHint(active, formula, refs);
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
    const table = parseTable(info.source);
    refs.forEach((ref, index) => {
      const area = this.referenceArea(info, table, ref, active.row - 1);
      if (!area) return;
      const color = REFERENCE_COLORS[index % REFERENCE_COLORS.length]!;
      const boxes = this.areaBoxes(info, area);
      boxes.forEach((box, b) => {
        const mark = this.host.floating("div", "swt-ref-mark");
        mark.style.setProperty("--swt-ref-color", color);
        Object.assign(mark.style, {
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.right - box.left}px`,
          height: `${box.bottom - box.top}px`,
        });
        for (const side of ["top", "right", "bottom", "left"]) {
          const edge = this.host.doc.createElement("div");
          edge.className = `swt-ref-edge swt-ref-${side}`;
          edge.title = "Drag to move the reference";
          edge.addEventListener("pointerdown", (e) => this.dragReference(e, index, "move"));
          mark.append(edge);
        }
        // The corner is the area's last cell: on the last box when sorting splits the area
        if (ref.kind === "area" && b === boxes.length - 1) {
          const corner = this.host.doc.createElement("div");
          corner.className = "swt-ref-corner";
          corner.title = "Drag to resize the range";
          corner.addEventListener("pointerdown", (e) => this.dragReference(e, index, "resize"));
          mark.append(corner);
        }
        mark.classList.add("swt-visible");
        this.referenceMarks.push(mark);
      });
    });
  }

  /** The table whose cells can be pointed at now, marked (none: undefined) */
  private markPointing(key: string | undefined): void {
    if (this.pointing === key) return;
    if (this.pointing !== undefined) this.host.tableMark(this.pointing, "pointing", false);
    this.pointing = key;
    if (key !== undefined) this.host.tableMark(key, "pointing", true);
  }

  /**
   * Pointing, as in a spreadsheet: while a formula is edited and its caret is
   * where a reference can go, a click on a cell of the same table inserts the
   * cell (A1), a drag the range (A1:B3), a click on a header the column
   * ([Qty]). Pointing again replaces the reference just inserted. Returns
   * whether the click was taken.
   */
  private pointReference(info: TableInfo, cell: CellRef, e: MouseEvent): boolean {
    const active = this.host.editing;
    if (!active || active.key !== info.key) return false;
    const slot = this.pointingSlot(active);
    if (!slot) return false;
    this.stopPointing?.();
    let span = slot;
    const put = (text: string, anchor?: CellRef) => {
      active.insert(span.from, span.to, text);
      span = { from: span.from, to: span.from + text.length };
      active.select(span.to, span.to);
      this.pointed = { editor: active, ...span, text, anchor };
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
      e.shiftKey && last?.editor === active && last.anchor && last.from === slot.from
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
    const end = () => {
      stop();
      this.stopPointing = undefined;
    };
    const stop = this.host.drag(e, {
      key: info.key,
      events: "mouse",
      onMove: (at) => {
        if (this.host.editing !== active) {
          end();
          return;
        }
        const to = this.bodyCellAt(info, at.x, at.y);
        const text = to && areaText(areaTo(to));
        if (text && text !== active.text.slice(span.from, span.to)) put(text, anchor);
      },
      onKey: end,
      onEnd: (_, cancelled) => {
        this.stopPointing = undefined;
        if (!cancelled && this.host.editing === active) active.focus();
      },
    });
    this.stopPointing = end;
    return true;
  }

  /** F4 in a formula: the $ of the reference at the caret cycled, the caret after it */
  private cycleFixed(active: CellEditor): boolean {
    const caret = active.selection[1];
    const cycled = cycleFixed(active.text, caret);
    if (!cycled) return false;
    // Replaced as typing would (Ctrl+Z in the field undoes it)
    active.insert(cycled.from, cycled.to, cycled.text);
    // The reference just pointed at, cycled: still the one pointing again replaces
    const pointed = this.pointed;
    if (pointed?.editor === active && pointed.from === cycled.from && pointed.to === cycled.to) {
      this.pointed = { ...pointed, to: cycled.from + cycled.text.length, text: cycled.text };
    }
    active.select(cycled.from + cycled.text.length, cycled.from + cycled.text.length);
    this.updateFormulaUi();
    return true;
  }

  /**
   * The functions and the page's names the name typed right before the caret
   * may be, while the list of them is not closed for that name; keeps which
   * one is picked
   */
  private choicesNow(active: CellEditor): FormulaChoices | undefined {
    if (active.row === 0 || !this.allowed(active)) return undefined;
    const text = active.text;
    const [from, to] = active.selection;
    const info = this.host.tableFor(active.key);
    const own = info ? metaName(this.host.tableOf(info)) : undefined;
    const choices = formulaChoices(text, from, to, info ? this.namesFor(info) : [], own);
    if (!choices) return undefined;
    const typed = text.slice(choices.from, choices.to);
    const key = `${choices.from}:${typed}`;
    if (this.dismissed === key) return undefined;
    if (this.choosing?.key !== key) this.choosing = { key, index: 0 };
    // The same name typed, fewer choices (the page read anew meanwhile): the pick stays in the list
    else this.choosing.index = Math.min(this.choosing.index, choices.choices.length - 1);
    return choices;
  }

  /**
   * The names a formula in this table can refer to: the page's (read once per
   * page's text), its own cells bare instead of as its table's, and its own
   * names as edited (the table only, so cheap whatever edits a feature holds)
   */
  private namesFor(info: TableInfo): readonly FormulaChoice[] {
    const text = this.host.pageText;
    if (this.pageNames?.text !== text) this.pageNames = { text, choices: pageNameChoices(pageTablesOf(text)) };
    const table = this.host.tableOf(info);
    const own = metaName(table)?.toLowerCase();
    const others = this.pageNames.choices.filter((choice) => !(choice.table && choice.table.toLowerCase() === own));
    return [...others, ...ownNameChoices(table)];
  }

  /**
   * Puts a choice in place of the name typed: a function with its "(" (the
   * help for its arguments follows), a cell's name, a row's with its "[", a
   * table's with its "!"
   */
  private insertChoice(active: CellEditor, choices: FormulaChoices, index: number): void {
    const text = choiceText(choices.choices[index]!);
    active.insert(choices.from, choices.to, text);
    const caret = choices.from + text.length;
    active.select(caret, caret);
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
    const [start, end] = active.selection;
    const value = active.text;
    const shown = value.trimStart().startsWith("=") ? `${value.slice(0, start)}▌${value.slice(end)}` : "=▌";
    this.functions.open(shown, (name) => {
      if (this.host.editing !== active) return;
      const text = `${name}(`;
      if (!active.text.trimStart().startsWith("=")) {
        active.insert(0, active.text.length, `=${text}`);
        active.select(active.text.length, active.text.length);
      } else {
        const typed = nameTyped(active.text, start, end) ?? { from: start, to: end };
        const inserted = needsOperator(active.text, typed.from) ? `+${text}` : text;
        active.insert(typed.from, typed.to, inserted);
        active.select(typed.from + inserted.length, typed.from + inserted.length);
      }
      this.choosing = undefined;
      this.updateFormulaUi();
    });
  }

  /** Where a reference pointed at in the table would go in the edited formula, if anywhere */
  private pointingSlot(active: CellEditor): { from: number; to: number } | undefined {
    if (active.row === 0 || !this.allowed(active)) return undefined;
    const pointed = this.pointed?.editor === active ? this.pointed : undefined;
    const [from, to] = active.selection;
    return referenceSlot(active.text, from, to, pointed);
  }

  /** The formula with its references in their colors, and help for what is typed */
  private showFormulaHint(active: CellEditor, formula: string, refs: readonly Reference[]): void {
    const { doc } = this.host;
    const hint = this.formulaHint.element;
    // fx at the hint's edge by the cell, the formula and its help beside it
    const body = doc.createElement("div");
    body.className = "swt-formula-hint-body";
    hint.replaceChildren(this.functionsButton(active), body);
    if (refs.length) {
      const line = doc.createElement("div");
      line.className = "swt-formula-preview";
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
      body.append(this.helpLine(choiceHelp(choices.choices[this.choosing.index]!)));
      body.append(Object.assign(doc.createElement("div"), { className: "swt-formula-tab", textContent: "Tab: insert · ↑ ↓: pick · Enter: save as typed · Esc: close" }));
    } else {
      const help = formulaHelp(formula, active.selection[0]);
      if (help) body.append(this.helpLine(help));
    }
    // Under the cell, above it where it does not fit and there is more room (fx at its bottom, by the cell again);
    // its cell scrolled out of view (the field with it, or the popup cut so): none, as there is no help either
    this.formulaHint.show({ kind: "editor" }, { gap: 4 });
    // The list made anew: the one picked scrolled into its view (the list's own scroll, not the page's)
    const list = hint.querySelector<HTMLElement>(".swt-formula-choices");
    const picked = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && picked) list.scrollTop = Math.max(0, picked.offsetTop + picked.offsetHeight - list.clientHeight);
  }

  /** The functions and names a name typed may be, the one picked marked; a click inserts one */
  private choiceList(active: CellEditor, choices: FormulaChoices, index: number): HTMLElement {
    const { doc } = this.host;
    const list = doc.createElement("div");
    list.className = "swt-formula-choices";
    list.setAttribute("role", "listbox");
    choices.choices.forEach((choice, i) => {
      const option = doc.createElement("div");
      option.className = `swt-formula-choice swt-formula-choice-${choice.kind}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(i === index));
      const code = doc.createElement("code");
      code.textContent = choiceText(choice).replace(/[([!]$/, "");
      const description = doc.createElement("span");
      // A function: its first sentence (the rest shows under the list for the one picked); a name: what it names
      description.textContent =
        choice.kind === "function"
          ? (functionNamed(choice.name)?.description ?? "").split(/(?<=\.)\s/)[0]!
          : choice.table
            ? `Named cell of ${choice.table}`
            : NAME_KINDS[choice.kind];
      option.append(code, description);
      // The field keeps the focus (the editor stays open)
      option.addEventListener("mousedown", (e) => e.preventDefault());
      option.addEventListener("click", () => {
        if (this.host.editing === active) this.insertChoice(active, choices, i);
      });
      list.append(option);
    });
    return list;
  }

  /** fx: every function, in the Functions dialog */
  private functionsButton(active: CellEditor): HTMLElement {
    const more = this.host.doc.createElement("button");
    more.type = "button";
    more.className = "swt-formula-functions";
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
    item.className = "swt-formula-help";
    const syntax = doc.createElement("code");
    const { argument } = help;
    if (argument) {
      const current = doc.createElement("b");
      current.className = "swt-formula-argument";
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
    this.markPointing(undefined);
    this.formulaHint.hide();
    for (const mark of this.referenceMarks) mark.remove();
    this.referenceMarks = [];
  }

  /** The body rows and columns a reference covers, within the table; undefined if none */
  private referenceArea(info: TableInfo, table: Table, ref: Reference, row: number): Area | undefined {
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

  /**
   * Screen boxes outlining an area: one per run of its rows that are shown
   * next to each other (sorting and filters can split an area), clipped to
   * what of the table is in view (the core's)
   */
  private areaBoxes(info: TableInfo, area: Area): Rect[] {
    const boxes: Rect[] = [];
    let run: number[] = [];
    const flush = () => {
      const first = run[0];
      const last = run[run.length - 1];
      run = [];
      if (first === undefined || last === undefined) return;
      const box = this.host.areaRect(info, { row: first, column: area.left }, { row: last, column: area.right });
      if (box) boxes.push(box);
    };
    // The body rows as shown, by their row in the markdown minus one
    for (const shown of this.host.shownOrder(info)) {
      if (shown === 0) continue;
      const row = shown - 1;
      if (row >= area.top && row <= area.bottom) run.push(shown);
      else flush();
    }
    flush();
    return boxes;
  }

  /** The body cell (row in the markdown minus one, column) under a point, if any */
  private bodyCellAt(info: TableInfo, x: number, y: number): { row: number; column: number } | undefined {
    const cell = this.host.cellAtPoint(info, x, y);
    return cell && cell.row > 0 ? { row: cell.row - 1, column: cell.column } : undefined;
  }

  /**
   * Dragging an outline's edge moves the reference to the cells under the
   * pointer (a column reference to another column); dragging a range's corner
   * resizes it. The formula in the editor changes as the pointer moves; Esc
   * puts it back.
   */
  private dragReference(e: PointerEvent, index: number, mode: "move" | "resize"): void {
    const active = this.host.editing;
    const info = active && this.host.tableFor(active.key);
    if (e.button !== 0 || !active || !info) return;
    // Not prevented: the mousedown that follows is (swt-floating), which keeps the focus in the field
    e.stopPropagation();
    const originalFormula = active.text;
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

    const textFor = (cell: { row: number; column: number }): string | undefined => {
      const dRow = cell.row - start.row;
      const dColumn = cell.column - start.column;
      if (ref.kind === "column") {
        const column = clamp(startArea.left + dColumn, lastColumn);
        return columnRefText(columnIdOf(headers, column), ref.thisRow);
      }
      // Its $ kept, moved or resized (on the edges as written)
      if (mode === "resize") {
        return areaText(
          {
            top: Math.min(startArea.top, cell.row),
            left: Math.min(startArea.left, cell.column),
            bottom: Math.max(startArea.top, cell.row),
            right: Math.max(startArea.left, cell.column),
          },
          ref.fixed,
        );
      }
      const height = startArea.bottom - startArea.top;
      const width = startArea.right - startArea.left;
      const top = clamp(startArea.top + dRow, lastRow - height);
      const left = clamp(startArea.left + dColumn, lastColumn - width);
      return areaText({ top, left, bottom: top + height, right: left + width }, ref.fixed);
    };

    const stop = this.host.drag(e, {
      key: info.key,
      events: "pointer",
      pageMark: "ref-dragging",
      // Esc puts the formula back; a cancelled pointer (a touch scroll, a context menu) keeps what was dragged
      onKey: (ev) => {
        if (ev.type !== "keydown" || ev.key !== "Escape") return;
        ev.preventDefault();
        ev.stopPropagation();
        stop();
        this.stopReferenceDrag = undefined;
        if (this.host.editing !== active) return;
        active.setText(originalFormula);
        active.focus();
        this.updateFormulaUi();
      },
      onMove: (at) => {
        const cell = this.bodyCellAt(info, at.x, at.y);
        const current = references(active.text)[index];
        const text = cell && current && textFor(cell);
        if (!text || !current || active.text.slice(current.from, current.to) === text) return;
        active.insert(current.from, current.to, text);
        const caret = current.from + text.length;
        active.select(caret, caret);
        this.updateFormulaUi();
      },
      onEnd: () => {
        this.stopReferenceDrag = undefined;
        if (this.host.editing !== active) return;
        active.focus();
        this.updateFormulaUi();
      },
    });
    this.stopReferenceDrag = () => {
      stop();
      this.stopReferenceDrag = undefined;
    };
  }
}
