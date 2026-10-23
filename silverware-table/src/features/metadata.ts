// Removing what Silverware Table stores in tables: the metadata row and the
// hidden tags in cells (tags.ts: formulas, whose cells keep their results,
// names), whatever module keeps them. The question asked first says whose it
// is, from the attributes' names (`<owner>.…`, metanames.ts): nothing a module
// says itself, a module turned off is named as well.
// For one table from its toolbar, for all tables of the page with the
// "Silverware Table: Remove table metadata" command.
import { FEATURE_NAMES, MODULE_LABELS } from "../bridge.ts";
import type { Feature, ModelHost, ToolbarButton, TableInfo } from "../core/feature.ts";
import { ICONS } from "../icons.ts";
import { findTables, minimalEdit, parseTable, serializeTable, type Table } from "../markdown.ts";
import { CORE } from "../metanames.ts";
import { attributesOf, cellTags, withoutTags } from "../tags.ts";

/** A table without its metadata row and without the hidden tags in its cells (formula cells keep their results) */
export function withoutMetadata(table: Table): Table {
  const { meta: _meta, metaSource: _source, ...rest } = table;
  return { ...rest, rows: table.rows.map((row) => (row.cells.some(hasTags) ? { ...row, cells: row.cells.map(withoutTags) } : row)) };
}

const hasTags = (cell: string) => cellTags(cell).length > 0;

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
