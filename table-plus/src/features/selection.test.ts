// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PAGE, cell, clickOn, controller, editor, flashes, flush, key, press, setup, text, useTablePage } from "../testing/page.ts";

describe("Selecting cells", () => {
  useTablePage();

  const copy = () => {
    const data: Record<string, string> = {};
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { setData: (type: string, value: string) => (data[type] = value) } });
    document.dispatchEvent(event);
    return { event, data };
  };
  const drag = (from: Element, to: Element) => {
    press(from, "mousedown");
    to.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));
    window.dispatchEvent(new MouseEvent("mouseup"));
  };

  it("selects the cells dragged across and copies them for a spreadsheet", async () => {
    await setup('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| a "b" | 10 <meta f="=5*2"> |\n| Fig | 2 |\n');
    drag(cell(0, 0), cell(2, 1));
    await flush();
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    expect(editor.querySelectorAll(".tp-selected").length).toBe(6);
    const { event, data } = copy();
    expect(event.defaultPrevented).toBe(true);
    expect(data["text/plain"]).toBe('Name\tQty\nPear\t3\n"a ""b"""\t10');
    expect(data["text/html"]).toBe(
      "<table><tr><td>Name</td><td>Qty</td></tr><tr><td>Pear</td><td>3</td></tr><tr><td>a &quot;b&quot;</td><td>10</td></tr></table>",
    );
    expect(flashes).toEqual(["Table Plus: copied 3 × 2 cells"]);
    expect(text).toContain("| Pear | 3 |");
  });

  it("selects rows as shown when sorted, and ends with Esc or a click", async () => {
    await setup(PAGE);
    clickOn(cell(0, 1).querySelector(".tp-sort")!); // Qty ascending: Fig 2, Pear 3, apple 10
    drag(cell(1, 0), cell(2, 1));
    expect(copy().data["text/plain"]).toBe("Fig\t2\nPear\t3");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(editor.querySelectorAll(".tp-selected").length).toBe(0);
    expect(copy().event.defaultPrevented).toBe(false);
    drag(cell(1, 0), cell(1, 1));
    expect(editor.querySelectorAll(".tp-selected").length).toBe(2);
    press(cell(3, 0), "mousedown");
    expect(editor.querySelectorAll(".tp-selected").length).toBe(0);
  });

  it("keeps the hidden tags the formulas module would take when it is off", async () => {
    const TAGGED = '| Name | Qty |\n|---|---|\n| Pear <meta n="pear"> | 3 |\n| Fig | 2 <meta f="=1+1"> |\n';
    await setup(TAGGED, { "tablePlus.modules.formulas.enabled": false });
    drag(cell(1, 0), cell(2, 1));
    key(editor, "Delete");
    await flush();
    // Nothing recalculated: the cell empty, its formula kept for when formulas are on
    expect(text).toBe('| Name | Qty |\n|---|---|\n| <meta n="pear"> | |\n| | <meta f="=1+1"> |\n');
  });

  it("empties the selected cells with Delete, formulas included, keeping the header", async () => {
    await setup('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 <meta f="=1+1"> |\n| Plum | 5 |\n');
    drag(cell(0, 1), cell(2, 1));
    key(editor, "Delete");
    await flush();
    await controller.scan();
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | |\n| Fig | |\n| Plum | 5 |\n");
    // The selection stays, shown on the table rendered again
    expect(editor.querySelectorAll(".tp-selected").length).toBe(3);
    // In a field, Delete deletes text as usual
    clickOn(cell(3, 0));
    key(editor.querySelector(".tp-cell-editor")!, "Delete");
    await flush();
    expect(text).toContain("| Plum | 5 |");
  });

  it("moves a selected cell with Home, End, PageUp and PageDown, and extends to there with Shift", async () => {
    const rows = Array.from({ length: 13 }, (_, i) => `| r${i + 1} | ${i + 1} | x |`).join("\n");
    await setup(`| A | B | C |\n|---|---|---|\n${rows}\n`);
    const marked = () => Array.from(editor.querySelectorAll(".tp-selected"));
    // A cell left selected by Esc in its editor
    clickOn(cell(2, 1));
    key(editor.querySelector(".tp-cell-editor")!, "Escape");
    await flush();
    expect(marked()).toEqual([cell(2, 1)]);
    key(editor, "End");
    expect(marked()).toEqual([cell(2, 2)]);
    key(editor, "Home", { shiftKey: true });
    expect(marked()).toEqual([cell(2, 0), cell(2, 1), cell(2, 2)]);
    key(editor, "PageDown");
    expect(marked()).toEqual([cell(12, 0)]);
    key(editor, "PageDown"); // stops at the last row
    expect(marked()).toEqual([cell(13, 0)]);
    key(editor, "PageUp", { shiftKey: true });
    expect(marked().length).toBe(11);
    key(editor, "PageUp");
    expect(marked()).toEqual([cell(1, 0)]); // the first body row, not the header
    key(editor, "End", { ctrlKey: true });
    expect(marked()).toEqual([cell(13, 2)]);
    key(editor, "Home", { ctrlKey: true, shiftKey: true });
    expect(marked().length).toBe(14 * 3);
    // Arrows (with Ctrl too) move the cell, with Shift extend
    key(editor, "ArrowDown");
    expect(marked()).toEqual([cell(1, 0)]);
    key(editor, "ArrowDown", { ctrlKey: true });
    expect(marked()).toEqual([cell(2, 0)]);
    key(editor, "ArrowRight");
    expect(marked()).toEqual([cell(2, 1)]);
    key(editor, "ArrowDown", { ctrlKey: true, shiftKey: true });
    expect(marked()).toEqual([cell(2, 1), cell(3, 1)]);
  });

  describe("select mode (Edit mode off, the default)", () => {
    const field = () => editor.querySelector<HTMLInputElement>(".tp-cell-editor");
    const marked = () => Array.from(editor.querySelectorAll(".tp-selected"));

    it("selects a cell with a click and edits it with a second click", async () => {
      localStorage.removeItem("tablePlus.editMode");
      await setup(PAGE);
      clickOn(cell(1, 1));
      expect(field()).toBeNull();
      expect(marked()).toEqual([cell(1, 1)]);
      // Another cell: selected instead
      clickOn(cell(2, 1));
      expect(marked()).toEqual([cell(2, 1)]);
      // Pressed and dragged on: the cells between
      press(cell(2, 0), "mousedown");
      cell(3, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 1 }));
      press(cell(3, 1), "mouseup");
      expect(marked().length).toBe(4);
      // The cell selected alone, clicked again (a double click does that too): edited
      clickOn(cell(2, 1));
      clickOn(cell(2, 1));
      expect(field()!.value).toBe("10");
      expect(marked()).toEqual([]);
    });

    it("edits the cell selected when typing, its text replaced; Enter and F2 edit it as it is", async () => {
      localStorage.removeItem("tablePlus.editMode");
      await setup(PAGE);
      clickOn(cell(1, 1));
      // The key goes on into the field (the browser types it there)
      const typed = new KeyboardEvent("keydown", { key: "7", bubbles: true, cancelable: true });
      editor.dispatchEvent(typed);
      expect(typed.defaultPrevented).toBe(false);
      expect(field()!.value).toBe("");
      field()!.value = "7";
      key(field()!, "Enter");
      await flush();
      expect(text).toBe(PAGE.replace("| Pear | 3 |", "| Pear | 7 |"));
      await controller.scan();
      key(field()!, "Escape"); // Enter moved on to the cell below: dropped, it stays selected
      await flush();
      expect(marked()).toEqual([cell(2, 1)]);
      key(editor, "F2");
      expect(field()!.value).toBe("10");
      key(field()!, "Escape");
      await flush();
      key(editor, "Backspace");
      expect(field()!.value).toBe("");
      key(field()!, "Escape");
      await flush();
      expect(text).toBe(PAGE.replace("| Pear | 3 |", "| Pear | 7 |"));
    });

    it("switches to edit mode with the toolbar's Edit mode button, kept in this browser", async () => {
      localStorage.removeItem("tablePlus.editMode");
      await setup(PAGE);
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      const toggle = () => document.querySelector<HTMLElement>('.tp-bar button[aria-label="Edit mode"]')!;
      expect(toggle().getAttribute("aria-pressed")).toBe("false");
      toggle().click();
      expect(toggle().getAttribute("aria-pressed")).toBe("true");
      expect(localStorage.getItem("tablePlus.editMode")).toBe("on");
      clickOn(cell(1, 1));
      expect(field()!.value).toBe("3");
    });
  });

  it("leaves a click on a cell to the cell editor", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1));
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(editor.querySelector(".tp-cell-editor")).not.toBeNull();
    expect(editor.querySelectorAll(".tp-selected").length).toBe(0);
  });
});
