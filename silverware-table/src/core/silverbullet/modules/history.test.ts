// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { findTables } from "../../../markdown.ts";
import { cell, controller, flush, pointInsert, setup, setText, text, useTablePage, tableKey } from "../../../testing/page.ts";

describe("History markers", () => {
  useTablePage();

  // The editor's cursor as CodeMirror keeps it through an edit: before an
  // insertion at its place (assoc -1), after a change before it
  let cursor = 0;
  const editor = {
    setSelection: (from: number) => {
      cursor = from;
    },
  };
  const following = () => {
    const bridge = controller.bridge as { replaceRange: (from: number, to: number, insert: string) => unknown };
    const replace = bridge.replaceRange.bind(bridge);
    bridge.replaceRange = (from, to, insert) => {
      if (cursor > from || (cursor === from && to > from)) cursor = Math.max(from, cursor + insert.length - (to - from));
      return replace(from, to, insert);
    };
  };
  const outsideTables = () => findTables(text).every((range) => cursor < range.from || cursor > range.to);

  // The edit then inserts right after the table, where the cursor would be
  it.each([
    ["text above it: the cursor goes before the table", "Intro\n\n"],
    ["at the page's start: the cursor goes after the row added", ""],
  ])("keeps the editor's cursor out of the table when a row is added at its end (the last row empty), %s", async (_, above) => {
    await setup(`${above}| A |\n|---|\n| 1 |\n| |\n\nEnd.\n`, {}, editor);
    following();
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    pointInsert({ key: tableKey(), axis: "row", at: 3, beside: { after: 2 } });
    document.querySelector<HTMLElement>(".swt-insert")!.click();
    await flush();
    await controller.scan();
    expect(text).toBe(`${above}| A |\n|---|\n| 1 |\n| |\n| |\n\nEnd.\n`);
    expect(outsideTables()).toBe(true);
  });

  it("keeps it right after the table for an edit inside it", async () => {
    await setup("Intro\n\n| A |\n|---|\n| 1 |\n\nEnd.\n", { "silverware.table.editor.enterKey": "save" }, editor);
    following();
    setText(text);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    pointInsert({ key: tableKey(), axis: "row", at: 1, beside: { before: 1 } });
    document.querySelector<HTMLElement>(".swt-insert")!.click();
    await flush();
    expect(text).toBe("Intro\n\n| A |\n|---|\n| |\n| 1 |\n\nEnd.\n");
    // After the table: the blank line under it
    expect(cursor).toBe(text.indexOf("\n\nEnd") + 1);
    expect(outsideTables()).toBe(true);
  });
});
