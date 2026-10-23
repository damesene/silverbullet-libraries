// A module's part for one table: what a module keeps and does for a table,
// written for that one table. The core makes a module's part for each table
// (as the table's key, core/tables.ts, it lasts the session), keeps them and
// hands each the hooks about its table; the module keeps what is the page's
// (a bubble open, the settings, what spans tables). So a module knows nothing
// of how many tables there are: that is the core's.
//
// A module with parts gives `tableParts` (tablePartsOf: the part's class, and
// how to make one); the core shows it to the rest as one feature (routed): each
// hook about a table (TABLE_HOOKS, with the place of the table among its
// arguments) goes to the part of that table, the others to the module.

import type { AdapterFeature, Feature, TableInfo, TableTarget, WidgetInfo } from "./feature.ts";
import type { TableKey } from "./tables.ts";

/** The hooks about one table, and which argument is the table (its info, a target, or its key) */
export const TABLE_HOOKS = {
  hovered: 0,
  cellMenu: 0,
  beforeCellPress: 0,
  afterCellPress: 0,
  enhanced: 0,
  looks: 0,
  columnMenuEntries: 0,
  columnMenuLeadEntries: 0,
  cellMenuEntries: 0,
  selectedCells: 0,
  selectCells: 0,
  selected: 0,
  columnMenuTopEntries: 0,
  columnMenuInsertEntries: 0,
  rowMenuEntries: 0,
  lineMenuEntries: 0,
  toolbarButtons: 0,
  prepareWrite: 0,
  holdCellEdit: 0,
  pendingEdits: 0,
  columnDeleteWarning: 0,
  tableDeleteWarning: 0,
  hiddenRows: 0,
  hidesRows: 0,
  viewApplied: 0,
  columnWidths: 0,
  headerRow: 0,
  viewForgotten: 0,
  columnsMoved: 0,
  action: 1,
  editorText: 0,
  menuNaming: 0,
  fillCell: 0,
  selectionLeaves: 0,
  addressFrame: 0,
  beforeActionPress: 0,
  // The adapter's: the widget first, its info second
  cellHovered: 1,
  decorate: 1,
  placeRows: 1,
  rowNeeded: 0,
  rowsAttached: 0,
} as const satisfies Partial<Record<keyof AdapterFeature, number>>;

export type TableHook = keyof typeof TABLE_HOOKS;

/** A table as its part knows it: its key (what the host's methods take), and the table as it is now */
export type PartTable = { readonly key: TableKey; current(): WidgetInfo | undefined };

/** A module's part for a table: the hooks about that table (the table passed as to the module), and its end */
export type TablePart = Partial<Pick<AdapterFeature, TableHook>> & { stop?(): void };

/** How a module's parts are made, and the hooks they have (found on their class) */
export type TableParts<P extends object = TablePart> = { readonly hooks: readonly TableHook[]; make(table: PartTable): P };

/** A module's parts of a class: `make` gives one for a table (the module's own, for what is the page's, in its closure) */
export function tablePartsOf<P extends object>(partClass: abstract new (...args: never[]) => P, make: (table: PartTable) => P): TableParts<P> {
  const hooks = (Object.keys(TABLE_HOOKS) as TableHook[]).filter((hook) => typeof (partClass.prototype as Record<string, unknown>)[hook] === "function");
  return { hooks, make };
}

/** A feature that has parts for tables */
export type PartedFeature = AdapterFeature & { readonly tableParts: TableParts<object> };

/** The key of a hook's table argument */
function keyOf(arg: unknown): TableKey | undefined {
  if (typeof arg === "string") return arg as TableKey;
  return (arg as TableInfo | TableTarget | undefined)?.key;
}

export class Parts {
  private readonly parts = new Map<object, Map<TableKey, TablePart>>();
  // A module as routed, to the module itself: its parts are the module's, whichever of the two asks
  private readonly originals = new WeakMap<object, Feature>();

  /** The module a feature is (itself, or the module routed) */
  private original(feature: Feature): Feature {
    return this.originals.get(feature) ?? feature;
  }

  constructor(private readonly current: (key: TableKey) => WidgetInfo | undefined) {}

  /** A module's part for a table, made the first time it is asked for */
  of<P extends object>(given: Feature, key: TableKey): P | undefined {
    const feature = this.original(given);
    const makes = (feature as Partial<PartedFeature>).tableParts;
    if (!makes) return undefined;
    let mine = this.parts.get(feature);
    if (!mine) this.parts.set(feature, (mine = new Map()));
    let part = mine.get(key);
    if (!part) mine.set(key, (part = makes.make({ key, current: () => this.current(key) }) as TablePart));
    return part as P;
  }

  /** A module's parts made so far (one per table it has done something for) */
  all<P extends object>(feature: Feature): readonly P[] {
    return [...(this.parts.get(this.original(feature))?.values() ?? [])] as P[];
  }

  /** The module's parts end with it */
  stopAll(given: Feature): void {
    const feature = this.original(given);
    for (const part of this.parts.get(feature)?.values() ?? []) part.stop?.();
    this.parts.delete(feature);
  }

  /**
   * The module as the core sees it: its own hooks as they are, each hook its
   * parts have going to the part of the table it is about, `stop` ending them
   * too. A module without parts is itself.
   */
  routed<F extends AdapterFeature>(feature: F): F {
    const makes = (feature as Partial<PartedFeature>).tableParts;
    if (!makes) return feature;
    const routed: Record<string, unknown> = {};
    // Its own methods, bound to it (its state is its own)
    for (let proto = Object.getPrototypeOf(feature); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        const value = (feature as unknown as Record<string, unknown>)[name];
        if (name !== "constructor" && !(name in routed) && typeof value === "function") routed[name] = value.bind(feature);
      }
    }
    for (const hook of makes.hooks) {
      const at = TABLE_HOOKS[hook];
      routed[hook] = (...args: unknown[]) => {
        const key = keyOf(args[at]);
        const part = key && this.of<TablePart>(feature, key);
        return (part?.[hook] as ((...a: unknown[]) => unknown) | undefined)?.(...args);
      };
    }
    const stop = routed.stop as (() => void) | undefined;
    routed.stop = () => {
      stop?.();
      this.stopAll(feature);
    };
    routed.tableParts = makes;
    this.originals.set(routed, feature);
    return routed as F;
  }
}
