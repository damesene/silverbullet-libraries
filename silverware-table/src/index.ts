// Silverware Table entry point, loaded by the library page's Space Lua:
//   js.importFromSpace("Library/damesene/silverware-table.js").init({ ... editor functions ... })
import { customSeries, customSeriesAnew, defineCustomSeries } from "./autofill/index.ts";
import { type Bridge, missingBridgeFunctions } from "./bridge.ts";
import { Controller } from "./controller.ts";
import { customTypes } from "./columntypes/custom.ts";
import { customTypesAnew, defineCustomTypes } from "./columntypes/registry.ts";
import { customFunctions } from "./formulas/custom.ts";
import { customFunctionsAnew, defineCustomFunctions } from "./formulas/registry.ts";

export const version = "0.1.0";

// One controller per window, even if the module is loaded again (e.g. after an update)
const GLOBAL_KEY = "__silverwareTable";

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

/** The "Silverware Table: Settings" command */
export function openSettings(): void {
  const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
  void controller?.openSettings();
}

/** The "Silverware Table: Remove table metadata" command */
export function removeAllMetadata(): void {
  const controller = (globalThis as unknown as Record<string, Controller | undefined>)[GLOBAL_KEY];
  void controller?.removeAllMetadata();
}

/**
 * What a notification says of definitions refused: which and why (the library
 * page's Lua adds where they come from: the definitions do not say)
 */
function notDefined(what: string, problems: readonly string[]): string | undefined {
  return problems.length ? `Silverware Table: ${what} not defined: ${problems.join("; ")}.` : undefined;
}

/**
 * `silverware.table.defineFunctions` (the library page's Space Lua): custom functions
 * for formulas, a list (or a function given the helpers that
 * returns one), usually a JS module of the space. The others defined, what is
 * wrong with any of them, which the library page shows as a notification (an
 * error there would stop the rest of the user's script).
 */
export function defineFunctions(definitions: unknown): string | undefined {
  const { functions, problems } = customFunctions(definitions);
  defineCustomFunctions(functions);
  definitionsChanged();
  return notDefined("custom functions", problems);
}

/**
 * `silverware.table.defineTypes`: custom column types, as `defineFunctions` takes
 * functions. Tables rendered from now on show them (Space Lua defines them
 * before a page shows); what is wrong with any of them, for a notification.
 */
export function defineTypes(definitions: unknown): string | undefined {
  const { types, problems } = customTypes(definitions);
  defineCustomTypes(types);
  definitionsChanged();
  return notDefined("custom column types", problems);
}

/**
 * `silverware.table.defineSeries`: custom series for AutoFill (lists of words to go
 * round, or series as the built-in ones), as `defineFunctions` takes
 * functions. The next fill uses them (no table shows them); what is wrong with
 * any of them, for a notification.
 */
export function defineSeries(definitions: unknown): string | undefined {
  const { series, problems } = customSeries(definitions);
  defineCustomSeries(series);
  return notDefined("custom series", problems);
}

/** Space Lua is loaded (again): the custom definitions are made anew, replacing those of before */
export function resetDefinitions(): void {
  customFunctionsAnew();
  customTypesAnew();
  customSeriesAnew();
}

// Tables are checked again once for definitions made in one go (a script's calls one after another)
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
    console.error(`Silverware Table: missing editor functions: ${missing.join(", ")}`);
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
