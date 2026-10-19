// Table Plus entry point, loaded by the library page's Space Lua:
//   js.importFromSpace("Library/damesene/table-plus.js").init({ ... editor functions ... })
import { type Bridge, missingBridgeFunctions } from "./bridge.ts";
import { Controller } from "./controller.ts";

export const version = "0.1.0";

// One controller per window, even if the module is loaded again (e.g. after an update)
const GLOBAL_KEY = "__tablePlus";

/** Called by the library page on SilverBullet's `page:index` event */
export function pageIndexed(name: string): void {
  const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
  void controller?.pageIndexed(name);
}

export function init(bridge: Bridge): void {
  const missing = missingBridgeFunctions(bridge);
  if (missing.length) {
    console.error(`Table Plus: missing editor functions: ${missing.join(", ")}`);
    return;
  }
  const global = globalThis as unknown as Record<string, Controller | undefined>;
  const existing = global[GLOBAL_KEY];
  if (existing) {
    existing.setBridge(bridge);
    return;
  }
  const controller = new Controller(document, bridge);
  global[GLOBAL_KEY] = controller;
  controller.start();
}
