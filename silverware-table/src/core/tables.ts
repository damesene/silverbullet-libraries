// Which table is which, for the session: a key for each table of a page, so
// what modules keep for a table stays with it whatever happens to the tables
// around it. Modules hold keys, compare them and give them back to the core;
// they never make one nor read anything from one: how a table is told apart is
// the core's, here.
//
// Each time the core reads a page's text, its tables are matched to the keys it
// knows, in steps:
// 1. a table whose text is as it was keeps its key wherever it is now (a table
//    inserted or deleted before it, Ctrl+Z bringing a deleted one back or
//    taking an inserted one out): the longest run of such tables in the page's
//    order, then one of them moved out of that order (cut and pasted
//    elsewhere);
// 2. a table the core wrote with a key made for it (reserve) has that key;
// 3. a table back as it was before it went (undone) has its key again, where
//    it fits among those of step 1;
// 4. the others (a table edited) take, in order, the keys left between the
//    tables around them: first those of tables in the text before, then those
//    of tables gone (its markdown being typed, a table back changed).
// A key whose table is gone is kept in its place, so its table can come back to
// it; a table no key is left for gets a new one. Two tables of the same text
// cannot be told apart: between them, the order decides.

import { findTables } from "../markdown.ts";

declare const TABLE_KEY: unique symbol;
/** A table's identity for the session (the core's: TableRegister) */
export type TableKey = string & { readonly [TABLE_KEY]: true };

/** A key in its page's order, with its table's text as last read; `shown` false while its table is gone */
type Slot = { readonly key: TableKey; text: string; shown: boolean };

type PageTables = {
  slots: Slot[];
  // Keys made before their tables were written (reserve), each for the table of its text once it is there
  expected: { readonly key: TableKey; text: string | undefined }[];
  // The text last matched, and the keys it gave (read again and again: matched once)
  text: string | undefined;
  keys: readonly TableKey[];
  // A key is never given twice
  next: number;
};

/** The longest run of pairs whose slots go up in the order of their tables (the pairs are in that order) */
function longestRun(pairs: readonly (readonly [number, number])[]): Set<number> {
  const length = pairs.map(() => 1);
  const from = pairs.map(() => -1);
  for (let b = 0; b < pairs.length; b++)
    for (let a = 0; a < b; a++)
      if (pairs[a]![1] < pairs[b]![1] && length[a]! + 1 > length[b]!) {
        length[b] = length[a]! + 1;
        from[b] = a;
      }
  let end = -1;
  length.forEach((l, i) => {
    if (end < 0 || l > length[end]!) end = i;
  });
  const kept = new Set<number>();
  for (let i = end; i >= 0; i = from[i]!) kept.add(pairs[i]![0]);
  return kept;
}

export class TableRegister {
  private readonly pages = new Map<string, PageTables>();

