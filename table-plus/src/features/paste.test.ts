// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cell, clickOn, editor, flashes, flush, key, setup, text, useTablePage } from "../testing/page.ts";

describe("Pasting from a spreadsheet", () => {
  useTablePage();

  const TOTAL = "| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | |\n";
  const field = () => editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;

  const pasteText = (text: string, shift = false) => {
    key(field(), "v", { ctrlKey: true, shiftKey: shift });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
    field().dispatchEvent(event);
    return event;
  };

  it("pastes cells over the table from the edited cell, as one edit", async () => {
    await setup(TOTAL);
    clickOn(cell(1, 0));
    const event = pasteText("Fig\t2\nPlum\t5\n");
    expect(event.defaultPrevented).toBe(true);
    await flush();
    expect(text).toBe('| Name | Qty |\n|---|---|\n| Fig | 2 |\n| Plum | 5 |\n| Total | |\n');
    expect(flashes).toEqual(["Table Plus: pasted 2 × 2 cells"]);
  });

  it("pastes as new rows with Ctrl+Shift+V", async () => {
    await setup(TOTAL);
    clickOn(cell(2, 0));
    pasteText("Fig\t2\nPlum\t5", true);
    await flush();
    expect(text).toBe('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 |\n| Plum | 5 |\n| Apple | 10 |\n| Total | |\n');
    expect(flashes).toEqual(["Table Plus: pasted 2 new rows"]);
  });

  it("leaves a single value to the field, and refuses a sorted table", async () => {
    await setup(TOTAL);
    clickOn(cell(1, 0));
    expect(pasteText("just text").defaultPrevented).toBe(false);
    key(field(), "Escape");
    await flush();
    clickOn(cell(0, 1).querySelector(".tp-sort")!);
    clickOn(cell(1, 0));
    pasteText("a\tb");
    await flush();
    expect(text).toBe(TOTAL);
    expect(flashes).toEqual(["Table Plus: clear sorting and filters to paste cells: the rows shown are not where they would go"]);
  });
});
