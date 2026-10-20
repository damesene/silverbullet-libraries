// WORKAROUND: SilverBullet and the on-screen keyboard on touch screens.
//
// Not a feature: a set of countermeasures to behaviour of SilverBullet (and the
// browser) that Table Plus cannot change, kept here so it is clear what they do
// and can go once SilverBullet behaves otherwise. Verified on Android with a
// scroll log (see CLAUDE.md, "On a phone SilverBullet scrolls to its editor's
// cursor"):
//
// - SilverBullet focuses its editor when a page opens, and counts its editor as
//   focused whenever the focus is anywhere in its content, a cell editor's field
//   included. While it is, every time the on-screen keyboard shows or goes, or
//   the focus moves, it scrolls the page to its editor's cursor
//   (client/components/keyboard_bar.tsx), which is wherever the last edit left
//   it, not at the cell (it cannot be in a table: SilverBullet would show the
//   table's markdown). The browser scrolls a focused editable's caret into view
//   on a resize too.
// - The on-screen keyboard shrinks the view (SilverBullet pins its layout to the
//   area above it), which can leave the cell being edited behind it.
//
// So, on a touch screen: a touch in a table takes the focus from SilverBullet's
// editor, and the focus is not handed back to it after editing (the keyboard
// goes). Whenever the view resizes, the cell being edited is scrolled back into
// it; for a moment after a cell's editor opens or the view resizes, any scroll
// that is not the user's brings the cell back.
import { EDITOR_SELECTOR } from "../dom.ts";

// How long after a cell's editor opens or the view resizes the cell is brought
// back when something else scrolls it away (SilverBullet scrolls after React
// renders and CodeMirror measures, within a few frames; the keyboard's
// animation resizes the view several times, each starting it again)
const HOLD_MS = 600;

export type TouchKeyboardHost = {
  readonly doc: Document;
  /** Whether an event's target is in a table Table Plus enhanced */
  inTable(target: EventTarget | null): boolean;
  /** Whether a cell's editor is open */
  editing(): boolean;
  /** Scrolls the cell being edited into view, if it is not */
  revealEditing(): void;
  /**
   * The view resized while a cell is edited: a table just written is no longer
   * held in its place, which would put the cell back under the keyboard
   */
  viewResized(): void;
};

// Chromium's VirtualKeyboard API: SilverBullet has it overlay the page and shrinks its layout itself
function virtualKeyboard(win: Window): EventTarget | undefined {
  return (win.navigator as { virtualKeyboard?: EventTarget }).virtualKeyboard;
}

export class TouchKeyboard {
  // The last press was a touch: SilverBullet's editor's focus would bring up the keyboard
  private pressedByTouch = false;
  // Until when the cell being edited is brought back into view (HOLD_MS)
  private heldUntil = 0;

  constructor(private readonly host: TouchKeyboardHost) {}

  start(): void {
    const win = this.host.doc.defaultView!;
    win.addEventListener("pointerdown", this.onPointerDown, true);
    win.addEventListener("scroll", this.onScroll, true);
    for (const type of ["touchstart", "wheel", "mousedown"]) win.addEventListener(type, this.userScrolls, { capture: true, passive: true });
    win.addEventListener("resize", this.onViewResize);
    win.visualViewport?.addEventListener("resize", this.onViewResize);
    virtualKeyboard(win)?.addEventListener("geometrychange", this.onViewResize);
  }

  stop(): void {
    const win = this.host.doc.defaultView!;
    win.removeEventListener("pointerdown", this.onPointerDown, true);
    win.removeEventListener("scroll", this.onScroll, true);
    for (const type of ["touchstart", "wheel", "mousedown"]) win.removeEventListener(type, this.userScrolls, true);
    win.removeEventListener("resize", this.onViewResize);
    win.visualViewport?.removeEventListener("resize", this.onViewResize);
    virtualKeyboard(win)?.removeEventListener("geometrychange", this.onViewResize);
  }

  /** A cell's editor opened: its field's focus makes SilverBullet scroll to its cursor */
  editorOpened(): void {
    this.hold();
  }

  /**
   * Instead of handing the focus back to SilverBullet's editor after a touch:
   * let go of it (the keyboard goes). True when it did.
   */
  letGoOfFocus(): boolean {
    if (!this.pressedByTouch) return false;
    const active = this.host.doc.activeElement;
    if (active instanceof HTMLElement && active !== this.host.doc.body) active.blur();
    return true;
  }

  private hold(): void {
    this.heldUntil = Date.now() + HOLD_MS;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pressedByTouch = e.pointerType === "touch";
    // SilverBullet's editor keeps no focus under a touch in a table
    if (!this.pressedByTouch || !this.host.inTable(e.target)) return;
    const active = this.host.doc.activeElement;
    if (active instanceof HTMLElement && active.matches(EDITOR_SELECTOR)) active.blur();
  };

  // A scroll that is not the user's while the cell is held: the cell comes back
  private onScroll = (): void => {
    if (Date.now() < this.heldUntil && this.host.editing()) this.host.revealEditing();
  };

  // The user scrolls or presses (a touch, a wheel, a press on a scrollbar): the
  // page is theirs (a press that opens a cell's editor holds it again)
  private userScrolls = (): void => {
    this.heldUntil = 0;
  };

  private onViewResize = (): void => {
    if (this.host.editing()) {
      this.host.viewResized();
      this.hold();
    }
    this.host.revealEditing();
    // Once the page is laid out in its new size
    this.host.doc.defaultView!.requestAnimationFrame?.(() => this.host.revealEditing());
  };
}
