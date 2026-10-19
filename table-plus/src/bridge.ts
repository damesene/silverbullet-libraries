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
  // Optional: asks before removing metadata (else the browser's confirm)
  readonly confirm?: (message: string, options?: { destructive?: boolean }) => boolean | Promise<boolean>;
  // Optional: reads another page's markdown, for formulas that refer to its tables ([[Page]]prices!B2)
  readonly readPage?: (name: string) => string | Promise<string>;
  // Optional: asks for a text, e.g. a table's name (else the browser's prompt); undefined: cancelled
  readonly prompt?: (message: string, defaultValue?: string) => string | undefined | null | Promise<string | undefined | null>;
};

type Setting<T> = {
  readonly path: string;
  readonly default: T;
  // The value as configured, or undefined when it is not valid
  readonly parse: (value: unknown) => T | undefined;
};

/**
 * The modules: the features that can be turned off, each with
 * `tablePlus.modules.<name>.enabled` (default true); read when Table Plus starts
 */
export const FEATURE_NAMES = [
  "formulas",
  "columnTypes",
  "selection",
  "paste",
  "handles",
  "sticky",
  "autoscroll",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

/**
 * Settings, registered with `config.define` on the library page: those of
 * whole tables as `tablePlus.<setting>`, those of a part of Table Plus as
 * `tablePlus.<part>.<setting>` and a module's as
 * `tablePlus.modules.<module>.<setting>`, so a part is set with one
 * `config.set("tablePlus.editor", { … })`
 */
export const SETTINGS = {
  enterKey: {
    path: "tablePlus.editor.enterKey",
    default: "moveDown",
    parse: (v) => (v === "save" || v === "moveDown" ? v : undefined),
  } satisfies Setting<"save" | "moveDown">,
  smartFilters: {
    path: "tablePlus.filter.smart",
    default: true,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Store table settings (for now: sorting) in the table's metadata row
  metadata: {
    path: "tablePlus.metadata",
    default: false,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // A click on a cell selects its text (Shift+click does not); off: the reverse
  selectOnClick: {
    path: "tablePlus.editor.selectOnClick",
    default: false,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Ctrl+Enter in a cell editor adds a row below; off: it is a plain Enter
  ctrlEnterAddsRow: {
    path: "tablePlus.editor.ctrlEnterAddsRow",
    default: true,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Write edited tables with aligned pipes; off: keep each table's own style
  autoFormat: {
    path: "tablePlus.autoFormat",
    default: true,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Milliseconds `${…}` cells wait after `page:index` for the indexers to write the index
  expressionsDelay: {
    path: "tablePlus.expressions.refreshDelay",
    default: 500,
    parse: (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined),
  } satisfies Setting<number>,
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
