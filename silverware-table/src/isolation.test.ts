// The layers' boundaries (docs/silverware-table-isolation.md): the modules in
// src/features/ work in model terms only, nothing of the rendering; the core and
// the adapter name no module. The compiler holds most of it (ModelHost,
// TableInfo); this holds what types cannot: imports and selectors.
import { describe, expect, it } from "vitest";

// (Vite reads the options as written: a literal each time)
const features = import.meta.glob(["./features/*.ts", "!./features/*.test.ts"], { query: "?raw", import: "default", eager: true });
const core = import.meta.glob(["./controller.ts", "./core/**/*.ts", "!./core/**/*.test.ts"], { query: "?raw", import: "default", eager: true });

/** The lines of each file that match, as `file:line: text` */
function matches(files: Record<string, string>, pattern: RegExp): string[] {
  return Object.entries(files).flatMap(([path, text]) =>
    text.split("\n").flatMap((line, i) => (pattern.test(line) && !/^\s*(\/\/|\*|\/\*\*)/.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : [])),
  );
}

describe("isolation", () => {
  it("finds the files it checks", () => {
    expect(Object.keys(features).length).toBeGreaterThan(10);
    expect(Object.keys(core)).toContain("./controller.ts");
  });

  it("the modules know nothing of the rendering: its types, the adapter, the DOM of SilverBullet", () => {
    expect(matches(features, /\b(HTMLTable\w*Element|WidgetInfo|TableHost|RenderedEditor|AdapterFeature|CellHit)\b/)).toEqual([]);
    expect(matches(features, /from "\.\.\/(dom\.ts|controller\.ts)"/)).toEqual([]);
    // Of the core, its API (feature.ts) and the helpers in model terms only: structural edits, presses told apart
    expect(matches(features, /from "\.\.\/core\/(?!(feature|structure|press)\.ts")/)).toEqual([]);
    // Their own UI only: no table's rows or cells looked for, nothing of SilverBullet's or CodeMirror's
    expect(matches(features, /(querySelector\w*|closest)\([^)]*(["'`](td|th|tr|table)\b|\bsb-|\bcm-)/)).toEqual([]);
    // Their floating UI made by the core (host.floating, panel, floatingMenu), which knows it so, a download given to it: nothing put into the page apart
    expect(matches(features, /\.body\.(append|prepend|appendChild|insertBefore)\(/)).toEqual([]);
  });

  it("the core and the adapter name no module", () => {
    // Remove metadata is the controller's own (a page command too), made by it for the list of modules
    expect(matches(core, /from "[./]*features\/(?!metadata\.ts")/)).toEqual([]);
    expect(matches(core, /moduleOn\("/)).toEqual([]);
  });
});
