// AutoFill: a column (or a row) of cells selected goes on into the cells
// dragged over: 1, 2 → 3, 4; Mon, Tue → Wed; Item 1 → Item 2; formulas with
// their references moved. This is the domain's API for the rest of Table
// Plus; the series are in builtin/ (only series) and the user's own
// (custom.ts), tried in the order registry.ts says.
export { cellValue, type Cell, type FillCells, type FillLine, filled, fillLine } from "./fill.ts";
export { customSeries } from "./custom.ts";
export { allSeries, clearCustomSeries, customSeriesAnew, defineCustomSeries, seriesFor } from "./registry.ts";
export type { Generator, Series } from "./series.ts";
