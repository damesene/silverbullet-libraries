// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cell, clickOn, controller, editor, flashes, flush, key, setup, text, useTablePage } from "../testing/page.ts";

describe("Long text in cells and the cell's popup", () => {
  useTablePage();

  const PAGE = "| Name | Notes |\n|---|---|\n| Pear | A long note about pears |\n| Fig | short |\n";
  const popup = () => document.querySelector<HTMLElement>(".swt-cell-popup");
  const popupField = () => popup()?.querySelector<HTMLTextAreaElement>("textarea.swt-cell-editor");
  const inlineField = () => editor.querySelector<HTMLInputElement>("input.swt-cell-editor");
  const expand = () => document.querySelector<HTMLElement>(".swt-expand")!;

  it("puts each body cell's content in a box the settings limit (wrap by default, 500px wide, 200px high)", async () => {
    await setup(PAGE);
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    expect(widget.classList.contains("swt-cells-wrap")).toBe(true);
    expect(widget.classList.contains("swt-long-text")).toBe(true);
    expect(widget.style.getPropertyValue("--swt-cell-max-width")).toBe("500px");
    expect(widget.style.getPropertyValue("--swt-cell-max-height")).toBe("200px");
    const box = cell(1, 1).querySelector(":scope > .swt-cell-content")!;
    expect(box.textContent).toBe("A long note about pears");
    // The header is not boxed; the text a cell shows is still its text
    expect(cell(0, 1).querySelector(".swt-cell-content")).toBeNull();
    expect(cell(1, 1).textContent).toBe("A long note about pears");
  });

  it("cuts with an ellipsis, without limits, as set", async () => {
    await setup(PAGE, { "silverware.table.modules.longText.overflow": "ellipsis", "silverware.table.modules.longText.maxWidth": 0, "silverware.table.modules.longText.maxHeight": 0 });
    await controller.scan();
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    expect(widget.classList.contains("swt-cells-ellipsis")).toBe(true);
    expect(widget.classList.contains("swt-cells-wrap")).toBe(false);
    expect(widget.style.getPropertyValue("--swt-cell-max-width")).toBe("none");
    expect(widget.style.getPropertyValue("--swt-cell-max-height")).toBe("none");
  });

  it("leaves cells as SilverBullet shows them with the longText module off: no limits, nothing marked cut (the content box stays, for widths)", async () => {
    await setup(PAGE, { "silverware.table.modules.longText.enabled": false });
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    expect(widget.classList.contains("swt-cells-wrap")).toBe(false);
    expect(widget.classList.contains("swt-cells-ellipsis")).toBe(false);
    // None of the module's CSS applies (it is for tables marked so)
    expect(widget.classList.contains("swt-long-text")).toBe(false);
    expect(widget.style.getPropertyValue("--swt-cell-max-width")).toBe("");
    const box = cell(1, 1).querySelector<HTMLElement>(".swt-cell-content")!;
    expect(box).not.toBeNull();
    Object.defineProperty(box, "scrollHeight", { configurable: true, value: 400 });
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(cell(1, 1).classList.contains("swt-cut")).toBe(false);
  });

  it("marks a cell cut when its text is taller (wider) than its box, once laid out and when the window resizes", async () => {
    await setup(PAGE);
    const box = cell(1, 1).querySelector<HTMLElement>(".swt-cell-content")!;
    const size = (scroll: number, client: number) => {
      Object.defineProperty(box, "scrollHeight", { configurable: true, value: scroll });
      Object.defineProperty(box, "clientHeight", { configurable: true, value: client });
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    size(400, 200);
    window.dispatchEvent(new Event("resize"));
    await frame();
    expect(cell(1, 1).classList.contains("swt-cut")).toBe(true);
    expect(cell(2, 1).classList.contains("swt-cut")).toBe(false);
    size(150, 150);
    window.dispatchEvent(new Event("resize"));
    await frame();
    expect(cell(1, 1).classList.contains("swt-cut")).toBe(false);
  });

  it("keeps the box when the cell is edited and comes back", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1));
    expect(inlineField()).not.toBeNull();
    key(inlineField()!, "Escape");
    await flush();
    expect(cell(1, 1).querySelectorAll(".swt-cell-content").length).toBe(1);
  });

  it("shows the expand button on a cut cell and opens its popup there: the whole text, saved with Enter", async () => {
    await setup(PAGE);
    // jsdom has no layout: cut as the overflow check would find it
    cell(1, 1).classList.add("swt-cut");
    cell(2, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(expand().classList.contains("swt-visible")).toBe(false);
    cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(expand().classList.contains("swt-visible")).toBe(true);
    expand().click();
    // The cell stays as it is, the field is in the popup
    expect(popupField()!.value).toBe("A long note about pears");
    expect(document.activeElement).toBe(popupField());
    expect(cell(1, 1).classList.contains("swt-editing")).toBe(true);
    expect(cell(1, 1).textContent).toBe("A long note about pears");
    expect(controller.isFloating(popupField()!)).toBe(true);
    popupField()!.value = "A longer note about pears, wrapped";
    key(popupField()!, "Enter");
    await flush();
    expect(text).toContain("| Pear | A longer note about pears, wrapped |");
    expect(popup()).toBeNull();
  });

  it("puts the expand button in the part of the cell in view: the table scrolled sideways, the cell partly under the held header", async () => {
    await setup(PAGE);
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    // The table's box shows x 100..400 of the page; the Notes cell spans x 300..700 (its right part scrolled away), y 120..220
    const set = (el: Element, rect: DOMRect) => Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: () => rect });
    set(widget, new DOMRect(100, 50, 300, 400));
    set(widget.querySelector("table")!, new DOMRect(100, 50, 600, 400));
    set(cell(1, 1), new DOMRect(300, 120, 400, 100));
    set(document.querySelector("thead")!, new DOMRect(100, 50, 600, 40));
    Object.defineProperty(expand(), "offsetWidth", { configurable: true, value: 18 });
    Object.defineProperty(expand(), "offsetHeight", { configurable: true, value: 18 });
    // Its text wider than its box, as the longText module measures it (its checks after a scroll keep it cut)
    Object.defineProperty(cell(1, 1).querySelector(".swt-cell-content")!, "scrollWidth", { configurable: true, value: 800 });
    cell(1, 1).classList.add("swt-cut");
    cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(expand().classList.contains("swt-visible")).toBe(true);
    // At the box's right edge (400), not the cell's (700)
    expect(parseFloat(expand().style.left)).toBe(400 - 18 - 2);
    expect(parseFloat(expand().style.top)).toBe(122);
    // The page scrolls, the header held over the cell's top: below it
    const scrolled = async () => {
      window.dispatchEvent(new Event("scroll"));
      for (let i = 0; i < 2; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    set(document.querySelector("thead")!, new DOMRect(100, 50, 600, 110));
    await scrolled();
    expect(parseFloat(expand().style.top)).toBe(162);
    // Almost all of it under the header: none until it shows again
    set(document.querySelector("thead")!, new DOMRect(100, 50, 600, 160));
    await scrolled();
    expect(expand().classList.contains("swt-visible")).toBe(false);
    set(document.querySelector("thead")!, new DOMRect(100, 50, 600, 40));
    await scrolled();
    expect(expand().classList.contains("swt-visible")).toBe(true);
  });

  it("cuts the popup as its cell is cut: under the held header, gone when the cell is out of view", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1));
    key(inlineField()!, "F2");
    const panel = popup()!;
    const set = (el: Element, rect: DOMRect) => Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: () => rect });
    set(editor.querySelector(".sb-table-widget")!, new DOMRect(100, 50, 600, 400));
    set(editor.querySelector("table")!, new DOMRect(100, 50, 600, 400));
    set(cell(1, 1), new DOMRect(100, 120, 200, 30));
    const scrolled = async (headerBottom: number) => {
      set(document.querySelector("thead")!, new DOMRect(100, 50, 600, headerBottom - 50));
      window.dispatchEvent(new Event("scroll"));
      for (let i = 0; i < 2; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    // The header held over the cell's top 20 px
    await scrolled(140);
    expect(panel.style.top).toBe("120px");
    expect(panel.style.clipPath).toBe("inset(20px 0 0 0px)");
    // The cell all under it: nothing of the popup shows, the field still edited
    await scrolled(200);
    expect(panel.style.clipPath).toBe("inset(50%)");
    expect(document.activeElement).toBe(popupField());
    // In view again: whole
    await scrolled(90);
    expect(panel.style.clipPath).toBe("");
  });

  it("leaves Ctrl+arrows and Ctrl+Alt+arrows in the popup to the text; in the cell they still move", async () => {
    await setup(PAGE, { "silverware.table.editor.enterKey": "save", "silverware.table.editor.ctrlEnterAddsRow": true });
    clickOn(cell(1, 1));
    key(inlineField()!, "F2");
    const field = popupField()!;
    // Not taken (the browser moves the text cursor by words, to the start…): the popup stays on its cell
    for (const [k, init] of [
      ["ArrowRight", { ctrlKey: true }],
      ["ArrowDown", { ctrlKey: true, shiftKey: true }],
      ["Home", { ctrlKey: true }],
      ["ArrowDown", { ctrlKey: true, altKey: true }],
      ["ArrowRight", { ctrlKey: true, altKey: true }],
    ] as const) {
      expect(key(field, k, init)).toBe(true);
    }
    await flush();
    expect(popupField()).toBe(field);
    expect(text).toBe(PAGE);
    // Ctrl+Enter saves as Enter does, no row added
    field.value = "Edited";
    key(field, "Enter", { ctrlKey: true });
    await flush();
    expect(popup()).toBeNull();
    expect(text).toBe("| Name | Notes |\n|---|---|\n| Pear | Edited |\n| Fig | short |\n");
    // In the cell itself, Ctrl+arrows still move the editor
    await controller.scan();
    clickOn(cell(1, 1));
    expect(key(inlineField()!, "ArrowDown", { ctrlKey: true })).toBe(false);
    await flush();
    expect(inlineField()!.value).toBe("short");
  });

  it("goes on in the popup with F2, what is typed kept; Esc closes it unsaved", async () => {
    await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
    clickOn(cell(1, 1));
    inlineField()!.value = "Typed so far";
    inlineField()!.setSelectionRange(5, 5);
    key(inlineField()!, "F2");
    expect(inlineField()).toBeNull();
    expect(popupField()!.value).toBe("Typed so far");
    expect(popupField()!.selectionStart).toBe(5);
    // Nothing written meanwhile
    expect(text).toBe(PAGE);
    key(popupField()!, "Escape");
    await flush();
    expect(popup()).toBeNull();
    expect(text).toBe(PAGE);
    // F2 again, then Enter: saved
    clickOn(cell(2, 1));
    inlineField()!.value = "longer";
    key(inlineField()!, "F2");
    key(popupField()!, "Enter");
    await flush();
    expect(text).toContain("| Fig | longer |");
  });

  it("announces nothing going on in the popup: nothing is saved then (a formula without the metadata setting)", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1));
    inlineField()!.value = "=1+1";
    key(inlineField()!, "F2");
    expect(popupField()!.value).toBe("=1+1");
    expect(flashes).toEqual([]);
    key(popupField()!, "Escape");
    await flush();
    expect(text).toBe(PAGE);
  });

  it("closes the popup when Silverware Table stops", async () => {
    await setup(PAGE);
    controller.editCell(controller.infoOf(editor.querySelector(".sb-table-widget")!)!, { row: 1, column: 1 }, undefined, true);
    expect(popup()).not.toBeNull();
    controller.stop();
    expect(popup()).toBeNull();
  });
});
