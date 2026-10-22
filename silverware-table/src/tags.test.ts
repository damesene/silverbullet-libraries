import { describe, expect, it } from "vitest";
import { cellTags, keepTags, withoutTags } from "./tags.ts";

describe("hidden tags in cells", () => {
  const cell = `37,5 <meta f='=[@qty]*2'> <meta n='pear' cn='first'>`;

  it("reads a cell's tags and its text without them", () => {
    expect(cellTags(cell)).toEqual([`<meta f='=[@qty]*2'>`, `<meta n='pear' cn='first'>`]);
    expect(withoutTags(cell)).toBe("37,5");
    expect(withoutTags("plain")).toBe("plain");
  });

  it("ends a tag at its first >, as SilverBullet does, so a value's > is written &gt;", () => {
    expect(cellTags(`big <meta f='=IF(A1&gt;5, "big", "")'>`)).toEqual([`<meta f='=IF(A1&gt;5, "big", "")'>`]);
    // A > typed by hand into a value: SilverBullet shows the rest as text, Silverware Table takes it as text too
    expect(withoutTags(`x <meta note='a > b'>`)).toBe(`x b'>`);
  });

  it("still finds a tag typed by hand with a lone quote", () => {
    expect(withoutTags(`x <meta note="oops>`)).toBe("x");
  });

  it("keeps the tags of the cell as it was with a new value, whatever they are for", () => {
    expect(keepTags("40", cell)).toBe(`40 <meta f='=[@qty]*2'> <meta n='pear' cn='first'>`);
    expect(keepTags("", cell)).toBe(`<meta f='=[@qty]*2'> <meta n='pear' cn='first'>`);
    expect(keepTags("40", "plain")).toBe("40");
  });

  it("leaves out the tags the new value has itself, and those a module takes", () => {
    expect(keepTags(`6 <meta f='=3*2'>`, cell)).toBe(`6 <meta f='=3*2'> <meta n='pear' cn='first'>`);
    expect(keepTags("40", cell, new Set(["f"]))).toBe(`40 <meta n='pear' cn='first'>`);
    expect(keepTags("", cell, new Set(["f", "n"]))).toBe("");
  });

  it("reads a tag's attributes, not what its values say (a formula's n=1)", () => {
    const named = `0 <meta f='=IF("n=1"="n=1",1,0)'> <meta n='row' cn='c'>`;
    expect(keepTags(`1 <meta f='=IF(n=5,1,0)'>`, named)).toBe(`1 <meta f='=IF(n=5,1,0)'> <meta n='row' cn='c'>`);
  });
});
