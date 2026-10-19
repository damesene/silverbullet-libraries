// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PAGE, bodyTexts, cell, clickOn, controller, editor, flashes, flush, key, setup, text, useTablePage } from "../testing/page.ts";

describe("Table metadata", () => {
  useTablePage();

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const META_PAGE = '| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| <meta sort="Qty:desc"> |\n';

  it("does not change the table when sorting with the setting off", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    await wait(450);
    expect(text).toBe(PAGE);
  });

  it("stores the sorting with the setting on, only where the clicks end", async () => {
    await setup(PAGE, { "tablePlus.metadata": true });
    clickOn(cell(0, 1).querySelector(".tp-sort")!); // Qty ascending
    clickOn(cell(0, 1).querySelector(".tp-sort")!); // Qty descending
    await wait(450);
    await controller.scan();
    expect(text).toBe(PAGE.replace("| Fig | 2 |\n", '| Fig | 2 |\n| <meta sort="qty:desc"> |\n'));
    expect(bodyTexts()).toEqual(["apple", "Pear", "Fig"]);
    clickOn(cell(0, 1).querySelector(".tp-sort")!); // back to the order as written
    await wait(450);
    expect(text).toBe(PAGE);
  });

  it("hides the metadata row and uses its sorting as the first view", async () => {
    await setup(META_PAGE);
    expect(bodyTexts()).toEqual(["apple", "Pear"]);
    const rows = editor.querySelectorAll("table tr");
    expect(rows[rows.length - 1]!.classList.contains("tp-meta-row")).toBe(true);
  });

  it("keeps updating a table's metadata with the setting off", async () => {
    await setup(META_PAGE); // the setting is off; the table stores Qty descending
    clickOn(cell(0, 1).querySelector(".tp-sort")!); // Qty: descending → the order as written
    await wait(450);
    // the stored sorting is cleared, and the row, now empty, goes
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n");
  });

  it("removes a table's metadata from its toolbar, and of all tables with the command", async () => {
    await setup(META_PAGE);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const remove = Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button")).find(
      (b) => b.textContent === "Remove metadata",
    )!;
    let agree = false;
    const questions: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      questions.push(message);
      return agree;
    };
    remove.click(); // declined: nothing changes
    await flush();
    expect(text).toBe(META_PAGE);
    expect(questions[0]).toContain("this table's metadata");
    agree = true;
    remove.click();
    await flush();
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n");

    controller.stop();
    document.body.replaceChildren();
    await setup(`${META_PAGE}\n${META_PAGE.replace("Qty:desc", "Name:asc")}`);
    const asked: string[] = [];
    let answer = false;
    const bridge = (controller as unknown as { bridge: Record<string, unknown> }).bridge;
    bridge.confirm = (message: string) => {
      asked.push(message);
      return answer;
    };
    await controller.removeAllMetadata(); // declined: nothing changes
    expect(text).toContain("<meta");
    expect(asked[0]).toContain("all 2 tables on this page");
    answer = true;
    await controller.removeAllMetadata();
    expect(text).not.toContain("<meta");
    expect(flashes).toEqual(["Table Plus: removed the metadata of 2 table(s)"]);
  });

  it("shows the rows as written once the metadata with their sorting is removed", async () => {
    await setup(META_PAGE);
    expect(bodyTexts()).toEqual(["apple", "Pear"]); // stored: Qty descending
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => true;
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button"))
      .find((b) => b.textContent === "Remove metadata")!
      .click();
    await flush();
    await controller.scan();
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n");
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
    expect(cell(0, 1).querySelector(".tp-sort")!.textContent).toBe("⇅");

    // The same with the command for the whole page
    controller.stop();
    document.body.replaceChildren();
    await setup(META_PAGE);
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => true;
    await controller.removeAllMetadata();
    await controller.scan();
    expect(bodyTexts()).toEqual(["Pear", "apple"]);
  });

  it("removes formulas with the metadata, keeping their results, and says so", async () => {
    const page = '| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Total | 3 <meta f="=SUM([Qty])"> |\n| <meta sort="Qty:desc"> |\n';
    await setup(page);
    const questions: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      questions.push(message);
      return true;
    };
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button"))
      .find((b) => b.textContent === "Remove metadata")!
      .click();
    await flush();
    expect(questions[0]).toContain("its stored settings (sorting, pinning), and its 1 formula: those cells keep their current results");
    expect(text).toBe("| Name | Qty |\n|---|---|\n| Pear | 3 |\n| Total | 3 |\n");

    // A table with formulas only: the button shows, and the command counts it
    controller.stop();
    document.body.replaceChildren();
    await setup('| A |\n|---|\n| 1 |\n| 2 <meta f="=A1*2"> |\n');
    const asked: string[] = [];
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = (message: string) => {
      asked.push(message);
      return true;
    };
    await controller.removeAllMetadata();
    expect(asked[0]).toContain("the 1 table on this page, including 1 formula (those cells keep their current results");
    expect(text).toBe("| A |\n|---|\n| 1 |\n| 2 |\n");
  });

  it("keeps the metadata row last and follows a renamed column", async () => {
    await setup(META_PAGE);
    clickOn(cell(0, 1)); // the Qty header
    editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "Count";
    key(editor.querySelector(".tp-cell-editor")!, "Enter");
    await flush();
    await controller.scan();
    expect(text).toBe('| Name | Count |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| <meta sort="count:desc"> |\n');
    // a row added at the end goes above the metadata row
    clickOn(editor.querySelector('tr[data-tp-row="1"]')!.querySelector("td")!); // Pear (shown last)
    key(editor.querySelector(".tp-cell-editor")!, "Tab");
    key(editor.querySelector(".tp-cell-editor")!, "Tab");
    await flush();
    await controller.scan();
    expect(text.split("\n").slice(-3)).toEqual(["| | |", '| <meta sort="count:desc"> |', ""]);
  });
});
