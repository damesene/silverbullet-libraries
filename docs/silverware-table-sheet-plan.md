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

## Phase 4: a table's identity and state kept by the core (branch `table-state`)

Agreed with the user on 2026-10-23. Modules do not know how a table is told
apart: today they key their state by `info.key` (`Page#n`, the table's place
among the page's tables), build keys themselves (the sheet, lazy saving,
Remove metadata) and ask `tableFor(key)`. A write that changes the order of
the page's tables (deleting one, inserting one among others) would hand their
state to the wrong tables. What a module needs is "the same table": its own
state for it across renderings, the table as it is now after a wait, whether
two are the same. The core gives exactly that and keeps how it tells tables
apart to itself:

- per-table state of a module, the same object for the same table across
  renderings, dropped with the table (`tableState`);
- the table as it is now from any earlier `TableInfo` (`current`), and
  `sameTable`;
- the core's register of the page's tables (`core/tables.ts`): an identity per
  table for the session, kept through the core's own writes that change their
  order; a table's place in the page text asked of it, never computed by a
  module (the sheet).

No change in behaviour; then review, fixes, merge.

## Phase 5: Delete table, and moving tables on the sheet (branch after phase 4)

Agreed with the user on 2026-10-23:

- *Delete table* in every table's ⋯ menu (a danger item), confirmed every
  time (what is lost: its rows, formulas elsewhere that refer to it); one
  edit, so Ctrl+Z restores it; the tables referring to it recalculated in the
  same edit; on a sheet, its widths handed to the next table, the sheet ended
  with its last table.
- Moving a table on the sheet changes its `at` only (one edit; its place in
  the page, its formulas unchanged: the sheet's addresses follow through the
  frame). Three ways to one move: a handle at the table's top left corner
  (where the row and column grips meet; for a mouse on hover, after a touch
  when a cell of it is selected; dragged: the table's outline snapped to the
  grid with the target's address, red where it would overlap; a tap or click
  selects the whole table); *Move table…* in the ⋯ menu and the cell menu (the
  next press or tap places its top left corner, as *Move to…*); a selection of
  the whole table dragged by its edge. Not through a new hook: the
  `AddressFrame` the sheet gives gets the table's place in the grid, whether
  a place is free and the move, which the selection module and the sheet's
  own handle both use; the rules in `sheet/layout.ts`.
- Rules: overlapping another table is refused (no table pushed aside); never
  past A1.
- Review, tests (a Playwright scenario each), merge.

## Phase 6: a module's part for one table (branch `table-parts`)

Agreed with the user on 2026-10-23: a module should not know there are several
tables. The core makes a module's part for each table, keeps it as long as the
table's key and hands it the hooks about that table; the module keeps what is
the page's. The modules about one table get parts (filters, widths, lazy
saving, largeTables' memory of a table); those spanning tables (formulas, the
sheet, selection, the clipboard, AutoFill, grips) keep keys as references
only. The core's own state by table stays the core's (it is where several
tables belong). Review, fixes, merge.

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
- 2026-10-23: phase 3 reviewed (from the end of phase 2); fixed: a table made
  on the sheet is written after the page's last table, not the sheet's (a
  table put among others moves their keys: views, held edits, view-only
  widths would go to the wrong tables), `'=` read as text there as anywhere,
  a press while its cell is edited not lost, its editor past the host
  table's columns (no column type of it applies), the history marker kept out
  of the table it goes after; the sheet's widths written only with a
  metadata row or the setting (else for the view), a width not stored not
  left shown; the range hint names another table's column with its table;
  looks not made twice when a sheet opens.
- 2026-10-23, branch `sheet-adjacent` (agreed with the user): a table grows
  only by the row right under it or the column right next to it, as a
  spreadsheet's table does (before, any cell in its rows or columns, however
  far, grew it with empty rows between); a value farther makes a table of its
  own; a table alone's sheet view becomes a sheet for it (`Sheet1`, at A1,
  named, one edit: `insertTable`'s `also`). Fixed on the way: a paste into a
  far cell's editor pasted cells into the table the editor belongs to
  (`CellEditor.placed`), Esc there selected a cell past that table.
