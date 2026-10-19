import { describe, expect, it } from "vitest";
import { findTables, locateByShape, parseMetaRow, parseTable, serializeTable } from "./markdown.ts";
import { followMetaSort, metaSort, withMeta, withMetaSort } from "./meta.ts";
import { columnAfterMove, deleteColumn, insertRow, moveColumn, setCell } from "./ops.ts";

const md = (t: ReturnType<typeof parseTable>) => serializeTable(t);

describe("metadata row", () => {
  it("is read from a last row holding only <meta …>", () => {
    const table = parseTable('| A | B |\n|---|---|\n| 1 | 2 |\n| <meta sort="A:desc" note=\'x\'> | |');
    expect(table.rows.map((r) => r.cells)).toEqual([["A", "B"], ["1", "2"]]);
    expect(table.meta).toEqual({ sort: "A:desc", note: "x" });
  });

  it("accepts <meta …/> and a row with fewer cells", () => {
    expect(parseMetaRow('| <meta sort="A:asc"/> |')).toEqual({ sort: "A:asc" });
  });

  it("is not a metadata row with other content or elsewhere", () => {
    expect(parseMetaRow('| <meta sort="A:asc"> | x |')).toBeUndefined();
    expect(parseMetaRow("| meta |")).toBeUndefined();
    const middle = parseTable('| A |\n|---|\n| <meta sort="A:asc"> |\n| 1 |');
    expect(middle.meta).toBeUndefined();
    expect(middle.rows).toHaveLength(3);
  });

  it("round-trips byte for byte", () => {
    const text = '| A | B |\n|---|---|\n| 1 | 2 |\n|<meta   sort="A:desc" >| |';
    expect(md(parseTable(text))).toBe(text);
    expect(md(setCell(parseTable(text), 1, 0, "9"))).toBe('| A | B |\n|---|---|\n| 9 | 2 |\n|<meta   sort="A:desc" >| |');
  });

  it("stays the last row when rows are added", () => {
    const table = parseTable('| A |\n|---|\n| 1 |\n| <meta sort="A:asc"> |');
    expect(md(insertRow(table, table.rows.length))).toBe('| A |\n|---|\n| 1 |\n| |\n| <meta sort="A:asc"> |');
  });

  it("does not widen columns or break alignment", () => {
    const text = '| Name  | Qty |\n| ----- | --- |\n| Pear  |   3 |\n| <meta sort="Qty:desc"> |';
    const table = parseTable(text);
    expect(table.padded).toBe(true);
    expect(md({ ...setCell(table, 1, 0, "Fig"), padded: true })).toBe(
      '| Name | Qty |\n| ---- | --- |\n| Fig  | 3   |\n| <meta sort="Qty:desc"> |',
    );
  });

  it("escapes values and drops a row left without attributes", () => {
    const table = withMeta(parseTable("| A |\n|---|\n| 1 |"), "sort", 'a|b "c" >d:asc');
    const text = md(table);
    expect(text).toBe('| A |\n|---|\n| 1 |\n| <meta sort="a\\|b &quot;c&quot; &gt;d:asc"> |');
    expect(parseTable(text).meta).toEqual({ sort: 'a|b "c" >d:asc' });
    expect(md(withMeta(parseTable(text), "sort", undefined))).toBe("| A |\n|---|\n| 1 |");
  });

  it("counts in the rendered shape, so the table is still found", () => {
    const text = 'x\n\n| A |\n|---|\n| 1 |\n| <meta sort="A:asc"> |\n';
    expect(locateByShape(text, 0, { rows: 3, columns: 1 })?.from).toBe(findTables(text)[0]!.from);
  });
});

describe("stored sorting", () => {
  const base = parseTable("| Name | Qty | Qty |\n|---|---|---|\n| a | 1 | 2 |");

  it("is stored by column name", () => {
    const sorted = withMetaSort(base, { column: 0, direction: "desc" });
    expect(sorted.meta).toEqual({ sort: "name:desc" });
    expect(metaSort(sorted)).toEqual({ column: 0, direction: "desc" });
  });

  it("adds the occurrence for duplicate column names", () => {
    const second = withMetaSort(base, { column: 2, direction: "asc" });
    expect(second.meta).toEqual({ sort: "qty:asc:2" });
    expect(metaSort(second)).toEqual({ column: 2, direction: "asc" });
    expect(withMetaSort(base, { column: 1, direction: "asc" }).meta).toEqual({ sort: "qty:asc:1" });
  });

  it("is ignored when its column is gone", () => {
    expect(metaSort(withMeta(base, "sort", "Missing:asc"))).toBeUndefined();
    expect(metaSort(withMeta(base, "sort", "Qty:asc:3"))).toBeUndefined();
  });

  it("follows its column through rename, move and delete", () => {
    const sorted = withMetaSort(base, { column: 2, direction: "desc" }); // the second Qty
    const renamed = followMetaSort(sorted, setCell(sorted, 0, 2, "Price"), (c) => c);
    expect(renamed.meta).toEqual({ sort: "price:desc" });
    const moved = followMetaSort(sorted, moveColumn(sorted, 2, 0), (c) => columnAfterMove(c, 2, 0));
    expect(moved.meta).toEqual({ sort: "qty:desc:1" });
    expect(metaSort(moved)).toEqual({ column: 0, direction: "desc" });
    const deleted = followMetaSort(sorted, deleteColumn(sorted, 2), (c) => (c === 2 ? undefined : c));
    expect(deleted.meta).toEqual({});
    expect(md(deleted)).toBe("| Name | Qty |\n|---|---|\n| a | 1 |");
  });

  it("leaves tables without a stored sorting alone", () => {
    const edited = setCell(base, 1, 0, "b");
    expect(followMetaSort(base, edited, (c) => c)).toBe(edited);
  });
});
