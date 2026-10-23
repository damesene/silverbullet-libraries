# Silverware Table: the plan of the sheet drawn by Silverware Table

Agreed with the user on 2026-10-22. The design is in
[silverware-table-sheets.md](silverware-table-sheets.md) (decisions, the cell
renderer); the layers in [silverware-table-isolation.md](silverware-table-isolation.md).
This file is the order of the work and how each phase ends, kept up to date as
phases finish (status below), so that work can go on from it in a new context.

## How each phase is done

- A branch of its own from `main`; small steps, each: `npm run build`,
  `npm run verify`, a UI scenario in `silverware-table/ui-tests/` for what
  changes how tables are used (`npm run test:ui`), a commit (Conventional
  Commits, no body, no AI trailer).
- At the phase's end: a review of the whole branch against `main` (the
  code-review skill), its findings checked and fixed, each with a test where
  one can show it; a click-through in the local SilverBullet (the debug build
  on port 3017, the library deployed while it is stopped: memory
  local-silverbullet); then, if everything holds, a fast-forward merge into
  `main` and a push (agreed for every phase, without asking).
- **Between branches, always tested in SilverBullet itself** (the user's
  requirement): before a merge and before the next branch starts, what the
  phase made is clicked through in the live SilverBullet, not only in the
  playground; what was checked and what was not is reported.
- The isolation holds throughout: modules (`src/features/`) in model terms
  only (`ModelHost`, `TableInfo`), the rendering in adapters
  (`core/silverbullet/`), the core naming no module; `isolation.test.ts`
  passes. Code taken from the branch `sheet-view` (written against the old
  API) is only its model logic (reading `sheet` and `at`), rewritten to the
  new API; none of its drawing or measuring (`sheetboard.ts`).

## Phase 1: the core with several adapters, the sheet drawing its table (branch `sheet-drawn`)

Nobody uses the sheet yet (in development, 2026-10-22): the phase is merged in
parts (1a: steps 1 to 3, the drawn table read only; 1b: steps 4 to 6), no
migration of what the old sheet stored, and no plain renderer for a
SilverBullet without the syscalls yet (the interface keeps room for it).
Ends with today's sheet view replaced by one whose table Silverware Table
draws itself, doing all today's sheet does (the grid, letters and numbers,
empty cells past the table, typing there grows the table, Esc), and today's
modules (selection, menus, copy, grips, AutoFill, formulas' hint, column
types, filters' marks) working on it unchanged.

1. A table Silverware Table draws itself stands in for the page's table of its
   key. Found on 2026-10-22: the core enhances any `.sb-table-widget` holding a
   `<table>` with `data-pos` in the document (its observer is on `body`) and
   matches it to the page's text by position and shape, so a table the sheet
   draws in SilverBullet's DOM form is handled by SilverBullet's adapter as it
   is, and no second adapter is needed for phase 1. What the core needs is one
   rule: while a drawn table (marked so, `dom.ts`) is shown, it is the table of
   its key (`tableFor`, `widgetForKey`, `shownTables`), SilverBullet's own one
   under it left out. A second adapter stays possible for a rendering of
   another form.
2. The cell renderer (`core/silverbullet/cells.ts`, interface `CellRenderer`):
   `render(cells)` in two steps (ready at once: plain cells and cached ones;
   then a promise for the rest, one SilverBullet call per table, each cell a
   row of a helper table), `release(nodes)`, whether cells need rendering
   again after indexing; the static renderer (`markdownToHtml` with
   `expand`, through the bridge), a bounded cache by text (cells without
   `${…}`), late results dropped unless the cell still shows that text, the
   plain-text rule tested on edge cases (the plain renderer for a SilverBullet
   without the syscalls: later). Clicks on `a[data-ref]` to `editor.navigate` through the
   bridge.
3. The sheet's adapter: draws one table from its markdown (rows, cells, the
   renderer filling them), over the window as today's sheet; implements the
   adapter interface; SilverBullet's table styles and the themes apply to it.
   Read only first: selecting, menus, copying work on it.
4. Editing in the drawn table: the cell editor in its cells, writes through
   the core (one edit, undo), the table drawn anew from the markdown written.
