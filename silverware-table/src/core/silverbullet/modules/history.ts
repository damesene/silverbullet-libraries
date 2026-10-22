// Undo and redo of table edits, scrolled as they should be.
//
// Undo moves the editor's cursor back to where it was before an edit and
// scrolls to it. Silverware Table edits away from that cursor, so before each edit
// it puts the cursor right after the table (outside it, so the table stays
// rendered) and remembers that position: an undo or redo that lands there
// undid a table edit, and the page is scrolled back to where it was. An edit
// that starts right there (a row added at the end, nothing else changed)
// would leave the cursor before what it inserts, in the table, which then
// shows its markdown: the cursor goes right before the table instead.
import type { Feature, TableHost } from "../../feature.ts";
import { EDITOR_SELECTOR } from "../../../dom.ts";

export class History implements Feature {
  // Editor cursor positions set before table edits
  private readonly markers = new Set<number>();

  constructor(private readonly host: TableHost) {}

  async beforeWrite(
    text: string,
    from: number,
    to: number,
    change: { readonly from: number; readonly to: number },
  ): Promise<((editFrom: number, lengthChange: number) => void) | undefined> {
    const { bridge } = this.host;
    if (!bridge.setSelection) return undefined;
    // Right after the table, else right before it; one the edit does not reach first
    const places = [to < text.length ? to + 1 : undefined, from > 0 ? from - 1 : undefined].filter((p) => p !== undefined);
    const reached = (p: number) => p >= change.from && p <= change.to;
    const marker = places.find((p) => !reached(p)) ?? places[0];
    if (marker === undefined) return undefined;
    await bridge.setSelection(marker, marker);
    // None it does not reach (a table at the page's start, a row added at its end): after the edit, after what it inserted
    const moveAfter = reached(marker);
    if (!moveAfter) this.remember(marker);
    // Redo restores the cursor where the edit left it: the marker, moved by the edit
    return (editFrom, lengthChange) => {
      const moved = marker + (moveAfter || marker > editFrom ? lengthChange : 0);
      if (moveAfter) void bridge.setSelection!(moved, moved);
      this.remember(moved);
    };
  }

  keyDown(e: KeyboardEvent): boolean {
    const { bridge } = this.host;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.toLowerCase();
    const step = mod && key === "z" ? (e.shiftKey ? "redo" : "undo") : mod && key === "y" && !e.shiftKey ? "redo" : undefined;
    const inEditor = e.target instanceof Element && !!e.target.closest(EDITOR_SELECTOR);
    if (!step || !inEditor || !bridge[step] || !bridge.getCursor) return false;
    e.preventDefault();
    e.stopPropagation();
    void this.step(step);
    return true;
  }

  private remember(marker: number): void {
    this.markers.add(marker);
    if (this.markers.size > 500) this.markers.delete(this.markers.values().next().value!);
  }

  private async step(step: "undo" | "redo"): Promise<void> {
    const { bridge, doc } = this.host;
    const editor = doc.querySelector<HTMLElement>(EDITOR_SELECTOR);
    const scroller = editor && this.host.scrollParentOf(editor);
    const top = scroller?.scrollTop;
    await bridge[step]!();
    const cursor = await bridge.getCursor!();
    if (!scroller || top === undefined || !this.markers.has(cursor)) return;
    // After the editor's own scroll, which runs in the next animation frame
    const restore = () => {
      scroller.scrollTop = top;
    };
    const win = doc.defaultView!;
    restore();
    if (!win.requestAnimationFrame) return;
    win.requestAnimationFrame(() => {
      restore();
      win.requestAnimationFrame(restore);
    });
  }
}
