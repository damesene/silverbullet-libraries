// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PAGE, cell, clickOn, controller, cursorMoves, editor, flashes, flush, key, press, setup, text, useTablePage } from "../testing/page.ts";

describe("Cell editor", () => {
  useTablePage();

  it("edits a cell in place without showing the markdown", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1));
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    expect(field.value).toBe("3");
    expect(cursorMoves).toEqual([]);

    field.value = "4 | 5";
    key(field, "Enter");
    await flush();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 4 \\| 5 |\n| apple | 10 |\n| Fig | 2 |\n");
    expect(cursorMoves).toEqual([]);
  });

  it("moves down on Enter with the 'moveDown' setting", async () => {
    await setup(PAGE, { "tablePlus.enterKey": "moveDown" });
    const editing = () => editor.querySelector<HTMLInputElement>(".tp-cell-editor");
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
    // the last row: Enter just saves
    clickOn(cell(3, 0));
    await waitFor(() => at()?.[0] === 3);
    key(editing()!, "Enter");
    await waitFor(() => editing() === null);
    expect(editing()).toBeNull();
  });

  it("only saves on Enter by default and with an unknown setting", async () => {
    await setup(PAGE, { "tablePlus.enterKey": "nonsense" });
    clickOn(cell(1, 1));
    key(editor.querySelector(".tp-cell-editor")!, "Enter");
    await flush();
    await flush();
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
  });

  it("writes edited tables aligned with the autoFormat setting", async () => {
    await setup("| Name | Qty |\n|---|--:|\n| Pear | 3 |\n| Apple | 10 |\n", { "tablePlus.autoFormat": true });
    clickOn(cell(1, 1));
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "300";
    key(editor.querySelector(".tp-cell-editor")!, "Enter");
    await flush();
    expect(text).toBe(
      "| Name  | Qty |\n| ----- | --: |\n| Pear  | 300 |\n| Apple |  10 |\n",
    );
  });

  it("adds a row below with Ctrl+Enter, unless the setting is off", async () => {
    await setup(PAGE);
    clickOn(cell(1, 1)); // Pear's Qty
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "4";
    key(editor.querySelector(".tp-cell-editor")!, "Enter", { ctrlKey: true });
    await flush();
    await controller.scan();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 4 |\n| | |\n| apple | 10 |\n| Fig | 2 |\n");
    const td = editor.querySelector(".tp-cell-editor")!.closest("td")!;
    expect([(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex]).toEqual([2, 1]);

    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "tablePlus.ctrlEnterAddsRow": false });
    clickOn(cell(1, 1));
    key(editor.querySelector(".tp-cell-editor")!, "Enter", { ctrlKey: true });
    await flush();
    expect(text).toBe(PAGE);
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
  });

  it("selects the cell's text on Shift+click, or on a plain click with selectOnClick", async () => {
    const selected = () => {
      const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
      return field.selectionStart === 0 && field.selectionEnd === field.value.length;
    };
    const click = (target: Element, shiftKey: boolean) => {
      press(target, "mousedown", { shiftKey });
      press(target, "click", { shiftKey });
    };
    await setup(PAGE);
    click(cell(1, 0), false);
    expect(selected()).toBe(false); // the cursor at the end
    click(cell(2, 0), true); // to another cell, with Shift
    await flush();
    expect(selected()).toBe(true);

    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "tablePlus.selectOnClick": true });
    await flush();
    click(cell(1, 0), false);
    expect(selected()).toBe(true);
    click(cell(2, 0), true);
    await flush();
    expect(selected()).toBe(false);
  });

  it("cancels an edit with Escape", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    field.value = "changed";
    key(field, "Escape");
    await flush();
    expect(text).toBe(PAGE);
    expect(cell(1, 0).textContent).toBe("Pear");
  });

  it("moves on with Tab and adds a row after the last cell", async () => {
    await setup(PAGE);
    clickOn(cell(3, 1));
    key(editor.querySelector(".tp-cell-editor")!, "Tab");
    await flush();
    await controller.scan();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| Fig | 2 |\n| | |\n");
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor");
    expect(field?.closest("tr")?.dataset.tpRow).toBe("4");
  });

  it("moves the editor between cells with Ctrl+arrows, Home and End", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    const editing = () => {
      const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
      const td = field.closest("td")!;
      return { field, at: [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex] };
    };
    key(editing().field, "Control");
    expect(document.body.classList.contains("tp-navigating")).toBe(true);

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
    expect(document.body.classList.contains("tp-navigating")).toBe(false);
  });

  it("moves rows and columns with Ctrl+Alt+arrows, the editor following", async () => {
    await setup(PAGE);
    const editing = () => {
      const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
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
    const at = () => editor.querySelector(".tp-cell-editor")!.closest("td")!.cellIndex;
    const press = async (k: string) => {
      key(editor.querySelector(".tp-cell-editor")!, k, { ctrlKey: true, altKey: true });
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
    const at = () => (editor.querySelector(".tp-cell-editor")!.closest("tr") as HTMLTableRowElement).rowIndex;
    const press = async (k: string, altKey = false) => {
      key(editor.querySelector(".tp-cell-editor")!, k, { ctrlKey: true, altKey });
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

  it("opens the next cell as on a Shift+click with Shift+Enter and Ctrl+Shift+arrows", async () => {
    const selected = () => {
      const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
      return field.selectionStart === 0 && field.selectionEnd === field.value.length;
    };
    const at = () => {
      const td = editor.querySelector(".tp-cell-editor")?.closest("td");
      return td && [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex];
    };
    const go = async (k: string, init: KeyboardEventInit) => {
      key(editor.querySelector(".tp-cell-editor")!, k, init);
      await flush();
      await controller.scan();
    };
    await setup(PAGE, { "tablePlus.enterKey": "moveDown" });
    clickOn(cell(1, 0));
    await go("ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(at()).toEqual([1, 1]);
    expect(selected()).toBe(true);
    await go("ArrowDown", { ctrlKey: true });
    expect(selected()).toBe(false);
    await go("Enter", { shiftKey: true });
    expect(at()).toEqual([3, 1]);
    expect(selected()).toBe(true);
    expect(text).toBe(PAGE); // moving does not touch the rows

    // swapped by selectOnClick: Shift opens with the cursor at the end
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "tablePlus.selectOnClick": true });
    await flush();
    press(cell(1, 0), "mousedown");
    press(cell(1, 0), "click");
    await go("ArrowRight", { ctrlKey: true, shiftKey: true });
    expect(at()).toEqual([1, 1]);
    expect(selected()).toBe(false);
  });

  it("does not move the header row, nor rows while sorted", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0));
    key(editor.querySelector(".tp-cell-editor")!, "ArrowDown", { ctrlKey: true, altKey: true });
    await flush();
    expect(text).toBe(PAGE);
    key(editor.querySelector(".tp-cell-editor")!, "Escape");
    await flush();
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    clickOn(cell(1, 0));
    key(editor.querySelector(".tp-cell-editor")!, "ArrowDown", { ctrlKey: true, altKey: true });
    await flush();
    expect(text).toBe(PAGE);
    expect(flashes.length).toBe(1);
  });

  it("keeps plain arrows, Home and End inside the field", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    for (const k of ["ArrowDown", "ArrowRight", "Home", "End"]) {
      expect(key(field, k)).toBe(true); // not prevented: the field handles it
    }
    await flush();
    expect(editor.querySelector(".tp-cell-editor")).toBe(field);
  });

  it("keeps a column's name when it is edited to nothing", async () => {
    await setup(PAGE);
    clickOn(cell(0, 1));
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    field.value = "  ";
    key(field, "Enter");
    await flush();
    expect(text).toBe(PAGE);
    expect(flashes.length).toBe(1);
  });
});