  /** The keys of a page's tables in its text, in the order findTables has them */
  keysOf(page: string, text: string): readonly TableKey[] {
    const tables = this.page(page);
    if (tables.text === text) return tables.keys;
    const ranges = findTables(text);
    const slots = tables.slots;
    const taken = new Array<number>(ranges.length).fill(-1);
    const used = new Set<number>();
    const take = (r: number, i: number) => {
      taken[r] = i;
      used.add(i);
    };
    const free = (i: number, shown: boolean, text?: string) => !used.has(i) && slots[i]!.shown === shown && (text === undefined || slots[i]!.text === text);
    // The slots of the tables placed around a table, by the page's order: those between them are its to take
    const between = (r: number): [number, number] => {
      let before = -1;
      for (let p = r - 1; p >= 0; p--)
        if (taken[p]! >= 0) {
          before = taken[p]!;
          break;
        }
      let after = slots.length;
      for (let n = r + 1; n < ranges.length; n++)
        if (taken[n]! >= 0) {
          after = taken[n]!;
          break;
        }
      return [before, after];
    };
    const takeBetween = (r: number, shown: boolean, text?: string) => {
      const [before, after] = between(r);
      for (let i = before + 1; i < after; i++)
        if (free(i, shown, text)) {
          take(r, i);
          return;
        }
    };
    // 1. As they were: the longest run in order, then one moved out of it
    const candidates: [number, number][] = [];
    const claimed = new Set<number>();
    ranges.forEach((range, r) => {
      const i = slots.findIndex((slot, s) => !claimed.has(s) && slot.shown && slot.text === range.text);
      if (i >= 0) {
        claimed.add(i);
        candidates.push([r, i]);
      }
    });
    const run = longestRun(candidates);
    for (const [r, i] of candidates) if (run.has(r)) take(r, i);
    // (One of the same text that fits in order first: a copy pasted elsewhere leaves the table copied its key)
    ranges.forEach((range, r) => {
      if (taken[r]! < 0) takeBetween(r, true, range.text);
    });
    ranges.forEach((range, r) => {
      if (taken[r]! >= 0) return;
      const i = slots.findIndex((_, s) => free(s, true, range.text));
      if (i >= 0) take(r, i);
    });
    // 2. Written with a key made for it
    const reserved = ranges.map((range, r) => {
      if (taken[r]! >= 0) return undefined;
      const e = tables.expected.findIndex((x) => x.text === range.text);
      return e < 0 ? undefined : tables.expected.splice(e, 1)[0]!.key;
    });
    // 3. Back as it was before it went, where it fits
    ranges.forEach((range, r) => {
      if (taken[r]! < 0 && !reserved[r]) takeBetween(r, false, range.text);
    });
    // 4. The rest: the keys left between, of tables in the text before first
    for (const shown of [true, false])
      ranges.forEach((_, r) => {
        if (taken[r]! < 0 && !reserved[r]) takeBetween(r, shown);
      });
    // The page's slots anew: its tables in order, each gone one after the slot it followed
    const placed: Slot[] = ranges.map((range, r) =>
      taken[r]! >= 0 ? slots[taken[r]!]! : { key: reserved[r] ?? this.make(page, tables), text: range.text, shown: true },
    );
    placed.forEach((slot, r) => {
      slot.text = ranges[r]!.text;
      slot.shown = true;
    });
    slots.forEach((slot, i) => {
      if (used.has(i)) return;
      slot.shown = false;
      const previous = slots.slice(0, i).reverse().find((s) => placed.includes(s));
      placed.splice(previous ? placed.indexOf(previous) + 1 : 0, 0, slot);
    });
    tables.slots = placed;
    tables.text = text;
    tables.keys = placed.filter((slot) => slot.shown).map((slot) => slot.key);
    return tables.keys;
  }

  /** A key for a table to be written into the page (`writing` says as what text): once it is there, it has this key */
  reserve(page: string): TableKey {
    const tables = this.page(page);
    const key = this.make(page, tables);
    tables.expected.push({ key, text: undefined });
    return key;
  }

  /** The table a key was reserved for is written as `text` */
  writing(key: TableKey, text: string): void {
    for (const tables of this.pages.values()) for (const e of tables.expected) if (e.key === key) e.text = text;
  }

  /** A key reserved for a table not written after all: no table gets it */
  release(key: TableKey): void {
    for (const tables of this.pages.values()) tables.expected = tables.expected.filter((e) => e.key !== key);
  }

  /** The page a key's table is on, if the core gave it */
  pageOf(key: TableKey): string | undefined {
    for (const [page, tables] of this.pages) if (tables.slots.some((slot) => slot.key === key) || tables.expected.some((e) => e.key === key)) return page;
    return undefined;
  }

  private page(page: string): PageTables {
    let tables = this.pages.get(page);
    if (!tables) this.pages.set(page, (tables = { slots: [], expected: [], text: undefined, keys: [], next: 0 }));
    return tables;
  }

  // Readable in a debugger and in tests: the page and a number (the first ones the tables' places as first seen)
  private make(page: string, tables: PageTables): TableKey {
    return `${page}#${tables.next++}` as TableKey;
  }
}
