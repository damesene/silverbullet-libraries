import { describe, expect, it } from "vitest";
import type { AdapterFeature, TableInfo, WidgetInfo } from "./feature.ts";
import { type PartTable, Parts, tablePartsOf } from "./parts.ts";
import type { TableKey } from "./tables.ts";

const info = (key: string) => ({ key }) as unknown as WidgetInfo;

class Counter {
  seen = 0;
  stopped = false;
  constructor(readonly table: PartTable) {}
  hidesRows(_info: TableInfo): boolean {
    this.seen++;
    return this.table.key === "P#1";
  }
  columnsMoved(): void {
    this.seen += 10;
  }
  stop(): void {
    this.stopped = true;
  }
}

class Module implements AdapterFeature {
  readonly made: Counter[] = [];
  readonly tableParts = tablePartsOf(Counter, (table) => {
    const part = new Counter(table);
    this.made.push(part);
    return part;
  });
  keys = 0;
  keyDown(): boolean {
    this.keys++;
    return false;
  }
}

describe("Parts", () => {
  it("hands a hook about a table to that table's part, made once, the others to the module", () => {
    const parts = new Parts((key) => info(key));
    const module = new Module();
    const routed: AdapterFeature = parts.routed(module);
    expect(routed.hidesRows!(info("P#0"))).toBe(false);
    expect(routed.hidesRows!(info("P#1"))).toBe(true);
    routed.hidesRows!(info("P#1"));
    expect(module.made.map((p) => [p.table.key, p.seen])).toEqual([
      ["P#0", 1],
      ["P#1", 2],
    ]);
    // A hook taking the key
    routed.columnsMoved!("P#0" as TableKey, (c) => c);
    expect(module.made[0]!.seen).toBe(11);
    // The module's own, bound to it
    routed.keyDown!({} as KeyboardEvent);
    expect(module.keys).toBe(1);
    // The table as it is now, and the parts made so far, the module's to ask for
    expect(module.made[1]!.table.current()?.key).toBe("P#1");
    expect(parts.of(module, "P#1" as TableKey)).toBe(module.made[1]);
    expect(parts.all(module)).toEqual(module.made);
  });

  it("has only the hooks the parts' class has, and ends the parts with the module", () => {
    const parts = new Parts((key) => info(key));
    const module = new Module();
    const routed: AdapterFeature = parts.routed(module);
    expect(routed.hiddenRows).toBeUndefined();
    expect(module.tableParts.hooks).toEqual(["hidesRows", "columnsMoved"]);
    routed.hidesRows!(info("P#0"));
    routed.stop!();
    expect(module.made[0]!.stopped).toBe(true);
    expect(parts.all(module)).toEqual([]);
  });

  it("leaves a module without parts as it is", () => {
    const parts = new Parts((key) => info(key));
    const plain: AdapterFeature = { keyDown: () => false };
    expect(parts.routed(plain)).toBe(plain);
  });
});

describe("Parts, the module routed", () => {
  it("has the module's parts, not a second set of them", () => {
    const parts = new Parts((key) => info(key));
    const module = new Module();
    const routed = parts.routed(module);
    expect(parts.of(routed, "P#0" as TableKey)).toBe(parts.of(module, "P#0" as TableKey));
    expect(module.made).toHaveLength(1);
  });
});
