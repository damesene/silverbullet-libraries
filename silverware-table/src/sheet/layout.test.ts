import { describe, expect, it } from "vitest";
import { type LaidOut, placeProblem, roomFor } from "./layout.ts";

// A at A1 (3 rows: header and two, 2 columns), C beside it at D1 (5 rows), B under A at A6
const A: LaidOut = { id: 1, at: { row: 0, column: 0 }, rows: 3, columns: 2, name: "a" };
const C: LaidOut = { id: 2, at: { row: 0, column: 3 }, rows: 5, columns: 2, name: "c" };
const B: LaidOut = { id: 3, at: { row: 5, column: 0 }, rows: 2, columns: 2, name: "b" };

const moved = (room: ReturnType<typeof roomFor>) => ("moved" in room ? Object.fromEntries(room.moved) : room);

describe("roomFor", () => {
  it("rows inserted: everything starting below moves down by as many, a table beside stays", () => {
    expect(moved(roomFor([A, C, B], { id: 1, rows: 5, columns: 2, claims: false }))).toEqual({ 3: { row: 7, column: 0 } });
  });

  it("moves what is below whatever its columns, so tables side by side stay in line", () => {
    const D: LaidOut = { id: 4, at: { row: 5, column: 6 }, rows: 2, columns: 1 };
    expect(moved(roomFor([A, B, D], { id: 1, rows: 4, columns: 2, claims: false }))).toEqual({ 3: { row: 6, column: 0 }, 4: { row: 6, column: 6 } });
  });

  it("rows claimed (a value typed below): nothing moves while they take empty cells", () => {
    expect(moved(roomFor([A, C, B], { id: 1, rows: 5, columns: 2, claims: true }))).toEqual({});
  });

  it("rows claimed into a table below: everything below moves as far as they reach into it", () => {
    const D: LaidOut = { id: 4, at: { row: 5, column: 6 }, rows: 2, columns: 1 };
    // A grows to row 7 (index 6): B at row 6 is reached by 2 rows; D, far right, moves with it
    expect(moved(roomFor([A, B, D], { id: 1, rows: 7, columns: 2, claims: true }))).toEqual({ 3: { row: 7, column: 0 }, 4: { row: 7, column: 6 } });
  });

  it("columns inserted: everything starting right of the table moves right, what is under it stays", () => {
    expect(moved(roomFor([A, C, B], { id: 1, rows: 3, columns: 3, claims: false }))).toEqual({ 2: { row: 0, column: 4 } });
  });

  it("refused where it would reach into a table it overlaps already (an `at` written by hand)", () => {
    // E over A's last row and on under it: tables that do not overlap never meet so
    const E: LaidOut = { id: 5, at: { row: 2, column: 1 }, rows: 3, columns: 1, name: "e" };
    expect(roomFor([A, E], { id: 1, rows: 4, columns: 2, claims: false })).toEqual({ refused: "e" });
  });

  it("a table beside it across its edge in other columns does not stop it", () => {
    expect("moved" in roomFor([A, C], { id: 1, rows: 6, columns: 2, claims: false })).toBe(true);
  });

  it("shrinking moves nothing", () => {
    expect(moved(roomFor([A, C, B], { id: 1, rows: 2, columns: 1, claims: false }))).toEqual({});
  });

  it("grown down and right at once (a cell typed below right of it): each way in turn", () => {
    // G under C's columns, below A's bottom: A grown to E5 reaches C (beside, right of A) and G
    const G: LaidOut = { id: 7, at: { row: 6, column: 3 }, rows: 2, columns: 1 };
    const room = roomFor([A, C, G], { id: 1, rows: 5, columns: 5, claims: true });
    // Down: in A's columns as they were nothing is reached; right: C (rows 0 to 4) is reached by 2 columns, and
    // everything right of A moves as far, G too, so C and G stay in line
    expect(moved(room)).toEqual({ 2: { row: 0, column: 5 }, 7: { row: 6, column: 5 } });
  });
});

describe("placeProblem", () => {
  const tables: LaidOut[] = [
    { id: 1, at: { row: 0, column: 0 }, rows: 3, columns: 2, name: "prices" },
    { id: 2, at: { row: 0, column: 4 }, rows: 2, columns: 1 },
  ];

  it("lets a table go where no other table is, also right next to one", () => {
    expect(placeProblem(tables, 2, { row: 0, column: 2 })).toBeUndefined();
    expect(placeProblem(tables, 2, { row: 3, column: 0 })).toBeUndefined();
    // Over its own old place: no other table there
    expect(placeProblem(tables, 1, { row: 1, column: 1 })).toBeUndefined();
  });

  it("names the table it would overlap", () => {
    expect(placeProblem(tables, 2, { row: 2, column: 1 })).toBe("prices");
    expect(placeProblem(tables, 1, { row: 0, column: 3 })).toBe("the table at E1");
  });
});
