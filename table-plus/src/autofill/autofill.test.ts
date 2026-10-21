import { afterEach, describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "../markdown.ts";
import { allSeries, clearCustomSeries, customSeries, customSeriesAnew, defineCustomSeries, type FillLine, filled, fillLine, seriesFor } from "./index.ts";

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

describe("custom series", () => {
  afterEach(() => clearCustomSeries());

  it("goes round a list of words, before the built-in series, and needs two of one not alone", () => {
    const { series, problems } = customSeries({
      default: () => [
        { name: "quarters", words: ["Q1", "Q2", "Q3", "Q4"] },
        { name: "status", words: ["todo", "doing", "done"], alone: false },
      ],
    });
    expect(problems).toEqual([]);
    defineCustomSeries(series);
    // Not Q5: the custom list before the built-in numbered text
    expect(after(["Q3"])).toEqual(["Q4", "Q1", "Q2"]);
    expect(after(["DOING", "DONE"], 1)).toEqual(["TODO"]);
    expect(after(["doing"], 1)).toEqual(["doing"]);
  });

  it("writes the words as the list does when typed so, else in the case of the first", () => {
    defineCustomSeries(
      customSeries([
        { name: "devices", words: ["iPhone", "iPad", "macOS"] },
        { name: "sizes", words: ["S", "M", "L", "XL"] },
        { name: "steps", words: ["To Do", "In Progress", "Done"] },
      ]).series,
    );
    expect(after(["iPhone"], 2)).toEqual(["iPad", "macOS"]);
    expect(after(["L"], 2)).toEqual(["XL", "S"]);
    expect(after(["To Do"], 1)).toEqual(["In Progress"]);
    expect(after(["to do"], 1)).toEqual(["in progress"]);
    // Built-in lists too: typed as listed, or in their own case
    expect(after(["Mon"], 1)).toEqual(["Tue"]);
    expect(after(["MON"], 1)).toEqual(["TUE"]);
  });

  it("goes on with a series' generator, a mistake in it no match or the value repeated", () => {
    defineCustomSeries(
      customSeries([
        { name: "weeks", match: (values: string[]) => (values.every((v) => /^W\d+$/.test(v)) ? (i: number) => `W${Number(values[0]!.slice(1)) + i}` : undefined) },
        { name: "broken", match: (values: string[]) => (values[0] === "boom" ? () => { throw new Error("no"); } : values[0] === "bad" ? 42 : undefined) },
      ]).series,
    );
    expect(after(["W7"], 2)).toEqual(["W8", "W9"]);
    expect(before(["W7"], 1)).toEqual(["W6"]);
    // A generator that throws gives the value repeated; a match giving no function is no match
    expect(after(["boom"], 1)).toEqual(["boom"]);
    expect(after(["bad"], 1)).toEqual(["bad"]);
  });

  it("replaces a built-in series of its name, in its place, and anew once Space Lua loads again", () => {
    defineCustomSeries(customSeries([{ name: "Lists", words: ["red", "green", "blue"] }]).series);
    expect(after(["Mon"], 1)).toEqual(["Mon"]);
    expect(after(["green"], 1)).toEqual(["blue"]);
    expect(allSeries().map((s) => s.name)).toEqual(["dates", "times", "numbers", "lists", "numbered text"]);
    customSeriesAnew();
    defineCustomSeries(customSeries([{ name: "sizes", words: ["S", "M", "L"] }]).series);
    expect(allSeries().map((s) => s.name)).toEqual(["sizes", "dates", "times", "numbers", "lists", "numbered text"]);
    expect(after(["Mon"], 1)).toEqual(["Tue"]);
  });

  it("tells what is wrong with a definition and defines the others", () => {
    const { series, problems } = customSeries([
      { name: "ok", words: ["a", "b"] },
      { name: "1st" },
      { name: "both", words: ["a", "b"], match: () => undefined },
      { name: "short", words: ["a"] },
      { name: "twice", words: ["Út", "ut"] },
    ]);
    expect(series.map((s) => s.name)).toEqual(["ok"]);
    expect(problems).toEqual([
      'series 2: its name "1st" is not letters, digits, _ and spaces starting with a letter',
      "series 3: both: it has words (a list to go round) or match (a series), one of them",
      "series 4: short: its words are not a list of two or more texts",
      "series 5: twice: a word is in its words twice (case and diacritics aside)",
    ]);
    expect(customSeries("x").problems).toEqual(["the definitions are not a list of series (or a function returning one)"]);
  });
});
