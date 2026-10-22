import { describe, expect, it } from "vitest";
import { columnIdOf, columnKey, findColumn, followColumn, sameColumnId } from "./columns.ts";

describe("columnKey", () => {
  it("keys a column as SilverBullet's index does", () => {
    expect(columnKey("Unit price")).toBe("unit_price");
    expect(columnKey("unit_price")).toBe("unit_price");
    expect(columnKey("Price / kg")).toBe("price_kg");
    expect(columnKey("a__b")).toBe("a_b");
    // Letters with diacritics are not A-Z either
    expect(columnKey("Množství")).toBe("mno_stv_");
    expect(columnKey("Cena (Kč)")).toBe("cena_k_");
  });

  it("leaves hashtags out, as SilverBullet's index does", () => {
    expect(columnKey("Price #euro")).toBe("price");
    expect(columnKey("#stars Rating")).toBe("rating");
    expect(columnKey("Score #percent10")).toBe("score");
    expect(columnKey("Two #euro #bold")).toBe("two");
    // Not a hashtag: no space before the #
    expect(columnKey("C#")).toBe("c_");
  });

  it("drops markdown emphasis and escapes first", () => {
    expect(columnKey("**Qty**")).toBe("qty");
    expect(columnKey("A \\| B")).toBe("a_b");
  });
});

describe("columns by name", () => {
  const headers = ["Name", "Qty", "Unit price", "qty"];

  it("finds a column by any spelling of its key, and duplicates by occurrence", () => {
    expect(findColumn(headers, { name: "unit_price", nth: 1 })).toBe(2);
    expect(findColumn(headers, { name: "UNIT PRICE", nth: 1 })).toBe(2);
    expect(findColumn(headers, { name: "Qty", nth: 2 })).toBe(3);
    expect(findColumn(headers, { name: "Qty", nth: 3 })).toBeUndefined();
    expect(findColumn(headers, { name: "Nope", nth: 1 })).toBeUndefined();
  });

  it("names a column by its key, with whether others share it", () => {
    expect(columnIdOf(headers, 2)).toEqual({ name: "unit_price", nth: 1, shared: false });
    expect(columnIdOf(headers, 3)).toEqual({ name: "qty", nth: 2, shared: true });
    expect(columnIdOf(headers, 9)).toBeUndefined();
  });

  it("follows a column through a rename, a move and a delete", () => {
    const id = { name: "qty", nth: 1 };
    expect(followColumn(headers, ["Name", "Count", "Unit price", "qty"], id)).toEqual({ name: "count", nth: 1, shared: false });
    const moved = ["Name", "qty", "Unit price", "Qty"];
    expect(followColumn(headers, moved, id, (c) => (c === 1 ? 3 : c === 3 ? 1 : c))).toEqual({ name: "qty", nth: 2, shared: true });
    expect(followColumn(headers, ["Name", "Unit price", "qty"], id, (c) => (c === 1 ? undefined : c > 1 ? c - 1 : c))).toBeNull();
    expect(followColumn(headers, headers, { name: "Nope", nth: 1 })).toBeUndefined();
    expect(sameColumnId({ name: "Unit price", nth: 1 }, { name: "unit_price", nth: 1 })).toBe(true);
  });
});
