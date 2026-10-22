// Silverware Table's features, in the order they get events: the modules (turned on
// or off by `silverware.table.modules.<name>.enabled`) and those always there. The
// controller creates those turned on from this list and knows none of them.
import type { FeatureName } from "./bridge.ts";
import type { AdapterFeature, Feature, TableHost } from "./core/feature.ts";
import { AutoFill } from "./features/autofill.ts";
import { Autoscroll } from "./core/silverbullet/modules/autoscroll.ts";
import { ColumnTypes } from "./features/columntypes.ts";
import { Excel } from "./features/excel.ts";
import { Export } from "./features/export.ts";
import { Expressions } from "./core/silverbullet/modules/expressions.ts";
import { Filters } from "./features/filters.ts";
import { Formulas } from "./features/formulas.ts";
import { FullScreen } from "./core/silverbullet/modules/fullscreen.ts";
import { Grips } from "./features/grips.ts";
import { History } from "./core/silverbullet/modules/history.ts";
import { LargeTables } from "./core/silverbullet/modules/largetables.ts";
import { Lazy } from "./features/lazy.ts";
import { LongText } from "./core/silverbullet/modules/longtext.ts";
import { Names } from "./features/names.ts";
import { PageLinks } from "./features/pagelinks.ts";
import { Paste } from "./features/paste.ts";
import { CellPopup } from "./core/silverbullet/modules/popup.ts";
import { Selection } from "./features/selection.ts";
import { Sheet } from "./core/silverbullet/modules/sheet.ts";
import { Sheets } from "./features/sheets.ts";
import { Sticky } from "./core/silverbullet/modules/sticky.ts";
import { Themes } from "./features/themes.ts";
import { Widths } from "./features/widths.ts";

/** A feature to create: a module (by its name), or one always there (no name) */
export type FeatureEntry = { readonly name: FeatureName | undefined; readonly create: () => AdapterFeature };

/** The features in the order they get events; `metadata` is the controller's own (Remove metadata, also a page command) */
export function featureEntries(host: TableHost, metadata: Feature): readonly FeatureEntry[] {
  const optional = (name: FeatureName, create: () => AdapterFeature): FeatureEntry => ({ name, create });
  const always = (create: () => AdapterFeature): FeatureEntry => ({ name: undefined, create });
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
    optional("sheet", () => new Sheet(host)),
    // Its part in a table's menu: Add to sheet…, Remove from sheet
    optional("sheet", () => new Sheets(host)),
    // Its icon last in the toolbar, before the menu
    optional("fullScreen", () => new FullScreen(host)),
    always(() => new Expressions(host)),
    always(() => new History(host)),
    always(() => new CellPopup(host)),
  ];
}
