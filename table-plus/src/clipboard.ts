// Writing to the clipboard from a menu or a button: the Clipboard API where
// the page has it (a secure context: https, localhost), else the copy command,
// which a page opened over http has too (SilverBullet on a phone in the local
// network, where navigator.clipboard is undefined).

/**
 * Text, and an HTML version of it for spreadsheets, onto the clipboard. Called
 * from a click: without the Clipboard API the copy runs before anything is
 * awaited, while the click still lets a page copy. Throws when nothing was copied.
 */
export async function writeClipboard(doc: Document, text: string, html?: string): Promise<void> {
  const win = doc.defaultView as (Window & { ClipboardItem?: typeof ClipboardItem }) | null;
  const clipboard = win?.navigator.clipboard;
  if (!clipboard?.writeText) {
    copyCommand(doc, text, html);
    return;
  }
  try {
    if (html !== undefined && win?.ClipboardItem && clipboard.write) {
      const blob = (type: string, value: string) => new Blob([value], { type });
      await clipboard.write([new win.ClipboardItem({ "text/plain": blob("text/plain", text), "text/html": blob("text/html", html) })]);
    } else {
      await clipboard.writeText(text);
    }
  } catch (e) {
    // Refused (the document not focused, a permission): the copy command may still copy; else the refusal is what to show
    try {
      copyCommand(doc, text, html);
    } catch {
      throw e;
    }
  }
}

// The copy command running: the copy event it fires is this module's (another copy listener leaves it)
let copying = false;

/** Whether a copy event now is the one writeClipboard fires (a listener putting cells on the clipboard leaves it) */
export function copyingFromMenu(): boolean {
  return copying;
}

/**
 * The copy command on a field holding the text, selected (Safari copies only
 * with something selected); the copy event puts the HTML version beside it.
 * The focus goes back where it was.
 */
function copyCommand(doc: Document, text: string, html: string | undefined): void {
  const field = doc.createElement("textarea");
  field.value = text;
  // Read-only: no on-screen keyboard for it; out of view, not scrolled to
  field.readOnly = true;
  field.setAttribute("aria-hidden", "true");
  Object.assign(field.style, { position: "fixed", top: "0", left: "0", width: "1px", height: "1px", opacity: "0" });
  field.addEventListener("copy", (e) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/plain", text);
    if (html !== undefined) e.clipboardData.setData("text/html", html);
    e.preventDefault();
  });
  const before = doc.activeElement;
  doc.body.append(field);
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, text.length);
  let copied = false;
  copying = true;
  try {
    copied = typeof doc.execCommand === "function" && doc.execCommand("copy");
  } finally {
    copying = false;
    field.remove();
    if (before instanceof HTMLElement) before.focus({ preventScroll: true });
  }
  if (!copied) throw new Error("the browser did not copy");
}
