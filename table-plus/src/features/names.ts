// Names: a table's name, in its metadata row and set from its toolbar, by
// which formulas in other tables refer to it. And names kept in cells
// (names.ts): a column's name, set in the column's
// menu. Formulas and the stored sorting name the column by it, so renaming the
// header (also in the markdown) does not break them, nor references from
// other pages. Setting or removing it rewrites the references to the column on
// the page (the write steps follow the column's new name). And a cell's name,
// set in its row's menu, by which formulas on the page (vat) and on other
// pages ([[Page]]vat) use the cell wherever it is moved. And a row's name,
// also set in its menu: pear[price] is the row's Price cell, wherever the row
// is moved or sorted.
import { columnIdOf, columnKey } from "../columns.ts";
import type { CellRef, Feature, MetadataPart, TableHost, ToolbarButton, WidgetInfo } from "../core/feature.ts";
import { functionNamed } from "../formulas/registry.ts";
import { ICONS } from "../icons.ts";
import { findTables, locateBySource, parseTable, type Table } from "../markdown.ts";
import { metaName, sameTableName, tableNameProblem, withMetaName } from "../meta.ts";
import type { MenuEntry } from "../menu.ts";
import { cellNameOf, namedRows, nameOf, nameProblem, rowNameIn, withCellName, withName } from "../names.ts";
import { setCell } from "../ops.ts";

/** Names, as a sentence lists them: "pear, fig and 3 more" */
function listed(names: readonly string[]): string {
  const shown = names.slice(0, 5);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown.join("");
}

export class Names implements Feature {
  constructor(private readonly host: TableHost) {}

  /** A name is one cell's, one row's: a copy of a row takes none */
  uniqueTags(): readonly string[] {
    return ["n", "cn"];
  }

  /** Deleting a column removes the names of the rows and cells it holds, and the formulas using them break */
  columnDeleteWarning(info: WidgetInfo, column: number): string | undefined {
    const body = parseTable(info.source).rows.slice(1);
    const rows = body.flatMap((r) => {
      const named = rowNameIn(r.cells);
      return named && named.column === column ? [named.name] : [];
    });
    const cells = body.flatMap((r) => {
      const name = cellNameOf(r.cells[column] ?? "");
      return name ? [name] : [];
    });
    if (!rows.length && !cells.length) return undefined;
    const lost = [
      ...(rows.length ? [`the name${rows.length === 1 ? "" : "s"} of ${rows.length === 1 ? "the row" : `${rows.length} rows`} ${listed(rows)}`] : []),
      ...(cells.length ? [`the name${cells.length === 1 ? "" : "s"} of ${cells.length === 1 ? "the cell" : `${cells.length} cells`} ${listed(cells)}`] : []),
    ];
    return `${lost.join(" and ")}: formulas that use ${rows.length + cells.length === 1 ? "it" : "them"} show #REF! or #NAME?`;
  }

  /** Remove metadata removes the names of columns, rows and cells */
  metadataPart(tables: readonly Table[]): MetadataPart | undefined {
    const count = tables.reduce(
      (n, table) => n + table.rows.reduce((m, row) => m + row.cells.filter((cell) => nameOf(cell) !== undefined || cellNameOf(cell) !== undefined).length, 0),
      0,
    );
    return count ? { count, what: "name", tags: ["n", "cn"] } : undefined;
  }

  /** Named cells show a mark in their corner, and their name on hover */
  decorate(_widget: HTMLElement, info: WidgetInfo): void {
    const model = parseTable(info.source);
    // A column's name: the same mark in its header
    model.rows[0]?.cells.forEach((raw, column) => {
      const name = nameOf(raw);
      const cell = info.table.rows[0]?.cells[column];
      if (!name || !cell) return;
      cell.classList.add("tp-named");
      cell.title = cell.title ? `${cell.title}\nColumn name: ${name}` : `Column name: ${name}`;
    });
    for (const tr of this.host.bodyRows(info)) {
      const cells = model.rows[Number(tr.dataset.tpRow)]?.cells ?? [];
      cells.forEach((raw, column) => {
        const name = cellNameOf(raw);
        const cell = tr.cells[column];
        if (!name || !cell) return;
        cell.classList.add("tp-named");
        cell.title = cell.title ? `${cell.title}\nName: ${name}` : `Name: ${name}`;
      });
      // A named row: a mark at its first cell's edge
      const row = rowNameIn(cells)?.name;
      const first = tr.cells[0];
      if (row && first) {
        first.classList.add("tp-row-named");
        first.title = first.title ? `${first.title}\nRow name: ${row}` : `Row name: ${row}`;
      }
    }
  }

