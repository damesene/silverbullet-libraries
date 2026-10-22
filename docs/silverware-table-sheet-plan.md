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

Editing is part of this phase (agreed): the new sheet replaces today's, so it
merges only once it does all today's does; a merge is never a step back.
Ends with today's sheet view replaced by one whose table Silverware Table
draws itself, doing all today's sheet does (the grid, letters and numbers,
empty cells past the table, typing there grows the table, Esc), and today's
modules (selection, menus, copy, grips, AutoFill, formulas' hint, column
types, filters' marks) working on it unchanged.

1. The core with more than one adapter at once: each table shown belongs to
   one (SilverBullet's, or one drawing tables itself); events, geometry,
   looks, marks, outlines, handles go to the table's adapter; floating
   controls placed by it.
2. The cell renderer (`core/silverbullet/cells.ts`, interface `CellRenderer`):
   `render(cells)` in two steps (ready at once: plain cells and cached ones;
   then a promise for the rest, one SilverBullet call per table, each cell a
   row of a helper table), `release(nodes)`, whether cells need rendering
   again after indexing; the static renderer (`markdownToHtml` with
   `expand`, through the bridge), a bounded cache by text (cells without
   `${…}`), late results dropped unless the cell still shows that text, the
   plain-text rule tested on edge cases; the plain renderer (no syscalls) as
   the fallback. Clicks on `a[data-ref]` to `editor.navigate` through the
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

1. The page's sheets from the tables' metadata (`sheet`, `at`), the model
   part of `sheet-view`'s `sheet/page.ts` rewritten to the new API.
2. Several tables on one grid by `at`, each drawn by the sheet's adapter
   (no limit of what CodeMirror keeps in the DOM).
3. *Add to sheet…* (a dialog through `openDialog`) and *Remove from sheet*.
4. Formulas shown in the sheet's addresses.
5. Review, fixes, click-through, merge.

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

- 2026-10-22: plan agreed (editing in phase 1, every phase merged without asking); nothing of phase 1 started.
