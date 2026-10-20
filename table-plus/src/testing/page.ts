// A page for testing Table Plus in jsdom: tables rendered the way SilverBullet
// renders them, a bridge over the page's text, and helpers to click and type.
// Test files call useTablePage() inside their describe; the page's state is
// exported as live bindings, so `text` is always the page's current text.
import { afterEach, beforeEach, vi } from "vitest";
import type { Bridge } from "../bridge.ts";
import { Controller } from "../controller.ts";
import { findTables, parseTable } from "../markdown.ts";

export let text: string;
export let editor: HTMLElement;
export let cursorMoves: number[];
export let flashes: string[];
export let controller: Controller;

export const PAGE = "Intro\n\n| Name | Qty |\n|---|---|\n| Pear | 3 |\n| apple | 10 |\n| Fig | 2 |\n";

/** Changes the page's text behind Table Plus' back, as an edit elsewhere would */
export function setText(next: string): void {
  text = next;
}

// Renders tables the way SilverBullet does: a .sb-table-widget per table with
// data-pos on the table, its rows and cells, and a click handler that moves
// the cursor into the table (which shows its markdown)
export function renderPage(page: string, into: HTMLElement, moves: number[]): void {
  into.replaceChildren();
  for (const range of findTables(page)) {
    const model = parseTable(range.text);
    const widget = document.createElement("span");
    widget.className = "sb-table-widget";
    widget.addEventListener("click", () => moves.push(range.from));
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
          // A formula's <meta> tag is not shown; hashtags are links, as SilverBullet renders them
          const shown = cell.replace(/<meta\b[^>]*>/gi, "").replace(/\*/g, "").trim();
          for (const part of shown.split(/((?:^|(?<=\s))#[^\s#]+)/)) {
            if (!part.startsWith("#")) {
              if (part) td.append(part);
              continue;
            }
            const tag = document.createElement("a");
            tag.className = "hashtag sb-hashtag";
            tag.dataset.tagName = part.slice(1);
            tag.dataset.ref = `tag:${part.slice(1)}`;
            tag.textContent = part;
            td.append(tag);
          }
        }
        tr.append(td);
      }
      (r === 0 ? thead : tbody).append(tr);
    });
    // The metadata row renders too, its <meta> unseen
    if (model.meta) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      // With its attributes, as SilverBullet renders it (verified)
      const meta = document.createElement("meta");
      for (const [name, value] of Object.entries(model.meta)) meta.setAttribute(name, value);
      td.append(meta);
      tr.append(td);
      tbody.append(tr);
    }
    table.append(thead, tbody);
    widget.append(table);
    into.append(widget);
  }
}

// Most tests check the markdown byte for byte as written, so formatting is off
// unless a test turns it on
export async function setup(page: string, settings: Record<string, unknown> = {}, bridgeExtras: Partial<Bridge> = {}): Promise<void> {
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
    ...bridgeExtras,
  };
  controller = new Controller(document, bridge);
  controller.start();
  await controller.scan();
  // The settings are read asynchronously: tests start once they are
  await flush();
}

/** A fresh page for each test, and Table Plus stopped after it */
export function useTablePage(): void {
  beforeEach(() => {
    document.body.replaceChildren();
    delete (globalThis as Record<string, unknown>).__tablePlus;
    // Most tests edit with a click: edit mode (select mode is the default in a browser that kept nothing)
    localStorage.setItem("tablePlus.editMode", "on");
  });
  afterEach(() => {
    controller?.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
}

export const cell = (row: number, column: number) => editor.querySelectorAll("table")[0]!.rows[row]!.cells[column]!;

export const bodyTexts = () =>
  Array.from(editor.querySelectorAll<HTMLTableRowElement>("tr[data-tp-row]:not(.tp-hidden)")).map((tr) => tr.cells[0]!.textContent);

export const press = (target: Element, type: string, init: MouseEventInit = {}) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));

export const clickOn = (target: Element) => {
  press(target, "mousedown");
  press(target, "click");
};

export const key = (target: Element, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** An item of the toolbar's ⋯ menu, by its label, the menu opened over the first body row of table `table` */
export function tableMenuItem(label: RegExp, table = 0): HTMLElement | undefined {
  editor.querySelectorAll("table")[table]!.rows[1]!.cells[0]!.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
  if (!document.querySelector(".tp-menu")) document.querySelector<HTMLElement>(".tp-bar .tp-bar-more")!.click();
  return Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item")).find((b) => label.test(b.textContent!));
}

/** An item of the menu of a cell (or of the cells selected), by its label, the menu opened with a right click on it */
export function cellMenuItem(target: Element, label: RegExp): HTMLElement | undefined {
  if (document.querySelector(".tp-menu")) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
  return Array.from(document.querySelectorAll<HTMLElement>(".tp-menu .tp-menu-item")).find((b) => label.test(b.textContent!));
}