5. The sheet view moved onto it: the grid, letters, numbers, empty cells
   beyond, typing there grows the table (as today); today's sheet module
   (one SilverBullet table and a grid) removed.
6. Review, fixes, click-through in SilverBullet, merge.

## Phase 2: several tables on one sheet (branch `sheet-tables`)

Step 2 of the design on the new base:

1. The page's sheets from the tables' metadata (`sheet`, `at`): `sheet-view`'s
   `src/sheet/page.ts` taken over (pure model: markdown and meta only,
   checked), with its tests.
2. *Add to sheet…* and *Remove from sheet* in a table's ⋯ menu: a model
   module (`features/sheets.ts`, `ModelHost` only), its dialog through
   `openDialog` (the page's sheets or a new one, the table's name, which a
   table on a sheet needs), written by key (`writeTable`); the old dialog's
   checks (free name, name taken, sheet name) rewritten, its drawing not.
   *Remove from sheet* keeps the name; a first table leaving hands the
   sheet's `sheet.width.*` on to the next.
3. The board: the sheet view of a table on a sheet shows the whole sheet,
   every table of it drawn (no limit of what CodeMirror keeps in the DOM) and
   placed at its `at` on one grid (rows one height, the sheet's columns'
   widths), one box over the window holding them, the sheet's letters and
   numbers, empty cells everywhere. A table on no sheet shows alone at A1, as
   in phase 1. Typing right of a table (its rows) or below it (its columns),
   up to the next table, grows it as in phase 1; elsewhere nothing yet
   (phase 3: a new table).
4. Formulas shown in the sheet's addresses (design at that step; the
   formulas know nothing of the sheet: the core offers a table's address
   frame).
5. Review, fixes, click-through in SilverBullet, merge.

## Phase 3: editing on the sheet, then selection, filters, sorting (branch `sheet-editing`)

Step 3 of the design (values and formulas with addresses translated, growth
moving the tables around it, a new table from typing far from the others),
then step 4 (selection, copying, AutoFill, filters, sorting, widths, pins
within a table on the sheet). Review, fixes, click-through, merge.

## Later (not in these phases)

Large tables on the sheet, touch on a phone, the live renderer
(`renderToDom`) and a renderer never evaluating `${…}` (a setting), tables of
other pages on a sheet.

## Status

- 2026-10-22: plan agreed (phase 1 merged in parts, every phase merged without asking); phase 1 started on branch `sheet-drawn`.
- 2026-10-22, phase 1: steps 1 to 3 done (a drawn table stands for its key;
  the cell renderer; the sheet draws its table, `core/silverbullet/drawn.ts`).
  Steps 4 and 5 came with step 3: the drawn table has SilverBullet's DOM form,
  so the core's cell editor edits it, and today's sheet (grid, letters,
  numbers, empty cells, growth) runs on it unchanged (its 12 UI scenarios pass
  on the drawn table), nothing of the old way left. Phase 1 is merged whole.
  Next: step 6 (review, fixes, click-through in SilverBullet, merge).
- 2026-10-22, phase 1 step 6: reviewed; fixed: full screen from the sheet,
  a query's table inside a cell, the sheet ending once its table is gone, the
  scroll kept across a drawing, no swap under a cell being edited, the scroll
  of the table under the drawn one, a table moved in the page, modified clicks
  on links, `${…}` cells drawn anew after indexing, SilverBullet's DOM in
  `dom.ts`. Left open, known:
  - Each write in the sheet renders SilverBullet's table (under it, enhanced
    in full) and draws the sheet's: two layouts per change. Large tables on
    the sheet are for later; then SilverBullet's table under a drawn one could
    skip the view's work.
  - A table's key is its place among the page's tables (`Page#n`): if the
    sheet's table is removed and another table follows it, that one takes the
    key and the sheet shows it (filters and sorting kept by key do the same).
    The sheet ends only when no table has the key.
  - Task states, command buttons and interactive widgets in the sheet's cells
    do nothing (static HTML; tasks in cells are text anyway).
