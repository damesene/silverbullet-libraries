// Names, each set by the pencil in the title of a menu (menuNaming): a
// table's name, in its metadata row (the ⋯ menu), by which formulas in other
// tables refer to it. And names kept in cells (names.ts): a column's name (its
// menu, or a header's cell menu). Formulas and the stored sorting name the
// column by it, so renaming the header (also in the markdown) does not break
// them, nor references from other pages. Setting or removing it rewrites the
// references to the column on the page (the write steps follow the column's
// new name). And a cell's name (its cell menu), unique in its table, by which
// formulas use the cell wherever it is moved: in its table vat, in another
// prices!vat, on another page [[Page]]prices!vat.
// And a row's name (its row menu): pear[price] is the row's Price cell,
// wherever the row is moved or sorted.
// A name more than one table of the page has (typed into the markdown, a
// table copied with it): formulas elsewhere use the first of them, so each
// such table's name shows in the danger color in the toolbar, whatever the
// setting, and it is said once (again once it was not shared meanwhile).
import { columnIdOf } from "../columns.ts";
import type { CellLook, CellRef, Feature, HeaderLook, MetadataPart, NamingTarget, ModelHost, TableLooks, ToolbarButton, TableInfo } from "../core/feature.ts";
import { functionNamed } from "../formulas/registry.ts";
import { findTables, locateBySource, parseTable, type Table } from "../markdown.ts";
import { metaName, sameTableName, tableNameProblem, withMetaName } from "../meta.ts";
import type { MenuNaming } from "../menu.ts";
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
  constructor(private readonly host: ModelHost) {}

  // The names (lowercase) more than one table of the page has, by how many, for the page's text as last read
  private shared: { readonly text: string; readonly names: ReadonlyMap<string, number> } | undefined;
  // The names said to be shared on this page so far
  private readonly told = new Set<string>();

  private sharedNames(): ReadonlyMap<string, number> {
    const text = this.host.pageText;
    if (this.shared?.text !== text) {
      const counts = new Map<string, number>();
      for (const range of findTables(text)) {
        const name = metaName(parseTable(range.text))?.toLowerCase();
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      this.shared = { text, names: new Map([...counts].filter(([, n]) => n > 1)) };
    }
    return this.shared.names;
  }

  /** The table's name, if another table of the page has it too */
  private sharedName(info: TableInfo): string | undefined {
    const name = metaName(parseTable(info.source));
    return name && this.sharedNames().has(name.toLowerCase()) ? name : undefined;
  }

  /** Another page: its names said anew */
  pageLoaded(): void {
    this.told.clear();
  }

  /** A table whose name another has too: said, once for that name on the page */
  enhanced(info: TableInfo): void {
    // (The page's text as last read without this table as rendered: read before it, nothing to tell by)
    if (!this.host.pageText.includes(info.source)) return;
    const shared = this.sharedNames();
    const own = metaName(parseTable(info.source))?.toLowerCase();
    // No longer shared (renamed): said again should it be shared again
    if (own && !shared.has(own)) this.told.delete(own);
    const name = this.sharedName(info);
    if (!name || this.told.has(name.toLowerCase())) return;
    this.told.add(name.toLowerCase());
    const count = shared.get(name.toLowerCase())!;
    void this.host.bridge.flash(
      `Silverware Table: ${count} tables on this page are named ${name}: formulas in other tables use the first of them. Rename the others (their name in the toolbar, in red)`,
      "error",
      // Until closed: what is wrong stays wrong until a table is renamed
      { timeout: 0 },
    );
  }

  /** A name is one cell's, one row's: a copy of a row takes none */
  uniqueTags(): readonly string[] {
    return ["n", "cn"];
  }

  /** Deleting a column removes the names of the rows and cells it holds, and the formulas using them break */
  columnDeleteWarning(info: TableInfo, column: number): string | undefined {
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
  looks(_info: TableInfo, table: Table): TableLooks | undefined {
    const headers: ({ column: number } & HeaderLook)[] = [];
    const cells: (CellRef & CellLook)[] = [];
    // A column's name: the same mark in its header
    table.rows[0]?.cells.forEach((raw, column) => {
      const name = nameOf(raw);
      if (name) headers.push({ column, marks: ["named"], title: `Column name: ${name}` });
    });
    table.rows.forEach((r, row) => {
      if (row === 0) return;
      r.cells.forEach((raw, column) => {
        const name = cellNameOf(raw);
        if (name) cells.push({ row, column, marks: ["named"], title: `Name: ${name}` });
      });
      // A named row: a mark at its first cell's edge
      const name = rowNameIn(r.cells)?.name;
      if (name) cells.push({ row, column: 0, marks: ["row-named"], title: `Row name: ${name}` });
    });
    return headers.length || cells.length ? { headers, cells } : undefined;
  }

  /** The table's name in the toolbar's row of names, Table (muted) without one: a click on it its field */
  toolbarButtons(info: TableInfo): ToolbarButton[] {
    const name = metaName(parseTable(info.source));
    const shared = this.sharedName(info) !== undefined;
    const title = shared
      ? `Another table on this page is named ${name} too: formulas in other tables use the first of them (${name}!A1). Click to rename this one`
      : name
        ? `This table is named ${name}: formulas in other tables refer to it as ${name}!A1. Click to rename it`
        : "This table has no name: click to name it, so formulas in other tables can refer to it (name!A1)";
    const naming = this.menuNaming(info, { kind: "table" });
    const look = shared ? { attention: true } : name ? {} : { muted: true };
    return [{ label: name ?? "Table", title, place: "name", slot: "table", ...look, ...(naming ? { naming } : {}), run: () => {} }];
  }

  /**
   * The name of what a menu is about, in its title with a pencil: the table's
   * (formulas elsewhere use it as name!A1), a row's (name[column]), a cell's,
   * a column's ([name] whatever its header says). Names are metadata: with
   * the setting off only one already there can be changed or removed.
   */
  menuNaming(info: TableInfo, target: NamingTarget): MenuNaming | undefined {
    const table = parseTable(info.source);
    const needs = "Needs the Store table metadata setting";
    if (target.kind === "table") {
      const name = metaName(table);
      return {
        ...(name ? { name } : {}),
        label: name ? `Rename this table (formulas elsewhere refer to it as ${name}!A1)` : "Name this table, so formulas in other tables can refer to it (name!A1)",
        clear: { label: "Remove name", title: "The table without a name: formulas in other tables that refer to it by it show #REF!" },
        ...(info.metaRow || this.host.metadataEnabled ? {} : { disabled: needs }),
        save: (next) => this.renameTable(info, next),
      };
    }
    if (target.kind === "row") {
      const name = rowNameIn(table.rows[target.row]?.cells ?? [])?.name;
      return {
        ...(name ? { name } : {}),
        label: name ? `Rename this row (formulas use its cells as ${name}[column])` : "Name this row, so formulas use its cells as name[column], wherever it is moved",
        ...(this.host.metadataEnabled || name !== undefined ? {} : { disabled: needs }),
        save: (next) => this.nameRow(info, target.row, next),
      };
    }
    if (target.kind === "cell") {
      const name = cellNameOf(table.rows[target.row]?.cells[target.column] ?? "");
      return {
        ...(name ? { name } : {}),
        label: name ? `Rename this cell (formulas use it as ${name})` : "Name this cell, so formulas use it by its name, wherever it is moved",
        ...(this.host.metadataEnabled || name !== undefined ? {} : { disabled: needs }),
        save: (next) => this.nameCell(info, target.row, target.column, next),
      };
    }
    const name = nameOf(table.rows[0]?.cells[target.column] ?? "");
    return {
      ...(name ? { name } : {}),
      label: name ? `Rename this column (formulas refer to it as [${name}])` : "Name this column, so formulas refer to it as [name] whatever its header says",
      ...(this.host.metadataEnabled || name !== undefined ? {} : { disabled: needs }),
      save: (next) => this.rename(info, target.column, next),
    };
  }

  /** A name saved as it was: nothing written, the keyboard back in the page (the menu's field had it) */
  private unchanged(): undefined {
    this.host.focusPage();
    return undefined;
  }

  /**
   * Names, renames or (with an empty name) unnames a table; refused, with
   * why, when it is not a valid name or another table on the page has it
   */
  private async renameTable(shownInfo: TableInfo, name: string): Promise<string | undefined> {
    const shown = parseTable(shownInfo.source);
    // Against the name as stored, so an empty answer also clears a name that is not valid
    if (name === (shown.meta?.name?.trim() ?? "")) return this.unchanged();
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    const problem = name === "" ? undefined : tableNameProblem(name);
    if (problem) return problem;
    if (name !== "") {
      const text = await this.host.bridge.getText();
      // This table where it is now: its position may have moved since it was rendered
      const self = locateBySource(text, info.hint, info.source);
      const taken = findTables(text).some((range) => {
        if (range.from === self?.from) return false;
        const other = metaName(parseTable(range.text));
        return other !== undefined && sameTableName(other, name);
      });
      if (taken) return `another table on this page is named ${name}`;
    }
    await this.host.writeTable(info, (t) => withMetaName(t, name === "" ? undefined : name));
    this.host.focusPage();
    return undefined;
  }

  /** Names a row (empty: unnames it); refused, with why, when not valid or another row of the table has it */
  private async nameRow(shownInfo: TableInfo, row: number, name: string): Promise<string | undefined> {
    const table = parseTable(shownInfo.source);
    const current = rowNameIn(table.rows[row]?.cells ?? [])?.name ?? "";
    if (name === current) return this.unchanged();
    let problem = name === "" ? undefined : nameProblem(name, "row");
    // The name is the table's: no other row of it may have it
    const other = name ? namedRows(table).get(name.toLowerCase()) : undefined;
    if (!problem && other !== undefined && other !== row) problem = `another row of this table is named ${name}`;
    if (problem) return problem;
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    // Renamed where the name is (a column inserted or moved may have taken it out of the first cell)
    await this.host.writeTable(info, (t) => {
      const column = rowNameIn(t.rows[row]?.cells ?? [])?.column ?? 0;
      return setCell(t, row, column, withName(t.rows[row]?.cells[column] ?? "", name || undefined));
    });
    this.host.focusPage();
    return undefined;
  }

  /**
   * Names a cell (empty: unnames it); refused, with why, when not valid, a
   * function's or another cell's of the table (a name is the table's: another
   * table may have a cell of the same name, written there as its name!name)
   */
  private async nameCell(shownInfo: TableInfo, row: number, column: number, name: string): Promise<string | undefined> {
    const table = this.host.tableOf(shownInfo);
    const current = cellNameOf(table.rows[row]?.cells[column] ?? "") ?? "";
    if (name === current) return this.unchanged();
    let problem = name === "" ? undefined : nameProblem(name, "cell");
    if (!problem && name && functionNamed(name.toUpperCase())) problem = `${name} is a function's name`;
    if (!problem && name) {
      const taken = table.rows.some((r, ri) => ri > 0 && r.cells.some((cell, ci) => cellNameOf(cell)?.toLowerCase() === name.toLowerCase() && !(ri === row && ci === column)));
      if (taken) problem = `another cell of this table is named ${name}`;
    }
    if (problem) return problem;
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    await this.host.writeTable(info, (t) => setCell(t, row, column, withCellName(t.rows[row]?.cells[column] ?? "", name || undefined)));
    this.host.focusPage();
    return undefined;
  }

  /** Names a column (empty: unnames it); refused, with why, when not valid or another column answers to it */
  private async rename(shownInfo: TableInfo, column: number, name: string): Promise<string | undefined> {
    const headers = parseTable(shownInfo.source).rows[0]?.cells ?? [];
    const current = nameOf(headers[column] ?? "") ?? "";
    if (name === current) return this.unchanged();
    const problem = name === "" ? undefined : nameProblem(name, "column");
    // Another column already answers to it: [name] would be ambiguous
    const taken =
      name !== "" &&
      headers.some((header, c) => c !== column && (nameOf(header)?.toLowerCase() === name.toLowerCase() || columnIdOf(headers, c)?.name === name.toLowerCase()));
    if (problem || taken) return problem ?? `another column of this table is named ${name}`;
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    await this.host.writeTable(info, (t) => setCell(t, 0, column, withName(t.rows[0]?.cells[column] ?? "", name || undefined)));
    this.host.focusPage();
    return undefined;
  }
}