  /** The table's name at the toolbar's left, and "Name table" in its menu */
  toolbarButtons(widget: HTMLElement, info: WidgetInfo): ToolbarButton[] {
    const name = metaName(parseTable(info.source));
    // A name is metadata: with the setting off, only a table with a metadata row can get one
    if (!info.metaRow && !this.host.metadataEnabled) return [];
    const rename = () => void this.renameTable(widget, info);
    const title = name
      ? `This table is named ${name}: formulas in other tables refer to it as ${name}!A1. Click to rename it`
      : "Name this table, so formulas in other tables can refer to it (name!A1)";
    return [
      ...(name ? [{ label: name, title, place: "label" as const, run: rename }] : []),
      { label: "Name table", icon: ICONS.fixedName, ...(name ? { value: name } : {}), title, run: rename },
    ];
  }

  /**
   * Names, renames or (with an empty name) unnames a table, asking for the
   * name; refused when it is not a valid name or another table on the page has it
   */
  private async renameTable(shownWidget: HTMLElement, shownInfo: WidgetInfo): Promise<void> {
    const shown = parseTable(shownInfo.source);
    const answer = await this.host.promptText("Table name (letters, digits and _; empty: no name)", metaName(shown) ?? "");
    if (answer === undefined) return;
    const name = answer.trim();
    // Against the name as stored, so an empty answer also clears a name that is not valid
    if (name === (shown.meta?.name?.trim() ?? "")) return;
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    const info = this.host.infoOf(widget) ?? shownInfo;
    const problem = name === "" ? undefined : tableNameProblem(name);
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    if (name !== "") {
      const text = await this.host.bridge.getText();
      // This table where it is now: its position may have moved since it was rendered
      const self = locateBySource(text, info.hint, info.source);
      const taken = findTables(text).some((range) => {
        if (range.from === self?.from) return false;
        const other = metaName(parseTable(range.text));
        return other !== undefined && sameTableName(other, name);
      });
      if (taken) {
        void this.host.bridge.flash(`Table Plus: another table on this page is named ${name}`, "error");
        return;
      }
    }
    await this.host.write(widget, (t) => withMetaName(t, name === "" ? undefined : name));
    this.host.focusEditor(widget);
  }

  /** "Name row" at the top of a row's menu */
  rowMenuEntries(widget: HTMLElement, info: WidgetInfo, row: number): MenuEntry[] {
    const cells = parseTable(info.source).rows[row]?.cells ?? [];
    const rowName = rowNameIn(cells)?.name;
    const rowAllowed = this.host.metadataEnabled || rowName !== undefined;
    return [
      {
        kind: "item",
        label: "Name row",
        icon: ICONS.fixedName,
        ...(rowName ? { value: { text: rowName } } : {}),
        ...(rowAllowed
          ? {
              hint: rowName
                ? `Formulas use this row's cells as ${rowName}[column] (from other tables table!${rowName}[column]), wherever it is moved. Click to rename it`
                : "Name this row, so formulas use its cells as name[column], wherever it is moved or sorted",
            }
          : { disabled: "Needs the Store table metadata setting" }),
        run: () => void this.nameRow(widget, info, row),
      },
    ];
  }

  /** First in a cell's menu: Name cell and Name row (also in the row's menu); in a header's, Name column */
  cellMenuEntries(widget: HTMLElement, info: WidgetInfo, cells: readonly CellRef[]): { order: number; entries: MenuEntry[] } | undefined {
    const [cell] = cells;
    if (cells.length !== 1 || !cell) return undefined;
    if (cell.row === 0) return { order: 0, entries: this.columnMenuTopEntries(widget, info, cell.column) };
    const { row, column } = cell;
    const name = cellNameOf(parseTable(info.source).rows[row]?.cells[column] ?? "");
    const allowed = this.host.metadataEnabled || name !== undefined;
    const entry: MenuEntry = {
      kind: "item",
      label: "Name cell",
      icon: ICONS.fixedName,
      ...(name ? { value: { text: name } } : {}),
      ...(allowed
        ? {
            hint: name
              ? `Formulas use this cell as ${name} (on other pages [[Page]]${name}), wherever it is moved. Click to rename it`
              : "Name this cell, so formulas use it by its name (vat), wherever it is moved",
          }
        : { disabled: "Needs the Store table metadata setting" }),
      run: () => void this.nameCell(widget, info, row, column),
    };
    return { order: 0, entries: [entry, ...this.rowMenuEntries(widget, info, row)] };
  }

