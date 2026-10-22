// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PAGE, bodyTexts, cell, clickOn, controller, editor, flush, key, setup, tableMenuItem, text, useTablePage } from "../testing/page.ts";

describe("Filters", () => {
  useTablePage();

  const STATUS = "| Task | Status |\n|---|---|\n| Docs | done |\n| Sort | open |\n| Filters | open |\n| Release | blocked |\n";
  const bubble = () => document.querySelector<HTMLElement>(".swt-filter-bubble.swt-visible");
  const popoverField = () => document.querySelector<HTMLInputElement>(".swt-filter-popover input.swt-filter");
  const typeInto = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };
  const openColumnFilter = (column: number) => {
    cell(1, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    document.querySelector<HTMLElement>('.swt-menu .swt-segment[aria-label="Filter this column"]')!.click();
  };
  const chip = () => {
    cell(0, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    return Array.from(document.querySelectorAll<HTMLElement>(".swt-bar .swt-chip")).find((c) => c.textContent!.endsWith("rows")) ?? null;
  };

  it("filters one column in a bubble under its header, the table not moving; its header mark opens it again", async () => {
    await setup(PAGE);
    openColumnFilter(1);
    expect(editor.querySelector(".swt-filter-row")).toBeNull();
    expect(document.activeElement).toBe(popoverField());
    typeInto(popoverField()!, ">2");
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(cell(0, 1).classList.contains("swt-filtered")).toBe(true);
    expect(chip()!.textContent).toBe("2 of 3 rows");
    // Leaving it closes it; the filter stays, its mark in the header opens it
    key(popoverField()!, "Escape");
    expect(bubble()).toBeNull();
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    clickOn(cell(0, 1).querySelector(".swt-filter-mark")!);
    expect(popoverField()!.value).toBe(">2");
    // The × beside the field closes it too, the filter kept
    document.querySelector<HTMLElement>(".swt-filter-popover .swt-filter-close")!.click();
    expect(bubble()).toBeNull();
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    // The chip's cross clears the filters
    chip()!.querySelector<HTMLElement>(".swt-chip-clear")!.click();
    await flush();
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    expect(cell(0, 1).classList.contains("swt-filtered")).toBe(false);
    expect(chip()).toBeNull();
  });

  it("has Filter in a column's menu as a row of icons after its type and sorting, its × removing the column's filter", async () => {
    await setup(PAGE);
    const openMenu = () => {
      if (document.querySelector(".swt-menu")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      cell(0, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      cell(1, 1).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      document.querySelector(".swt-grip-column")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    };
    const remove = () => document.querySelector<HTMLElement>('.swt-menu .swt-segment[aria-label="Remove this column\'s filter"]')!;
    openMenu();
    const rows = Array.from(document.querySelectorAll(".swt-menu .swt-menu-item, .swt-menu .swt-menu-segmented")).map(
      (e) => e.querySelector(".swt-label")?.textContent ?? "",
    );
    expect(rows.findIndex((l) => l.startsWith("Type"))).toBe(rows.indexOf("Sort") - 1);
    expect(rows.indexOf("Filter")).toBe(rows.indexOf("Sort") + 1);
    expect(remove().getAttribute("aria-disabled")).toBe("true");
    remove().click();
    expect(document.querySelector(".swt-menu")).not.toBeNull();
    document.querySelector<HTMLElement>('.swt-menu .swt-segment[aria-label="Filter this column"]')!.click();
    typeInto(popoverField()!, "3");
    expect(bodyTexts()).toEqual(["Pear"]);
    openMenu();
    expect(remove().hasAttribute("aria-disabled")).toBe(false);
    remove().click();
    expect(document.querySelector(".swt-menu")).toBeNull();
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
  });

  it("offers a column's few values to tick, as =a|b", async () => {
    await setup(STATUS);
    openColumnFilter(1);
    const values = () => Array.from(document.querySelectorAll<HTMLElement>(".swt-filter-value"));
    expect(values().map((v) => v.textContent)).toEqual(["done1", "open2", "blocked1"]);
    const tick = (label: string) => {
      const box = values().find((v) => v.textContent!.startsWith(label))!.querySelector("input")!;
      box.checked = !box.checked;
      box.dispatchEvent(new Event("change"));
    };
    tick("open");
    expect(popoverField()!.value).toBe("=open");
    expect(bodyTexts()).toEqual(["Sort", "Filters"]);
    tick("blocked");
    expect(popoverField()!.value).toBe("=open|blocked");
    expect(bodyTexts()).toEqual(["Sort", "Filters", "Release"]);
    // Ticked as the field says
    expect(values().map((v) => v.querySelector("input")!.checked)).toEqual([false, true, true]);
    tick("open");
    tick("blocked");
    expect(popoverField()!.value).toBe("");
    expect(bodyTexts()).toEqual(["Docs", "Sort", "Filters", "Release"]);
  });

  it("shows what a field understands, a click putting it in the field", async () => {
    await setup(PAGE);
    openColumnFilter(1);
    // A column of numbers: comparing first
    const hints = () => Array.from(document.querySelectorAll<HTMLElement>(".swt-filter-hint"));
    expect(hints()[0]!.textContent).toBe(">10 above");
    typeInto(popoverField()!, "5");
    hints()[0]!.click();
    expect(popoverField()!.value).toBe(">5");
    expect(bodyTexts()).toEqual(["apple"]);
  });

  it("hides the filter row without clearing the filters; a field's cross clears it", async () => {
    await setup(PAGE);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const toggle = () => document.querySelector<HTMLElement>('.swt-bar button[aria-label="Filter"]')!;
    toggle().click();
    const field = editor.querySelector<HTMLInputElement>('.swt-filter[data-swt-column="0"]')!;
    field.focus();
    typeInto(field, "a");
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(field.closest(".swt-filter-field")!.classList.contains("swt-filter-active")).toBe(true);
    field.blur();
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    toggle().click();
    expect(editor.querySelector(".swt-filter-row")).toBeNull();
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(cell(0, 0).classList.contains("swt-filtered")).toBe(true);
    // Shown again with the filter in it
    toggle().click();
    const again = editor.querySelector<HTMLInputElement>('.swt-filter[data-swt-column="0"]')!;
    expect(again.value).toBe("a");
    again.closest("td")!.querySelector<HTMLElement>(".swt-filter-clear")!.click();
    expect(again.value).toBe("");
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
  });

  describe("stored in the table", () => {
    const STORED = `| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| Fig | 2 |\n| <meta filter.qty='&gt;2'> |\n`;

    it("stores the filters once the field is left, with the metadata setting", async () => {
      await setup(PAGE, { "silverware.table.metadata": true });
      openColumnFilter(1);
      typeInto(popoverField()!, ">2");
      // Not while typed in
      await flush();
      expect(text).toBe(PAGE);
      key(popoverField()!, "Escape");
      await flush();
      await flush();
      expect(text).toBe(PAGE.replace("| Fig | 2 |\n", `| Fig | 2 |\n| <meta filter.qty='&gt;2'> |\n`));
      // Cleared with the chip: the attribute goes, and the row with nothing left in it
      await controller.scan();
      chip()!.querySelector<HTMLElement>(".swt-chip-clear")!.click();
      await flush();
      await flush();
      expect(text).toBe(PAGE);
    });

    it("filters with the stored filters, which follow their column", async () => {
      await setup(STORED);
      expect(bodyTexts()).toEqual(["Pear", "apple"]);
      expect(cell(0, 1).classList.contains("swt-filtered")).toBe(true);
      // The column renamed: its filter goes with it
      clickOn(cell(0, 1));
      const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      field.value = "Count";
      key(field, "Enter");
      await flush();
      expect(text).toContain(`| <meta filter.count='&gt;2'> |`);
    });

    it("leaves the stored filters alone with the filters module off", async () => {
      await setup(STORED, { "silverware.table.modules.filters.enabled": false });
      expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
      expect(cell(0, 1).querySelector(".swt-filter-mark")).toBeNull();
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      expect(document.querySelector('.swt-bar button[aria-label="Filter"]')).toBeNull();
      // Kept, following its column
      clickOn(cell(0, 1));
      const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      field.value = "Count";
      key(field, "Enter");
      await flush();
      expect(text).toContain(`| <meta filter.count='&gt;2'> |`);
    });

    it("shows the stored filters again when the metadata comes back (Ctrl+Z)", async () => {
      await setup(STORED);
      const bridge = (controller as unknown as { bridge: { confirm: unknown; replaceRange(from: number, to: number, text: string): Promise<void> } }).bridge;
      bridge.confirm = () => true;
      tableMenuItem(/^Remove metadata$/)!.click();
      await flush();
      await controller.scan();
      expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
      // The markdown as it was
      await bridge.replaceRange(0, text.length, STORED);
      await controller.scan();
      expect(bodyTexts()).toEqual(["Pear", "apple"]);
    });

    it("waits with storing while a cell is edited, so the editor stays", async () => {
      await setup(PAGE, { "silverware.table.metadata": true, "silverware.table.editor.enterKey": "save" });
      openColumnFilter(1);
      typeInto(popoverField()!, ">2");
      // A cell edited: the field left, nothing written under the editor
      clickOn(cell(1, 0));
      await flush();
      await flush();
      const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
      expect(field).not.toBeNull();
      expect(text).toBe(PAGE);
      field.value = "Pearl";
      key(field, "Enter");
      await flush();
      await controller.scan();
      await flush();
      await flush();
      expect(text).toContain("| Pearl | 3 |");
      expect(text).toContain(`| <meta filter.qty='&gt;2'> |`);
    });

    it("stores each table's filters when typing goes from one table's field to another's", async () => {
      const TWO = "| A |\n|---|\n| x |\n| y |\n\n| B |\n|---|\n| x |\n| z |\n";
      await setup(TWO, { "silverware.table.metadata": true });
      const fieldOf = (table: number) => {
        const t = editor.querySelectorAll("table")[table]!;
        t.rows[1]!.cells[0]!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        if (!t.querySelector(".swt-filter-row")) document.querySelector<HTMLElement>('.swt-bar button[aria-label="Filter"]')!.click();
        return editor.querySelectorAll("table")[table]!.querySelector<HTMLInputElement>("input.swt-filter")!;
      };
      const first = fieldOf(0);
      first.focus();
      typeInto(first, "x");
      const second = fieldOf(1);
      second.focus();
      for (let i = 0; i < 3; i++) {
        await flush();
        await controller.scan();
      }
      // (The harness renders every table anew after a write, SilverBullet only the one written: focused again)
      const again = editor.querySelectorAll("table")[1]!.querySelector<HTMLInputElement>("input.swt-filter")!;
      again.focus();
      typeInto(again, "z");
      again.blur();
      for (let i = 0; i < 3; i++) {
        await flush();
        await controller.scan();
      }
      expect(text).toBe(`| A |\n|---|\n| x |\n| y |\n| <meta filter.a='x'> |\n\n| B |\n|---|\n| x |\n| z |\n| <meta filter.b='z'> |\n`);
    });

    it("are removed with the metadata", async () => {
      await setup(STORED);
      (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => true;
      tableMenuItem(/^Remove metadata$/)!.click();
      await flush();
      await controller.scan();
      expect(text).toBe(STORED.replace(`| <meta filter.qty='&gt;2'> |\n`, ""));
      expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    });
  });
});
