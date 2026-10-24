// Removing what Silverware Table stores in tables: the metadata row and the
// hidden tags in cells (tags.ts: formulas, whose cells keep their results,
// names), whatever module keeps them. The question asked first says whose it
// is, from the attributes' names (`<owner>.…`, metanames.ts): nothing a module
// says itself, a module turned off is named as well.
// For one table from its toolbar, for all tables of the page with the
// "Silverware Table: Remove table metadata" command, for cells, rows or
// columns from their menu (a column's attributes in the metadata row too).
import { FEATURE_NAMES, MODULE_LABELS } from "../bridge.ts";
import { CELL_MENU_ORDER, type CellMenuGroup, type CellRef, type Feature, type ModelHost, type ToolbarButton, type TableInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { findTables, minimalEdit, parseTable, serializeTable, type Table } from "../markdown.ts";
import type { MenuEntry } from "../menu.ts";
import { columnsAttributes } from "../meta.ts";
import { CORE } from "../metanames.ts";
import { attributesOf, cellTags, withoutTags } from "../tags.ts";

/** A table without its metadata row and without the hidden tags in its cells (formula cells keep their results) */
export function withoutMetadata(table: Table): Table {
  const { meta: _meta, metaSource: _source, ...rest } = table;
  return { ...rest, rows: table.rows.map((row) => (row.cells.some(hasTags) ? { ...row, cells: row.cells.map(withoutTags) } : row)) };
}

const hasTags = (cell: string) => cellTags(cell).length > 0;

/** Cells (markdown rows) and whole columns of a table whose metadata goes: the cells' hidden tags, the columns' attributes in the metadata row */
export type MetadataPart = { readonly cells: readonly CellRef[]; readonly columns: ReadonlySet<number> };

/** What a part holds, as a table of its own: its cells in one row, its columns' attributes as its metadata (for hasMetadata, metadataOwners) */
function partOf(table: Table, part: MetadataPart): Table {
  const { meta: _meta, metaSource: _source, ...rest } = table;
  const names = columnsAttributes(table, part.columns);
  const cells = { cells: part.cells.map((ref) => table.rows[ref.row]?.cells[ref.column] ?? "") };
  return { ...rest, rows: [cells], ...(names.length ? { meta: Object.fromEntries(names.map((name) => [name, table.meta![name]!])) } : {}) };
}

/** A table without the metadata of a part of it: its cells' hidden tags (formula cells keep their results), its columns' attributes */
export function withoutMetadataOf(table: Table, part: MetadataPart): Table {
  const names = new Set(columnsAttributes(table, part.columns));
  const taken = new Map<number, Set<number>>();
  for (const ref of part.cells) taken.set(ref.row, (taken.get(ref.row) ?? new Set()).add(ref.column));
  const rows = table.rows.map((row, r) => {
    const columns = taken.get(r);
    return columns && row.cells.some((cell, c) => columns.has(c) && hasTags(cell)) ? { ...row, cells: row.cells.map((cell, c) => (columns.has(c) ? withoutTags(cell) : cell)) } : row;
  });
  if (names.size === 0) return { ...table, rows };
  return { ...table, rows, meta: Object.fromEntries(Object.entries(table.meta ?? {}).filter(([name]) => !names.has(name))) };
}

/** Whether a table holds metadata: a metadata row, or hidden tags in cells */
function hasMetadata(table: Table): boolean {
  return table.meta !== undefined || table.rows.some((row) => row.cells.some(hasTags));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Whose an attribute is, by its name: the part before its first dot (none: someone else's) */
const ownerOf = (name: string): string | undefined => (name.includes(".") ? name.slice(0, name.indexOf(".")) : undefined);

/** An owner as the question names it: Silverware Table for the core, a module by its label */
function ownerLabel(owner: string | undefined): string {
  if (owner === CORE) return "Silverware Table";
  const module = FEATURE_NAMES.find((name) => name.toLowerCase() === owner);
  return module ? MODULE_LABELS[module] : "others";
}

/**
 * Whose the tables' metadata is, as the question says it: each owner (the
 * core first, then in the order found) with how many of its cells hold some
 */
export function metadataOwners(tables: readonly Table[]): string[] {
  const owners = new Map<string | undefined, number>([[CORE, 0]]);
  const seen = new Set<string | undefined>();
  for (const table of tables) {
    for (const name of Object.keys(table.meta ?? {})) {
      seen.add(ownerOf(name));
      if (!owners.has(ownerOf(name))) owners.set(ownerOf(name), 0);
    }
    for (const row of table.rows) {
      for (const cell of row.cells) {
        for (const owner of new Set(cellTags(cell).flatMap(attributesOf).map(ownerOf))) {
          seen.add(owner);
          owners.set(owner, (owners.get(owner) ?? 0) + 1);
        }
      }
    }
  }
  return [...owners].filter(([owner]) => seen.has(owner)).map(([owner, cells]) => `${ownerLabel(owner)}${cells ? ` (${plural(cells, "cell")})` : ""}`);
}

/** Owners listed in a sentence: "a, b and c" */
function listed(items: readonly string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : (items[0] ?? "");
}

/** What a question says it removes: whose it is (none found: an empty metadata row) */
function whose(owners: readonly string[], where: string): string {
  return owners.length ? `, what ${listed(owners)} keep${owners.length === 1 ? "s" : ""} in ${where}` : "";
}

// What the question says of what stays
const KEPT = "Cells keep their text, a formula's cell its result.";

export class Metadata implements Feature {
  constructor(private readonly host: ModelHost) {}

  toolbarButtons(info: TableInfo): ToolbarButton[] {
    if (!hasMetadata(parseTable(info.source))) return [];
    return [
      {
        label: "Remove metadata",
        icon: ICONS.trash,
        danger: true,
        title: "Remove this table's <meta> tags: its stored settings (sorting, filters, pinning, name, theme, stripes) and what its cells keep (formulas, which keep their results, names)",
        run: () => void this.removeFromTable(info),
      },
    ];
  }

  /** Remove metadata in the menu of a cell or of the cells selected, last (with deleting) */
  cellMenuEntries(info: TableInfo, cells: readonly CellRef[]): CellMenuGroup | undefined {
    const entry = this.partEntry(info, { cells, columns: new Set() }, cells.length === 1 ? "this cell" : `these ${cells.length} cells`);
    return entry && { order: CELL_MENU_ORDER.deleting, entries: [entry] };
  }

  /** Remove metadata in the menu of rows (columns): their cells, a column's header too, and the columns' attributes */
  lineMenuEndEntries(info: TableInfo, axis: "row" | "column", lines: readonly number[]): MenuEntry[] {
    const rows = axis === "row" ? lines : Array.from({ length: info.rows }, (_, row) => row);
    const columns = axis === "row" ? Array.from({ length: info.columns }, (_, column) => column) : lines;
    const part = { cells: rows.flatMap((row) => columns.map((column) => ({ row, column }))), columns: new Set(axis === "column" ? lines : []) };
    const entry = this.partEntry(info, part, lines.length === 1 ? `this ${axis}` : `these ${lines.length} ${axis}s`);
    return entry ? [entry] : [];
  }

  /** Remove metadata for a part of the table, where it has some */
  private partEntry(info: TableInfo, part: MetadataPart, what: string): MenuEntry | undefined {
    if (!hasMetadata(partOf(parseTable(info.source), part))) return undefined;
    return {
      kind: "item",
      label: "Remove metadata",
      icon: ICONS.trash,
      danger: true,
      hint: `Remove the <meta> tags of ${what}: formulas (their cells keep their results), names${part.columns.size ? ", the columns' stored settings (sorting, filters, widths)" : ""}`,
      run: () => void this.removeFromPart(info, part, what),
    };
  }

  /** Removes the metadata of a part of a table, once confirmed */
  private async removeFromPart(shownInfo: TableInfo, part: MetadataPart, what: string): Promise<void> {
    const shown = partOf(parseTable(shownInfo.source), part);
    const owners = metadataOwners([shown]);
    if (!(await this.host.ask(`Remove the metadata of ${what}${whose(owners, what.startsWith("this ") ? "it" : "them")}? ${KEPT} Ctrl+Z brings it back.`))) return;
    // The table as rendered now: the dialog may have outlived the rendering it was asked from
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    if (columnsAttributes(parseTable(info.source), part.columns).length) this.host.forgetStoredView(info.key);
    await this.host.writeTable(info, (table) => withoutMetadataOf(table, part));
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.host.focusPage();
  }

  /**
   * Removes a table's metadata, once confirmed: its metadata row (a sorting
   * stored there goes with it: the rows show as written) and the formulas of
   * its cells, which keep their results as plain values
   */
  private async removeFromTable(shownInfo: TableInfo): Promise<void> {
    const shown = parseTable(shownInfo.source);
    const owners = metadataOwners([shown]);
    if (!(await this.host.ask(`Remove this table's metadata${whose(owners, "it")}? ${KEPT} Ctrl+Z brings it back.`))) return;
    // The table as rendered now: the dialog may have outlived the rendering it was asked from
    const info = this.host.tableFor(shownInfo.key) ?? shownInfo;
    if (parseTable(info.source).meta) this.host.forgetStoredView(info.key);
    await this.host.writeTable(info, withoutMetadata);
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.host.focusPage();
  }

  /** Removes the metadata of all tables on the current page, once confirmed */
  async removeFromPage(): Promise<void> {
    const { bridge } = this.host;
    const text = await bridge.getText();
    // From the last table up, so the earlier ones keep their positions
    const tables = findTables(text)
      .filter((range) => {
        return hasMetadata(parseTable(range.text));
      })
      .reverse();
    if (tables.length === 0) {
      void bridge.flash("Silverware Table: no table on this page has metadata", "info");
      return;
    }
    const models = tables.map((range) => parseTable(range.text));
    const owners = metadataOwners(models);
    const question =
      `Remove the metadata of ${tables.length === 1 ? "the 1 table" : `all ${tables.length} tables`} on this page` +
      `${whose(owners, tables.length === 1 ? "it" : "them")}? ${KEPT} Ctrl+Z brings it back.`;
    if (!(await this.host.ask(question))) return;
    // One edit over the span of all those tables, so one Ctrl+Z undoes it
    const from = tables[tables.length - 1]!.from;
    const to = tables[0]!.to;
    let span = text.slice(from, to);
    const keys = this.host.tableKeys(await bridge.getCurrentPage(), text);
    for (const range of tables) {
      const table = parseTable(range.text);
      if (table.meta) this.host.forgetStoredView(keys[range.ordinal]!);
      span = span.slice(0, range.from - from) + serializeTable(withoutMetadata(table)) + span.slice(range.to - from);
    }
    const edit = minimalEdit(text.slice(from, to), span);
    await bridge.replaceRange(from + edit.from, from + edit.to, edit.insert);
    // The dialog took the focus: back to the editor, so Ctrl+Z works right away
    this.host.focusPage();
    void bridge.flash(`Silverware Table: removed the metadata of ${tables.length} table(s)`, "info");
  }
}
