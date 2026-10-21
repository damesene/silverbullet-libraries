// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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

  it("ends the selection when a + adds a row and edits its cell", async () => {
    // Select mode: a click selects
    localStorage.removeItem("tablePlus.editMode");
    await setup(PAGE);
    cell(3, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    clickOn(cell(3, 0));
    expect(cell(3, 0).classList.contains("tp-selected")).toBe(true);
    // The quiet + under the last row (a floating control: the press leaves the selection)
    press(document.querySelector('.tp-insert.tp-quiet[aria-label="Add a row"]')!, "mousedown");
    for (let i = 0; i < 5 && !editor.querySelector(".tp-cell-editor"); i++) {
      await flush();
      await controller.scan();
    }
    expect(text).toBe(`${PAGE}| | |\n`);
    expect(editor.querySelector(".tp-cell-editor")!.closest("tr")!.dataset.tpRow).toBe("4");
    expect(editor.querySelectorAll(".tp-selected").length).toBe(0);
  });

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

  it("moves the rows or columns of the selection with Ctrl+Alt+arrows, the selection with them", async () => {
    await setup("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |\n");
    const marked = () => Array.from(editor.querySelectorAll(".tp-selected"), (c) => c.textContent);
    const moved = async (k: string) => {
      key(editor, k, { ctrlKey: true, altKey: true });
      await flush();
      await controller.scan();
    };
    // One cell selected (not edited): its row moves
    clickOn(cell(1, 0));
    key(editor.querySelector(".tp-cell-editor")!, "Escape");
    await flush();
    await moved("ArrowDown");
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| 4 | 5 | 6 |\n| 1 | 2 | 3 |\n| 7 | 8 | 9 |\n");
    expect(marked()).toEqual(["1"]);
    // Two rows: they move together, and stop at the table's end
    key(editor, "ArrowDown", { shiftKey: true });
    expect(marked()).toEqual(["1", "7"]);
    await moved("ArrowUp");
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 7 | 8 | 9 |\n| 4 | 5 | 6 |\n");
    expect(marked()).toEqual(["1", "7"]);
    await moved("ArrowUp");
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 7 | 8 | 9 |\n| 4 | 5 | 6 |\n");
    // Two columns: right, then back to the start with Home
    key(editor, "ArrowRight", { shiftKey: true });
    expect(marked()).toEqual(["1", "2", "7", "8"]);
    await moved("ArrowRight");
    expect(text).toBe("| C | A | B |\n|---|---|---|\n| 3 | 1 | 2 |\n| 9 | 7 | 8 |\n| 6 | 4 | 5 |\n");
    expect(marked()).toEqual(["1", "2", "7", "8"]);
    await moved("Home");
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 7 | 8 | 9 |\n| 4 | 5 | 6 |\n");
    // A selection with the header: its columns move, its rows do not
    key(editor, "ArrowUp", { shiftKey: true });
    await moved("ArrowUp");
    expect(text).toBe("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n| 7 | 8 | 9 |\n| 4 | 5 | 6 |\n");
    await moved("End");
    expect(text).toBe("| C | A | B |\n|---|---|---|\n| 3 | 1 | 2 |\n| 9 | 7 | 8 |\n| 6 | 4 | 5 |\n");
  });

  it("does not move the selection's rows while the table is sorted", async () => {
    await setup("| A | B |\n|---|---|\n| 2 | x |\n| 1 | y |\n");
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    clickOn(cell(1, 0));
    key(editor.querySelector(".tp-cell-editor")!, "Escape");
    await flush();
    key(editor, "ArrowDown", { ctrlKey: true, altKey: true });
    await flush();
    expect(text).toBe("| A | B |\n|---|---|\n| 2 | x |\n| 1 | y |\n");
    expect(flashes.at(-1)).toContain("sorting");
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

  it("on a touch screen selects more with the handles at the selection's corners, whole rows staying whole, and opens the menu of several cells on a tap", async () => {
    localStorage.removeItem("tablePlus.editMode");
    await setup(PAGE);
    const touch = (target: EventTarget, type: string) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType: "touch" }));
    const tap = (target: Element) => {
      touch(target, "pointerdown");
      touch(window, "pointerup");
      clickOn(target);
    };
    const under = (target: Element) => Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
    const start = () => document.querySelector<HTMLElement>(".tp-select-start")!;
    const end = () => document.querySelector<HTMLElement>(".tp-select-end")!;
    const dragEnd = (to: Element) => {
      under(to);
      touch(end(), "pointerdown");
      touch(window, "pointermove");
      touch(window, "pointerup");
    };
    try {
      tap(cell(1, 0));
      expect(document.documentElement.dataset.tpPointer).toBe("touch");
      expect([start().parentElement, end().parentElement]).toEqual([cell(1, 0), cell(1, 0)]);
      // Dragged to Qty of apple: two rows, two columns
      dragEnd(cell(2, 1));
      expect(editor.querySelectorAll(".tp-selected").length).toBe(4);
      expect(end().parentElement).toBe(cell(2, 1));
      // In the last column (inside its cell there), not the last row
      expect([end().classList.contains("tp-select-edge-column"), end().classList.contains("tp-select-edge-row")]).toEqual([true, false]);
      // A tap in the selection: its menu (whole rows: the rows'), the cells staying selected
      tap(cell(1, 1));
      expect(document.querySelector(".tp-menu .tp-menu-title")!.textContent).toBe("Row 1");
      expect(editor.querySelectorAll(".tp-selected").length).toBe(4);
      key(document.querySelector(".tp-menu")!, "Escape");
      // A whole row dragged down: whole rows
      controller.selectCells(controller.infoOf(editor.querySelector(".sb-table-widget")!)!, { row: 1, column: 0 }, { row: 1, column: 1 });
      dragEnd(cell(3, 0));
      expect(editor.querySelectorAll(".tp-selected").length).toBe(6);
      // A tap on a cell selected alone still edits it
      key(document.body, "Escape");
      tap(cell(3, 0));
      tap(cell(3, 0));
      expect(editor.querySelector(".tp-cell-editor")).not.toBeNull();
      expect(start()).toBeNull();
    } finally {
      delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("on a tap in a row its grip selected, shows the cell menu alone, and its click runs no item under the finger", async () => {
    localStorage.removeItem("tablePlus.editMode");
    await setup(PAGE);
    // The tap and its mouse events at once, as a phone fires them (a slow run would leave the second its swallowing lasts)
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const touch = (target: EventTarget, type: string) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType: "touch" }));
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    // Select mode: a first click on the grip selects the row, a second opens its menu
    for (let i = 0; i < 2; i++) {
      grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    }
    expect(document.querySelector(".tp-menu-title")!.textContent).toBe("Row 1");
    touch(cell(1, 1), "pointerdown");
    touch(window, "pointerup");
    // The row selected whole: the row's menu, by the cell, alone
    expect(Array.from(document.querySelectorAll(".tp-menu-title")).map((t) => t.textContent)).toEqual(["Row 1"]);
    // The tap's mouse events after it, the click on an item that opened under the finger
    clickOn(cell(1, 1));
    const item = Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === "Delete row")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
    item.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    // Checked now: later jsdom, which lays nothing out, takes the table for scrolled out of view (its menu closes)
    expect(document.querySelector(".tp-menu")).not.toBeNull();
    await flush();
    expect(text).toBe(PAGE);
    vi.restoreAllMocks();
  });

  it("marks select mode on the page and the cell selected alone, for the pointer (the next click edits only that cell)", async () => {
    localStorage.removeItem("tablePlus.editMode");
    await setup(PAGE);
    expect(document.documentElement.dataset.tpSelectMode).toBe("");
    clickOn(cell(1, 0));
    expect(cell(1, 0).classList.contains("tp-selected-alone")).toBe(true);
    clickOn(cell(2, 1));
    press(cell(1, 0), "mousedown", { shiftKey: true });
    expect(editor.querySelectorAll(".tp-selected-alone").length).toBe(0);
    controller.stop();
    expect(document.documentElement.dataset.tpSelectMode).toBeUndefined();
  });

  describe("moving the cells selected", () => {
    const GRID = '| A | B |\n|---|---|\n| 1 | 2 <meta f="=A1*2"> |\n| 3 | 4 |\n| 5 <meta n="five"> | 6 |\n| | |\n';
    const info = () => controller.infoOf(editor.querySelector<HTMLElement>(".sb-table-widget")!)!;
    const under = (target: Element) => Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
    const edge = () => editor.querySelector<HTMLElement>(".tp-select-edge-right")!;

    it("drags them by their edge: moved, formulas with them, names staying; with Ctrl copied, a formula's references moved", async () => {
      await setup(GRID, { "tablePlus.metadata": true });
      try {
        controller.selectCells(info(), { row: 1, column: 0 }, { row: 1, column: 1 });
        expect(editor.querySelectorAll(".tp-select-edge").length).toBe(6);
        // Pressed on the first row's edge, the pointer over the third row: the cells there
        press(edge(), "mousedown");
        under(cell(3, 0));
        window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 5, clientY: 5 }));
        expect(document.querySelector(".tp-move-tip")!.textContent).toBe("A3:B3");
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        await flush();
        // The formula keeps its reference as written: A1, now empty
        expect(text).toBe('| A | B |\n|---|---|\n| | |\n| 3 | 4 |\n| 1 <meta n="five"> | 0 <meta f="=A1*2"> |\n| | |\n');
        await controller.scan();
        // Copied back with Ctrl: the formula's reference moved with it
        controller.selectCells(info(), { row: 3, column: 0 }, { row: 3, column: 1 });
        press(edge(), "mousedown");
        under(cell(4, 0));
        window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, ctrlKey: true }));
        expect(document.querySelector(".tp-move-tip")!.textContent).toBe("+ A4:B4");
        window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, ctrlKey: true }));
        await flush();
        expect(text).toContain('| 1 | 6 <meta f="=A2*2"> |');
        expect(text).toContain('| 1 <meta n="five"> | 0 <meta f="=A1*2"> |');
      } finally {
        delete (document as { elementFromPoint?: unknown }).elementFromPoint;
      }
    });

    it("moves them with Move to… in their menu and a click on the cell they go to, kept within the table", async () => {
      await setup(GRID, { "tablePlus.metadata": true });
      controller.selectCells(info(), { row: 2, column: 0 }, { row: 3, column: 0 });
      cell(2, 0).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerType: "mouse" }));
      cell(2, 0).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
      Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === "Move 2 cells to…")!.click();
      // The second column of the last row: two cells high, they start a row above
      press(cell(4, 1), "mousedown");
      await flush();
      expect(text).toBe('| A | B |\n|---|---|\n| 1 | 2 <meta f="=A1*2"> |\n| | 4 |\n| <meta n="five"> | 3 |\n| | 5 |\n');
    });
  });
});
