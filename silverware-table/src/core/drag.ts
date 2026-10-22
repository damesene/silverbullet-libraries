// A drag followed for a feature (TableHost.drag), in model terms: where the
// pointer is, what it is on and the cell of the drag's table under it (the
// nearest one, `clamp`, when it is past the table), as it moves and when it is
// let go. Near an edge of what shows the table, that scrolls (`autoscroll`),
// and a pointer held still there goes on (`repeat`). Esc, the window left or a
// cancelled touch cancel it. What the pointer is on comes from the adapter.
import type { CellRef, DragOptions, DragPoint, PointerTarget, WidgetInfo } from "./feature.ts";

export type DragContext = {
  readonly doc: Document;
  /** What an event's target is; what is at a point of the window */
  targetOf(target: EventTarget | null): PointerTarget;
  targetAt(x: number, y: number): PointerTarget;
  /** The table with a key as shown now */
  tableFor(key: string): WidgetInfo | undefined;
  cellNear(info: WidgetInfo, x: number, y: number): CellRef | undefined;
  scrollNear(info: WidgetInfo, x: number, y: number, sideways: boolean): void;
  pageMark(mark: string, on: boolean): void;
};

// A pointer held still near an edge: the drag goes on this often (it scrolls on)
const REPEAT_MS = 50;

/** Follows a drag from its press; returns what ends it early (nothing more is told then) */
export function followDrag(context: DragContext, start: MouseEvent | PointerEvent, options: DragOptions): () => void {
  const win = context.doc.defaultView!;
  let at = { x: start.clientX, y: start.clientY, ctrl: start.ctrlKey || start.metaKey };
  // A mouse's events come from what is under it; a touch's from what it pressed (found by the point then)
  const byEvents = options.events === "mouse" && !options.byPoint;
  let over: EventTarget | null = byEvents ? start.target : null;
  let moved = false;
  let ended = false;

  const point = (): DragPoint => {
    const target = over ? context.targetOf(over) : context.targetAt(at.x, at.y);
    let cell: CellRef | undefined;
    if ((target.kind === "cell" || target.kind === "outline" || target.kind === "handle") && target.key === options.key) {
      cell = { row: target.row, column: target.column };
    } else if (options.clamp) {
      const info = context.tableFor(options.key);
      cell = info && context.cellNear(info, at.x, at.y);
    }
    return { ...at, target, cell };
  };

  const moveTo = (x: number, y: number, ctrl: boolean) => {
    at = { x, y, ctrl };
    moved = true;
    const info = context.tableFor(options.key);
    if (options.autoscroll && info) context.scrollNear(info, x, y, options.sideways ?? true);
    options.onMove(point());
  };

  const onMove = (e: MouseEvent) => {
    // A mouse let go outside the window: no mouseup came
    if (options.events === "mouse" && e.buttons === 0) {
      finish(false);
      return;
    }
    if (byEvents) over = e.target;
    moveTo(e.clientX, e.clientY, e.ctrlKey || e.metaKey);
  };
  const onUp = (e: MouseEvent) => {
    at = { x: e.clientX, y: e.clientY, ctrl: e.ctrlKey || e.metaKey };
    if (byEvents) over = e.target;
    finish(false);
  };
  const onCancel = () => finish(true);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && options.escape) {
      if (e.type !== "keydown") return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
      return;
    }
    // Ctrl pressed or let go on the way (a move becomes a copy)
    if (e.key === "Control" || e.key === "Meta") at = { ...at, ctrl: e.type === "keydown" };
    options.onKey?.(e);
  };

  const [move, up] = options.events === "mouse" ? (["mousemove", "mouseup"] as const) : (["pointermove", "pointerup"] as const);
  const timer = options.repeat
    ? win.setInterval(() => {
        if (moved) moveTo(at.x, at.y, at.ctrl);
      }, REPEAT_MS)
    : undefined;

  const stop = () => {
    if (ended) return;
    ended = true;
    if (timer !== undefined) win.clearInterval(timer);
    win.removeEventListener(move, onMove as EventListener, true);
    win.removeEventListener(up, onUp as EventListener, true);
    win.removeEventListener("pointercancel", onCancel, true);
    win.removeEventListener("keydown", onKey, true);
    win.removeEventListener("keyup", onKey, true);
    win.removeEventListener("blur", onCancel);
    if (options.pageMark) context.pageMark(options.pageMark, false);
  };
  const finish = (cancelled: boolean) => {
    if (ended) return;
    const end = point();
    stop();
    options.onEnd(end, cancelled);
  };

  win.addEventListener(move, onMove as EventListener, true);
  win.addEventListener(up, onUp as EventListener, true);
  win.addEventListener("pointercancel", onCancel, true);
  // Keys only for a drag that hears them: a press that may become a drag leaves them to the cell editor it opened
  if (options.escape || options.onKey) {
    win.addEventListener("keydown", onKey, true);
    win.addEventListener("keyup", onKey, true);
  }
  win.addEventListener("blur", onCancel);
  if (options.pageMark) context.pageMark(options.pageMark, true);
  return stop;
}
