// The tables of a page as formulas see them: by their names and their named
// cells (formulas refer to them: prices!B2, vat), with those of other pages
// the pageLinks module read; and which tables a write recalculates (those
// referring by name to the table written, in turn).
import type { OtherPages, PageTable, Table } from "../markdown.ts";
import { metaName } from "../meta.ts";
import { cellNameOf, namedCells, rowNameIn } from "../names.ts";
import type { NamedCell, TableSource } from "./evaluate.ts";
import type { FormulaChoice } from "./help.ts";
import { referredTableNames } from "./references.ts";

/** A page's tables by their names, and its named cells by their names (lowercase), of every table (a name is unique in its table only) */
type PageNames = { readonly tables: Map<string, Table>; readonly cells: Map<string, NamedCell[]> };

/**
 * The tables of a page by their names, and its named cells, for formulas that
 * refer to them: `replace` stands in for one table (the one being written),
 * and `others` has those of other pages. `tables` is read on the first lookup.
 */
export function pageTables(
  tables: () => readonly PageTable[],
  here: string,
  replace?: { readonly from: number; readonly table: Table },
  others?: OtherPages,
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
      for (const { range, table: parsed } of list) {
        const table = isHere && replace && range.from === replace.from ? replace.table : parsed;
        const own = metaName(table)?.toLowerCase();
        if (own && !names.tables.has(own)) names.tables.set(own, table);
        for (const [name, cell] of namedCells(table)) {
          const cells = names.cells.get(name);
          if (cells) cells.push({ table, ...cell });
          else names.cells.set(name, [{ table, ...cell }]);
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

/** The names of a table's body cells, as written */
function cellNames(table: Table): string[] {
  return table.rows.slice(1).flatMap((row) => row.cells.map(cellNameOf).filter((name): name is string => !!name));
}

/**
 * The page's names any formula of it can refer to, as written, to offer while
 * a name is typed: its named tables, and their named cells (as table!name: a
 * name is its table's; the cells of a table without a name cannot be referred
 * to from another)
 */
export function pageNameChoices(tables: readonly PageTable[]): FormulaChoice[] {
  return once(
    tables.flatMap(({ table }): FormulaChoice[] => {
      const own = metaName(table);
      return own ? [{ kind: "table", name: own }, ...cellNames(table).map((name): FormulaChoice => ({ kind: "cell", name, table: own }))] : [];
    }),
  );
}

/** The names a table's own formulas refer to bare, as written: its named cells (vat) and rows (`pear[price]`) */
export function ownNameChoices(table: Table): FormulaChoice[] {
  const rows = table.rows.slice(1).flatMap((row): FormulaChoice[] => {
    const name = rowNameIn(row.cells)?.name;
    return name ? [{ kind: "row", name }] : [];
  });
  return once([...cellNames(table).map((name): FormulaChoice => ({ kind: "cell", name })), ...rows]);
}

/**
 * What a table's write affects in the other tables: its name (lowercase).
 * Formulas refer to another table by its name only (prices!B2, prices!vat): a
 * bare cell name is their own table's.
 */
export type Affected = { readonly tables: Set<string> };

export function affectedBy(...tables: Table[]): Affected {
  const affected: Affected = { tables: new Set() };
  for (const table of tables) addAffected(affected, table);
  return affected;
}

export function addAffected(affected: Affected, table: Table): void {
  const name = metaName(table)?.toLowerCase();
  if (name) affected.tables.add(name);
}

/** What a table's formulas refer to on the page: tables by name */
export function referredBy(table: Table): Affected {
  return { tables: referredTableNames(table) };
}

export function isAffected(referred: Affected, affected: Affected): boolean {
  return [...referred.tables].some((n) => affected.tables.has(n));
}

/**
 * The tables a write of the table `source` recalculates: that table, and the
 * tables that refer to it by name, or in turn to those. All of the page's when
 * the table is not found.
 */
export function tablesWritten(all: readonly PageTable[], source: string): Table[] {
  const own = all.find((t) => t.range.text === source)?.table;
  if (!own) return all.map((t) => t.table);
  const result = [own];
  const affected = affectedBy(own);
  const rest = all.filter((t) => t.table !== own).map((t) => ({ table: t.table, referred: referredBy(t.table) }));
  for (let found = true; found; ) {
    found = false;
    for (let i = rest.length - 1; i >= 0; i--) {
      if (!isAffected(rest[i]!.referred, affected)) continue;
      result.push(rest[i]!.table);
      addAffected(affected, rest[i]!.table);
      rest.splice(i, 1);
      found = true;
    }
  }
  return result;
}