- 2026-10-22: phase 1 checked in the local SilverBullet (the sheet: its own
  table over the window, cells rendered through the Lua bridge, SilverBullet's
  look, a cell edited and the table drawn anew, growth, a link by
  SilverBullet's navigation, the sheet ended with the page left; the earlier
  23 steps of every module again) and merged into `main`. Next: phase 2 on
  branch `sheet-tables`.
- 2026-10-22, phase 2 (branch `sheet-tables`): the page's sheets read from
  the tables' metadata; *Add to sheet…* / *Remove from sheet*; the board (one
  box over the window, every table of the sheet drawn at its `at`, rows of one
  height, the columns as wide as the widest table's there or the sheet's
  `sheet.width.*`, a table's header and pins scrolling with the sheet); growth
  of the nearer table that can grow (left in its rows or above in its
  columns), refused where it would reach into another; formulas in the
  sheet's addresses through a core `AddressFrame` (the sheet gives it, the
  formulas module translates the editor's text, the titles, the outlines,
  pointing, dragging; a reference stays on its record). Reviewed; fixed: a
  formula shown untranslated saved as such, the board alone not ended by an
  early refresh, the sheet's widths handed to its new first table in the same
  edit (the core lets a later feature see an earlier one's change of another
  table), `prices! B2`, the page's table under the board taking presses for
  its +, keys on the board reaching the page under it, Esc twice closing the
  board, the landing cell above rows pinned to the bottom. Checked in the
  local SilverBullet (two tables 120 lines apart, the second not in
  SilverBullet's DOM, shown together; widths; a formula shown and stored;
  growth of each; Remove from sheet in one edit). Merged into `main`. Left
  open: pointing at another table of the sheet is phase 3. Next: phase 3 on branch
  `sheet-editing`.
- 2026-10-23, on `sheet-editing` before phase 3: a formula's title follows a
  sort on the sheet at once (the sheet asks the core for the looks again when
  a table's rows' order changes); in a sorted or filtered table on the sheet a
  range of rows is not pointed at, for any table (the hint says why and names
  the column to use; a header click gives it), a range within one row is.
- 2026-10-23: pointing at another table of the sheet (the frame lists its
  tables: `AddressFrame.tables`): its cell in the sheet's address, stored by its
  name; its header as `name![column]`; its outlines shown (moved by pointing
  again, not by their edges); a table without a name is said so.
- 2026-10-23, phase 3: a table that grows makes room on its sheet (agreed
  with the user after comparing Excel and Google Sheets): everything that
  starts below its bottom moves down, whatever its columns, everything right
  of it moves right, all by the same amount, so the layout stays; rows or
  columns inserted move it by as many, those claimed by a value typed or
  pasted past the table as far as they reach into a table; a table beside it
  stays; nothing moves back when a table shrinks; one edit. The rule is
  `sheet/layout.ts` (`roomFor`), alone, to change in one place; the write
  passes `claims`, the sheets module applies it (`otherTablesWritten`) and
  refuses only a layout that overlaps already (`refusesWrite`: tables that do
  not overlap never meet so, which the agreed exception for a table beside
  turned out to be).
- 2026-10-23, phase 3: a value typed into an empty cell no table grows to
  makes a table of its own (agreed: the value is a value, *Column 1* above it;
  on the sheet's first row the table starts there and the value goes a row
  lower; named `tableN`; written after the sheet's last table; a formula
  saved as text, `'=…` in its editor, a formula once the ' is removed in the
  sheet view; on a table alone, said to put it on a sheet first). The core
  got `editBeyond`'s `place` and `insertTable`. Next: selection, copying,
  AutoFill, filters, sorting, widths, pins on the sheet.
- 2026-10-23, branch `sheet-interactions` (phase 3, step 4): a survey found
  selection, copying, the cell menu, sorting and filters working on the
  sheet's tables as they are; fixed: the fill handle cut off by its cell
  (the cell's content clipped instead). Agreed: a column's width dragged on
  the sheet is the sheet's column's (`sheet.width.<letters>`, every table in
  it, through the address frame's widths), a table alone's kept in it the same way; a filter
  hides rows of its table only (not the sheet's whole rows, as Excel would).
