// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cellText } from "../dom.ts";
import { ICONS } from "../icons.ts";
import { TYPES } from "../types/index.ts";
import { bodyTexts, cell, clickOn, controller, editor, flashes, flush, key, press, setup, text, useTablePage } from "../testing/page.ts";

describe("Column types", () => {
  useTablePage();

  // An icon as the page holds it (the browser writes <path/> as <path></path>)
  const asRendered = (html: string) => {
    const span = document.createElement("span");
    span.innerHTML = html;
    return span.innerHTML;
  };
  const iconHtml = (name: string) => asRendered(TYPES.get(name)!.icon!);
  const usd = (n: number) => TYPES.get("currency")!.format(String(n), "usd") as string;
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
    // The type's icon goes after the column's name, before the sort button, and is not part of the name
    const icon = cell(0, 1).querySelector(".tp-type-icon")!;
    expect(icon.nextElementSibling!.classList.contains("tp-sort")).toBe(true);
    // Kept with the name's last word, so a narrow column never wraps the icons apart
    const kept = icon.parentElement!;
    expect(kept.classList.contains("tp-keep")).toBe(true);
    expect(kept.firstChild!.textContent).toBe("Price ");
    expect(icon.innerHTML).toBe(iconHtml("currency"));
    expect((icon as HTMLElement).title).toContain("Currency (#currency-usd)");
    expect(cell(0, 0).querySelector(".tp-type-icon")).toBeNull();
    expect(cellText(cell(0, 1))).toBe("Price");
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

  it("offers the type's values in the editor, and says when a value saved is not of the type", async () => {
    // Enter only saves: the cell below would open with a list of its own
    await setup(PAGE, { "tablePlus.editor.enterKey": "save" });
    clickOn(cell(1, 2));
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    const picker = document.querySelector<HTMLElement>(".tp-choices")!;
    const options = () => Array.from(picker.querySelectorAll<HTMLElement>(".tp-choice"));
    // All the values, though the cell has one: to change it to another; its own marked
    expect(picker.classList.contains("tp-visible")).toBe(true);
    expect(options().map((o) => o.textContent)).toEqual(["0 ☆☆☆☆☆", "1 ★☆☆☆☆", "2 ★★☆☆☆", "3 ★★★☆☆", "4 ★★★★☆", "5 ★★★★★"]);
    expect(options()[4]!.classList.contains("tp-current")).toBe(true);
    // Typing narrows them to those containing what is typed
    field.value = "★★★★";
    field.dispatchEvent(new Event("input"));
    expect(options().map((o) => o.textContent)).toEqual(["4 ★★★★☆", "5 ★★★★★"]);
    field.value = "9";
    field.dispatchEvent(new Event("input"));
    expect(picker.classList.contains("tp-visible")).toBe(false);
    key(field, "Enter");
    await flush();
    expect(text).toContain("| Pear | 12.99 | 9 | yes |");
    expect(flashes).toEqual(['Table Plus: "9" is not a whole number from 0 to 5 (#stars); saved as typed']);
    expect(picker.classList.contains("tp-visible")).toBe(false);
  });

  it("picks a value from the list with the mouse, or with the arrows and Enter", async () => {
    await setup(PAGE);
    const field = () => editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    const options = () => Array.from(document.querySelectorAll<HTMLElement>(".tp-choices .tp-choice"));
    clickOn(cell(1, 3)); // Done: yes
    options().find((o) => o.textContent === "❌ no")!.click();
    await flush();
    expect(text).toContain("| Pear | 12.99 | 4 | no |");
    await controller.scan();

    clickOn(cell(2, 2)); // Rating: 1, where the arrows start
    expect(options()[1]!.classList.contains("tp-active")).toBe(true);
    key(field(), "ArrowDown");
    key(field(), "ArrowDown");
    expect(options()[3]!.classList.contains("tp-active")).toBe(true);
    expect(field().value).toBe("1"); // the arrows only move along the list
    key(field(), "Enter");
    await flush();
    expect(text).toContain("| Fig | 3.5 | 3 | no |");
    await controller.scan();

    // A value not of the type: all the values to pick one, until something is typed
    clickOn(cell(3, 3)); // Done: maybe
    expect(options().map((o) => o.textContent)).toEqual(["✅ yes", "❌ no"]);
    field().value = "mayb";
    field().dispatchEvent(new Event("input"));
    expect(document.querySelector(".tp-choices")!.classList.contains("tp-visible")).toBe(false);
  });

  it("shows a formula's result in its column's type", async () => {
    await setup(
      '| Item | Price #currency-usd |\n|---|---|\n| Pear | 12.99 |\n| Fig | 3.5 |\n| Total | 16.49 <meta f="=SUM([price])"> |\n',
    );
    expect(cell(3, 1).textContent).toBe(usd(16.49));
    expect(cell(3, 1).classList.contains("tp-formula")).toBe(true);
  });

  it("picks a column's type from its menu, as a hashtag in its header", async () => {
    await setup("| Item | Rating #todo |\n|---|---|\n| Pear | 4 |\n");
    const openColumnMenu = () => {
      cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".tp-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };
    const item = (label: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === label)!;
    const title = () => document.querySelector(".tp-menu-title")!.textContent;
    openColumnMenu();
    // The types show in the same dropdown; Back shows the column's menu again
    item("Type").click();
    expect(title()).toBe("Column type");
    // A type's detail shows in a bubble beside the menu while it is hovered
    item("Unit").dispatchEvent(new MouseEvent("mouseenter"));
    const bubble = document.querySelector<HTMLElement>(".tp-menu-detail")!;
    expect(bubble.hidden).toBe(false);
    expect(bubble.querySelector(".tp-menu-detail-title")!.textContent).toBe("Unit");
    expect(Array.from(bubble.querySelectorAll("code"), (c) => c.textContent)).toEqual(["#unit-kg"]);
    expect(bubble.querySelector("p")!.textContent).toBe("A number with a unit: the unit after the dash.");
    expect(bubble.querySelector(".tp-menu-detail-note")!.textContent).toBe("Also written as #kg, #km, #watt");
    expect(item("Unit").title).toBe("");
    item("Unit").dispatchEvent(new MouseEvent("mouseleave"));
    expect(bubble.hidden).toBe(true);
    // Each type with its icon
    expect(item("Stars").querySelector(".tp-icon")!.innerHTML).toBe(iconHtml("stars"));
    // The arrow before the title goes back
    document.querySelector<HTMLElement>(".tp-menu-title .tp-menu-back")!.click();
    expect(title()).toBe("Column: Rating #todo");
    item("Type").click();
    item("Stars").click();
    await flush();
    await controller.scan();
    expect(text).toBe("| Item | Rating #todo #stars |\n|---|---|\n| Pear | 4 |\n");
    expect(document.querySelector(".tp-menu")).toBeNull();
    expect(cell(1, 1).textContent).toBe("★★★★☆");
    expect(cell(0, 1).querySelector(".tp-type-icon")!.innerHTML).toBe(iconHtml("stars"));

    openColumnMenu();
    // The item keeps its icon; the type's icon goes before the type's name
    expect(item("Type: Stars").querySelector(".tp-icon")!.innerHTML).toBe(asRendered(ICONS.columnType));
    expect(item("Type: Stars").querySelector(".tp-menu-value-icon")!.innerHTML).toBe(iconHtml("stars"));
    item("Type: Stars").click();
    item("No type").click();
    await flush();
    expect(text).toBe("| Item | Rating #todo |\n|---|---|\n| Pear | 4 |\n");
  });

  it("edits a header as the column's name, keeping its type", async () => {
    await setup("| Item | Rating #stars-3 |\n|---|---|\n| Pear | 2 |\n");
    clickOn(cell(0, 1));
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    expect(field.value).toBe("Rating");
    field.value = "Score";
    key(field, "Enter");
    await flush();
    expect(text).toBe("| Item | Score #stars-3 |\n|---|---|\n| Pear | 2 |\n");
    // An emptied name keeps the old one, type and all
    await controller.scan();
    clickOn(cell(0, 1));
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = " ";
    key(editor.querySelector(".tp-cell-editor")!, "Enter");
    await flush();
    expect(text).toBe("| Item | Score #stars-3 |\n|---|---|\n| Pear | 2 |\n");
  });

  it("makes links of web addresses", async () => {
    await setup("| Site #link |\n|---|\n| https://silverbullet.md/ |\n");
    const link = cell(1, 0).querySelector("a")!;
    expect([link.textContent, link.getAttribute("href"), link.target]).toEqual(["silverbullet.md", "https://silverbullet.md/", "_blank"]);
  });
});
