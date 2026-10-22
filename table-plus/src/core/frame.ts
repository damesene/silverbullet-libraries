// Work done once per frame however often it is asked for before: placing
// what follows scrolling, measuring once laid out. Reading layout in a frame,
// after the changes of the events before it, lays the page out once.

/**
 * A function that runs `run` in the next frame, once however often it is
 * called until then (where frames are not, in tests: after a timeout)
 */
export function oncePerFrame(doc: Document, run: () => void): () => void {
  let queued = false;
  const frame = () => {
    queued = false;
    run();
  };
  return () => {
    if (queued) return;
    queued = true;
    const win = doc.defaultView;
    if (win?.requestAnimationFrame) win.requestAnimationFrame(frame);
    else setTimeout(frame, 0);
  };
}
