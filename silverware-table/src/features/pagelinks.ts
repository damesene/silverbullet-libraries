// The pageLinks module: formulas referring to tables and named cells on other
// pages ([[Prices]]fruit!B2) get those pages read (space.readPage), and in turn
// the pages those pages' tables refer to. A page is read when a table referring
// to it shows, again for every write that recalculates such a table (so the
// results written are up to date), and again when SilverBullet indexes it (it
// changed): then the formulas module checks the tables shown again.
// Turned off, no page is read, and formulas referring to one keep their
// results (formula/page.ts: pages not read are `unread`).
import type { Feature, ModelHost, TableTarget, TableInfo, WritePage } from "../core/feature.ts";
import { type FormulaCells, type FormulasOffer, referredPages } from "../formulas/index.ts";
import { tablesWritten } from "../formulas/page.ts";
import { metaName } from "../meta.ts";
import { type OtherPages, type PageTable, pageTablesOf, parseTable, type Table } from "../markdown.ts";

// At most this many other pages are read for one page's formulas (pages that refer on and on)
const MAX_OTHER_PAGES = 20;

export class PageLinks implements Feature {
  // The other pages read: their tables, or null where there is no such page
  private readonly pages = new Map<string, readonly PageTable[] | null>();
  // Counts the pages read, so what formulas computed from them is computed anew
  private version = 0;

  constructor(private readonly host: ModelHost) {}

  otherPages(): OtherPages {
    return { tables: (page) => this.pages.get(page), version: this.version };
  }

  /** A table shown: the pages its formulas read, if not read yet; then its formulas are checked again */
  /** The cells as the formulas module reads them: none while it is off (the pages are read for formulas only) */
  private cells(): FormulaCells | undefined {
    return this.host.offered<FormulasOffer>("formulas")?.cells;
  }

  enhanced(info: TableInfo): void {
    void this.load([parseTable(info.source)], false).then((read) => {
      if (read) this.host.tablesChanged();
    });
  }

  /** Before a write reads the page: the pages the tables it recalculates refer to, read again */
  async prepareWrite(info: TableTarget): Promise<void> {
    const cells = this.cells();
    if (!cells) return;
    const tables = pageTablesOf(this.host.pageText).map((t) => ({ ...t, name: metaName(t.table) }));
    await this.load(tablesWritten(cells, tables, info.source), true);
  }

  /** After the edit: pages the page's tables and the edited one refer to, if not read yet */
  async prepareEdit(edited: Table, page: WritePage): Promise<void> {
    await this.load([...page.tables.map((t) => t.table), edited], false);
  }

  /**
   * Another page formulas read was changed: read it again, and the tables
   * shown are checked again. When it is the page shown now (it was read from
   * another page before), it is forgotten, so going back there does not use it
   * as it was.
   */
  async pageIndexed(name: string): Promise<void> {
    if (!this.pages.has(name)) return;
    if (name === this.host.currentPage) {
      this.pages.delete(name);
      return;
    }
    await this.load(this.tablesShown(), new Set([name]));
    this.host.tablesChanged();
  }

  /** The tables shown, as last read */
  private tablesShown(): Table[] {
    return this.host.shownTables().map((info) => parseTable(info.source));
  }

  /**
   * Reads the other pages these tables' formulas refer to, and in turn the
   * pages those pages' tables refer to; `fresh`: also those read before.
   * Whether a page was read.
   */
  private async load(tables: Iterable<Table>, fresh: boolean | ReadonlySet<string>): Promise<boolean> {
    // Read for formulas only
    const cells = this.cells();
    if (!this.host.bridge.readPage || !cells) return false;
    const queue = new Set<string>();
    for (const table of tables) for (const page of referredPages(cells, table)) queue.add(page);
    const done = new Set<string>();
    let read = false;
    for (const page of queue) {
      if (done.size >= MAX_OTHER_PAGES) break;
      done.add(page);
      if (page === this.host.currentPage) continue;
      if (fresh === true || (fresh && fresh.has(page)) || !this.pages.has(page)) {
        await this.read(page);
        read = true;
      }
      for (const { table } of this.pages.get(page) ?? []) for (const next of referredPages(cells, table)) queue.add(next);
    }
    return read;
  }

  /** Reads another page's tables; the earlier ones stay until it is read, so formulas never see it missing meanwhile */
  private async read(page: string): Promise<void> {
    let tables: readonly PageTable[] | null;
    try {
      tables = pageTablesOf(await this.host.bridge.readPage!(page));
    } catch {
      tables = null;
    }
    this.pages.set(page, tables);
    this.version++;
  }
}
