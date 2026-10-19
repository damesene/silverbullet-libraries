// The SilverBullet API Table Plus uses, handed over by the library page's
// Space Lua (`editor.*` and `config.get`), so no SilverBullet internals are needed.
export type Bridge = {
  readonly getText: () => string | Promise<string>;
  readonly replaceRange: (from: number, to: number, text: string) => unknown;
  readonly moveCursor: (pos: number, center?: boolean) => unknown;
  readonly getCurrentPage: () => string | Promise<string>;
  readonly flash: (message: string, type?: "info" | "error") => unknown;
  // Optional: without it, settings keep their defaults
  readonly getConfig?: (path: string, defaultValue: unknown) => unknown;
  // Optional: without them, undoing a table edit scrolls to the editor's cursor
  readonly setSelection?: (from: number, to: number) => unknown;
  readonly getCursor?: () => number | Promise<number>;
  readonly undo?: () => unknown;
  readonly redo?: () => unknown;
  // Optional: re-evaluates `${…}` cells once the page index is up to date
  readonly evalExpression?: (expression: string) => unknown;
};

type Setting<T> = {
  readonly path: string;
  readonly default: T;
  // The value as configured, or undefined when it is not valid
  readonly parse: (value: unknown) => T | undefined;
};

/** Settings, registered with `config.define` on the library page */
export const SETTINGS = {
  enterKey: {
    path: "tablePlus.enterKey",
    default: "save",
    parse: (v) => (v === "save" || v === "moveDown" ? v : undefined),
  } satisfies Setting<"save" | "moveDown">,
  smartFilters: {
    path: "tablePlus.smartFilters",
    default: true,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Pixels; 0: no limit
  maxHeight: {
    path: "tablePlus.maxHeight",
    default: 0,
    parse: (v) => {
      const n = typeof v === "string" ? Number(v) : v;
      return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
    },
  } satisfies Setting<number>,
};

export type SettingValue<K extends keyof typeof SETTINGS> = NonNullable<
  ReturnType<(typeof SETTINGS)[K]["parse"]>
>;

const REQUIRED: readonly (keyof Bridge)[] = [
  "getText",
  "replaceRange",
  "moveCursor",
  "getCurrentPage",
  "flash",
];

export function missingBridgeFunctions(bridge: Partial<Bridge> | undefined): string[] {
  return REQUIRED.filter((name) => typeof bridge?.[name] !== "function");
}
