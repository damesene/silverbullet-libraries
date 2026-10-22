import { describe, expect, it } from "vitest";
import libraryPage from "../silverware-table.md?raw";

// The rules of the library page's space-style block: [selectors, declarations],
// the innermost blocks (rules inside @media too)
function rules(): [string[], string][] {
  const css = /```space-style\r?\n([\s\S]*?)```/.exec(libraryPage)![1]!.replace(/\/\*[\s\S]*?\*\//g, "");
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), (m) => [m[1]!.split(",").map((s) => s.trim()), m[2]!]);
}

describe("The library page's CSS", () => {
  it("decorates a body cell's text on its content box too, which a decoration on the cell does not reach (an inline block)", () => {
    const decorating = rules().filter(([, body]) => /(^|;)\s*text-decoration(-line)?\s*:/.test(body));
    expect(decorating.length).toBeGreaterThan(0);
    for (const [selectors] of decorating) {
      for (const selector of selectors) {
        // A selector ending at a cell (`… td.swt-formula:not(.swt-editing)`)
        if (!/(^|[\s>+~])td(?=[.:[]|$)[^\s>+~]*$/.test(selector)) continue;
        expect(selectors, selector).toContain(`${selector} > .swt-cell-content`);
      }
    }
  });

  it("underlines a formula's result", () => {
    const rule = rules().find(([selectors]) => selectors.includes(".sb-table-widget.swt-table td.swt-formula:not(.swt-editing) > .swt-cell-content"));
    expect(rule?.[1]).toMatch(/text-decoration:\s*underline dotted/);
  });
});
