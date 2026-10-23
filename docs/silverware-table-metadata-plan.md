# Silverware Table: modules' data through the host (plan)

The decisions behind it are in CLAUDE.md, *Modules and their data*. Stored markdown changes without compatibility (agreed: nobody uses it yet), so the commits that change it are marked `!`. Each step is one commit (or a few), built and verified on its own; the branch is `meta-namespaces`.

## Status

Steps 1 to 5 done (5: the metadata setting off in the core: `setMeta`/`setColumnsMeta` add nothing new, `canStoreMeta`/`canStoreCellTag`/`canName`/`canPin` for the modules\' menus, the write step `withoutNewTagValues`). The cell rule is the table\'s, not the column\'s: a value the table had anywhere stays, as cells moved across columns (selection, cut and paste) take their formulas along. Next: step 6.

## The format

| What | Today | Then |
| --- | --- | --- |
| The metadata row's marker | none (a row without `f`, `n`, `cn`) | `core.table` |
| Table's name | `name` | `core.name` |
| Pins | `pin-top` … | `core.pin-top` … |
| Sorting | `sort.qty` | `core.-c-qty.sort` |
| A column's, a row's, a cell's name (tags in cells) | `n`, `cn` | `core.n`, `core.cn` |
| Filters | `filter.status` | `filters.-c-status.condition` |
| Widths | `width.qty` | `widths.-c-qty.size` |
| Theme, stripes | `theme`, `stripes` | `themes.name`, `themes.stripes` |
| Sheet | `sheet`, `at`, `sheet.width.A` | `sheet.name`, `sheet.at`, `sheet.width.A` (A is the sheet's column, not the table's: no `-c-`) |
| Formula (a tag in a cell) | `f` | `formulas.f` |

A duplicate column name keeps its occurrence: `core.-c-qty:2.sort`.

## Steps

1. **A host per module** (refactor, no change in behaviour): `modules.ts` creates each module with a host that knows its `FeatureName` (forwarding to the controller, bound methods made once, no state of its own); the always-on features and the core get the core's.
2. **Modules offering an API to others** (refactor): `host.offer(api)` and `host.offered(name)` (undefined while that module is off). The formulas module offers its formulas' reading; the excel module takes it from there instead of importing the cells' parsing (with formulas off it exports values).
3. **The formulas domain reads and writes cells through functions it is given** (refactor): `getFormula`/`setFormula` in the contexts `evaluate.ts` and `edits.ts` already get, made by the formulas module (still writing `f` at this step); the names of tables looked up through the `TableSource` the module builds, the own table's name (before and after a rename) given; autofix's and the errors' table names from the source.
4. **The host's metadata functions** (`feat(table)!`): `host.getMeta(t, key, { column })`, `host.setMeta(t, key, value, { column })`, `host.columnsMeta(t, key)`, `host.getCellTag(cell, key)`, `host.withCellTag(cell, key, value)`, `host.canStoreMeta(t, key, { column })`; `host.tableName(t)`; the core's names in `meta.ts` (`<module>.<key>`, `-c-`), `followColumnMeta` on `-c-` attributes of any module; `core.table` in the parser and the serializer (`parseMetaRow` no longer knows `f`, `n`, `cn`). Then module by module, each with its fixtures, tests and the library page: the core's own (name, pins, sorting), filters, widths, themes, sheet (both modules), formulas (`formulas.f`), names (`core.n`, `core.cn` through `host.setColumnName`, `setRowName`, `setCellName`; `uniqueTags`, `takesTags` in keys or gone where the core knows its names).
5. **The metadata setting off, in the core** (`feat(table)`): `setMeta` adds no attribute the table lacks; the core's write step takes off cells' tags new to their cell and column (said once per write); the modules' menus ask `canStoreMeta` instead of `metadataEnabled` checks of their own (filters, widths, themes, names, sheets, sheet, grips' pins, formulas); the core's sorting and pins by the same rule.
6. **Remove metadata asks by owners** (`feat(table)`): the question lists the modules whose attributes go, from the prefixes (their labels); `metadataPart` goes.
7. **The sheet without handing over** (`feat(table)`): a sheet's data read from any table of the sheet, not only the first; handing it over stays where metadata are on; deleting the table that holds it warns that it goes (`tableDeleteWarning`).
8. **The isolation test**: modules import nothing of `meta.ts` nor `metaAttribute`; domains read no `meta`.
9. **Docs**: the library page (what a table keeps, the format above), CLAUDE.md (layout, architecture), docs/silverware-table-isolation.md; the playground's sample and the showcase pages rewritten.

`npm run build`, `npm run verify` and `npm run test:ui` before each commit.
