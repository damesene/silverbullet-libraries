// Silverware Table's features, in the order they get events: the modules (turned on
// or off by `silverware.table.modules.<name>.enabled`) and those always there. The
// controller creates those turned on from this list and knows none of them.
import type { FeatureName } from "./bridge.ts";
import type { Feature, TableHost } from "./core/feature.ts";
import { AutoFill } from "./features/autofill.ts";
import { Autoscroll } from "./features/autoscroll.ts";
import { ColumnTypes } from "./features/columntypes.ts";
import { Excel } from "./features/excel.ts";
import { Export } from "./features/export.ts";
import { Expressions } from "./features/expressions.ts";
import { Filters } from "./features/filters.ts";
import { Formulas } from "./features/formulas.ts";
import { FullScreen } from "./features/fullscreen.ts";
import { Grips } from "./features/grips.ts";
import { History } from "./features/history.ts";
import { LargeTables } from "./features/largetables.ts";
import { Lazy } from "./features/lazy.ts";
import { LongText } from "./features/longtext.ts";
import { Names } from "./features/names.ts";
import { PageLinks } from "./features/pagelinks.ts";
import { Paste } from "./features/paste.ts";
import { CellPopup } from "./features/popup.ts";
import { Selection } from "./features/selection.ts";
import { Sticky } from "./features/sticky.ts";
import { Themes } from "./features/themes.ts";
import { Widths } from "./features/widths.ts";

/** A feature to create: a module (by its name), or one always there (no name) */
export type FeatureEntry = { readonly name: FeatureName | undefined; readonly create: () => Feature };

/** The features in the order they get events; `metadata` is the controller's own (Remove metadata, also a page command) */
export function featureEntries(host: TableHost, metadata: Feature): readonly FeatureEntry[] {
  const optional = (name: FeatureName, create: () => Feature): FeatureEntry => ({ name, create });
  const always = (create: () => Feature): FeatureEntry => ({ name: undefined, create });
  return [
    // First: the header moves before what follows it
    optional("sticky", () => new Sticky(host)),
    // Before what takes presses: a press while picking where AutoFill to… fills to ends picking (or fills) first;
    // before the selection too: Esc while dragging the fill handle cancels the fill, the selection stays
    optional("autofill", () => new AutoFill(host)),
    optional("autoscroll", () => new Autoscroll(host)),
    optional("handles", () => new Grips(host)),
    optional("widths", () => new Widths(host)),
    optional("longText", () => new LongText(host)),
    // Before what places rows into the table: it takes them out of the document first
    optional("largeTables", () => new LargeTables(host)),
    // Recalculate first in the toolbar
    optional("formulas", () => new Formulas(host)),
    optional("pageLinks", () => new PageLinks(host)),
    // Before types: Filter right after the sorting in the column menu
    optional("filters", () => new Filters(host)),
    // After formulas: a formula's result is shown in its column's type
    optional("columnTypes", () => new ColumnTypes(host)),
    optional("names", () => new Names(host)),
    always(() => metadata),
    optional("paste", () => new Paste(host)),
    optional("selection", () => new Selection(host)),
    optional("lazy", () => new Lazy(host)),
    optional("themes", () => new Themes(host)),
    optional("export", () => new Export(host)),
    optional("excel", () => new Excel(host)),
    // Its icon last in the toolbar, before the menu
    optional("fullScreen", () => new FullScreen(host)),
    always(() => new Expressions(host)),
    always(() => new History(host)),
    always(() => new CellPopup(host)),
  ];
}
