import { describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "../markdown.ts";
import { type FillLine, filled, fillLine, seriesFor } from "./index.ts";

/** The values after (and, backward, before) the ones given, as a drag fills them */
const after = (values: string[], count = 3) => {
  const { next } = seriesFor(values);
  return Array.from({ length: count }, (_, j) => next(values.length + j));
};
const before = (values: string[], count = 2) => {
  const { next } = seriesFor(values);
  return Array.from({ length: count }, (_, j) => next(-1 - j));
};

describe("series", () => {
  it("goes on with numbers by their step, written as they are; one number repeats", () => {
    expect(after(["1", "2"])).toEqual(["3", "4", "5"]);
    expect(after(["10", "20"])).toEqual(["30", "40", "50"]);
    expect(before(["1", "2"])).toEqual(["0", "-1"]);
    expect(after(["1,5", "2,5"], 2)).toEqual(["3,5", "4,5"]);
    expect(after(["0.25", "0.5"], 2)).toEqual(["0.75", "1.00"]);
    expect(after(["001", "002"], 2)).toEqual(["003", "004"]);
    // Uneven: their trend
    expect(after(["1", "2", "4"], 1)).toEqual(["5.33"]);
    expect(after(["7"])).toEqual(["7", "7", "7"]);
    // One number repeats, whatever its sign or decimals; numbers of more than 15 digits are no series
    expect(after(["9.99"], 2)).toEqual(["9.99", "9.99"]);
    expect(after(["-3"], 2)).toEqual(["-3", "-3"]);
    expect(after(["2,5"], 1)).toEqual(["2,5"]);
    expect(after(["12345678901234567890", "12345678901234567890"], 1)).toEqual(["12345678901234567890"]);
    expect(after(["Acct 12345678901234567890"], 1)).toEqual(["Acct 12345678901234567890"]);
  });

  it("goes on with text with a number in it", () => {
    expect(after(["Item 1"], 2)).toEqual(["Item 2", "Item 3"]);
    expect(after(["A-01"], 2)).toEqual(["A-02", "A-03"]);
    expect(after(["Q1", "Q3"], 2)).toEqual(["Q5", "Q7"]);
    expect(after(["10 %", "20 %"], 1)).toEqual(["30 %"]);
    // Back past 0: up again, no minus sign in the text
    expect(before(["Item 1"], 2)).toEqual(["Item 0", "Item 1"]);
    expect(before(["A-01"], 2)).toEqual(["A-00", "A-01"]);
  });

  it("goes round days and months, English and Czech, in the case and diacritics typed", () => {
    expect(after(["Mon", "Tue"])).toEqual(["Wed", "Thu", "Fri"]);
    expect(after(["Sunday"], 1)).toEqual(["Monday"]);
    expect(after(["FRI"], 2)).toEqual(["SAT", "SUN"]);
    expect(after(["Po", "Út"], 2)).toEqual(["St", "Čt"]);
    expect(after(["Po", "Ut"], 2)).toEqual(["St", "Ct"]);
    expect(after(["pondělí"], 1)).toEqual(["úterý"]);
    expect(after(["leden", "březen"], 2)).toEqual(["květen", "červenec"]);
    expect(after(["Jan", "Apr"], 1)).toEqual(["Jul"]);
    expect(before(["Mon"], 1)).toEqual(["Sun"]);
    // The short Czech words are everyday words too: one repeats, two make a series
    expect(after(["ne"], 2)).toEqual(["ne", "ne"]);
    expect(after(["ne", "po"], 1)).toEqual(["út"]);
  });

  it("goes on with dates and times", () => {
    expect(after(["2025-11-06"], 2)).toEqual(["2025-11-07", "2025-11-08"]);
    expect(after(["2025-11-06", "2025-11-13"], 1)).toEqual(["2025-11-20"]);
    // By months: the first date's day, or the month's last
    expect(after(["2025-01-31", "2025-02-28"], 2)).toEqual(["2025-03-31", "2025-04-30"]);
    expect(after(["2025-11-06 14:00", "2025-11-06 16:00"], 1)).toEqual(["2025-11-06 18:00"]);
    expect(after(["14:30"], 2)).toEqual(["15:30", "16:30"]);
    expect(after(["23:00"], 1)).toEqual(["00:00"]);
    expect(after(["8:00", "8:15"], 1)).toEqual(["08:30"]);
    // Dates with dots, written as the first one is
    expect(after(["6.11.2025"], 2)).toEqual(["7.11.2025", "8.11.2025"]);
    expect(after(["06. 11. 2025", "13. 11. 2025"], 1)).toEqual(["20. 11. 2025"]);
    expect(after(["31.1.2025", "28.2.2025"], 1)).toEqual(["31.3.2025"]);
  });

  it("repeats what fits no series", () => {
    expect(after(["a", "b"])).toEqual(["a", "b", "a"]);
    expect(before(["a", "b", "c"], 2)).toEqual(["c", "b"]);
    expect(after(["Mon", "Mon"], 2)).toEqual(["Mon", "Mon"]);
    expect(after(["1", "x"], 2)).toEqual(["1", "x"]);
    expect(seriesFor(["a"]).name).toBe("repeat");
  });
});

describe("filling a table", () => {
  const TABLE = parseTable("| N | Day | F |\n|---|---|---|\n| 1 | Mon | =A1 |\n| 2 | Tue | x |\n|  |  | <meta cn=\"keep\"> |\n|  |  |  |\n");
  // A claim as the formulas module makes one: cells written "=…" copied with the rows they moved
  const cells = {
    claim: (cell: string, from: { row: number }, to: { row: number }) => (cell.startsWith("=") ? `=moved ${to.row - from.row}` : undefined),
    keepTags: (value: string, from: string) => [value, ...(from.match(/<meta[^>]*>/g) ?? [])].join(" ").trim(),
  };
  const column = (c: number, backward = false): FillLine => ({
    sources: [1, 2].map((row) => ({ row, column: c })),
    targets: [3, 4].map((row) => ({ row, column: c })),
    backward,
  });

  it("fills each column on its own, keeping the tags of the cells written over", () => {
    const result = filled(TABLE, [column(0), column(1)], cells);
    expect(serializeTable(result).split("\n").slice(4, 6)).toEqual(["| 3 | Wed | <meta cn=\"keep\"> |", "| 4 | Thu | |"]);
  });

  it("copies the cells another part claims, the selected cells over again, others as their values", () => {
    expect(fillLine(TABLE, column(2), cells)).toEqual(['=moved 2 <meta cn="keep">', "x"]);
  });
});
