// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cell, clickOn, controller, editor, flush, key, PAGE, setup, text, useTablePage } from "../../../testing/page.ts";

describe("Full screen", () => {
  useTablePage();

  const widget = () => editor.querySelector<HTMLElement>(".sb-table-widget")!;
  // In the table's ⋯ menu, before its title (the toolbar shows it only with the toolbarNames setting)
  const icon = (label: string) => {
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    if (!document.querySelector(".swt-menu .swt-menu-names")) document.querySelector<HTMLElement>(".swt-bar .swt-bar-more")!.click();
    return document.querySelector<HTMLButtonElement>(`.swt-menu button[aria-label="${label}"]`);
  };

  it("shows the table over the whole window from its toolbar icon, the same icon closes it", async () => {
    await setup(PAGE);
    icon("Full screen")!.click();
    expect(widget().classList.contains("swt-fullscreen")).toBe(true);
    const exit = icon("Exit full screen")!;
    expect(exit.getAttribute("aria-pressed")).toBe("true");
    exit.click();
    expect(widget().classList.contains("swt-fullscreen")).toBe(false);
    expect(icon("Full screen")).not.toBeNull();
  });

  it("stays over the window while the table is edited (rendered anew), and Esc closes it, but not a cell editor's", async () => {
    await setup(PAGE);
    icon("Full screen")!.click();
    clickOn(cell(1, 1));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    // Esc in the cell editor ends the edit only
    key(field, "Escape");
    expect(widget().classList.contains("swt-fullscreen")).toBe(true);
    clickOn(cell(1, 1));
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "7";
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    for (let i = 0; i < 4; i++) await flush();
    await controller.scan();
    expect(text).toContain("| Pear | 7 |");
    expect(widget().classList.contains("swt-fullscreen")).toBe(true);
    key(editor.querySelector(".swt-cell-editor")!, "Escape");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(widget().classList.contains("swt-fullscreen")).toBe(false);
  });
});
