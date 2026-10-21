// A feature's modal dialog (TableHost.openDialog): over the page, in the
// look of Table Plus' settings dialog. Its keys and presses are its own (the
// controller leaves them: not a selected cell's, not SilverBullet's), Tab
// stays in it, Esc or a press on the backdrop closes it, and the focus goes
// back where it was. The cell editor stays open meanwhile: its field losing
// the focus to the dialog is not leaving it (CellEditing asks `isOpen`).
import { UI_CLASS } from "../dom.ts";
import { ICONS } from "../icons.ts";

export type DialogOptions = {
  readonly title: string;
  // A line under the title (what the dialog is for)
  readonly subtitle?: string;
  // A class of the dialog's box, for its own look
  readonly className?: string;
  readonly content: HTMLElement;
  // Buttons under the content
  readonly footer?: HTMLElement;
  // The element to focus first (else the dialog itself)
  readonly focus?: HTMLElement;
  // Closed, whichever way
  readonly closed?: () => void;
};

export type Dialog = { readonly element: HTMLElement; close(): void };

export class Dialogs {
  private shown: { readonly backdrop: HTMLElement; readonly returnFocus: Element | null; readonly closed?: () => void } | undefined;

  constructor(private readonly doc: Document) {}

  get isOpen(): boolean {
    return !!this.shown?.backdrop.isConnected;
  }

  /** Whether a node is the open dialog's */
  contains(node: Node): boolean {
    return !!this.shown?.backdrop.contains(node);
  }

  open(options: DialogOptions): Dialog {
    this.close();
    const { doc } = this;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
      const e = doc.createElement(tag);
      e.className = className;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const backdrop = el("div", `${UI_CLASS} tp-dialog-backdrop`);
    const dialog = el("div", `tp-dialog${options.className ? ` ${options.className}` : ""}`);
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", options.title);
    dialog.tabIndex = -1;
    const head = el("div", "tp-dialog-head");
    const titles = el("div", "tp-dialog-titles");
    titles.append(el("h2", "tp-dialog-title", options.title));
    if (options.subtitle) titles.append(el("p", "tp-dialog-subtitle", options.subtitle));
    const close = el("button", "tp-dialog-close");
    close.type = "button";
    close.title = "Close (Esc)";
    close.setAttribute("aria-label", close.title);
    close.innerHTML = ICONS.clear;
    close.addEventListener("click", () => this.close());
    head.append(titles, close);
    const body = el("div", "tp-dialog-body");
    body.append(options.content);
    dialog.append(head, body);
    if (options.footer) {
      const foot = el("div", "tp-dialog-foot");
      foot.append(options.footer);
      dialog.append(foot);
    }
    backdrop.append(dialog);
    backdrop.addEventListener("keydown", (e) => this.onKeyDown(e, dialog));
    // A press beside the dialog closes it; one in it stays in it
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        this.close();
      }
    });
    this.shown = { backdrop, returnFocus: doc.activeElement, ...(options.closed ? { closed: options.closed } : {}) };
    doc.body.append(backdrop);
    (options.focus ?? dialog).focus({ preventScroll: true });
    return { element: dialog, close: () => this.close() };
  }

  close(): void {
    const shown = this.shown;
    if (!shown) return;
    this.shown = undefined;
    shown.backdrop.remove();
    if (shown.returnFocus instanceof HTMLElement && shown.returnFocus.isConnected) shown.returnFocus.focus({ preventScroll: true });
    shown.closed?.();
  }

  // Esc closes; Tab stays in the dialog; no key goes on to the page
  private onKeyDown(e: KeyboardEvent, dialog: HTMLElement): void {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")).filter(
      (f) => !(f as HTMLButtonElement).disabled && f.offsetParent !== null,
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = this.doc.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
