// Measuring where Silverware Table spends its time, for the playground's benchmark.
// Silverware Table itself has no measuring in it (what SilverBullet runs is not
// touched): the playground wraps, from outside, the methods of its controller
// (the core's phases), of its cell editor and of each feature once they are
// started. They call each other through `this`, so the wrapped ones run.
//
// A measure is one call: its total time (an async one until its promise
// settles), its self time (the total less the measures nested in it while it
// ran synchronously) and its synchronous part. Calls of a feature nested in
// another of its calls (a hook calling its own helpers) are part of the outer
// one and not measured apart; the core's are each measured.

export type ProfileEntry = {
  readonly label: string;
  // performance.now() at its start
  readonly start: number;
  readonly total: number;
  readonly self: number;
  // The part that ran synchronously (an async call's continuations are measured apart, as their own calls)
  readonly sync: number;
};

export type ProfileSink = (entry: ProfileEntry) => unknown;

let sink: ProfileSink | undefined;

type Frame = { readonly owner: string | undefined; children: number };
// The measures running now (synchronously), innermost last
const stack: Frame[] = [];

export function setProfileSink(next: ProfileSink | undefined): void {
  sink = next;
}

const now = () => globalThis.performance?.now() ?? Date.now();

/** Runs `run`, measured as `label` while profiling; `owner`'s calls nested in its own are not measured apart */
export function measure<T>(label: string, run: () => T, owner?: string): T {
  const to = sink;
  if (!to || (owner !== undefined && stack.some((frame) => frame.owner === owner))) return run();
  const frame: Frame = { owner, children: 0 };
  const start = now();
  stack.push(frame);
  let result: T;
  try {
    result = run();
  } finally {
    stack.pop();
  }
  const sync = now() - start;
  const parent = stack.at(-1);
  if (parent) parent.children += sync;
  const self = Math.max(0, sync - frame.children);
  if (result instanceof Promise) {
    const done = () => void to({ label, start, total: now() - start, self, sync });
    result.then(done, done);
  } else {
    to({ label, start, total: sync, self, sync });
  }
  return result;
}

/**
 * Wraps methods of `target` (its class's and their parents'; `only`: just
 * these) so each call is measured as `<name> · <method>`. With `nested`, its
 * calls nested in its own are measured too (the core's phases).
 */
export function profiled<T extends object>(name: string, target: T, { only, nested = false }: { only?: readonly string[]; nested?: boolean } = {}): T {
  const wrapped = new Set<string>();
  for (let proto = Object.getPrototypeOf(target); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const method of Object.getOwnPropertyNames(proto)) {
      if (method === "constructor" || wrapped.has(method) || (only && !only.includes(method))) continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, method);
      if (typeof descriptor?.value !== "function") continue;
      wrapped.add(method);
      const original = descriptor.value as (...args: unknown[]) => unknown;
      const label = `${name} · ${method}`;
      const owner = nested ? undefined : name;
      Object.defineProperty(target, method, {
        configurable: true,
        writable: true,
        value(this: unknown, ...args: unknown[]) {
          return measure(label, () => original.apply(this, args), owner);
        },
      });
    }
  }
  return target;
}

// The controller's phases measured (each apart): enhancing a table and its
// parts, applying the view, writing; and its toolbar's (made, placed)
const CORE_PHASES = ["scan", "enhanceNow", "decorate", "applyView", "layOutCells", "pinColumns", "write", "showMarkdown"];
const TOOLBAR_PHASES = ["show", "place"];

/** A feature's name in the log: its class's (Formulas, ColumnTypes, Grips: the handles module…) */
const featureName = (feature: object) => feature.constructor.name.replace(/^./, (c) => c.toLowerCase());

/**
 * Measures Silverware Table's controller (the one `init` made, kept on the window):
 * its phases and cell editor now, its features once they are started. What
 * they did before that (the first tables enhanced) is not measured.
 */
export async function profileSilverwareTable(): Promise<void> {
  type Internals = { cellEditor: object; toolbar: object; features: object[]; featuresStarted?: Promise<void> };
  const controller = (globalThis as unknown as Record<string, Internals | undefined>).__silverwareTable;
  if (!controller) return;
  profiled("core", controller, { only: CORE_PHASES, nested: true });
  profiled("core toolbar", controller.toolbar, { only: TOOLBAR_PHASES, nested: true });
  profiled("cell editor", controller.cellEditor);
  await controller.featuresStarted;
  for (const feature of controller.features) profiled(featureName(feature), feature);
}
