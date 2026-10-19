// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bridge } from "./bridge.ts";
import { Controller } from "./controller.ts";
import { findTables, parseTable } from "./markdown.ts";

// Renders tables the way SilverBullet does: a .sb-table-widget per table with
// data-pos on the table, its rows and cells, and a click handler that moves
// the cursor into the table (which shows its markdown)
function renderPage(text: string, editor: HTMLElement, cursorMoves: number[]): void {
  editor.replaceChildren();
  for (const range of findTables(text)) {
    const model = parseTable(range.text);
    const widget = document.createElement("span");
    widget.className = "sb-table-widget";
    widget.addEventListener("click", () => cursorMoves.push(range.from));
    const table = document.createElement("table");
    table.dataset.pos = String(range.from);
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");
    model.rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      tr.dataset.pos = String(range.from + r);
      for (const cell of row.cells) {
        // SilverBullet leaves out empty header cells
        if (r === 0 && cell === "") continue;
        const td = document.createElement("td");
        if (cell.startsWith("[[")) {
          const a = document.createElement("a");
          a.dataset.ref = cell.slice(2, -2);
          a.textContent = cell.slice(2, -2);
          td.append(a);
        } else {
          // A formula's <meta> tag is not shown
          td.textContent = cell.replace(/<meta\b[^>]*>/gi, "").replace(/\*/g, "").trim();
        }
        tr.append(td);
      }
      (r === 0 ? thead : tbody).append(tr);
    });
    // The metadata row renders too, its <meta> unseen
    if (model.meta) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.append(document.createElement("meta"));
      tr.append(td);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    widget.append(table);
    editor.append(widget);
  }
}

