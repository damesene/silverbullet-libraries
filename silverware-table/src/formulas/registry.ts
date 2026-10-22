// Which functions formulas can call: the built-in ones (builtin/) and the
// custom ones the user defines (custom.ts), which replace a built-in one of
// their name.
import { BUILT_IN_FUNCTIONS } from "./builtin/index.ts";
import type { FormulaFunction } from "./function.ts";

// The custom functions by name, as last defined
let custom = new Map<string, FormulaFunction>();

/** The function formulas call by this name (upper case): the custom one, else the built-in one */
export function functionNamed(name: string): FormulaFunction | undefined {
  return custom.get(name) ?? BUILT_IN_FUNCTIONS[name];
}

/** Every function's name, built-in and custom */
export function functionNames(): string[] {
  return Array.from(new Set([...Object.keys(BUILT_IN_FUNCTIONS), ...custom.keys()]));
}

/** Whether formulas calling this function (upper case) call a custom one */
export function isCustomFunction(name: string): boolean {
  return custom.has(name);
}

/** Whether this function (upper case) is a built-in one */
export function isBuiltInFunction(name: string): boolean {
  return name in BUILT_IN_FUNCTIONS;
}

// Space Lua is loaded again: the next definitions replace those of before
let anew = false;

/** Custom functions, added to those defined before (one of the same name replaced), or replacing them all after `customFunctionsAnew` */
export function defineCustomFunctions(functions: readonly FormulaFunction[]): void {
  custom = new Map([...(anew ? [] : custom), ...functions.map((f) => [f.name, f] as const)]);
  anew = false;
}

/**
 * Space Lua is loaded again: the scripts define the functions anew. Those of
 * before are kept until then, so formulas calculated meanwhile (a write) still
 * have them; when no script defines any any more, they stay until a reload.
 */
export function customFunctionsAnew(): void {
  anew = true;
}

/** Forgets the custom functions */
export function clearCustomFunctions(): void {
  custom = new Map();
  anew = false;
}
