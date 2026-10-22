import { describe, expect, it } from "vitest";
import { withAreasWritten, writtenArea } from "./frame.ts";

describe("withAreasWritten", () => {
  it("rewrites each cell and range reference, its table's name with it", () => {
    const shifted = withAreasWritten("=SUM(A1:B2) + prices!$C$3 * [qty] + [[Shop]]t!A1", (ref) =>
      ref.table?.page ? undefined : writtenArea({ top: ref.area.top + 1, left: ref.area.left, bottom: ref.area.bottom + 1, right: ref.area.right }, ref.fixed),
    );
    expect(shifted).toBe("=SUM(A2:B3) + $C$4 * [qty] + [[Shop]]t!A1");
  });

  it("leaves a reference as written where nothing is given, and adds a table's name", () => {
    expect(withAreasWritten("=A1+B1", (ref) => (ref.area.left === 1 ? writtenArea(ref.area, ref.fixed, "costs") : undefined))).toBe("=A1+costs!B1");
  });

  it("replaces a table's name with spaces before the cell", () => {
    expect(withAreasWritten("=prices! B2", (ref) => writtenArea(ref.area))).toBe("=B2");
  });

  it("leaves functions, names and text alone", () => {
    expect(withAreasWritten('=LOG2(8) & "A1" & vat & pear[price]', () => "X9")).toBe('=LOG2(8) & "A1" & vat & pear[price]');
  });
});
