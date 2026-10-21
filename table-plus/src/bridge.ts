// The SilverBullet API Table Plus uses, handed over by the library page's
// Space Lua (`editor.*` and `config.get`), so no SilverBullet internals are needed.
import { BUILT_IN_THEMES, NATIVE_THEME, STRIPES, type Stripes, stripesLabel, stripesName, themeLabel, themeName, themesInStyles } from "./themes.ts";

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
  // Optional: writes a page's markdown (with readPage), e.g. edits held for a page no longer in the editor
  readonly writePage?: (name: string, text: string) => unknown;
  // Optional: asks for a text, e.g. a table's name (else the browser's prompt); undefined: cancelled
  readonly prompt?: (message: string, defaultValue?: string) => string | undefined | null | Promise<string | undefined | null>;
  // Optional, for the settings dialog: writes the space's configuration page
  // (CONFIG) and loads the configuration again (as SilverBullet's
  // Configuration Manager does); with readPage. Without it (and without
  // saveSettings) the dialog only shows the settings.
  readonly saveConfigPage?: (text: string) => unknown;
  // Optional: saves settings by path where there is no configuration page (the playground); undefined: back to the default
  readonly saveSettings?: (values: Readonly<Record<string, unknown>>) => unknown;
  // Optional: reloads the page, for modules turned on or off (else the browser reloads it)
  readonly reloadUI?: () => unknown;
};

type Setting<T> = {
  readonly path: string;
  // Its name in the settings dialog (as in config.define's ui label on the library page), and what it does in a few words
  readonly label: string;
  readonly hint: string;
  readonly default: T;
  // The value as configured, or undefined when it is not valid
  readonly parse: (value: unknown) => T | undefined;
  // A choice: the values it takes, and what the settings dialog calls them
  readonly choices?: readonly T[];
  readonly choiceLabels?: readonly string[];
  // More values found at run time (themes the page's styles define), offered after those
  readonly moreChoices?: (doc: Document) => readonly T[];
  // What the settings dialog calls a value of moreChoices
  readonly moreLabel?: (value: T) => string;
};

// A number of pixels, 0 or more (0: no limit)
const pixels = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};

/**
 * The modules: the features that can be turned off, each with
 * `tablePlus.modules.<name>.enabled` (default true, but MODULES_OFF_BY_DEFAULT);
 * read when Table Plus starts
 */
