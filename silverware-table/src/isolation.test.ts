// The layers' boundaries (docs/silverware-table-isolation.md): the modules in
// src/features/ work in model terms only, nothing of the rendering; the core and
// the adapter name no module. The compiler holds most of it (ModelHost,
// TableInfo); this holds what types cannot: imports and selectors.
import { describe, expect, it } from "vitest";

// (Vite reads the options as written: a literal each time)
const features = import.meta.glob(["./features/*.ts", "!./features/*.test.ts"], { query: "?raw", import: "default", eager: true });
const core = import.meta.glob(["./controller.ts", "./core/**/*.ts", "!./core/**/*.test.ts"], { query: "?raw", import: "default", eager: true });
// The domains the modules hand data to: their own pure code
const domains = import.meta.glob(["./formulas/**/*.ts", "./sheet/**/*.ts", "./excel/**/*.ts", "./export/**/*.ts", "!./**/*.test.ts"], { query: "?raw", import: "default", eager: true });

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

  it("a table's key is made by the core's register only: no module builds one, from a table's place or otherwise", () => {
    // (core/parts.ts makes none: it passes on the key a hook was given)
    const outside = Object.fromEntries(Object.entries({ ...features, ...core }).filter(([path]) => path !== "./core/tables.ts" && path !== "./core/parts.ts"));
    expect(matches(outside, /as TableKey\b|`\$\{[^`]*\}#\$\{/)).toEqual([]);
  });

  it("a module keeps no collection of state by table: its part for each table holds it (core/parts.ts)", () => {
    // (The sheet lays several tables out on one board: those are its own, the page's)
    const modules = Object.fromEntries(
      Object.entries({ ...features, ...core }).filter(([path]) => (path.startsWith("./features/") || path.startsWith("./core/silverbullet/modules/")) && !path.endsWith("/sheet.ts")),
    );
    expect(matches(modules, /\b(Map|Set|WeakMap)<TableKey\b/)).toEqual([]);
  });

  it("what tables keep is read and written through the host: no module nor domain names an attribute or reads the metadata itself", () => {
    // (Remove metadata is the core's: it names whose each attribute is)
    const modules = Object.fromEntries(
      Object.entries({ ...features, ...core }).filter(([path]) => (path.startsWith("./features/") && path !== "./features/metadata.ts") || path.startsWith("./core/silverbullet/modules/")),
    );
    // A guard against calling them by mistake: a module could keep its data elsewhere, which nothing here prevents
    expect(matches(modules, /from "[./]*(meta|metanames|names|tagvalues)\.ts"/)).toEqual([]);
    expect(matches(modules, /\bmetaAttribute\b/)).toEqual([]);
    expect(matches(domains, /from "[./]*(meta|metanames|names|tagvalues)\.ts"|\bmetaAttribute\b|[\w)\]?]\.meta\b/)).toEqual([]);
  });

  it("the core and the adapter name no module", () => {
    // Remove metadata is the controller's own (a page command too), made by it for the list of modules
    expect(matches(core, /from "[./]*features\/(?!metadata\.ts")/)).toEqual([]);
    expect(matches(core, /moduleOn\("/)).toEqual([]);
  });
});
