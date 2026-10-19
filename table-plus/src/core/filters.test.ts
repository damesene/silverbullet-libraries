// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PAGE, bodyTexts, cell, clickOn, editor, flush, key, setup, useTablePage } from "../testing/page.ts";

describe("Filters", () => {
  useTablePage();

  const STATUS = "| Task | Status |\n|---|---|\n| Docs | done |\n| Sort | open |\n| Filters | open |\n| Release | blocked |\n";
  const bubble = () => document.querySelector<HTMLElement>(".tp-filter-bubble.tp-visible");
  const popoverField = () => document.querySelector<HTMLInputElement>(".tp-filter-popover input.tp-filter");
  const typeInto = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };
  const openColumnFilter = (column: number) => {
    cell(1, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document.querySelector(".tp-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === "Filter")!.click();
  };
  const chip = () => {
    cell(0, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    return document.querySelector<HTMLElement>(".tp-bar .tp-filter-chip");
  };

  it("filters one column in a bubble under its header, the table not moving; its header mark opens it again", async () => {
    await setup(PAGE);
    openColumnFilter(1);
    expect(editor.querySelector(".tp-filter-row")).toBeNull();
    expect(document.activeElement).toBe(popoverField());
    typeInto(popoverField()!, ">2");
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(cell(0, 1).classList.contains("tp-filtered")).toBe(true);
    expect(chip()!.textContent).toBe("2 of 3 rows");
    // Leaving it closes it; the filter stays, its mark in the header opens it
    key(popoverField()!, "Escape");
    expect(bubble()).toBeNull();
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    clickOn(cell(0, 1).querySelector(".tp-filter-mark")!);
    expect(popoverField()!.value).toBe(">2");
    // The chip's cross clears the filters
    chip()!.querySelector<HTMLElement>(".tp-chip-clear")!.click();
    await flush();
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    expect(cell(0, 1).classList.contains("tp-filtered")).toBe(false);
    expect(chip()).toBeNull();
  });

  it("offers a column's few values to tick, as =a|b", async () => {
    await setup(STATUS);
    openColumnFilter(1);
    const values = () => Array.from(document.querySelectorAll<HTMLElement>(".tp-filter-value"));
    expect(values().map((v) => v.textContent)).toEqual(["done1", "open2", "blocked1"]);
    const tick = (label: string) => {
      const box = values().find((v) => v.textContent!.startsWith(label))!.querySelector("input")!;
      box.checked = !box.checked;
      box.dispatchEvent(new Event("change"));
    };
    tick("open");
    expect(popoverField()!.value).toBe("=open");
    expect(bodyTexts()).toEqual(["Sort", "Filters"]);
    tick("blocked");
    expect(popoverField()!.value).toBe("=open|blocked");
    expect(bodyTexts()).toEqual(["Sort", "Filters", "Release"]);
    // Ticked as the field says
    expect(values().map((v) => v.querySelector("input")!.checked)).toEqual([false, true, true]);
    tick("open");
    tick("blocked");
    expect(popoverField()!.value).toBe("");
    expect(bodyTexts()).toEqual(["Docs", "Sort", "Filters", "Release"]);
  });

  it("shows what a field understands, a click putting it in the field", async () => {
    await setup(PAGE);
    openColumnFilter(1);
    // A column of numbers: comparing first
    const hints = () => Array.from(document.querySelectorAll<HTMLElement>(".tp-filter-hint"));
    expect(hints()[0]!.textContent).toBe(">10 above");
    typeInto(popoverField()!, "5");
    hints()[0]!.click();
    expect(popoverField()!.value).toBe(">5");
    expect(bodyTexts()).toEqual(["apple"]);
  });

  it("hides the filter row without clearing the filters; a field's cross clears it", async () => {
    await setup(PAGE);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const toggle = () => document.querySelector<HTMLElement>('.tp-bar button[aria-label="Filter"]')!;
    toggle().click();
    const field = editor.querySelector<HTMLInputElement>('.tp-filter[data-tp-column="0"]')!;
    field.focus();
    typeInto(field, "a");
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(field.closest("td")!.classList.contains("tp-filter-active")).toBe(true);
    field.blur();
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    toggle().click();
    expect(editor.querySelector(".tp-filter-row")).toBeNull();
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(cell(0, 0).classList.contains("tp-filtered")).toBe(true);
    // Shown again with the filter in it
    toggle().click();
    const again = editor.querySelector<HTMLInputElement>('.tp-filter[data-tp-column="0"]')!;
    expect(again.value).toBe("a");
    again.closest("td")!.querySelector<HTMLElement>(".tp-filter-clear")!.click();
    expect(again.value).toBe("");
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
  });
});
