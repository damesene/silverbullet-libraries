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
};

/** Settings, registered with `config.define` on the library page */
export const SETTINGS = {
  enterKey: { path: "tablePlus.enterKey", values: ["save", "moveDown"], default: "save" },
  smartFilters: { path: "tablePlus.smartFilters", values: [true, false], default: true },
} as const;

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
