// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { bodyTexts, cell, clickOn, editor, flush, key, press, setup, text, useTablePage } from "../testing/page.ts";

describe("Column types", () => {
  useTablePage();

  const usd = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
  const PAGE = [
    "| Item | Price #currency-usd | Rating #stars | Done #check |",
    "|---|---|---|---|",
    "| Pear | 12.99 | 4 | yes |",
    "| Fig | 3.5 | 1 | no |",
    "| Plum | lots | 2 | maybe |",
    "| Kiwi | [[Shop]] | | x |",
    "",
  ].join("\n");

  it("shows cells as their column's type, hiding the type's hashtag", async () => {
    await setup(PAGE);
    expect([cell(1, 1).textContent, cell(1, 2).textContent, cell(1, 3).textContent]).toEqual([usd(12.99), "★★★★☆", "✅"]);
    expect(cell(2, 3).textContent).toBe("❌");
    expect(cell(0, 1).querySelector(".tp-type-tag")!.textContent).toBe("#currency-usd");
    // The markdown is left as written
    expect(text).toBe(PAGE);
  });

  it("marks values that are not of the type, and leaves cells with markup and empty ones alone", async () => {
    await setup(PAGE);
    expect(cell(3, 1).textContent).toBe("lots");
    expect(cell(3, 1).classList.contains("tp-type-invalid")).toBe(true);
    expect(cell(3, 1).title).toBe('"lots" is not a number');
    expect(cell(3, 3).classList.contains("tp-type-invalid")).toBe(true);
    expect(cell(4, 1).querySelector("a")!.textContent).toBe("Shop");
    expect(cell(4, 2).textContent).toBe("");
    expect(cell(4, 2).classList.contains("tp-type-invalid")).toBe(false);
  });

  it("sorts by the values, not by what the cells show", async () => {
    await setup(PAGE);
    clickOn(cell(0, 2).querySelector(".tp-sort")!); // Rating ascending
    expect(bodyTexts()).toEqual(["Fig", "Plum", "Pear", "Kiwi"]);
    clickOn(cell(0, 3).querySelector(".tp-sort")!); // Done ascending: no before yes, the invalid one as text
    expect(bodyTexts().slice(0, 2)).toEqual(["Fig", "Pear"]);
  });

  it("edits and copies the value", async () => {
    await setup(PAGE);
    clickOn(cell(1, 2));
    expect(editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value).toBe("4");
    key(editor.querySelector(".tp-cell-editor")!, "Escape");
    await flush();
    press(cell(1, 1), "mousedown");
    cell(1, 2).dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
    const data: Record<string, string> = {};
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(copy, "clipboardData", { value: { setData: (type: string, value: string) => (data[type] = value) } });
    document.dispatchEvent(copy);
    expect(data["text/plain"]).toBe("12.99\t4");
  });

  it("shows a formula's result in its column's type", async () => {
    await setup(
      '| Item | Price #currency-usd |\n|---|---|\n| Pear | 12.99 |\n| Fig | 3.5 |\n| Total | 16.49 <meta f="=SUM([price])"> |\n',
    );
    expect(cell(3, 1).textContent).toBe(usd(16.49));
    expect(cell(3, 1).classList.contains("tp-formula")).toBe(true);
  });

  it("makes links of web addresses", async () => {
    await setup("| Site #link |\n|---|\n| https://silverbullet.md/ |\n");
    const link = cell(1, 0).querySelector("a")!;
    expect([link.textContent, link.getAttribute("href"), link.target]).toEqual(["silverbullet.md", "https://silverbullet.md/", "_blank"]);
  });
});
