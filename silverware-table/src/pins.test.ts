import { describe, expect, it } from "vitest";
import { parseTable, serializeTable } from "./markdown.ts";
import { metaPins, withMetaPins } from "./meta.ts";
import {
  appendColumnAt,
  appendRowAt,
  clampColumnMove,
  clampRowMove,
  columnZone,
  deleteColumnPins,
  deleteRowPins,
  insertColumnAt,
  insertRowAt,
  pinColumn,
  pinRow,
  rowZone,
} from "./pins.ts";
import { NO_PINS } from "./view.ts";

// A table of 7 rows: header + body rows 1..6; 2 pinned to the top, 1 to the bottom
const pins = { ...NO_PINS, top: 2, bottom: 1 };
const ROWS = 7;

describe("row zones", () => {
  it("tells which rows are pinned", () => {
    expect([0, 1, 2, 3, 5, 6].map((r) => rowZone(pins, ROWS, r))).toEqual([
      undefined,
      "top",
      "top",
      undefined,
      undefined,
      "bottom",
    ]);
  });

  it("keeps moves within a zone, or between the zones", () => {
    expect(clampRowMove(pins, ROWS, 1, 4)).toBe(2); // pinned: within the top zone
    expect(clampRowMove(pins, ROWS, 4, 1)).toBe(3); // unpinned: below the top zone
    expect(clampRowMove(pins, ROWS, 4, 6)).toBe(5); // and above the bottom zone
    expect(clampRowMove(pins, ROWS, 6, 1)).toBe(6); // the only bottom row stays
  });

  it("never inserts above the first top row or below the last bottom row", () => {
    expect(insertRowAt(pins, ROWS, 1)).toEqual({ at: 2, pins: { ...pins, top: 3 } }); // inside the zone: pinned
    expect(insertRowAt(pins, ROWS, 3)).toEqual({ at: 3, pins }); // the zone's inner edge: not pinned
    expect(insertRowAt(pins, ROWS, 7)).toEqual({ at: 6, pins }); // below the last: above it, at the edge
    const twoBottom = { ...NO_PINS, bottom: 2 };
    expect(insertRowAt(twoBottom, ROWS, 7)).toEqual({ at: 6, pins: { ...twoBottom, bottom: 3 } });
  });

  it("adds rows at the end above the bottom zone", () => {
    expect(appendRowAt(pins, ROWS)).toBe(6);
    expect(insertRowAt(pins, ROWS, appendRowAt(pins, ROWS)).pins).toEqual(pins);
    expect(appendRowAt(NO_PINS, ROWS)).toBe(7);
  });

  it("counts deleted pinned rows out", () => {
    expect(deleteRowPins(pins, ROWS, 2)).toEqual({ ...pins, top: 1 });
    expect(deleteRowPins(pins, ROWS, 6)).toEqual({ ...pins, bottom: 0 });
    expect(deleteRowPins(pins, ROWS, 4)).toEqual(pins);
  });

  it("pins and unpins at the zones' inner edges", () => {
    expect(pinRow(pins, ROWS, 5, "top")).toEqual({ to: 3, pins: { ...pins, top: 3 } });
    expect(pinRow(pins, ROWS, 3, "bottom")).toEqual({ to: 5, pins: { ...pins, bottom: 2 } });
    expect(pinRow(pins, ROWS, 1, undefined)).toEqual({ to: 2, pins: { ...pins, top: 1 } });
    expect(pinRow(pins, ROWS, 6, undefined)).toEqual({ to: 6, pins: { ...pins, bottom: 0 } });
    expect(pinRow(pins, ROWS, 1, "bottom")).toEqual({ to: 5, pins: { ...pins, top: 1, bottom: 2 } });
    expect(pinRow(pins, ROWS, 2, "top")).toEqual({ to: 2, pins });
  });
});

describe("column zones", () => {
  // 5 columns: 1 pinned left, 1 pinned right
  const p = { ...NO_PINS, left: 1, right: 1 };

  it("keeps columns in their zones", () => {
    expect([0, 1, 3, 4].map((c) => columnZone(p, 5, c))).toEqual(["left", undefined, undefined, "right"]);
    expect(clampColumnMove(p, 5, 2, 0)).toBe(1);
    expect(clampColumnMove(p, 5, 2, 4)).toBe(3);
  });

  it("inserts, appends, deletes and pins by the same rules", () => {
    expect(insertColumnAt(p, 5, 0)).toEqual({ at: 1, pins: p });
    expect(insertColumnAt(p, 5, 5)).toEqual({ at: 4, pins: p });
    expect(appendColumnAt(p, 5)).toBe(4);
    expect(deleteColumnPins(p, 5, 4)).toEqual({ ...p, right: 0 });
    expect(pinColumn(p, 5, 2, "left")).toEqual({ to: 1, pins: { ...p, left: 2 } });
    expect(pinColumn(p, 5, 2, "right")).toEqual({ to: 3, pins: { ...p, right: 2 } });
    expect(pinColumn(p, 5, 0, undefined)).toEqual({ to: 0, pins: { ...p, left: 0 } });
  });
});

describe("pins in the metadata row", () => {
  it("are stored as counts, limited to the table", () => {
    const table = withMetaPins(parseTable("| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |"), { ...NO_PINS, top: 1, right: 1 });
    expect(serializeTable(table)).toBe(`| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| <meta core.table core.pin-top='1' core.pin-right='1'> |`);
    expect(metaPins(parseTable(serializeTable(table)))).toEqual({ ...NO_PINS, top: 1, right: 1 });
    const tooMany = parseTable(`| A |\n|---|\n| 1 |\n| <meta core.table core.pin-top='5' core.pin-bottom='2' core.pin-left='x'> |`);
    expect(metaPins(tooMany)).toEqual({ ...NO_PINS, top: 1 });
  });
});