describe("Controller", () => {
  let text: string;
  let editor: HTMLElement;
  let cursorMoves: number[];
  let flashes: string[];
  let controller: Controller;

  // Most tests check the markdown byte for byte as written, so formatting is off
  // unless a test turns it on
  const setup = async (page: string, settings: Record<string, unknown> = {}) => {
    const config: Record<string, unknown> = { "tablePlus.autoFormat": false, ...settings };
    text = page;
    editor = document.createElement("div");
    editor.className = "cm-content";
    editor.tabIndex = 0;
    document.body.append(editor);
    cursorMoves = [];
    flashes = [];
    renderPage(text, editor, cursorMoves);
    const bridge: Bridge = {
      getText: () => text,
      replaceRange: (from, to, insert) => {
        text = text.slice(0, from) + insert + text.slice(to);
        renderPage(text, editor, cursorMoves);
      },
      moveCursor: (pos) => cursorMoves.push(pos),
      getCurrentPage: () => "Test",
      flash: (message) => flashes.push(message),
      getConfig: (path, defaultValue) => (path in config ? config[path] : defaultValue),
    };
    controller = new Controller(document, bridge);
    controller.start();
    await controller.scan();
  };

  const cell = (row: number, column: number) =>
    editor.querySelectorAll("table")[0]!.rows[row]!.cells[column]!;
  const bodyTexts = () =>
    Array.from(editor.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")).map(
      (tr) => tr.cells[0]!.textContent,
    );
  const press = (target: Element, type: string, init: MouseEventInit = {}) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
  const clickOn = (target: Element) => {
    press(target, "mousedown");
    press(target, "click");
  };
  const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    document.body.replaceChildren();
    delete (globalThis as Record<string, unknown>).__tablePlus;
  });
  afterEach(() => {
    controller?.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const PAGE = "Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| Fig | 2 |\n";

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

  it("sorts and restores the order without touching the markdown", async () => {
    await setup(PAGE);
    const sort = cell(0, 0).querySelector(".tp-sort")!;
    clickOn(sort);
    expect(bodyTexts()).toEqual(["apple", "Fig", "Pear"]);
    clickOn(sort);
    expect(bodyTexts()).toEqual(["Pear", "Fig", "apple"]);
    clickOn(sort);
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    expect(text).toBe(PAGE);
    expect(cursorMoves).toEqual([]);
  });

  it("clears the sorting with the cross next to the sort status", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const chip = document.querySelector(".tp-bar .tp-chip")!;
    expect(chip.textContent).toBe("Sorted by Name ↑");
    expect(document.querySelector(".tp-bar")!.textContent).not.toContain("Original order");
    chip.querySelector<HTMLElement>(".tp-chip-clear")!.click();
    expect(bodyTexts()).toEqual(["Pear", "apple", "Fig"]);
    expect(document.querySelector(".tp-bar .tp-chip")).toBeNull();
  });

  it("filters with number comparisons unless smart filters are off", async () => {
    const filterRows = async (config: Record<string, unknown>) => {
      controller?.stop();
      document.body.replaceChildren();
      delete (globalThis as Record<string, unknown>).__tablePlus;
      await setup(PAGE, config);
      await flush();
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button"))
        .find((b) => b.textContent === "Filter")!
        .click();
      const input = editor.querySelector<HTMLInputElement>('.tp-filter[data-tp-column="1"]')!;
      input.value = ">2";
      input.dispatchEvent(new Event("input"));
      await flush();
      return bodyTexts();
    };
    expect(await filterRows({})).toEqual(["Pear", "apple"]);
    expect(await filterRows({ "tablePlus.smartFilters": false })).toEqual([]);
  });

  it("limits the table height with the maxHeight setting", async () => {
    await setup(PAGE, { "tablePlus.maxHeight": 300 });
    await flush();
    await controller.scan();
    const widget = editor.querySelector<HTMLElement>(".sb-table-widget")!;
    expect(widget.style.maxHeight).toBe("300px");
    controller.stop();
    document.body.replaceChildren();
    await setup(PAGE, { "tablePlus.maxHeight": "nonsense" });
    await flush();
    expect(editor.querySelector<HTMLElement>(".sb-table-widget")!.style.maxHeight).toBe("");
  });

  it("re-evaluates ${…} cells once the page is indexed", async () => {
    // the fake render shows the expression source; SilverBullet would show a stale value
    await setup("| N | Sum |\n|---|---|\n| a | 1 |\n| b | ${S()} |\n| c | x ${S()} |\n");
    let sum = 42;
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.evalExpression = (e: string) =>
      e === "S()" ? sum : undefined;
    vi.useFakeTimers();
    const indexed = async (page: string) => {
      await controller.pageIndexed(page);
      await vi.advanceTimersByTimeAsync(600); // the time given to the indexers
    };
    await indexed("Other page");
    expect(cell(2, 1).textContent).toBe("${S()}");
    await indexed("Test");
    expect(cell(2, 1).textContent).toBe("42");
    expect(cell(3, 1).textContent).toBe("x ${S()}"); // not a single expression: left alone
    sum = 7;
    await indexed("Test");
    expect(cell(2, 1).textContent).toBe("7");
    vi.useRealTimers();
  });

  describe("table metadata", () => {
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
      expect(text).toBe(PAGE.replace("| Fig | 2 |\n", '| Fig | 2 |\n| <meta sort="Qty:desc"> |\n'));
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

    it("keeps the metadata row last and follows a renamed column", async () => {
      await setup(META_PAGE);
      clickOn(cell(0, 1)); // the Qty header
      editor.querySelector<HTMLInputElement>(".tp-cell-editor")!.value = "Count";
      key(editor.querySelector(".tp-cell-editor")!, "Enter");
      await flush();
      await controller.scan();
      expect(text).toBe('| Name | Count |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| <meta sort="Count:desc"> |\n');
      // a row added at the end goes above the metadata row
      clickOn(editor.querySelector('tr[data-tp-row="1"]')!.querySelector("td")!); // Pear (shown last)
      key(editor.querySelector(".tp-cell-editor")!, "Tab");
      key(editor.querySelector(".tp-cell-editor")!, "Tab");
      await flush();
      await controller.scan();
      expect(text.split("\n").slice(-3)).toEqual(["| | |", '| <meta sort="Count:desc"> |', ""]);
    });
  });

  describe("pinned rows and columns", () => {
    const openMenu = (row: number, axis: "row" | "column", column = 0) => {
      // A menu still open would be closed by the next grip click instead
      if (document.querySelector(".tp-menu")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      cell(row, column).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      const grip = document.querySelector<HTMLElement>(axis === "row" ? ".tp-grip:not(.tp-grip-column)" : ".tp-grip-column")!;
      grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
      return document.querySelector(".tp-menu")!;
    };
    const item = (menu: Element, label: string) =>
      Array.from(menu.querySelectorAll<HTMLElement>(".tp-menu-item")).find((b) => b.textContent === label)!;

    it("offers pinning only with the metadata setting", async () => {
      await setup(PAGE);
      await flush();
      const pin = item(openMenu(1, "row"), "Pin to top");
      expect(pin.getAttribute("aria-disabled")).toBe("true");
      pin.click();
      await flush();
      expect(text).toBe(PAGE);

      // a table with metadata: nothing new can be pinned, but unpinning works
      controller.stop();
      document.body.replaceChildren();
      await setup('| A |\n|---|\n| 1 |\n| 2 |\n| <meta pin-top="1"> |\n');
      await flush();
      expect(item(openMenu(2, "row"), "Pin to bottom").getAttribute("aria-disabled")).toBe("true");
      const unpin = item(openMenu(1, "row"), "Pin to top"); // checked: unpins
      expect(unpin.getAttribute("aria-disabled")).toBeNull();
      unpin.click();
      await flush();
      expect(text).toBe("| A |\n|---|\n| 1 |\n| 2 |\n");
    });

    it("moves a pinned row to the edge and keeps it there", async () => {
      await setup(PAGE, { "tablePlus.metadata": true });
      await flush();
      item(openMenu(1, "row"), "Pin to bottom").click(); // Pear
      await flush();
      await controller.scan();
      expect(text).toBe('Intro\n\n| Name | Qty |\n|---|---|\n| apple | 10 |\n| Fig | 2 |\n| Pear | 3 |\n| <meta pin-bottom="1"> |\n');
      expect(editor.querySelector("tfoot")?.textContent).toContain("Pear");

      // a row added at the end goes above it
      clickOn(cell(2, 1)); // Fig's Qty, the last unpinned row
      key(editor.querySelector(".tp-cell-editor")!, "Enter", { ctrlKey: true });
      await flush();
      await controller.scan();
      expect(text.split("\n").slice(4, 9)).toEqual(["| apple | 10 |", "| Fig | 2 |", "| | |", "| Pear | 3 |", '| <meta pin-bottom="1"> |']);

      // sorting leaves it at the bottom
      key(editor.querySelector(".tp-cell-editor")!, "Escape");
      await flush();
      clickOn(cell(0, 0).querySelector(".tp-sort")!);
      clickOn(cell(0, 0).querySelector(".tp-sort")!); // Name descending
      expect(bodyTexts()).toEqual(["Fig", "apple", "", "Pear"]);
    });

    it("disables inserting outside the pinned edges", async () => {
      await setup('| A | B |\n|---|---|\n| top | 1 |\n| mid | 2 |\n| end | 3 |\n| <meta pin-top="1" pin-bottom="1" pin-left="1"> |\n', {
        "tablePlus.metadata": true,
      });
      await flush();
      const blocked = (menu: Element, label: string) => item(menu, label).getAttribute("aria-disabled") === "true";
      let menu = openMenu(1, "row"); // "top", pinned to the top
      expect([blocked(menu, "Insert row above"), blocked(menu, "Insert row below")]).toEqual([true, false]);
      menu = openMenu(4, "row"); // "end", pinned to the bottom (in the footer, after the hidden metadata row)
      expect([blocked(menu, "Insert row above"), blocked(menu, "Insert row below")]).toEqual([false, true]);
      menu = openMenu(2, "column", 0); // A, pinned left
      expect([blocked(menu, "Insert column left"), blocked(menu, "Insert column right")]).toEqual([true, false]);
      menu = openMenu(2, "column", 1); // B, not pinned
      expect([blocked(menu, "Insert column left"), blocked(menu, "Insert column right")]).toEqual([false, false]);
    });

    it("pins a column to the left", async () => {
      await setup(PAGE, { "tablePlus.metadata": true });
      await flush();
      item(openMenu(1, "column", 1), "Pin left").click(); // Qty
      await flush();
      await controller.scan();
      expect(text).toBe('Intro\n\n| Qty | Name |\n|---|---|\n| 3 | Pear |\n| 10 | apple |\n| 2 | Fig |\n| <meta pin-left="1"> |\n');
      expect(cell(1, 0).classList.contains("tp-pin-left")).toBe(true);
    });
  });

  it("applies the sorting to the markdown, once confirmed, and ends the sorting view", async () => {
    await setup(PAGE);
    let agree = false;
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.confirm = () => agree;
    const sortQty = () => clickOn(cell(0, 1).querySelector(".tp-sort")!);
    sortQty();
    sortQty(); // Qty descending
    const applyButton = () => {
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      return document.querySelector<HTMLElement>(".tp-bar .tp-chip-apply")!;
    };
    applyButton().click(); // declined
    await flush();
    expect(text).toBe(PAGE);
    agree = true;
    applyButton().click();
    await flush();
    await controller.scan();
    expect(text).toBe("Intro\n\n| Name | Qty |\n|---|---|\n| apple | 10 |\n| Pear | 3 |\n| Fig | 2 |\n");
    expect(bodyTexts()).toEqual(["apple", "Pear", "Fig"]);
    cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.querySelector(".tp-bar .tp-chip")).toBeNull(); // no sorting view any more
  });

  it("keeps an open cell editor focused when ${…} cells are re-evaluated", async () => {
    await setup("| N | Sum |\n|---|---|\n| a | 1 |\n| b | 2 |\n| total | ${S()} |\n");
    (controller as unknown as { bridge: Record<string, unknown> }).bridge.evalExpression = () => 3;
    clickOn(cell(2, 1)); // b's Sum
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    field.value = "25";
    field.setSelectionRange(1, 1);
    vi.useFakeTimers();
    await controller.pageIndexed("Test");
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();
    expect(cell(3, 1).textContent).toBe("3");
    expect(editor.querySelector(".tp-cell-editor")).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(1);
  });

  it("sorts numbers numerically", async () => {
    await setup(PAGE);
    clickOn(cell(0, 1).querySelector(".tp-sort")!);
    expect(bodyTexts()).toEqual(["Fig", "Pear", "apple"]);
  });

  it("keeps the sort when the table is re-rendered after an edit", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    clickOn(cell(1, 0)); // shown first: apple
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    expect(field.value).toBe("apple");
    field.value = "Zucchini";
    key(field, "Enter");
    await flush();
    await controller.scan();
    expect(text).toContain("| Zucchini | 10 |");
    expect(bodyTexts()).toEqual(["Fig", "Pear", "Zucchini"]);
  });

  it("shows the markdown on Alt+click with the cursor in the clicked cell", async () => {
    await setup(PAGE);
    press(cell(2, 1), "mousedown", { altKey: true });
    press(cell(2, 1), "click", { altKey: true });
    await flush();
    expect(cursorMoves.length).toBe(1);
    expect(text.slice(cursorMoves[0])).toMatch(/^10 \|/);
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
  });

  it("leaves link clicks to SilverBullet", async () => {
    await setup("| Page |\n|---|\n| [[Other]] |\n");
    const link = editor.querySelector("a[data-ref]")!;
    clickOn(link);
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    expect(cursorMoves.length).toBe(1);
  });

  it("refuses to save when the table changed underneath", async () => {
    await setup(PAGE);
    clickOn(cell(1, 0));
    text = text.replace("| Pear | 3 |", "| Plum | 3 |");
    const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
    field.value = "Kiwi";
    key(field, "Enter");
    await flush();
    expect(text).not.toContain("Kiwi");
    expect(flashes.length).toBe(1);
  });

  it("opens a row menu from the row grip and runs its actions", async () => {
    await setup(PAGE);
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    expect(grip.classList.contains("tp-visible")).toBe(true);
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    const menu = document.querySelector(".tp-menu")!;
    expect(menu.querySelector(".tp-menu-title")?.textContent).toBe("Row 2");
    const item = Array.from(menu.querySelectorAll<HTMLElement>(".tp-menu-item")).find(
      (b) => b.textContent === "Duplicate row",
    )!;
    item.click();
    await flush();
    expect(text).toBe(
      "Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| apple | 10 |\n| Fig | 2 |\n",
    );
    expect(document.querySelector(".tp-menu")).toBeNull();
  });

  it("blocks moving rows while sorted", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    cell(2, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const grip = document.querySelector<HTMLElement>(".tp-grip:not(.tp-grip-column)")!;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
    const moveUp = Array.from(document.querySelectorAll<HTMLElement>(".tp-menu-item")).find(
      (b) => b.textContent === "Move up",
    )!;
    expect(moveUp.getAttribute("aria-disabled")).toBe("true");
    moveUp.click();
    await flush();
    expect(text).toBe(PAGE);
  });

  it("offers to name unnamed columns instead of enhancing a shifted table", async () => {
    await setup("| A | | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(editor.querySelector(".sb-table-widget")!.classList.contains("tp-table")).toBe(false);
    const button = editor.querySelector<HTMLElement>(".tp-notice button")!;
    button.click();
    await flush();
    expect(text).toBe("| A | Column 2 | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    expect(cursorMoves).toEqual([]);
    await controller.scan();
    expect(editor.querySelector(".sb-table-widget")!.classList.contains("tp-table")).toBe(true);
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

  it("stays out of the way when tables render without positions", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await setup(PAGE);
    document.body.replaceChildren();
    editor.replaceChildren();
    document.body.append(editor);
    renderPage(PAGE, editor, cursorMoves);
    for (const el of Array.from(editor.querySelectorAll("[data-pos]"))) el.removeAttribute("data-pos");
    await controller.scan();
    await controller.scan();
    clickOn(cell(1, 0));
    expect(editor.querySelector(".tp-cell-editor")).toBeNull();
    expect(cursorMoves.length).toBe(1);
    expect(flashes.length).toBe(1);
  });

  describe("formulas", () => {
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
      const buttons = () => Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button")).map((b) => b.textContent);
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      const recalc = Array.from(document.querySelectorAll<HTMLElement>(".tp-bar button")).find(
        (b) => b.textContent === "Recalculate",
      )!;
      recalc.click();
      await flush();
      await controller.scan();
      expect(text).toContain('| Total | 14 <meta f="=SUM([Qty])"> |');
      cell(1, 0).dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      expect(buttons()).not.toContain("Recalculate");
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

      it("puts the reference back when a drag is cancelled with Esc", async () => {
        await setup(TOTAL);
        clickOn(cell(3, 1));
        field().value = "=[Qty]";
        field().dispatchEvent(new Event("input"));
        expect(marks().length).toBe(1);
        pointer(marks()[0]!.querySelector(".tp-ref-left")!, "pointerdown", 150, 30);
        pointer(window, "pointermove", 50, 30);
        expect(field().value).toBe("=[Name]");
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        expect(field().value).toBe("=[Qty]");
        expect(document.querySelector(".tp-cell-editor")).not.toBeNull();
      });
    });
  });
});