- 2026-10-23, branch `toolbar-names` (agreed with the user): the toolbar shows
  a row of names: the sheet's (No sheet, muted, on none) after the sheet view's
  icon, the table's (Table, muted, without one) after a table's icon, which is
  the full screen's; a click on a name types it (a sheet's typed: the table
  moved there, its place kept where free, else under that sheet's lowest
  table, named if it has none; empty: off its sheet), a sheet view showing the
  table going to its new sheet. *Add to sheet…* and *Remove from sheet* went.
  The names are left of the icons where both fit in the table's width, else
  above them; the room above a held header (STICKY_GAP, the board's top
  border) went from 42 to 66px for the two rows.
  Then (agreed): the names are in the ⋯ menu always: the table's as its title
  (Table without one; the pencil after it names it, as in every menu of what
  can be named; long names cut, whole in the tooltip), the table's icon (full
  screen) before the title, in line with the sheet's icon in the first row
  under it (the sheet's name, *No sheet* muted on none). In the toolbar only by
  the setting *Names in the toolbar* (`toolbarNames`: never, always, or while
  Shift alone is held, the default: names in every toolbar were too much for
  tables nobody names); without them in the toolbar, their icons are in the ⋯
  menu only. Fixed on the way: one menu open at a time (a cell's menu and the
  ⋯ menu were both open), the toolbar measured where it will be placed (Shift
  pressed over a table with a long name placed it a row too high). Merged
  into `main` (with `sheet-adjacent`) without a click-through in SilverBullet.
- Left of phases 1 to 3: a click-through in the local SilverBullet of
  `sheet-adjacent` and `toolbar-names` (growth by the next row or column, a
  table alone made a sheet, the names in the ⋯ menu and with Shift, a table
  moved to another sheet by its name); pinning rows and columns of a table
  on the sheet, not tried on purpose (only that pins scroll with the sheet).
  Then *Later* above. Known: commit 929a04b is marked `!` though it breaks
  nothing a space has.
- 2026-10-23, after phase 3: Silverware Table's own elements made with one
  helper (`el` in `elements.ts`; VanJS weighed and set aside). On the sheet: a
  cell's text in the middle of its row (the zero-width space keeping an empty
  row tall made a line of its own above the content's block); the controls of
  the table under the pointer hidden when the sheet or full screen opens or
  closes (`hideControls` through `claimWindow`/`releaseWindow`), a covered
  table's quiet + hidden (`underWindow`). Open, not reproduced: in the user's
  playground a light bar flickers over the top of a sheet's table and its
  left edge, the table looking shifted into the letters and numbers.
  Next: phase 4, then phase 5.
- 2026-10-23, phase 4 (branch `table-state`): `core/tables.ts`, the core's
  register: `TableKey` (modules hold keys, never make or read one: the
  isolation test says so), matched to the page's tables each time its text is
  read: a table of unchanged text keeps its key wherever it is (a table
  inserted or deleted before it, Ctrl+Z), the others take in order the keys
  left between those, a gone table's key stays for it to come back to;
  `tableKeys(page, text)`, `pageOf`, `newTableKey` (the sheet's new table) on
  the host. Reviewed; fixed: a gone table's key taken by the next table
  edited after it (keys of tables in the text before come first), one early
  match by text (a copy pasted before the tables) dropping the keys of all
  after it (the longest run in order kept, a table moved found too), a new
  table written again after an undo taking its gone key instead of the one
  made for it (reserved keys before gone ones), keys made for tables never
  written (made as the value is saved, given back if not written). Modules' state for a table stays theirs, in maps by key: with keys
  that never change, a state held by the core would be the same maps (weighed
  and left).
- 2026-10-23, phase 5 (branch `table-delete`): *Delete table*, the core's,
  last in every table's ⋯ menu: asked first (`tableDeleteWarning` of the
  modules: the formulas of tables referring to it, a sheet whose only table
  it is), one edit with the tables the modules change for it
  (`otherTablesWritten` with no `after`: `#REF!`, the sheet's widths handed
  on). Next: moving tables on the sheet.
- 2026-10-23, phase 5: moving a table on the sheet (a table on a sheet
  only): its handle at the top left corner (dragged; clicked: the whole table
  selected), *Move table…* in the ⋯ and cell menus (the next press or tap),
  the whole table selected dragged by its edge (the selection module, through
  the frame: no hook); all through `AddressFrame` (`origin`, `cellAt`,
  `placeProblem`, `previewPlace`, `moveTo`), the rule `placeProblem` in
  `sheet/layout.ts` (never over another table, never past A1).
  Reviewed; fixed: the history marker of Delete table put into the next table
  (the table's own span given; at the page's start a line break kept for the
  cursor), Esc during any drag Esc cancels going to the features (a board
  closed, a selection cleared: the core keeps it for the drag), Esc in Move
  table… from a cell's menu clearing the selection instead (a feature picking
  gets the keys first: `pointerBusy` "pick"), a table in column A or row 1
  jumping as its whole selection is dragged by its edge (`cellAt` keeps the
  point on the grid), the handle not draggable by a finger (`touch-action`),
  the overlap check by rows as shown (a filter's hidden rows: by the markdown's
  now), a table alone's edges offering a move (`movable`), the handle shown
  with its corner scrolled out of the board, CRLF at the page's end, Delete
  table finding its table by its key. Left: deleting the first of two tables of
  the same name moves references to the second (formulas take a name's first
  table).
