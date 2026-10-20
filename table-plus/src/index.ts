// Table Plus entry point, loaded by the library page's Space Lua:
//   js.importFromSpace("Library/damesene/table-plus.js").init({ ... editor functions ... })
import { type Bridge, missingBridgeFunctions } from "./bridge.ts";
import { Controller } from "./controller.ts";
import { defineCustomFunctions, customFunctionsAnew } from "./formulas/registry.ts";
import { customFunctions } from "./formulas/custom.ts";

export const version = "0.1.0";

// One controller per window, even if the module is loaded again (e.g. after an update)
const GLOBAL_KEY = "__tablePlus";

/** Called by the library page on SilverBullet's `page:index` event */
export function pageIndexed(name: string): void {
  const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
  void controller?.pageIndexed(name);
}

/** Called by the library page on SilverBullet's `editor:pageLoaded` event */
export function pageLoaded(): void {
  const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
  void controller?.pageLoaded();
}

/** The "Table Plus: Settings" command */
export function openSettings(): void {
  const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
  void controller?.openSettings();
}

/** The "Table Plus: Remove table metadata" command */
export function removeAllMetadata(): void {
  const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
  void controller?.removeAllMetadata();
}

/**
 * `tablePlus.defineFunctions` (the library page's Space Lua): custom functions
 * for formulas, a list (or a function given the helpers that
 * returns one), usually a JS module of the space. The others defined, what is
 * wrong with any of them, which the library page shows as a notification (an
 * error there would stop the rest of the user's script).
 */
export function defineFunctions(definitions: unknown): string | undefined {
  const { functions, problems } = customFunctions(definitions);
  defineCustomFunctions(functions);
  definitionsChanged();
  return problems.length ? `Table Plus: custom functions not defined: ${problems.join("; ")}` : undefined;
}

/** Space Lua is loaded (again): the custom definitions are made anew, replacing those of before */
export function resetDefinitions(): void {
  customFunctionsAnew();
}

// Formulas are checked again once for definitions made in one go (a script's calls one after another)
let checkQueued = false;
function definitionsChanged(): void {
  if (checkQueued) return;
  checkQueued = true;
  setTimeout(() => {
    checkQueued = false;
    const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
    controller?.tablesChanged();
  });
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
