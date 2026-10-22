// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { controller, editor, flush, PAGE, setup, text, useTablePage } from "../testing/page.ts";

describe("Large tables", () => {
  useTablePage();

  const ROWS = 300;
  const LARGE = `| Name | Qty |\n|---|---|\n${Array.from({ length: ROWS }, (_, i) => `| Row ${i + 1} | ${i} |`).join("\n")}\n`;
  const widget = () => editor.querySelector<HTMLElement>(".sb-table-widget")!;
  const inDocument = () => Array.from(editor.querySelectorAll<HTMLTableRowElement>("tbody tr[data-swt-row]"));
  const info = () => controller.infoOf(widget())!;
  // The module is off by default
  const ON = { "silverware.table.modules.largeTables.enabled": true };

  it("keeps only the rows in view of a large table in the document, all of them still the table's", async () => {
    await setup(LARGE, ON);
    expect(widget().classList.contains("swt-large-table")).toBe(true);
    expect(inDocument().length).toBeGreaterThan(20);
    expect(inDocument().length).toBeLessThan(ROWS);
    // In their place, an empty row as tall as they are
    expect(editor.querySelectorAll("tbody tr.swt-large-spacer").length).toBe(2);
    expect(controller.bodyRows(info()).length).toBe(ROWS);
    expect(controller.shownRows(info()).length).toBe(ROWS + 1);
    expect(controller.cellAt(info(), { row: 250, column: 0 })!.textContent).toBe("Row 250");
  });

  it("puts a row out of view back to edit it, and a table rendered anew takes its rows out before it is laid out", async () => {
    await setup(LARGE, ON);
    const far = controller.cellAt(info(), { row: 250, column: 1 })!;
    expect(far.isConnected).toBe(false);
    controller.editCell(info(), { row: 250, column: 1 }, "replace");
    const field = editor.querySelector<HTMLInputElement>(".swt-cell-editor")!;
    expect(field.closest("tr")!.dataset.swtRow).toBe("250");
    field.value = "x";
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    for (let i = 0; i < 4; i++) await flush();
    expect(text).toContain("| Row 250 | x");
    // Rendered anew: few rows in the document again, the next row's editor among them
    await controller.scan();
    expect(inDocument().length).toBeLessThan(ROWS);
    expect(editor.querySelector(".swt-cell-editor")?.closest("tr")?.dataset.swtRow).toBe("251");
  });

  it("leaves smaller tables as they were", async () => {
    await setup(PAGE, ON);
    expect(widget().classList.contains("swt-large-table")).toBe(false);
  });

  it("leaves a table with fewer rows than the setting says as it was", async () => {
    await setup(LARGE, { ...ON, "silverware.table.modules.largeTables.minRows": 400 });
    expect(widget().classList.contains("swt-large-table")).toBe(false);
    expect(inDocument().length).toBe(ROWS);
  });

  it("leaves every table as it was with the module off, as it is by default", async () => {
    await setup(LARGE);
    expect(widget().classList.contains("swt-large-table")).toBe(false);
    expect(inDocument().length).toBe(ROWS);
  });
});
