// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PAGE, cell, clickOn, controller, cursorMoves, editor, flashes, flush, key, press, setup, text, useTablePage } from "../testing/page.ts";

describe("Cell editor", () => {
  useTablePage();

  it("edits a cell in place without showing the markdown", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    expect(field.value).toBe("3");
    expect(cursorMoves).toEqual([]);

    field.value = "4 | 5";
    key(field, "Enter");
    await flush();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 4 \\| 5 |\n| apple | 10 |\n| Fig | 2 |\n");
    expect(cursorMoves).toEqual([]);
  });

  describe("a cell past the table (editBeyond)", () => {
    const beyond = (row: number, column: number) => {
      const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
      const info = controller.infoOf(widget)!;
      const td = document.createElement("td");
      document.body.append(td);
      controller.editBeyond(widget, info, { row: info.rows + row, column: info.columns + column }, td);
      return td.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    };

    it("grows the table to hold it: the rows and columns up to it added, the new columns named", async () => {
      await setup(PAGE);
      const field = beyond(1, 1);
      expect(field.value).toBe("");
      field.value = "x";
      key(field, "Enter");
      await flush();
      expect(text).toBe(
        "Intro\n\n| Name | Qty | Column 3 | Column 4 |\n|---|---|---|---|\n| Pear | 3 | | |\n| apple | 10 | | |\n| Fig | 2 | | |\n| | | | |\n| | | | x |\n",
      );
    });

    it("in the header's line right of the table: a column of that name", async () => {
      await setup(PAGE);
      const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
      const info = controller.infoOf(widget)!;
      const td = document.createElement("td");
      document.body.append(td);
      controller.editBeyond(widget, info, { row: 0, column: info.columns }, td);
      const field = td.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      field.value = "Price";
      key(field, "Enter");
      await flush();
      expect(text).toContain("| Name | Qty | Price |\n|---|---|---|\n| Pear | 3 | |");
    });

    it("writes nothing while it is empty, nor on Esc", async () => {
      await setup(PAGE);
      const field = beyond(0, 0);
      key(field, "Enter");
      await flush();
      expect(text).toBe(PAGE);
      const again = beyond(0, 0);
      again.value = "x";
      key(again, "Escape");
      await flush();
      expect(text).toBe(PAGE);
      expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    });

    it("keeps rows pinned to the bottom last: the new rows go above them", async () => {
      await setup("| A |\n|---|\n| 1 |\n| total |\n| <meta pin-bottom='1'> |\n", { "silverware.table.metadata": true });
      const field = beyond(0, 0);
      field.value = "2";
      key(field, "Tab");
      await flush();
      expect(text).toContain("| A | Column 2 |\n|---|---|\n| 1 | |\n| | 2 |\n| total | |\n");
    });
  });

  it("moves down on Enter with the 'moveDown' setting", async () => {
    await setup(PAGE, { "silverware.table.editor.enterKey": "moveDown" });
    const editing = () => editor.querySelector<HTMLInputElement>(".swt-cell-editor");
    const at = () => {
      const td = editing()?.closest("td");
      return td ? [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex] : null;
    };
    const waitFor = async (done: () => boolean) => {
      for (let i = 0; i < 50 && !done(); i++) {
        await flush();
        await controller.scan();
      }
    };
    clickOn(cell(1, 1));
    editing()!.value = "4";
    key(editing()!, "Enter");
    await waitFor(() => at()?.[0] === 2);
    expect(text).toContain("| Pear | 4 |");
    expect(at()).toEqual([2, 1]);
    key(editing()!, "Enter", { shiftKey: true }); // also down
    await waitFor(() => at()?.[0] === 3);
    expect(at()).toEqual([3, 1]);
    // The last row: Enter adds a row under it, edited in the same column
    clickOn(cell(3, 0));
    await waitFor(() => at()?.[0] === 3);
    key(editing()!, "Enter");
    await waitFor(() => at()?.[0] === 4);
    expect(at()).toEqual([4, 0]);
    expect(text.split("\n").filter((line) => line.startsWith("|"))).toHaveLength(6);
  });

  it("moves down on Enter by default and with an unknown setting, only saves with save", async () => {
    const at = () => {
      const td = editor.querySelector(".swt-cell-editor")?.closest("td");
      return td ? [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex] : null;
    };
    await setup(PAGE, { "silverware.table.editor.enterKey": "nonsense" });
    clickOn(cell(1, 1));
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    await flush();
    expect(at()).toEqual([2, 1]);

    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "silverware.table.editor.enterKey": "save" });
    clickOn(cell(1, 1));
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    await flush();
    expect(at()).toBeNull();
  });

  it("writes edited tables aligned with the autoFormat setting", async () => {
    await setup("| Name | Qty |\n|---|--:|\n| Pear | 3 |\n| Apple | 10 |\n", { "silverware.table.autoFormat": true });
    clickOn(cell(1, 1));
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "300";
    key(editor.querySelector(".swt-cell-editor")!, "Enter");
    await flush();
    expect(text).toBe(
      "| Name  | Qty |\n| ----- | --: |\n| Pear  | 300 |\n| Apple |  10 |\n",
    );
  });

  it("adds a row below with Ctrl+Enter, unless the setting is off", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1)); // Pear's Qty
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "4";
    key(editor.querySelector(".swt-cell-editor")!, "Enter", { ctrlKey: true });
    await flush();
    await controller.scan();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 4 |\n| | |\n| apple | 10 |\n| Fig | 2 |\n");
    const td = editor.querySelector(".swt-cell-editor")!.closest("td")!;
    expect([(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex]).toEqual([2, 1]);

    controller.stop();
    document.body.replaceChildren();
    // Off: Ctrl+Enter is a plain Enter (here: only saving)
    await setup(PAGE, { "silverware.table.editor.ctrlEnterAddsRow": false, "silverware.table.editor.enterKey": "save" });
    clickOn(cell(1, 1));
    key(editor.querySelector(".swt-cell-editor")!, "Enter", { ctrlKey: true });
    await flush();
    expect(text).toBe(PAGE);
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
  });

  it("selects the cells from the edited one with Shift+click; a plain click selects the text with selectOnClick", async () => {
    const selected = () => {
      const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      return field.selectionStart === 0 && field.selectionEnd === field.value.length;
    };
    const click = (target: Element, shiftKey: boolean) => {
      press(target, "mousedown", { shiftKey });
      press(target, "click", { shiftKey });
    };
    const marked = () => Array.from(editor.querySelectorAll(".swt-selected"));
    await setup(PAGE);
    click(cell(1, 0), false);
    expect(selected()).toBe(false); // the cursor at the end
    editor.querySelector<HTMLInputElement>(".swt-cell-editor")!.value = "Plum";
    click(cell(2, 1), true); // to another cell, with Shift: the cells between, the edited one saved
    await flush();
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    expect(text).toBe(PAGE.replace("| Pear |", "| Plum |"));
    await controller.scan();
    expect(marked()).toEqual([cell(1, 0), cell(1, 1), cell(2, 0), cell(2, 1)]);
    // Shift+click again: on from the selection's first cell
    click(cell(3, 0), true);
    expect(marked()).toEqual([cell(1, 0), cell(2, 0), cell(3, 0)]);
    // Esc drops the edit and leaves the cell selected; a second Esc ends that
    click(cell(0, 1), false);
    key(editor.querySelector(".swt-cell-editor")!, "Escape");
    await flush();
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    expect(marked()).toEqual([cell(0, 1)]);
    key(editor, "Escape");
    expect(marked()).toEqual([]);
    // Nothing edited or selected: just that cell
    click(cell(2, 1), true);
    expect(marked()).toEqual([cell(2, 1)]);

    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "silverware.table.editor.selectOnClick": true });
    await flush();
    click(cell(1, 0), false);
    expect(selected()).toBe(true);

    // Without the selection module, Shift+click opens the cell as the setting's other choice
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "silverware.table.modules.selection.enabled": false });
    await flush();
    click(cell(2, 0), true);
    expect(selected()).toBe(true);
  });

  it("cancels an edit with Escape", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    field.value = "changed";
    key(field, "Escape");
    await flush();
    expect(text).toBe(PAGE);
    expect(cell(1, 0).textContent).toBe("Pear");
  });

  it("moves on with Tab and adds a row after the last cell", async () => {
    await setup(PAGE);
    clickOn(cell(3, 1));
    key(editor.querySelector(".swt-cell-editor")!, "Tab");
    await flush();
    await controller.scan();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| Fig | 2 |\n| | |\n");
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor");
    expect(field?.closest("tr")?.dataset.swtRow).toBe("4");
  });

  it("moves the editor between cells with Ctrl+arrows, Home and End", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    const editing = () => {
      const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      const td = field.closest("td")!;
      return { field, at: [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex] };
    };
    // The move cursor on the cell under the pointer only (jsdom does not hit-test: told which)
    let under: Element = cell(2, 1);
    document.elementFromPoint = () => under;
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10, pointerType: "mouse" }));
    expect(cell(2, 1).classList.contains("swt-navigating-here")).toBe(false);
    key(editing().field, "Control");
    expect(cell(2, 1).classList.contains("swt-navigating-here")).toBe(true);
    expect(document.body.classList.contains("swt-navigating")).toBe(false);
    under = cell(1, 1);
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 30, pointerType: "mouse" }));
    expect([cell(2, 1), cell(1, 1)].map((c) => c.classList.contains("swt-navigating-here"))).toEqual([false, true]);

    key(editing().field, "ArrowDown", { ctrlKey: true });
    await flush();
    expect(editing().at).toEqual([2, 0]);
    key(editing().field, "End", { ctrlKey: true });
    await flush();
    expect(editing().at).toEqual([2, 1]);
    key(editing().field, "ArrowRight", { ctrlKey: true }); // the table's edge: stays
    await flush();
    expect(editing().at).toEqual([2, 1]);
    key(editing().field, "ArrowUp", { ctrlKey: true });
    key(editing().field, "ArrowUp", { ctrlKey: true });
    await flush();
    expect(editing().at).toEqual([0, 1]);

    // a changed cell is saved on the way
    editing().field.value = "Count";
    key(editing().field, "Home", { ctrlKey: true });
    await flush();
    await controller.scan();
    expect(text).toContain("| Name | Count |");
    expect(editing().at).toEqual([0, 0]);

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));
    expect(editor.querySelectorAll(".swt-navigating-here").length).toBe(0);
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it("moves rows and columns with Ctrl+Alt+arrows, the editor following", async () => {
    await setup(PAGE);
    const editing = () => {
      const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      const td = field.closest("td")!;
      return { field, at: [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex] };
    };
    const press = async (k: string) => {
      key(editing().field, k, { ctrlKey: true, altKey: true });
      await flush();
      await controller.scan();
    };
    clickOn(cell(1, 0)); // Pear
    editing().field.value = "Pears"; // saved together with the move
    await press("ArrowDown");
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| apple | 10 |\n| Pears | 3 |\n| Fig | 2 |\n");
    expect(editing().at).toEqual([2, 0]);
    await press("ArrowDown");
    await press("ArrowDown"); // already the last row
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| apple | 10 |\n| Fig | 2 |\n| Pears | 3 |\n");
    expect(editing().at).toEqual([3, 0]);
    await press("ArrowRight");
    expect(text).toBe("Intro\n\n| Qty | Name |\n|---|---|\n| 10 | apple |\n| 2 | Fig |\n| 3 | Pears |\n");
    expect(editing().at).toEqual([3, 1]);
    expect(editing().field.value).toBe("Pears");
  });

  it("moves a column to the start or the end with Ctrl+Alt+Home and End", async () => {
    await setup("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    const at = () => editor.querySelector(".swt-cell-editor")!.closest("td")!.cellIndex;
    const press = async (k: string) => {
      key(editor.querySelector(".swt-cell-editor")!, k, { ctrlKey: true, altKey: true });
      await flush();
      await controller.scan();
    };
    clickOn(cell(1, 1)); // B
    await press("End");
    expect(text).toBe("| A | C | B |\n|---|---|---|\n| 1 | 3 | 2 |\n");
    expect(at()).toBe(2);
    await press("End"); // already last
    expect(text).toBe("| A | C | B |\n|---|---|---|\n| 1 | 3 | 2 |\n");
    await press("Home");
    expect(text).toBe("| B | A | C |\n|---|---|---|\n| 2 | 1 | 3 |\n");
    expect(at()).toBe(0);
  });

  it("jumps and moves rows by 10 with Ctrl(+Alt)+PageUp and PageDown", async () => {
    const rows = Array.from({ length: 15 }, (_, i) => `| r${i + 1} |`).join("\n");
    await setup(`| N |\n|---|\n${rows}\n`);
    const at = () => (editor.querySelector(".swt-cell-editor")!.closest("tr") as HTMLTableRowElement).rowIndex;
    const press = async (k: string, altKey = false) => {
      key(editor.querySelector(".swt-cell-editor")!, k, { ctrlKey: true, altKey });
      await flush();
      await controller.scan();
    };
    clickOn(cell(2, 0)); // r2
    await press("PageDown");
    expect(at()).toBe(12);
    await press("PageDown"); // stops at the last row
    expect(at()).toBe(15);
    await press("PageUp");
    expect(at()).toBe(5);
    await press("PageUp"); // stops at the first body row, not the header
    expect(at()).toBe(1);

    await press("PageDown", true); // r1 moves 10 places down
    expect(text.split("\n").slice(2, 13).join(",")).toBe(
      "| r2 |,| r3 |,| r4 |,| r5 |,| r6 |,| r7 |,| r8 |,| r9 |,| r10 |,| r11 |,| r1 |",
    );
    expect(at()).toBe(11);
    await press("PageDown", true); // only 4 places left: to the end
    expect(text.split("\n")[16]).toBe("| r1 |");
    expect(at()).toBe(15);
    await press("PageUp", true);
    expect(at()).toBe(5);
    expect(text.split("\n")[6]).toBe("| r1 |");
  });

  it("opens the cell below with its text selected with Shift+Enter; Ctrl+Shift+arrows select cells", async () => {
    const selected = () => {
      const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      return field.selectionStart === 0 && field.selectionEnd === field.value.length;
    };
    const at = () => {
      const td = editor.querySelector(".swt-cell-editor")?.closest("td");
      return td && [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex];
    };
    const go = async (k: string, init: KeyboardEventInit) => {
      key(editor.querySelector(".swt-cell-editor")!, k, init);
      await flush();
      await controller.scan();
    };
    const marked = () => Array.from(editor.querySelectorAll(".swt-selected"));
    await setup(PAGE, { "silverware.table.editor.enterKey": "moveDown" });
    clickOn(cell(1, 0));
    await go("ArrowDown", { ctrlKey: true });
    expect(selected()).toBe(false);
    await go("Enter", { shiftKey: true });
    expect(at()).toEqual([3, 0]);
    expect(selected()).toBe(true);
    expect(text).toBe(PAGE); // moving does not touch the rows

    // Ctrl+Shift+arrow: the editor closes, the cells from it on are selected; Shift+arrows (with Ctrl too) go on
    await go("ArrowUp", { ctrlKey: true, shiftKey: true });
    expect(editor.querySelector(".swt-cell-editor")).toBeNull();
    expect(marked()).toEqual([cell(2, 0), cell(3, 0)]);
    key(editor, "ArrowRight", { shiftKey: true });
    key(editor, "ArrowUp", { shiftKey: true, ctrlKey: true });
    expect(marked()).toEqual([cell(1, 0), cell(1, 1), cell(2, 0), cell(2, 1), cell(3, 0), cell(3, 1)]);
    // At the table's edge it stays
    key(editor, "ArrowRight", { shiftKey: true });
    expect(marked().length).toBe(6);

    // swapped by selectOnClick: Shift+Enter opens with the cursor at the end
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "silverware.table.editor.selectOnClick": true, "silverware.table.editor.enterKey": "moveDown" });
    await flush();
    press(cell(1, 0), "mousedown");
    press(cell(1, 0), "click");
    await go("Enter", { shiftKey: true });
    expect(at()).toEqual([2, 0]);
    expect(selected()).toBe(false);
    // Enter, Tab and Ctrl+arrows follow the setting
    await go("Enter", {});
    expect(at()).toEqual([3, 0]);
    expect(selected()).toBe(true);
    await go("Tab", {});
    expect(selected()).toBe(true);
    await go("ArrowUp", { ctrlKey: true });
    expect(at()).toEqual([2, 1]);
    expect(selected()).toBe(true);

    // Without the selection module, Ctrl+Shift+arrows open the cell with its text selected
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "silverware.table.modules.selection.enabled": false });
    await flush();
    clickOn(cell(1, 0));
    await go("ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(at()).toEqual([1, 1]);
    expect(selected()).toBe(true);
  });

  it("does not move the header row, nor rows while sorted", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0));
    key(editor.querySelector(".swt-cell-editor")!, "ArrowDown", { ctrlKey: true, altKey: true });
    await flush();
    expect(text).toBe(PAGE);
    key(editor.querySelector(".swt-cell-editor")!, "Escape");
    await flush();
    clickOn(cell(0, 0).querySelector(".swt-sort")!);
    clickOn(cell(1, 0));
    key(editor.querySelector(".swt-cell-editor")!, "ArrowDown", { ctrlKey: true, altKey: true });
    await flush();
    expect(text).toBe(PAGE);
    expect(flashes.length).toBe(1);
  });

  it("keeps plain arrows, Home and End inside the field", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    for (const k of ["ArrowDown", "ArrowRight", "Home", "End"]) {
      expect(key(field, k)).toBe(true); // not prevented: the field handles it
    }
    await flush();
    expect(editor.querySelector(".swt-cell-editor")).toBe(field);
  });

  it("keeps a column's name when it is edited to nothing", async () => {
    await setup(PAGE);
    clickOn(cell(0, 1));
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    field.value = "  ";
    key(field, "Enter");
    await flush();
    expect(text).toBe(PAGE);
    expect(flashes.length).toBe(1);
  });
});