export const FEATURE_NAMES = [
  "formulas",
  "names",
  "pageLinks",
  "filters",
  "columnTypes",
  "selection",
  "autofill",
  "lazy",
  "themes",
  "export",
  "excel",
  "paste",
  "handles",
  "widths",
  "longText",
  "sticky",
  "autoscroll",
  "largeTables",
  "fullScreen",
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

// Modules off until turned on (as config.define on the library page says)
const MODULES_OFF_BY_DEFAULT: ReadonlySet<FeatureName> = new Set(["largeTables"]);

/** Whether a module is on when its setting is not set */
export function moduleOnByDefault(name: FeatureName): boolean {
  return !MODULES_OFF_BY_DEFAULT.has(name);
}

// The modules' names in the settings dialog (as in config.define's ui labels on the library page)
export const MODULE_LABELS: Readonly<Record<FeatureName, string>> = {
  formulas: "Formulas",
  names: "Names",
  pageLinks: "Links to other pages",
  filters: "Filters",
  columnTypes: "Column types",
  selection: "Cell selection",
  autofill: "AutoFill",
  lazy: "Lazy saving",
  themes: "Themes",
  export: "Export",
  excel: "Excel",
  paste: "Copy, cut and paste",
  handles: "Row and column handles",
  widths: "Column widths",
  longText: "Long text in cells",
  sticky: "Sticky header",
  autoscroll: "Middle-button scrolling",
  largeTables: "Large tables",
  fullScreen: "Full screen",
};

// What each module does, in a few words (the settings dialog shows it beside the module's name)
export const MODULE_DESCRIPTIONS: Readonly<Record<FeatureName, string>> = {
  formulas: "Formulas in cells (=SUM(B1:B3)), recalculated on every edit",
  names: "Name tables, columns, rows and cells, to refer to them in formulas",
  pageLinks: "Formulas can refer to tables and named cells on other pages",
  filters: "Show only the rows whose cells match what you type under a header",
  columnTypes: "A header's hashtag formats its column (#currency, #stars…)",
  selection: "A click selects a cell, as in a spreadsheet; drag or Shift to select more, to copy, paste over or empty them",
  autofill: "A square at the corner of the cells selected: drag it to fill the cells after them (1, 2 → 3, 4; Mon → Tue; formulas with their references moved), double-click it to fill down",
  lazy: "An icon in a table's toolbar switches it to saving its cells edited together, a moment after editing stops: quicker typing in large tables",
  themes: "How tables look (header, lines, stripes, spacing): a theme for every table, another one for a table from its ⋯ menu",
  export: "Copy as CSV in a table's ⋯ menu",
  excel: "Export to Excel… in a table's ⋯ menu: copy for Excel (numbers and dates as Excel's), or download an .xlsx file with the formulas",
  paste: "Copy, Cut and Paste in the cell menu; Ctrl+X cuts cells (they move where they are pasted); Ctrl+V pastes cells copied from a spreadsheet over the table, Ctrl+Shift+V as new rows",
  handles: "Handles beside rows and above columns: drag to move them, click for their menu",
  widths: "Drag the right edge of a header to set its column's width",
  longText: "Text wider than a maximum column width wraps or is cut, the expand button shows it whole",
  sticky: "A table's header stays in view while the page scrolls past it",
  autoscroll: "The middle mouse button over a table scrolls it in the direction the pointer moves",
  largeTables: "Tables with many rows scroll in a box of their own (Maximum table height, else the window's height), and only the rows in view are in the page: editing stays quick",
  fullScreen: "An icon in the table's toolbar shows the table over the whole window; the same icon or Esc closes it",
};

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
    label: "Enter in a cell editor",
    hint: "What Enter does while a cell is edited",
    default: "moveDown",
    choices: ["save", "moveDown"],
    choiceLabels: ["Save", "Save, edit the cell below"],
    parse: (v) => (v === "save" || v === "moveDown" ? v : undefined),
  } satisfies Setting<"save" | "moveDown">,
  smartFilters: {
    path: "tablePlus.modules.filters.smart",
    label: "Smart filters",
    hint: "Filters understand >10, /pattern/, =text, a|b and !text; off, what is typed is text to find",
    default: true,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Store table settings (sorting, filters, pins, names) in the table's metadata row
  metadata: {
    path: "tablePlus.metadata",
    label: "Store table metadata",
    hint: "Tables keep their sorting, filters, column widths, pins, names and formulas in a hidden last row; pinning and new formulas need it. Off, sorting and filters are only a view",
    default: false,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // A click, Enter, Tab and Ctrl+arrows open a cell with its text selected (Shift+Enter does not); off: the reverse
  selectOnClick: {
    path: "tablePlus.editor.selectOnClick",
    label: "Click selects the cell's text",
    hint: "A cell opened for editing (a click, Enter, Tab, Ctrl+arrows) has its whole text selected; off, the cursor is at its end",
    default: false,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Ctrl+Enter in a cell editor adds a row below; off: it is a plain Enter
  ctrlEnterAddsRow: {
    path: "tablePlus.editor.ctrlEnterAddsRow",
    label: "Ctrl+Enter adds a row",
    hint: "While a cell is edited, Ctrl+Enter saves it, adds an empty row below and edits it; off, it works like Enter",
    default: true,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Write edited tables with aligned pipes; off: keep each table's own style
  autoFormat: {
    path: "tablePlus.autoFormat",
    label: "Format tables",
    hint: "A table edited with Table Plus is written with its columns aligned; off, each table keeps its own style",
    default: true,
    parse: (v) => (typeof v === "boolean" ? v : undefined),
  } satisfies Setting<boolean>,
  // Milliseconds `${…}` cells wait after `page:index` for the indexers to write the index
  expressionsDelay: {
    path: "tablePlus.expressions.refreshDelay",
    label: "Delay before refreshing (ms)",
    hint: "After an edit, cells with ${…} (a query, a sum) are evaluated again once SilverBullet has indexed the page: how long to wait for that; raise it if they still show old values",
    default: 500,
    parse: (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined),
  } satisfies Setting<number>,
  // How long after editing stops a table in lazy saving writes its cells (the lazy module)
  lazyDelay: {
    path: "tablePlus.modules.lazy.delay",
    label: "Saves after (ms)",
    hint: "In lazy saving, the cells edited are saved this long after no cell is being edited",
    default: 500,
    parse: (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined),
  } satisfies Setting<number>,
  // The tables' theme (the themes module); a table's metadata may choose another
  theme: {
    path: "tablePlus.modules.themes.theme",
    label: "Theme",
    hint: "How tables look: their header, lines, stripes and spacing. Native leaves them as SilverBullet shows them; a table's ⋯ menu can choose another theme for it",
    default: NATIVE_THEME as string,
    choices: BUILT_IN_THEMES as readonly string[],
    choiceLabels: BUILT_IN_THEMES.map(themeLabel),
    moreChoices: themesInStyles,
    moreLabel: themeLabel,
    parse: themeName,
  } satisfies Setting<string>,
  // Every other row or column tinted, in the theme's color (the themes module); a table's metadata may say otherwise
  stripes: {
    path: "tablePlus.modules.themes.stripes",
    label: "Stripes",
    hint: "Every other row (or column) is tinted, in the theme's color; the icons in Theme in a table's ⋯ menu can choose otherwise for that table",
    default: "rows",
    choices: STRIPES,
    choiceLabels: STRIPES.map(stripesLabel),
    parse: stripesName,
  } satisfies Setting<Stripes>,
  // Pixels; 0: no limit
  maxHeight: {
    path: "tablePlus.maxHeight",
    label: "Maximum table height (px)",
    hint: "A taller table gets its own scrollbar; 0: no limit",
    default: 0,
    parse: pixels,
  } satisfies Setting<number>,
  // Text longer than a cell's maximum width: wrapped onto more lines, or cut with an ellipsis (…)
  cellOverflow: {
    path: "tablePlus.modules.longText.overflow",
    label: "Text that does not fit",
    hint: "What text wider than the maximum column width does",
    default: "wrap",
    choices: ["wrap", "ellipsis"],
    choiceLabels: ["Wrap", "Cut with an ellipsis (…)"],
    parse: (v) => (v === "wrap" || v === "ellipsis" ? v : undefined),
  } satisfies Setting<"wrap" | "ellipsis">,
  // A column's maximum width in pixels; 0: no limit
  cellMaxWidth: {
    path: "tablePlus.modules.longText.maxWidth",
    label: "Maximum column width (px)",
    hint: "Text wider than this wraps or is cut, as set above; 0: no limit",
    default: 500,
    parse: pixels,
  } satisfies Setting<number>,
  // From how many rows a table is a large one (the largeTables module)
  largeTablesMinRows: {
    path: "tablePlus.modules.largeTables.minRows",
    label: "Applies from (rows)",
    hint: "A table with at least this many rows gets its own box, and only the rows in view are kept in the page",
    default: 200,
    parse: (v) => (typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : undefined),
  } satisfies Setting<number>,
  // A wrapped cell's maximum height in pixels, the rest cut; 0: no limit
  cellMaxHeight: {
    path: "tablePlus.modules.longText.maxHeight",
    label: "Maximum cell height (px)",
    hint: "Wrapped text grows a cell up to this height, the rest is cut (the expand button shows it whole); 0: no limit",
    default: 200,
    parse: pixels,
  } satisfies Setting<number>,
};

/**
 * A choice setting's options, for the settings dialog and the playground: its
 * choices, those found at run time, and the value set if it is none of them
 * (a theme whose style is gone), each with what to call it
 */
export function settingChoices(key: keyof typeof SETTINGS, doc: Document, current: unknown): { readonly value: string; readonly label: string }[] {
  const setting = SETTINGS[key] as {
    readonly choices?: readonly string[];
    readonly choiceLabels?: readonly string[];
    readonly moreChoices?: (doc: Document) => readonly string[];
    readonly moreLabel?: (value: string) => string;
  };
  if (!setting.choices) return [];
  const options = setting.choices.map((value, i) => ({ value, label: setting.choiceLabels?.[i] ?? value }));
  const more = (value: string) => ({ value, label: setting.moreLabel?.(value) ?? value });
  for (const value of setting.moreChoices?.(doc) ?? []) if (!options.some((o) => o.value === value)) options.push(more(value));
  if (typeof current === "string" && current !== "" && !options.some((o) => o.value === current)) options.push(more(current));
  return options;
}

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
