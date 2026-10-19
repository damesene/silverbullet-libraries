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
          td.textContent = cell.replace(/\*/g, "");
        }
        tr.append(td);
      }
      (r === 0 ? thead : tbody).append(tr);
    });
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

  const setup = async (page: string, config: Record<string, unknown> = {}) => {
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
    key(editing()!, "Enter", { shiftKey: true });
    await waitFor(() => at()?.[0] === 1);
    expect(at()).toEqual([1, 1]);
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

  it("moves rows and columns with Ctrl+Shift+arrows, the editor following", async () => {
    await setup(PAGE);
    const editing = () => {
      const field = editor.querySelector<HTMLInputElement>(".tp-cell-editor")!;
      const td = field.closest("td")!;
      return { field, at: [(td.parentElement as HTMLTableRowElement).rowIndex, td.cellIndex] };
    };
    const press = async (k: string) => {
      key(editing().field, k, { ctrlKey: true, shiftKey: true });
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

  it("moves a column to the start or the end with Ctrl+Shift+Home and End", async () => {
    await setup("| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n");
    const at = () => editor.querySelector(".tp-cell-editor")!.closest("td")!.cellIndex;
    const press = async (k: string) => {
      key(editor.querySelector(".tp-cell-editor")!, k, { ctrlKey: true, shiftKey: true });
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

  it("does not move the header row, nor rows while sorted", async () => {
    await setup(PAGE);
    clickOn(cell(0, 0));
    key(editor.querySelector(".tp-cell-editor")!, "ArrowDown", { ctrlKey: true, shiftKey: true });
    await flush();
    expect(text).toBe(PAGE);
    key(editor.querySelector(".tp-cell-editor")!, "Escape");
    await flush();
    clickOn(cell(0, 0).querySelector(".tp-sort")!);
    clickOn(cell(1, 0));
    key(editor.querySelector(".tp-cell-editor")!, "ArrowDown", { ctrlKey: true, shiftKey: true });
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
});
