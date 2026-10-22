// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cellText } from "../dom.ts";
import { typeNamed } from "../columntypes/index.ts";
import { clearCustomTypes } from "../columntypes/registry.ts";
import { defineTypes } from "../index.ts";
import { bodyTexts, cell, clickOn, controller, editor, flashes, flush, key, press, setup, text, useTablePage } from "../testing/page.ts";

describe("Column types", () => {
  useTablePage();

  // An icon as the page holds it (the browser writes <path/> as <path></path>)
  const asRendered = (html: string) => {
    const span = document.createElement("span");
    span.innerHTML = html;
    return span.innerHTML;
  };
  const iconHtml = (name: string) => asRendered(typeNamed(name)!.icon!);
  const usd = (n: number) => typeNamed("currency")!.format(String(n), { code: "usd" }) as string;
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
    expect(cell(0, 1).querySelector(".swt-hidden-tag")!.textContent).toBe("#currency-usd");
    // The type's icon goes after the column's name, before the filter mark and the sort button, and is not part of the name
    const icon = cell(0, 1).querySelector(".swt-type-icon")!;
    expect(icon.nextElementSibling!.classList.contains("swt-filter-mark")).toBe(true);
    expect(icon.nextElementSibling!.nextElementSibling!.classList.contains("swt-sort")).toBe(true);
    // On the header's one line beside the name, which the CSS cuts with an ellipsis where it does not fit (the icons stay)
    const head = icon.parentElement!;
    expect(head.classList.contains("swt-head")).toBe(true);
    expect(head.firstElementChild!.classList.contains("swt-head-name")).toBe(true);
    expect(head.firstElementChild!.textContent!.trim()).toBe("Price #currency-usd");
    expect(icon.innerHTML).toBe(iconHtml("currency"));
    expect((icon as HTMLElement).title).toContain("Currency (#currency-usd)");
    expect(cell(0, 0).querySelector(".swt-type-icon")).toBeNull();
    expect(cellText(cell(0, 1))).toBe("Price");
    // The markdown is left as written
    expect(text).toBe(PAGE);
  });

  it("marks values that are not of the type, and leaves cells with markup and empty ones alone", async () => {
    await setup(PAGE);
    expect(cell(3, 1).textContent).toBe("lots");
    expect(cell(3, 1).classList.contains("swt-type-invalid")).toBe(true);
    expect(cell(3, 1).title).toBe('"lots" is not a number');
    expect(cell(3, 3).classList.contains("swt-type-invalid")).toBe(true);
    expect(cell(4, 1).querySelector("a")!.textContent).toBe("Shop");
    expect(cell(4, 2).textContent).toBe("");
    expect(cell(4, 2).classList.contains("swt-type-invalid")).toBe(false);
  });

  it("sorts by the values, not by what the cells show", async () => {
    await setup(PAGE);
    clickOn(cell(0, 2).querySelector(".swt-sort")!); // Rating ascending
    expect(bodyTexts()).toEqual(["Fig", "Plum", "Pear", "Kiwi"]);
    clickOn(cell(0, 3).querySelector(".swt-sort")!); // Done ascending: no before yes, the invalid one as text
    expect(bodyTexts().slice(0, 2)).toEqual(["Fig", "Pear"]);
  });

  it("edits and copies the value", async () => {
    await setup(PAGE);
    clickOn(cell(1, 2));
    expect(editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value).toBe("4");
    key(editor.querySelector(".swt-cell-editor")!, "Escape");
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
    await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
    clickOn(cell(1, 2));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    const picker = document.querySelector<HTMLElement>(".swt-choices")!;
    const options = () => Array.from(picker.querySelectorAll<HTMLElement>(".swt-choice"));
    // All the values, though the cell has one: to change it to another; its own marked
    expect(picker.classList.contains("swt-visible")).toBe(true);
    expect(options().map((o) => o.textContent)).toEqual(["0 ☆☆☆☆☆", "1 ★☆☆☆☆", "2 ★★☆☆☆", "3 ★★★☆☆", "4 ★★★★☆", "5 ★★★★★"]);
    expect(options()[4]!.classList.contains("swt-current")).toBe(true);
    // Typing narrows them to those containing what is typed
    field.value = "★★★★";
    field.dispatchEvent(new Event("input"));
    expect(options().map((o) => o.textContent)).toEqual(["4 ★★★★☆", "5 ★★★★★"]);
    field.value = "9";
    field.dispatchEvent(new Event("input"));
    expect(picker.classList.contains("swt-visible")).toBe(false);
    key(field, "Enter");
    await flush();
    expect(text).toContain("| Pear | 12.99 | 9 | yes |");
    expect(flashes).toEqual(['Silverware Table: "9" is not a whole number from 0 to 5 (#stars); saved as typed']);
    expect(picker.classList.contains("swt-visible")).toBe(false);
  });

  it("picks a value from the list with the mouse, or with the arrows and Enter", async () => {
    await setup(PAGE);
    const field = () => editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    const options = () => Array.from(document.querySelectorAll<HTMLElement>(".swt-choices .swt-choice"));
    clickOn(cell(1, 3)); // Done: yes
    // Saved as Enter saves: what hears Enter in the editor (the sheet view going on to the next cell) hears it
    const keys: string[] = [];
    field().addEventListener("keydown", (e) => keys.push(e.key));
    options().find((o) => o.textContent === "❌ no")!.click();
    expect(keys).toEqual(["Enter"]);
    await flush();
    expect(text).toContain("| Pear | 12.99 | 4 | no |");
    await controller.scan();

    clickOn(cell(2, 2)); // Rating: 1, where the arrows start
    expect(options()[1]!.classList.contains("swt-active")).toBe(true);
    key(field(), "ArrowDown");
    key(field(), "ArrowDown");
    expect(options()[3]!.classList.contains("swt-active")).toBe(true);
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
    expect(document.querySelector(".swt-choices")!.classList.contains("swt-visible")).toBe(false);
  });

  it("shows a formula's result in its column's type", async () => {
    await setup(
      `| Item | Price #currency-usd |\n|---|---|\n| Pear | 12.99 |\n| Fig | 3.5 |\n| Total | 16.49 <meta f='=SUM([price])'> |\n`,
    );
    expect(cell(3, 1).textContent).toBe(usd(16.49));
    expect(cell(3, 1).classList.contains("swt-formula")).toBe(true);
  });

  describe("custom types", () => {
    afterEach(() => clearCustomTypes());
    const TEMP = {
      name: "temp",
      description: "A temperature.",
      params: { scale: { kind: "choice", values: ["c", "f"], default: "c" } },
      check: (text: string) => (text === "hot" ? undefined : Number.isNaN(Number(text)) ? `"${text}" is not a number` : undefined),
      format: (text: string, { scale }: { scale: string }) => {
        if (text === "hot") throw new Error("no number");
        return `${text} °${scale.toUpperCase()}`;
      },
      choices: () => ["20", "100"],
    };

    it("shows cells as a custom type defined from Space Lua; one that fails marks the cell", async () => {
      // Space Lua defines them before the page's tables show
      expect(defineTypes([TEMP, { name: "bad-name" }])).toBe(
        'Silverware Table: custom column types not defined: type 2: its name "bad-name" is not letters, digits and _ starting with a letter. Search the space for defineTypes to find the space-lua block giving them.',
      );
      await setup("| Place | Temp #temp-f |\n|---|---|\n| Oven | 350 |\n| Sun | hot |\n| Moon | cold |\n");
      expect(cell(1, 1).textContent).toBe("350 °F");
      expect(cell(0, 1).querySelector(".swt-hidden-tag")!.textContent).toBe("#temp-f");
      expect(cell(0, 1).querySelector(".swt-type-icon")).not.toBeNull();
      // Its method threw: marked, with why
      expect(cell(2, 1).classList.contains("swt-type-invalid")).toBe(true);
      expect(cell(2, 1).title).toBe("#temp-f failed: no number");
      expect(cell(3, 1).title).toBe('"cold" is not a number');
      // Its hashtag hidden as the page renders, once the definitions are taken (tablesChanged)
      controller.tablesChanged();
      expect(document.querySelector('style[data-silverware-table="types"]')!.textContent).toContain('[data-tag-name^="temp-" i]');
      // Its values offered in the editor
      clickOn(cell(1, 1));
      await flush();
      expect(Array.from(document.querySelectorAll(".swt-choices .swt-choice")).map((c) => c.textContent)).toEqual(["20", "100"]);
    });

    it("is picked in the Type menu by its name where its syntax does not name it", async () => {
      defineTypes([{ ...TEMP, syntax: "temp, temp-f" }, { name: "scale", syntax: "#scale-f", params: { s: { kind: "choice", values: ["f"] } } }]);
      await setup("| Place | Temp |\n|---|---|\n| Oven | 350 |\n");
      const pick = async (label: string) => {
        cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
        window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
        const item = (text: string) => Array.from(document.querySelectorAll<HTMLElement>(".swt-menu-item")).find((b) => b.textContent?.startsWith(text))!;
        document.querySelector<HTMLElement>('.swt-menu .swt-segments[aria-label^="Type"] .swt-segment')!.click();
        item(label).click();
        await flush();
        await controller.scan();
      };
      await pick("Temp");
      expect(text).toBe("| Place | Temp #temp |\n|---|---|\n| Oven | 350 |\n");
      // A syntax that names the type: its first form
      await pick("Scale");
      expect(text).toBe("| Place | Temp #scale-f |\n|---|---|\n| Oven | 350 |\n");
    });
  });

  it("picks a column's type from its menu, as a hashtag in its header", async () => {
    await setup("| Item | Rating #todo |\n|---|---|\n| Pear | 4 |\n");
    const openColumnMenu = () => {
      cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };
    const item = (label: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(".swt-menu-item")).find((b) => b.textContent === label)!;
    const title = () => document.querySelector(".swt-menu-title")!.textContent;
    // As Filter: the type's name after Type, its icon opening the list, a × removing it (greyed out without a type)
    const typeRow = () => document.querySelector<HTMLElement>('.swt-menu .swt-segments[aria-label^="Type"]')!;
    const types = () => typeRow().querySelectorAll<HTMLElement>(".swt-segment")[0]!;
    const remove = () => typeRow().querySelectorAll<HTMLElement>(".swt-segment")[1]!;
    openColumnMenu();
    expect(typeRow().getAttribute("aria-label")).toBe("Type");
    expect(remove().getAttribute("aria-disabled")).toBe("true");
    // The types show in the same dropdown; Back shows the column's menu again
    types().click();
    expect(title()).toBe("Column type");
    // A type's detail shows in a bubble beside the menu while it is hovered
    item("Unit").dispatchEvent(new MouseEvent("mouseenter"));
    const bubble = document.querySelector<HTMLElement>(".swt-menu-detail")!;
    expect(bubble.hidden).toBe(false);
    expect(bubble.querySelector(".swt-menu-detail-title")!.textContent).toBe("Unit");
    expect(Array.from(bubble.querySelectorAll("code"), (c) => c.textContent)).toEqual(["#unit-kg"]);
    expect(bubble.querySelector("p")!.textContent).toBe("A number with a unit: the unit after the dash.");
    expect(bubble.querySelector(".swt-menu-detail-note")!.textContent).toBe("Also written as #kg, #km, #watt");
    expect(item("Unit").title).toBe("");
    item("Unit").dispatchEvent(new MouseEvent("mouseleave"));
    expect(bubble.hidden).toBe(true);
    // Each type with its icon
    expect(item("Stars").querySelector(".swt-icon")!.innerHTML).toBe(iconHtml("stars"));
    // The arrow before the title goes back
    document.querySelector<HTMLElement>(".swt-menu-title .swt-menu-back")!.click();
    expect(title()).toBe("Column: Rating #todo");
    types().click();
    item("Stars").click();
    await flush();
    await controller.scan();
    expect(text).toBe("| Item | Rating #todo #stars |\n|---|---|\n| Pear | 4 |\n");
    expect(document.querySelector(".swt-menu")).toBeNull();
    expect(cell(1, 1).textContent).toBe("★★★★☆");
    expect(cell(0, 1).querySelector(".swt-type-icon")!.innerHTML).toBe(iconHtml("stars"));

    openColumnMenu();
    // The type's name after Type, its icon on the button opening the list; the × removes it
    expect(typeRow().getAttribute("aria-label")).toBe("Type: Stars");
    expect(types().querySelector("svg")!.outerHTML).toBe(iconHtml("stars"));
    expect(remove().hasAttribute("aria-disabled")).toBe(false);
    remove().click();
    await flush();
    expect(text).toBe("| Item | Rating #todo |\n|---|---|\n| Pear | 4 |\n");
    expect(document.querySelector(".swt-menu")).toBeNull();
    // No type from the list too
    await controller.scan();
    openColumnMenu();
    types().click();
    item("Stars").click();
    await flush();
    await controller.scan();
    openColumnMenu();
    types().click();
    item("No type").click();
    await flush();
    expect(text).toBe("| Item | Rating #todo |\n|---|---|\n| Pear | 4 |\n");
  });

  it("edits a header as the column's name, keeping its type", async () => {
    await setup("| Item | Rating #stars-3 |\n|---|---|\n| Pear | 2 |\n");
    clickOn(cell(0, 1));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    expect(field.value).toBe("Rating");
    field.value = "Score";
    key(field, "Enter");
    await flush();
    expect(text).toBe("| Item | Score #stars-3 |\n|---|---|\n| Pear | 2 |\n");
    // An emptied name keeps the old one, type and all
    await controller.scan();
    clickOn(cell(0, 1));
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = " ";
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    expect(text).toBe("| Item | Score #stars-3 |\n|---|---|\n| Pear | 2 |\n");
  });

  it("makes links of web addresses", async () => {
    await setup("| Site #link |\n|---|\n| https://silverbullet.md/ |\n");
    const link = cell(1, 0).querySelector("a")!;
    expect([link.textContent, link.getAttribute("href"), link.target]).toEqual(["silverbullet.md", "https://silverbullet.md/", "_blank"]);
  });
});
