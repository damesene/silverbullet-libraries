// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cell, clickOn, controller, editor, flashes, flush, key, setup, text, useTablePage } from "../testing/page.ts";

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

  it("pastes from a selected cell (select mode): its editor opens for the paste", async () => {
    localStorage.removeItem("tablePlus.editMode");
    await setup(TOTAL);
    clickOn(cell(1, 0));
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    const down = new KeyboardEvent("keydown", { key: "v", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    editor.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { getData: () => "Fig\t2" } });
    field().dispatchEvent(event);
    await flush();
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Fig | 2 |\n| Pear | 3 |\n| Apple | 10 |\n| Total | |\n");
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

  it("gives new rows' empty cells of a calculated column its formula; a value pasted there stays", async () => {
    const CALC = '| Name | Qty | Twice |\n|---|---|---|\n| Pear | 3 | 6 <meta f="=[@qty]*2"> |\n| Apple | 10 | 20 <meta f="=[@qty]*2"> |\n';
    await setup(CALC);
    clickOn(cell(2, 0));
    pasteText("Fig\t2\nPlum\t5\t99", true);
    await flush();
    expect(text).toBe(
      '| Name | Qty | Twice |\n|---|---|---|\n| Pear | 3 | 6 <meta f="=[@qty]*2"> |\n| Fig | 2 | 4 <meta f="=[@qty]*2"> |\n| Plum | 5 | 99 |\n| Apple | 10 | 20 <meta f="=[@qty]*2"> |\n',
    );
  });

  it("keeps the hidden tags of the cells pasted over: names, and formulas with the formulas module off", async () => {
    const TAGGED = '| Name | Qty |\n|---|---|\n| Pear <meta n="pear"> | 3 |\n| Total | 3 <meta f="=SUM([qty])"> |\n';
    await setup(TAGGED, { "tablePlus.modules.formulas.enabled": false });
    clickOn(cell(1, 0));
    pasteText("Fig\t2\nAll\t9");
    await flush();
    // Nothing recalculated: the value pasted stays, the formula kept for when formulas are on
    expect(text).toBe('| Name | Qty |\n|---|---|\n| Fig <meta n="pear"> | 2 |\n| All | 9 <meta f="=SUM([qty])"> |\n');
  });

  describe("from the cell menu", () => {
    const menuItem = (label: string) => Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === label);
    const openMenu = (at: Element) => {
      at.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerType: "mouse" }));
      at.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    };
    const clipboard = (text: string) =>
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => text, writeText: async () => {} } });
    afterEach(() => {
      delete (navigator as { clipboard?: unknown }).clipboard;
      delete (navigator as { permissions?: unknown }).permissions;
      delete (document as { hasFocus?: unknown }).hasFocus;
    });

    it("pastes the clipboard's cells from the cell, a single value into it, and new rows", async () => {
      clipboard("Fig\t2\nPlum\t5\n");
      await setup(TOTAL);
      openMenu(cell(1, 0));
      menuItem("Paste")!.click();
      await flush();
      await flush();
      await controller.scan();
      expect(text).toBe("| Name | Qty |\n|---|---|\n| Fig | 2 |\n| Plum | 5 |\n| Total | |\n");
      // A single value, as a spreadsheet copies one cell (a line break after it), with a | escaped
      clipboard("a|b\n");
      openMenu(cell(3, 1));
      menuItem("Paste")!.click();
      await flush();
      await flush();
      await controller.scan();
      expect(text).toContain("| Total | a\\|b |");
      clipboard("Kiwi\t1\n");
      openMenu(cell(1, 0));
      menuItem("Paste as new rows")!.click();
      await flush();
      await flush();
      expect(text).toContain("| Kiwi | 1 |\n| Fig | 2 |");
    });

    it("is disabled where the page cannot read the clipboard, or it holds nothing (known where reading needs no asking)", async () => {
      await setup(TOTAL);
      openMenu(cell(1, 0));
      expect(menuItem("Paste")!.getAttribute("aria-disabled")).toBe("true");
      key(document.querySelector(".tp-menu")!, "Escape");
      // Another application emptied it: read when the page comes back to the front
      clipboard("");
      Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "granted", addEventListener: () => {}, removeEventListener: () => {} }) } });
      controller.stop();
      // The page in front (jsdom's has no focus)
      Object.defineProperty(document, "hasFocus", { configurable: true, value: () => true });
      await setup(TOTAL);
      // The module starts, asks for the permission and reads the clipboard: each a promise, awaited as long as they take
      await vi.waitFor(() => {
        document.querySelector(".tp-menu") && key(document.querySelector(".tp-menu")!, "Escape");
        window.dispatchEvent(new Event("focus"));
        openMenu(cell(1, 0));
        expect(menuItem("Paste")!.title).toBe("The clipboard holds no text to paste");
      });
    });
  });

  describe("cutting", () => {
    const PAGE3 = "| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 <meta f=\"=1+1\"> |\n| | |\n| | |\n";
    const info = () => controller.infoOf(editor.querySelector<HTMLElement>(".sb-table-widget")!)!;
    const cutKey = () => {
      const data: Record<string, string> = {};
      const event = new Event("cut", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", { value: { setData: (type: string, value: string) => (data[type] = value) } });
      document.dispatchEvent(event);
      return { event, data };
    };
    const edges = () => editor.querySelectorAll(".tp-cut-edge").length;
    afterEach(() => {
      delete (navigator as { clipboard?: unknown }).clipboard;
    });

    it("cuts with Ctrl+X (copied, outlined, nothing changed) and moves the cells, formulas and all, where Ctrl+V pastes them", async () => {
      await setup(PAGE3, { "tablePlus.metadata": true });
      controller.selectCells(info(), { row: 1, column: 0 }, { row: 2, column: 1 });
      const { event, data } = cutKey();
      expect(event.defaultPrevented).toBe(true);
      expect(data["text/plain"]).toBe("Pear\t3\nFig\t2");
      expect(edges()).toBe(4);
      expect(text).toBe(PAGE3);
      // Pasted lower: moved, where they were emptied
      clickOn(cell(3, 0));
      pasteText("Pear\t3\nFig\t2\n");
      await flush();
      expect(text).toBe('| Name | Qty |\n|---|---|\n| | |\n| | |\n| Pear | 3 |\n| Fig | 2 <meta f="=1+1"> |\n');
      await controller.scan();
      expect(edges()).toBe(0);
    });

    it("pastes a copy once the cells cut changed, the clipboard holds something else, or Esc ended the cut", async () => {
      await setup(PAGE3, { "tablePlus.metadata": true });
      controller.selectCells(info(), { row: 1, column: 0 }, { row: 1, column: 0 });
      cutKey();
      // Esc ends it
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(edges()).toBe(0);
      clickOn(cell(3, 0));
      pasteText("Pear\tx\n");
      await flush();
      expect(text).toContain("| Pear | 3 |");
      expect(text).toContain("| Pear | x |");
      await controller.scan();
      // Another text on the clipboard: pasted as it is, the cut cells stay
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      controller.selectCells(info(), { row: 2, column: 0 }, { row: 2, column: 0 });
      cutKey();
      clickOn(cell(4, 0));
      pasteText("Kiwi\t1\n");
      await flush();
      expect(text).toContain("| Fig | 2 ");
      expect(text).toContain("| Kiwi | 1 |");
    });

    it("cuts and moves from the cell menu, also where the page cannot read the clipboard (over http)", async () => {
      await setup(PAGE3, { "tablePlus.metadata": true });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
      const menuItem = (label: string) => Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === label);
      const openMenu = (at: Element) => {
        at.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 2, pointerType: "mouse" }));
        at.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
      };
      openMenu(cell(1, 0));
      menuItem("Cut")!.click();
      await flush();
      expect(edges()).toBe(1);
      openMenu(cell(4, 1));
      const paste = menuItem("Paste (move 1 cell)")!;
      expect(paste.getAttribute("aria-disabled")).toBeNull();
      paste.click();
      await flush();
      await flush();
      expect(text).toBe('| Name | Qty |\n|---|---|\n| | 3 |\n| Fig | 2 <meta f="=1+1"> |\n| | |\n| | Pear |\n');
      // A header is not cut: its name stays
      await controller.scan();
      openMenu(cell(0, 0));
      expect(menuItem("Cut")!.getAttribute("aria-disabled")).toBe("true");
    });
  });

  it("keeps a column's type when a paste renames its header", async () => {
    await setup("| Name | Price #currency-usd |\n|---|---|\n| Pear | 3 |\n");
    clickOn(cell(1, 0));
    // Two cells from the header: the first row names the columns
    key(field(), "Escape");
    clickOn(cell(0, 0));
    pasteText("Item\tCost\nFig\t2\n");
    await flush();
    expect(text).toBe("| Item | Cost #currency-usd |\n|---|---|\n| Fig | 2 |\n");
  });
});
