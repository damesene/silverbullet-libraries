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
import { TableLabels } from "./core/silverbullet/modules/labels.ts";
import { Themes } from "./features/themes.ts";
import { Widths } from "./features/widths.ts";

/**
 * A feature to create: a module (by its name), or one always there (no name);
 * made with its host: a module's its own (core/modulehost.ts), the core's for the others
 */
export type FeatureEntry = { readonly name: FeatureName | undefined; readonly create: (host: TableHost) => AdapterFeature };

/** The features in the order they get events; `metadata` is the controller's own (Remove metadata, also a page command) */
export function featureEntries(metadata: Feature): readonly FeatureEntry[] {
  const optional = (name: FeatureName, create: (host: TableHost) => AdapterFeature): FeatureEntry => ({ name, create });
  const always = (create: (host: TableHost) => AdapterFeature): FeatureEntry => ({ name: undefined, create });
  return [
    // First: the header moves before what follows it
    optional("sticky", (host) => new Sticky(host)),
    // Before what takes presses: a press while picking where AutoFill to… fills to ends picking (or fills) first;
    // before the selection too: Esc while dragging the fill handle cancels the fill, the selection stays
    optional("autofill", (host) => new AutoFill(host)),
    optional("autoscroll", (host) => new Autoscroll(host)),
    optional("handles", (host) => new Grips(host)),
    optional("widths", (host) => new Widths(host)),
    optional("longText", (host) => new LongText(host)),
    // Before what places rows into the table: it takes them out of the document first
    optional("largeTables", (host) => new LargeTables(host)),
    // Recalculate first in the toolbar
    optional("formulas", (host) => new Formulas(host)),
    optional("pageLinks", (host) => new PageLinks(host)),
    // Before types: Filter right after the sorting in the column menu
    optional("filters", (host) => new Filters(host)),
    // After formulas: a formula's result is shown in its column's type
    optional("columnTypes", (host) => new ColumnTypes(host)),
    optional("names", (host) => new Names(host)),
    always(() => metadata),
    optional("paste", (host) => new Paste(host)),
    optional("selection", (host) => new Selection(host)),
    optional("lazy", (host) => new Lazy(host)),
    optional("themes", (host) => new Themes(host)),
    optional("export", (host) => new Export(host)),
    optional("excel", (host) => new Excel(host)),
    optional("sheet", (host) => new Sheet(host)),
    // Its part in a table's menu: Add to sheet…, Remove from sheet
    optional("sheet", (host) => new Sheets(host)),
    // Its icon last in the toolbar, before the menu
    optional("fullScreen", (host) => new FullScreen(host)),
    // After what moves tables (the held header, the sheet): placed by where they are then
    optional("tableLabels", (host) => new TableLabels(host)),
    always((host) => new Expressions(host)),
    always((host) => new History(host)),
    always((host) => new CellPopup(host)),
  ];
}
