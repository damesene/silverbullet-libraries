// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cell, clickOn, controller, editor, flashes, flush, key, press, setup as setupPage, text, useTablePage } from "../testing/page.ts";
import { FORMULAS_NEED_METADATA } from "./formulas.ts";

describe("Formulas", () => {
  useTablePage();

  // New formulas are stored in the table: the metadata setting is on unless a test turns it off
  const setup = (page: string, settings: Record<string, unknown> = {}) =>
    setupPage(page, { "tablePlus.metadata": true, ...settings });

  const TOTAL = "| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | |\n";
  const field = () => editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
  const type = async (value: string) => {
    field().value = value;
    field().dispatchEvent(new Event("input", { bubbles: true }));
    key(field(), "Enter");
    await flush();
    await controller.scan();
  };

  it("writes a typed formula's result with the formula", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    await type("=SUM(B1:B2)");
    expect(text).toBe('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | 13 <meta f="=SUM(B1:B2)"> |\n');
    expect(cell(3, 1).textContent).toBe("13");
    expect(cell(3, 1).classList.contains("tp-formula")).toBe(true);
    expect(cell(3, 1).title).toBe("=SUM(B1:B2)");
  });

  it("edits a formula cell as its formula and recalculates on every edit", async () => {
    await setup('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | 13 <meta f="=SUM([Qty])"> |\n');
    clickOn(cell(3, 1));
    expect(field().value).toBe("=SUM([Qty])");
    key(field(), "Escape");
    await flush();
    clickOn(cell(1, 1));
    await type("5");
    expect(text).toContain('| Total | 15 <meta f="=SUM([Qty])"> |');
    // A plain value replaces the formula
    clickOn(cell(3, 1));
    await type("7");
    expect(text).toContain("| Total | 7 |");
  });

  it("computes a new row with the formula its columns compute every row with", async () => {
    await setup(
      '| Item | Qty | Price | Amount |\n|---|---|---|---|\n| a | 2 | 3 | 6 <meta f="=[@Qty]*[@Price]"> |\n',
    );
    clickOn(cell(1, 0));
    key(field(), "Enter", { ctrlKey: true });
    await flush();
    await controller.scan();
    expect(text).toContain('<meta f="=[@Qty]*[@Price]"> |\n| ');
    for (const [value, next] of [["b", "Tab"], ["5", "Tab"], ["2", "Enter"]] as const) {
      field().value = value;
      key(field(), next);
      await flush();
      await controller.scan();
    }
    expect(text.split("\n").slice(-2)).toEqual(['| b | 5 | 2 | 10 <meta f="=[@Qty]*[@Price]"> |', ""]);
  });

  it("completes a function name with Tab, and moves on with Tab otherwise", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    field().value = "=su";
    field().setSelectionRange(3, 3);
    field().dispatchEvent(new Event("input"));
    expect(document.querySelector(".tp-formula-tab")!.textContent).toBe("Tab: SUM(");
    key(field(), "Tab");
    expect(field().value).toBe("=SUM(");
    expect(field().selectionStart).toBe(5);
    // Saved with the column's key, as SilverBullet's queries name it
    field().value = "=SUM([Qty])";
    field().setSelectionRange(11, 11);
    key(field(), "Tab");
    await flush();
    expect(text).toContain('| Total | 13 <meta f="=SUM([qty])"> |');
  });


  it("fixes a missing ) when the formula is saved, and says so", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    await type("=SUM(B1:B2");
    expect(text).toContain('| Total | 13 <meta f="=SUM(B1:B2)"> |');
    expect(flashes).toEqual(["Table Plus: formula fixed: added )"]);
  });

  it("keeps a text that starts with = when typed as '=, and when it is edited again", async () => {
    await setup(TOTAL);
    clickOn(cell(3, 1));
    await type("'=not a formula");
    expect(text).toContain("| Total | =not a formula |");
    clickOn(cell(3, 1));
    expect(field().value).toBe("'=not a formula");
    await type("'=still not a formula");
    expect(text).toContain("| Total | =still not a formula |");
  });

  it("adjusts references when a row is deleted", async () => {
    await setup('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Fig | 2 |\n| Total | 15 <meta f="=SUM(B1:B3)"> |\n');
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document
      .querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!
      .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item"))
      .find((b) => b.textContent === "Delete row")!
      .click();
    await flush();
    expect(text).toBe('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Fig | 2 |\n| Total | 5 <meta f="=SUM(B1:B2)"> |\n');
  });

  it("offers to recalculate results that are out of date", async () => {
    const stale = '| Name | Qty |\n|---|---|\n| Pear | 4 |\n| Apple | 10 |\n| Total | 13 <meta f="=SUM([Qty])"> |\n';
    await setup(stale);
    // Viewing does not write
    expect(text).toBe(stale);
    const recalc = () => document.querySelector<HTMLElement>('.tp-bar button[aria-label="Recalculate"]');
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    // An icon, first in the toolbar, highlighted while results are out of date
    expect(document.querySelector(".tp-bar")!.firstElementChild).toBe(recalc());
    expect(recalc()!.querySelector("svg")).not.toBeNull();
    expect(recalc()!.classList.contains("tp-attention")).toBe(true);
    recalc()!.click();
    await flush();
    await controller.scan();
    expect(text).toContain('| Total | 14 <meta f="=SUM([Qty])"> |');
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    // Still there, no longer highlighted
    expect(recalc()!.classList.contains("tp-attention")).toBe(false);
  });

  describe("referring to other tables", () => {
    const PAGE2 = [
      "| Name | Price |",
      "|---|---|",
      "| Pear | 12 |",
      "| Fig | 3 |",
      '| <meta name="prices"> |',
      "",
      "| Fruit | Cost |",
      "|---|---|",
      '| Fig | 3 <meta f="=XLOOKUP([@fruit], prices![name], prices![price])"> |',
      '| All | 15 <meta f="=SUM(prices![price])"> |',
      "",
    ].join("\n");
    const second = (row: number, column: number) => editor.querySelectorAll("table")[1]!.rows[row]!.cells[column]!;

    it("writes the results of the tables that refer to an edited one, in the same edit", async () => {
      await setup(PAGE2, { "tablePlus.editor.enterKey": "save" });
      let edits = 0;
      const bridge = (controller as unknown as { bridge: { replaceRange: (...a: unknown[]) => unknown } }).bridge;
      const replace = bridge.replaceRange;
      bridge.replaceRange = (...args: unknown[]) => {
        edits++;
        return replace(...args);
      };
      clickOn(cell(2, 1)); // Fig's price
      await type("4");
      expect(edits).toBe(1);
      expect(text).toContain("| Fig | 4 |");
      expect(text).toContain('| Fig | 4 <meta f="=XLOOKUP([@fruit], prices![name], prices![price])"> |');
      expect(text).toContain('| All | 16 <meta f="=SUM(prices![price])"> |');
      expect(second(1, 1).textContent).toBe("4");
    });

    it("leaves the tables that do not refer to the edited one as they are", async () => {
      const unrelated = '| X |\n|---|\n| 1 <meta f="=stock!A1"> |\n';
      await setup(`${PAGE2}\n${unrelated}`, { "tablePlus.editor.enterKey": "save" });
      clickOn(cell(2, 1));
      await type("4");
      expect(text).toContain('| All | 16 <meta f="=SUM(prices![price])"> |');
      expect(text).toContain(unrelated);
    });

    it("keeps the references of other tables on the cells they were to, and on the table when it is renamed", async () => {
      const PAGE3 = [
        "| Name | Price |",
        "|---|---|",
        "| Pear | 12 |",
        "| Fig | 3 |",
        '| <meta name="prices"> |',
        "",
        "| Item | Cost |",
        "|---|---|",
        '| Fig | 3 <meta f="=prices!B2"> |',
        "",
      ].join("\n");
      await setup(PAGE3);
      // A row inserted above Pear, from its row menu
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".tp-grip:not(.tp-grip-column)")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === "Insert row above")!.click();
      await flush();
      await controller.scan();
      expect(text).toContain('| Fig | 3 <meta f="=prices!B3"> |');
      // Renamed with Name
      vi.spyOn(window, "prompt").mockReturnValue("costs");
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button")).find((b) => b.textContent!.startsWith("Name"))!.click();
      await flush();
      expect(text).toContain('<meta name="costs">');
      expect(text).toContain('| Fig | 3 <meta f="=costs!B3"> |');
    });

    it("offers to recalculate a table when the one it refers to was changed in the markdown", async () => {
      await setup(PAGE2.replace("| Fig | 3 |", "| Fig | 5 |"));
      second(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      const recalc = document.querySelector<HTMLElement>('.tp-bar button[aria-label="Recalculate"]')!;
      expect(recalc.classList.contains("tp-attention")).toBe(true);
      recalc.click();
      await flush();
      expect(text).toContain('| Fig | 5 <meta f="=XLOOKUP([@fruit], prices![name], prices![price])"> |');
      expect(text).toContain('| All | 17 <meta f="=SUM(prices![price])"> |');
    });
  });

  describe("with the metadata setting off", () => {
    const OFF = { "tablePlus.metadata": false };

    it("saves a typed formula as text, and says why while it is typed", async () => {
      await setup(TOTAL, OFF);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1:B2)";
      field().dispatchEvent(new Event("input", { bubbles: true }));
      expect(document.querySelector(".tp-formula-hint")!.textContent).toBe(FORMULAS_NEED_METADATA);
      expect(document.querySelectorAll(".tp-ref-mark").length).toBe(0);
      key(field(), "Enter");
      await flush();
      expect(text).toContain("| Total | =SUM(B1:B2) |");
      expect(flashes).toEqual([`Table Plus: ${FORMULAS_NEED_METADATA}; saved as text`]);
    });

    it("keeps existing formulas working: edited, recalculated", async () => {
      await setup('| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Apple | 10 |\n| Total | 13 <meta f="=SUM([qty])"> |\n', OFF);
      clickOn(cell(3, 1));
      expect(field().value).toBe("=SUM([qty])");
      await type("=SUM(B1:B2)*2");
      expect(text).toContain('| Total | 26 <meta f="=SUM(B1:B2)*2"> |');
      clickOn(cell(1, 1));
      await type("4");
      expect(text).toContain('| Total | 28 <meta f="=SUM(B1:B2)*2"> |');
    });
  });

  describe("with layout", () => {
    // Cells 100×20 px in a grid: column c at x = 100c, row r (header 0) at y = 20r
    beforeEach(() => {
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        const rect = (left: number, top: number, width: number, height: number) =>
          ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
        if (this instanceof HTMLTableCellElement) {
          const row = (this.parentElement as HTMLTableRowElement).rowIndex;
          return rect(this.cellIndex * 100, row * 20, 100, 20);
        }
        if (this instanceof HTMLTableRowElement) return rect(0, this.rowIndex * 20, 1000, 20);
        if (this.classList.contains("sb-table-widget")) return rect(0, 0, 1000, 1000);
        return rect(0, 0, 0, 0);
      });
    });

    const marks = () => Array.from(document.querySelectorAll<HTMLElement>(".tp-ref-mark"));
    const pointer = (target: EventTarget, type: string, x: number, y: number) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));

    it("outlines each reference in its own color, with help under the cell", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1:B2) + A1";
      field().dispatchEvent(new Event("input"));
      expect(marks().map((m) => [m.style.left, m.style.top, m.style.width, m.style.height])).toEqual([
        ["100px", "20px", "100px", "40px"],
        ["0px", "20px", "100px", "20px"],
      ]);
      expect(marks()[0]!.style.getPropertyValue("--tp-ref-color")).not.toBe(marks()[1]!.style.getPropertyValue("--tp-ref-color"));
      expect(document.querySelector(".tp-formula-preview")!.textContent).toBe("=SUM(B1:B2) + A1");
      key(field(), "Escape");
      await flush();
      expect(marks()).toEqual([]);
      expect(document.querySelector(".tp-formula-hint")!.classList.contains("tp-visible")).toBe(false);
    });

    it("moves a reference by dragging its outline, and resizes a range by its corner", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1)";
      field().dispatchEvent(new Event("input"));
      // Drag B1 (y 20–40) down one row
      pointer(marks()[0]!.querySelector(".tp-ref-top")!, "pointerdown", 150, 30);
      pointer(window, "pointermove", 150, 50);
      expect(field().value).toBe("=SUM(B2)");
      pointer(window, "pointerup", 150, 50);
      // Resize from B2 up to B1
      pointer(marks()[0]!.querySelector(".tp-ref-corner")!, "pointerdown", 150, 50);
      pointer(window, "pointermove", 150, 30);
      expect(field().value).toBe("=SUM(B1:B2)");
      pointer(window, "pointerup", 150, 30);
      expect(document.activeElement).toBe(field());
      key(field(), "Enter");
      await flush();
      expect(text).toContain('| Total | 13 <meta f="=SUM(B1:B2)"> |');
    });

    it("inserts a cell, a dragged range or a clicked column where the formula expects a reference", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(";
      field().setSelectionRange(5, 5);
      // Press on B1 (y 20–40), drag to B2, release
      press(cell(1, 1), "mousedown", { clientX: 150, clientY: 30 });
      expect(field().value).toBe("=SUM(B1");
      window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 150, clientY: 50 }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 150, clientY: 50 }));
      expect(field().value).toBe("=SUM(B1:B2");
      expect(document.querySelector(".tp-cell-editor")).not.toBeNull();
      // Pointing again replaces the reference just inserted
      press(cell(2, 0), "mousedown", { clientX: 50, clientY: 50 });
      window.dispatchEvent(new MouseEvent("mouseup"));
      expect(field().value).toBe("=SUM(A2");
      // After a comma, a click on the header inserts the column
      field().value = "=SUM(A2, ";
      field().setSelectionRange(9, 9);
      press(cell(0, 1), "mousedown", { clientX: 150, clientY: 10 });
      window.dispatchEvent(new MouseEvent("mouseup"));
      expect(field().value).toBe("=SUM(A2, [qty]");
      field().value += ")";
      key(field(), "Enter");
      await flush();
      expect(text).toContain('| Total | 13 <meta f="=SUM(A2, [qty])"> |');
    });

    it("shows that cells can be pointed at, extends with Shift+click and stops a drag when editing ends", async () => {
      await setup(TOTAL);
      const widget = () => editor.querySelector<HTMLElement>(".sb-table-widget")!;
      clickOn(cell(3, 1));
      field().value = "=SUM(";
      field().setSelectionRange(5, 5);
      field().dispatchEvent(new Event("input"));
      expect(widget().classList.contains("tp-pointing")).toBe(true);
      press(cell(1, 1), "mousedown", { clientX: 150, clientY: 30 });
      window.dispatchEvent(new MouseEvent("mouseup"));
      press(cell(2, 1), "mousedown", { clientX: 150, clientY: 50, shiftKey: true });
      window.dispatchEvent(new MouseEvent("mouseup"));
      expect(field().value).toBe("=SUM(B1:B2");
      // Typing makes it part of the formula: no more pointing after it
      key(field(), ")");
      field().value = "=SUM(B1:B2)";
      field().setSelectionRange(11, 11);
      field().dispatchEvent(new Event("input"));
      expect(widget().classList.contains("tp-pointing")).toBe(false);
      // A drag whose editor closes stops changing anything
      field().value = "=SUM(B1:B2)+";
      field().setSelectionRange(12, 12);
      press(cell(1, 0), "mousedown", { clientX: 50, clientY: 30 });
      expect(field().value).toBe("=SUM(B1:B2)+A1");
      const closed = field();
      key(closed, "Escape");
      window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX: 50, clientY: 50 }));
      expect(closed.value).toBe("=SUM(B1:B2)+A1");
      expect(widget().classList.contains("tp-pointing")).toBe(false);
    });

    it("ends editing after a typed reference instead of replacing it", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=B1+B2";
      field().setSelectionRange(6, 6);
      clickOn(cell(1, 0));
      await flush();
      expect(text).toContain('| Total | 13 <meta f="=B1+B2"> |');
    });

    it("ends editing as before when a click comes after a complete operand", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=SUM(B1:B2)";
      field().setSelectionRange(11, 11);
      clickOn(cell(1, 0));
      await flush();
      expect(text).toContain('| Total | 13 <meta f="=SUM(B1:B2)"> |');
    });

    it("puts the reference back when a drag is cancelled with Esc", async () => {
      await setup(TOTAL);
      clickOn(cell(3, 1));
      field().value = "=[Qty]";
      field().dispatchEvent(new Event("input"));
      expect(marks().length).toBe(1);
      pointer(marks()[0]!.querySelector(".tp-ref-left")!, "pointerdown", 150, 30);
      pointer(window, "pointermove", 50, 30);
      expect(field().value).toBe("=[name]");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(field().value).toBe("=[Qty]");
      expect(document.querySelector(".tp-cell-editor")).not.toBeNull();
    });
  });
});
