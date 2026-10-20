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

// The last word of a header's name, kept on one line with the icons after it
export const KEEP_CLASS = "tp-keep";

/**
 * Keeps the icons after a header's name (its type's icon, the sort control) on
 * the line of the name's last word: a narrow column wraps the name between
 * words, never the icons onto a line of their own. Done once per rendering.
 */
export function keepIconsWithName(cell: HTMLTableCellElement): void {
  if (cell.querySelector(`:scope > .${KEEP_CLASS}`)) return;
  const nodes = Array.from(cell.childNodes);
  let last = nodes.length - 1;
  while (last >= 0 && !(nodes[last]!.nodeType === 3 && nodes[last]!.textContent!.trim() !== "")) last--;
  // A name that ends in markup (a link, emphasis) is left as it is
  if (last < 0) return;
  // The pin mark sits out of the line, at the cell's edge
  const after = nodes.slice(last + 1).filter((n) => !(n instanceof Element && n.classList.contains("tp-pin-mark")));
  if (!after.some((n) => n instanceof Element && n.classList.contains(UI_CLASS))) return;
  const text = nodes[last] as Text;
  const word = /\S+\s*$/.exec(text.data)!;
  const keep = cell.ownerDocument.createElement("span");
  keep.className = KEEP_CLASS;
  keep.append(text.data.slice(word.index), ...after);
  text.data = text.data.slice(0, word.index);
  cell.insertBefore(keep, text.nextSibling);
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
