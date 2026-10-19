// Undo and redo of table edits, scrolled as they should be.
//
// Undo moves the editor's cursor back to where it was before an edit and
// scrolls to it. Table Plus edits away from that cursor, so before each edit
// it puts the cursor right after the table (outside it, so the table stays
// rendered) and remembers that position: an undo or redo that lands there
// undid a table edit, and the page is scrolled back to where it was.
import type { Feature, TableHost } from "../core/feature.ts";
import { EDITOR_SELECTOR } from "../dom.ts";

export class History implements Feature {
  // Editor cursor positions set before table edits
  private readonly markers = new Set<number>();

  constructor(private readonly host: TableHost) {}

  async beforeWrite(text: string, from: number, to: number): Promise<((editFrom: number, lengthChange: number) => void) | undefined> {
    const { bridge } = this.host;
    if (!bridge.setSelection) return undefined;
    const marker = to < text.length ? to + 1 : from > 0 ? from - 1 : undefined;
    if (marker === undefined) return undefined;
    await bridge.setSelection(marker, marker);
    this.remember(marker);
    // Redo restores the cursor where the edit left it: the marker, moved by the edit
    return (editFrom, lengthChange) => this.remember(marker + (marker > editFrom ? lengthChange : 0));
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
