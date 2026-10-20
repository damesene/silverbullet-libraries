// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { controller, editor, flush, PAGE, setup, useTablePage } from "../table-plus/src/testing/page.ts";
import { measure, profiled, profileTablePlus, type ProfileEntry, setProfileSink } from "./profile.ts";

describe("Profiling", () => {
  afterEach(() => setProfileSink(undefined));

  it("measures nothing without a sink", () => {
    const entries: ProfileEntry[] = [];
    expect(measure("x", () => 2)).toBe(2);
    expect(entries).toEqual([]);
  });

  it("measures each call's total and self time, nested ones apart; an async one until it is done", async () => {
    const entries: ProfileEntry[] = [];
    setProfileSink((e) => entries.push(e));
    measure("outer", () => measure("inner", () => 1));
    expect(entries.map((e) => e.label)).toEqual(["inner", "outer"]);
    const [inner, outer] = entries;
    expect(outer!.total).toBeGreaterThanOrEqual(inner!.total);
    expect(outer!.self).toBeLessThanOrEqual(outer!.total - inner!.total + 0.001);
    entries.length = 0;
    let resolve = () => {};
    const done = measure("async", () => new Promise<void>((r) => (resolve = r)));
    expect(entries).toEqual([]);
    resolve();
    await done;
    await flush();
    expect(entries.map((e) => e.label)).toEqual(["async"]);
  });

  it("wraps an object's methods as `name · method`, its calls to its own methods part of the outer call", () => {
    const entries: ProfileEntry[] = [];
    setProfileSink((e) => entries.push(e));
    class Base {
      helper(): number {
        return 1;
      }
    }
    class Thing extends Base {
      hook(): number {
        return this.helper() + 1;
      }
    }
    const thing = profiled("thing", new Thing());
    expect(thing.hook()).toBe(2);
    expect(entries.map((e) => e.label)).toEqual(["thing · hook"]);
    thing.helper();
    expect(entries.map((e) => e.label)).toEqual(["thing · hook", "thing · helper"]);
  });
});

describe("Profiling Table Plus from outside", () => {
  useTablePage();
  afterEach(() => setProfileSink(undefined));

  it("measures the core's phases and the features' hooks, Table Plus left as it is", async () => {
    await setup(PAGE);
    const labels = new Set<string>();
    setProfileSink((e) => void labels.add(e.label));
    (globalThis as Record<string, unknown>).__tablePlus = controller;
    await profileTablePlus();
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    await controller.write(widget, (t) => ({ ...t, padded: true }));
    await controller.scan();
    await flush();
    for (const label of ["core · write", "core · enhanceNow", "core · decorate", "core · applyView", "formulas · decorate", "columnTypes · decorate"]) {
      expect(labels, label).toContain(label);
    }
  });
});