- 2026-10-23, phase 6 (branch `table-parts`): `core/parts.ts` (a part's class
  declares its hooks; the core routes those hooks by the table they are about,
  makes and keeps the parts, ends them with the module; `host.tablePart`,
  `host.tableParts`); filters, widths, lazy saving and largeTables moved onto
  parts, no change in behaviour; the isolation test keeps modules from
  collections by key (the sheet aside).
  Reviewed: no behaviour changed but one, fixed: switching one table's lazy
  saving off cancels the delay again (every flush does, as before); the module
  routed knows its parts as the module's own (no second set). Left: the sheet
  keeps its board's tables by key (the board spans them).
- 2026-10-23, branch `sheet-followups`: SilverBullet's table under a drawn
  one is no longer decorated nor viewed (only registered, the features told),
  shown as itself once the board ends: a write on the sheet lays out one table
  (400 rows: about 210 to 160 ms in the playground). Pins on the sheet tried:
  they scroll with the sheet, a value under a row pinned to the bottom or
  right of a column pinned right goes before it (as in the page), scenarios
  and the library page say so. Delete table says when another table of the
  same name takes the references over.
  The sheet's scrollbars no longer move with writes that widen a column (the
  user saw them jump while editing): the grid's reach only grows while the
  board shows. Then, from the user's steps (a table at G4, G5 and G6 edited):
  the board scrolled down by the table's place (the core's view anchor took
  the drawn table's top before the sheet placed it: tables a feature draws
  are not anchored now), and the column of the cell edited next grew wide and
  shrank again (its editor held the cell to its width before the sheet laid
  the table out: dropped while the sheet measures).
  Also: Ctrl held over cells selected (select mode) shows the move cursor as in
  a cell editor (Ctrl+arrows move the selection); a sheet's tables have a light
  line round them (`--swt-sheet-table-line`), where each ends among the empty
  cells.
  A formula's result on the sheet is underlined again (the content's box
  clipped the underline: room above and below the line now). A write of a
  table whose last write is not rendered anew yet waits for it (a + pressed
  twice on the sheet, in SilverBullet: "the table changed in the meantime").
  A table shown as a sheet but on none says so in its toolbar: its sheet's
  name *No sheet* in the danger color, the row of names shown whatever the
  setting (a name's `attention`), a click its field (agreed with the user: no
  label of its own on the board).
  Tab / Shift+Tab move the cell selected (select mode) as in a cell editor;
  Enter on the last row adds a row with *Save, edit the cell below* (agreed
  with the user: only with that setting).
