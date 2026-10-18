// Everything Table Plus assumes about SilverBullet's rendered tables lives here,
// so a SilverBullet update that changes it has one place to fix.

// The element SilverBullet renders a markdown table into
export const WIDGET_SELECTOR = ".sb-table-widget";

// CodeMirror's editable area: focusing it hands the keyboard back to the editor
export const EDITOR_SELECTOR = ".cm-content";

// Elements inside a table with SilverBullet's own click behaviour (links,
// mentions, command buttons, extended task states); their clicks are left alone
export const NATIVE_ACTION_SELECTOR =
  "a[data-ref], [data-mention-name], button[data-onclick], span.sb-task-state";

// Other interactive elements: they keep their default action, but the click
// does not reach SilverBullet's "click shows the markdown" handler
export const INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label";

// Elements Table Plus adds into a rendered table
export const UI_CLASS = "tp-ui";

export function renderedTable(widget: Element): HTMLTableElement | null {
  return widget.querySelector("table");
}

/**
 * Document position of a rendered table. SilverBullet renders tables with
 * `data-pos` on the table, its rows and cells; a table at the very start of a
 * page has no position on the table itself, so its rows are tried too.
 */
export function positionHint(table: HTMLTableElement): number | undefined {
  const element = table.dataset.pos !== undefined ? table : table.querySelector("[data-pos]");
  const pos = element instanceof HTMLElement ? Number(element.dataset.pos) : NaN;
  return Number.isFinite(pos) ? pos : undefined;
}

/** A cell's text as shown, without anything Table Plus added */
export function cellText(cell: Element): string {
  let text = "";
  for (const node of Array.from(cell.childNodes)) {
    if (node instanceof Element && node.classList.contains(UI_CLASS)) continue;
    text += node.textContent ?? "";
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * How many characters of a cell's shown text (whitespace collapsed, as in
 * `cellText`) lie before the point (x, y), or undefined if unknown.
 */
export function caretTextOffset(cell: Element, x: number, y: number): number | undefined {
  const doc = cell.ownerDocument;
  let node: Node | undefined;
  let offset = 0;
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    node = position?.offsetNode;
    offset = position?.offset ?? 0;
  } else if (typeof doc.caretRangeFromPoint === "function") {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer;
    offset = range?.startOffset ?? 0;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE || !cell.contains(node)) return undefined;
  let before = "";
  const walker = doc.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (text.parentElement?.closest(`.${UI_CLASS}`)) continue;
    if (text === node) {
      before += (text.textContent ?? "").slice(0, offset);
      break;
    }
    before += text.textContent ?? "";
  }
  return before.replace(/\s+/g, " ").trimStart().length;
}
