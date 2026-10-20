// Everything Table Plus assumes about SilverBullet's rendered tables lives here,
// so a SilverBullet update that changes it has one place to fix.

// The element SilverBullet renders a markdown table into
export const WIDGET_SELECTOR = ".sb-table-widget";

// CodeMirror's editable area: focusing it hands the keyboard back to the editor
export const EDITOR_SELECTOR = ".cm-content";

// CodeMirror's scroller: the page's view, below SilverBullet's top bar, even
// while the page is too short to scroll
export const SCROLLER_SELECTOR = ".cm-scroller";

// Elements inside a table with SilverBullet's own click behaviour (links,
// mentions, command buttons, extended task states); their clicks are left alone
export const NATIVE_ACTION_SELECTOR =
  "a[data-ref], [data-mention-name], button[data-onclick], span.sb-task-state";

// Other interactive elements: they keep their default action, but the click
// does not reach SilverBullet's "click shows the markdown" handler
export const INTERACTIVE_SELECTOR = "a, button, input, select, textarea, label";

// Elements Table Plus adds into a rendered table
export const UI_CLASS = "tp-ui";

// Those of them in a header cell that sit out of its line (positioned at the
// cell's edge: the pin mark, a module's handle): the header's layout leaves them where they are
export const OUT_OF_LINE_CLASS = "tp-out-of-line";

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

// A header's hashtag that gives its column a type (features/types.ts): hidden, not part of its name
export const TYPE_TAG_CLASS = "tp-type-tag";

/** A cell's text as shown, without anything Table Plus added (or hid), wherever in the cell it is */
export function cellText(cell: Element): string {
  let text = "";
  const walk = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node instanceof Element && (node.classList.contains(UI_CLASS) || node.classList.contains(TYPE_TAG_CLASS))) continue;
      if (node.nodeType === 3) text += node.textContent ?? "";
      else walk(node);
    }
  };
  walk(cell);
  return text.replace(/\s+/g, " ").trim();
}

// A header's content on one line: its name (cut with an ellipsis where it does
// not fit) and the icons after it (its type's, the filter mark, the sort
// control), which always show
export const HEAD_CLASS = "tp-head";
const HEAD_NAME_CLASS = "tp-head-name";

/**
 * Lays a header cell out on one line: its name in a box that the CSS cuts
 * with an ellipsis, the icons after it (Table Plus' inline elements) beside
 * it, both in a box no wider than the column may be. Done once per rendering.
 */
export function layOutHeaderCell(cell: HTMLTableCellElement): void {
  if (cell.querySelector(`:scope > .${HEAD_CLASS}`)) return;
  const doc = cell.ownerDocument;
  const head = doc.createElement("span");
  head.className = HEAD_CLASS;
  const name = doc.createElement("span");
  name.className = HEAD_NAME_CLASS;
  head.append(name);
  for (const node of Array.from(cell.childNodes)) {
    const ui = node instanceof Element && node.classList.contains(UI_CLASS);
    if (ui && (node as Element).classList.contains(OUT_OF_LINE_CLASS)) continue;
    (ui ? head : name).append(node);
  }
  cell.prepend(head);
}

/**
 * A cell's value for sorting, filtering and copying: what a column type
 * keeps of it (data-tp-value), else its text as shown
 */
export function cellValue(cell: HTMLElement): string {
  return cell.dataset.tpValue ?? cellText(cell);
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
