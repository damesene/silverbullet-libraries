import { describe, expect, it } from "vitest";
import { type TableKey, TableRegister } from "./tables.ts";

const table = (name: string, value = "1") => `| ${name} |\n|---|\n| ${value} |`;
const page = (...tables: string[]) => tables.join("\n\ntext\n\n");

describe("TableRegister", () => {
  const keys = (register: TableRegister, text: string) => register.keysOf("P", text);

  it("gives the tables first seen their places, the same keys for the same text again", () => {
    const register = new TableRegister();
    const text = page(table("a"), table("b"));
    expect(keys(register, text)).toEqual(["P#0", "P#1"]);
    expect(keys(register, text)).toBe(keys(register, text));
  });

  it("keeps a table's key when it is edited, or a table is inserted or deleted before it", () => {
    const register = new TableRegister();
    const [a, b, c] = keys(register, page(table("a"), table("b"), table("c")));
    // b edited
    expect(keys(register, page(table("a"), table("b", "2"), table("c")))).toEqual([a, b, c]);
    // A table inserted first: a new key, the others theirs
    const inserted = keys(register, page(table("new"), table("a"), table("b", "2"), table("c")));
    expect(inserted.slice(1)).toEqual([a, b, c]);
    expect([a, b, c]).not.toContain(inserted[0]);
    // a deleted
    expect(keys(register, page(table("new"), table("b", "2"), table("c")))).toEqual([inserted[0], b, c]);
  });

  it("gives a table brought back (undone, its markdown typed again) its key again", () => {
    const register = new TableRegister();
    const [a, b, c] = keys(register, page(table("a"), table("b"), table("c")));
    keys(register, page(table("a"), table("c")));
    // Ctrl+Z: b as it was
    expect(keys(register, page(table("a"), table("b"), table("c")))).toEqual([a, b, c]);
    // b's markdown broken while it is typed, then a table again with another text: still b's key, between a and c
    keys(register, page(table("a"), "| b |\n|--", table("c")));
    expect(keys(register, page(table("a"), table("b", "typed"), table("c")))).toEqual([a, b, c]);
  });

  it("takes an inserted table out again (undone) without moving the others' keys", () => {
    const register = new TableRegister();
    const [a, b] = keys(register, page(table("a"), table("b")));
    keys(register, page(table("a"), table("new"), table("b")));
    expect(keys(register, page(table("a"), table("b")))).toEqual([a, b]);
  });

  it("never gives a key twice, and tells which page a key is on", () => {
    const register = new TableRegister();
    const [a] = keys(register, page(table("a"))) as [TableKey];
    keys(register, "");
    const [other] = keys(register, page(table("other")));
    // The page emptied and another table typed: in a's place, a's key (as the order says)
    expect(other).toBe(a);
    const [, added] = keys(register, page(table("other"), table("added")));
    expect(added).not.toBe(a);
    expect(register.pageOf(a)).toBe("P");
    expect(register.keysOf("Q", table("q"))).toEqual(["Q#0"]);
    expect(register.pageOf("Q#0" as never)).toBe("Q");
  });
});

describe("TableRegister.reserve", () => {
  it("gives a table written with a key made for it that key, not another's left between", () => {
    const register = new TableRegister();
    const [a, b, c] = register.keysOf("P", page(table("a"), table("b"), table("c")));
    // b gone, then a table written where it was, with a key made for it
    register.keysOf("P", page(table("a"), table("c")));
    const made = register.reserve("P");
    register.writing(made, table("made"));
    expect(register.pageOf(made)).toBe("P");
    expect(register.keysOf("P", page(table("a"), table("made"), table("c")))).toEqual([a, made, c]);
    expect(made).not.toBe(b);
  });
});

describe("TableRegister, what the review found", () => {
  it("does not give a gone table's key to the next table edited after it", () => {
    const register = new TableRegister();
    const [a, , c] = register.keysOf("P", page(table("a"), table("b"), table("c")));
    register.keysOf("P", page(table("a"), table("c")));
    expect(register.keysOf("P", page(table("a"), table("c", "edited")))).toEqual([a, c]);
  });

  it("keeps the keys of tables a copy is pasted before, and of a table moved", () => {
    const register = new TableRegister();
    const [x, y, z] = register.keysOf("P", page(table("x"), table("y"), table("z")));
    const pasted = register.keysOf("P", page(table("z"), table("x"), table("y"), table("z")));
    expect(pasted.slice(1)).toEqual([x, y, z]);
    expect([x, y, z]).not.toContain(pasted[0]);
    const other = new TableRegister();
    const [a, b, c] = other.keysOf("P", page(table("a"), table("b"), table("c")));
    expect(other.keysOf("P", page(table("b"), table("c"), table("a")))).toEqual([b, c, a]);
  });

  it("gives a table written again as it was undone its new reserved key, not the gone one's", () => {
    const register = new TableRegister();
    register.keysOf("P", page(table("a")));
    const first = register.reserve("P");
    register.writing(first, table("made"));
    expect(register.keysOf("P", page(table("a"), table("made")))[1]).toBe(first);
    // Undone, then the same value typed into the same cell: the same text, a new key made for it
    register.keysOf("P", page(table("a")));
    const second = register.reserve("P");
    register.writing(second, table("made"));
    expect(register.keysOf("P", page(table("a"), table("made")))[1]).toBe(second);
  });

  it("gives a key released (its table not written) to no table", () => {
    const register = new TableRegister();
    const [a] = register.keysOf("P", page(table("a")));
    const key = register.reserve("P");
    register.writing(key, table("made"));
    register.release(key);
    const keys = register.keysOf("P", page(table("a"), table("made")));
    expect(keys[0]).toBe(a);
    expect(keys[1]).not.toBe(key);
  });
});
