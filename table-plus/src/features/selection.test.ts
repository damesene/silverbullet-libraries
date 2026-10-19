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
    expect(text).toContain('| <meta n="pear"> | |');
    expect(text).toContain('<meta f="=1+1"> |');
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

  it("leaves a click on a cell to the cell editor", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1));
    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(editor.querySelector(".tp-cell-editor")).not.toBeNull();
    expect(editor.querySelectorAll(".tp-selected").length).toBe(0);
  });
});