  private async nameRow(shownWidget: HTMLElement, shownInfo: WidgetInfo, row: number): Promise<void> {
    const table = parseTable(shownInfo.source);
    const current = rowNameIn(table.rows[row]?.cells ?? [])?.name ?? "";
    const answer = await this.host.promptText("Name of the row (letters, digits and _; empty: none)", current);
    if (answer === undefined) return;
    const name = answer.trim();
    if (name === current) return;
    let problem = name === "" ? undefined : nameProblem(name, "row");
    // The name is the table's: no other row of it may have it
    const other = name ? namedRows(table).get(name.toLowerCase()) : undefined;
    if (!problem && other !== undefined && other !== row) problem = `another row of this table is named ${name}`;
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    // Renamed where the name is (a column inserted or moved may have taken it out of the first cell)
    await this.host.write(widget, (t) => {
      const column = rowNameIn(t.rows[row]?.cells ?? [])?.column ?? 0;
      return setCell(t, row, column, withName(t.rows[row]?.cells[column] ?? "", name || undefined));
    });
    this.host.focusEditor(widget);
  }

  private async nameCell(shownWidget: HTMLElement, shownInfo: WidgetInfo, row: number, column: number): Promise<void> {
    const current = cellNameOf(parseTable(shownInfo.source).rows[row]?.cells[column] ?? "") ?? "";
    const answer = await this.host.promptText("Name of the cell (letters, digits and _; empty: none)", current);
    if (answer === undefined) return;
    const name = answer.trim();
    if (name === current) return;
    let problem = name === "" ? undefined : nameProblem(name, "cell");
    if (!problem && name && functionNamed(name.toUpperCase())) problem = `${name} is a function's name`;
    if (!problem && name) {
      // The name is the page's: no other cell on it may have it
      const text = await this.host.bridge.getText();
      const own = locateBySource(text, shownInfo.hint, shownInfo.source);
      const taken = findTables(text).some((range) =>
        parseTable(range.text).rows.some((r, ri) =>
          ri > 0 && r.cells.some((cell, ci) => cellNameOf(cell)?.toLowerCase() === name.toLowerCase() && !(own && range.from === own.from && ri === row && ci === column)),
        ),
      );
      if (taken) problem = `another cell on this page is named ${name}`;
    }
    if (problem) {
      void this.host.bridge.flash(`Table Plus: ${problem}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, row, column, withCellName(t.rows[row]?.cells[column] ?? "", name || undefined)));
    this.host.focusEditor(widget);
  }

  /** "Name column" at the top of a column's menu */
  columnMenuTopEntries(widget: HTMLElement, info: WidgetInfo, column: number): MenuEntry[] {
    const fixed = nameOf(parseTable(info.source).rows[0]?.cells[column] ?? "");
    // A name is metadata: with the setting off, only one already there can be changed or removed
    const allowed = this.host.metadataEnabled || fixed !== undefined;
    return [
      {
        kind: "item",
        label: "Name column",
        icon: ICONS.fixedName,
        ...(fixed ? { value: { text: fixed } } : {}),
        ...(allowed
          ? {
              hint: fixed
                ? `Formulas refer to this column as [${fixed}], whatever its header says. Click to rename it`
                : "Name this column, so formulas refer to it as [name] whatever its header says (also from other pages)",
            }
          : { disabled: "Needs the Store table metadata setting" }),
        run: () => void this.rename(widget, info, column),
      },
    ];
  }

  private async rename(shownWidget: HTMLElement, shownInfo: WidgetInfo, column: number): Promise<void> {
    const headers = parseTable(shownInfo.source).rows[0]?.cells ?? [];
    const current = nameOf(headers[column] ?? "") ?? "";
    const answer = await this.host.promptText("Name of the column (letters, digits and _; empty: none)", current || columnKey(headers[column] ?? ""));
    if (answer === undefined) return;
    const name = answer.trim();
    if (name === current) return;
    const problem = name === "" ? undefined : nameProblem(name, "column");
    // Another column already answers to it: [name] would be ambiguous
    const taken =
      name !== "" &&
      headers.some((header, c) => c !== column && (nameOf(header)?.toLowerCase() === name.toLowerCase() || columnIdOf(headers, c)?.name === name.toLowerCase()));
    if (problem || taken) {
      void this.host.bridge.flash(`Table Plus: ${problem ?? `another column of this table is named ${name}`}`, "error");
      return;
    }
    const widget = this.host.widgetForKey(shownInfo.key) ?? shownWidget;
    await this.host.write(widget, (t) => setCell(t, 0, column, withName(t.rows[0]?.cells[column] ?? "", name || undefined)));
    this.host.focusEditor(widget);
  }
}
