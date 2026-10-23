// The tables of a page as formulas see them: by their names and their named
// cells (formulas refer to them: prices!B2, vat), with those of other pages
// the pageLinks module read; and which tables a write recalculates (those
// referring by name to the table written, in turn). The tables' names come with
// them, from the formulas module (its host): the domain reads no metadata.
import type { PageTable, Table } from "../markdown.ts";
import { cellsByName, type FormulaCells } from "./cell.ts";
import type { NamedCell, TableSource } from "./evaluate.ts";
import type { FormulaChoice } from "./help.ts";
import { referredTableNames } from "./references.ts";

/** A table of a page with its name (undefined: none), as the formulas module gives it */
export type NamedPageTable = PageTable & { readonly name: string | undefined };

/** The other pages read, their tables with their names (null: no such page; undefined: not read) */
export type NamedOtherPages = { readonly tables: (page: string) => readonly NamedPageTable[] | null | undefined };

/** A page's tables by their names, and its named cells by their names (lowercase), of every table (a name is unique in its table only) */
type PageNames = { readonly tables: Map<string, Table>; readonly cells: Map<string, NamedCell[]> };

/**
 * The tables of a page by their names, and its named cells, for formulas that
 * refer to them: `replace` stands in for one table (the one being written),
 * and `others` has those of other pages. `tables` is read on the first lookup.
 */
export function pageTables(
  cells: FormulaCells,
  tables: () => readonly NamedPageTable[],
  here: string,
  replace?: { readonly from: number; readonly table: Table; readonly name: string | undefined },
  others?: NamedOtherPages,
): TableSource {
  const pages = new Map<string, PageNames>();
  const namesOf = (page: string | undefined): PageNames | undefined => {
    const isHere = page === undefined || page === here;
    const key = isHere ? "" : page;
    let names = pages.get(key);
    if (!names) {
      const list = isHere ? tables() : others?.tables(page);
      if (!list) return undefined;
      names = { tables: new Map(), cells: new Map() };
      for (const given of list) {
        const { table, name: tableName } = isHere && replace && given.range.from === replace.from ? replace : given;
        const own = tableName?.toLowerCase();
        if (own && !names.tables.has(own)) names.tables.set(own, table);
        for (const [name, cell] of cellsByName(cells, table)) {
          const found: NamedCell = { table, tableName, ...cell };
          const list = names.cells.get(name);
          if (list) list.push(found);
          else names.cells.set(name, [found]);
        }
      }
      pages.set(key, names);
    }
    return names;
  };
  return Object.assign((name: string, page?: string) => namesOf(page)?.tables.get(name.toLowerCase()), {
    cell: (name: string, page?: string) => namesOf(page)?.cells.get(name.toLowerCase())?.[0],
    cellsNamed: (name: string, page?: string) => namesOf(page)?.cells.get(name.toLowerCase()) ?? [],
    // Pages not read (none without the pageLinks module): formulas referring to them keep their results
    unread: (page: string) => page !== here && others?.tables(page) === undefined,
  });
}

/** Each choice once (by its kind, table and name, ignoring case), the first as written */
function once(choices: readonly FormulaChoice[]): FormulaChoice[] {
  const seen = new Set<string>();
  return choices.filter((choice) => {
    const key = `${choice.kind}:${choice.table?.toLowerCase() ?? ""}!${choice.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


/**
 * The page's names any formula of it can refer to, as written, to offer while
 * a name is typed: its named tables, and their named cells (as table!name: a
 * name is its table's; the cells of a table without a name cannot be referred
 * to from another)
 */
export function pageNameChoices(cells: FormulaCells, tables: readonly NamedPageTable[]): FormulaChoice[] {
  return once(
    tables.flatMap(({ table, name: own }): FormulaChoice[] =>
      own ? [{ kind: "table", name: own }, ...cells.cellNames(table).map(({ name }): FormulaChoice => ({ kind: "cell", name, table: own }))] : [],
    ),
  );
}

/** The names a table's own formulas refer to bare, as written: its named cells (vat) and rows (`pear[price]`) */
export function ownNameChoices(cells: FormulaCells, table: Table): FormulaChoice[] {
  const rows = cells.rowNames(table).map(({ name }): FormulaChoice => ({ kind: "row", name }));
  return once([...cells.cellNames(table).map(({ name }): FormulaChoice => ({ kind: "cell", name })), ...rows]);
}

/**
 * What a table's write affects in the other tables: its name (lowercase).
 * Formulas refer to another table by its name only (prices!B2, prices!vat): a
 * bare cell name is their own table's.
 */
export type Affected = { readonly tables: Set<string> };

/** What writing tables of these names (undefined: unnamed) affects */
export function affectedBy(...names: (string | undefined)[]): Affected {
  const affected: Affected = { tables: new Set() };
  for (const name of names) addAffected(affected, name);
  return affected;
}

export function addAffected(affected: Affected, name: string | undefined): void {
  if (name) affected.tables.add(name.toLowerCase());
}

/** What a table's formulas refer to on the page: tables by name */
export function referredBy(cells: FormulaCells, table: Table): Affected {
  return { tables: referredTableNames(cells, table) };
}

export function isAffected(referred: Affected, affected: Affected): boolean {
  return [...referred.tables].some((n) => affected.tables.has(n));
}

/**
 * The tables a write of the table `source` recalculates: that table, and the
 * tables that refer to it by name, or in turn to those. All of the page's when
 * the table is not found.
 */
export function tablesWritten(cells: FormulaCells, all: readonly NamedPageTable[], source: string): Table[] {
  const found = all.find((t) => t.range.text === source);
  if (!found) return all.map((t) => t.table);
  const own = found.table;
  const result = [own];
  const affected = affectedBy(found.name);
  const rest = all.filter((t) => t.table !== own).map((t) => ({ table: t.table, name: t.name, referred: referredBy(cells, t.table) }));
  for (let found = true; found; ) {
    found = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (!isAffected(rest[i]!.referred, affected)) continue;
      result.push(rest[i]!.table);
      addAffected(affected, rest[i]!.name);
      rest.splice(i, 1);
      found = true;
    }
  }
  return result;
}
