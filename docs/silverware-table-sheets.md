# Silverware Table: an Excel-like sheet of several tables (analysis, not started)

Status: analysed on 2026-10-22, the decisions taken the same day (below).
Step 1 built the same day: the sheet module (`features/sheet.ts`), *Sheet
view* in a table's toolbar, beside full screen (which stays as it was); the
table over the window shared with it (`core/overwindow.ts`), a cell past the
table edited by the core's cell editor (`TableHost.editBeyond`, the table
grown in one write: `growTo`). Steps 2 to 4 not started.

## The request

A toolbar icon switches to an Excel-like view: like today's full screen, but
with "endless" rows and columns, also where the table has no data. Markdown
has one table per block, so a sheet holding several tables is several
tables of the page: out of the sheet the page shows them as plain tables;
an attribute in each says it belongs to the sheet and where it sits on it.
Each table stays editable on its own, and edits show on the sheet. Formulas
on the sheet show addresses of the sheet, while each table keeps its own
(A1 is its first row under its header); a formula referring across tables on
the sheet is stored as a reference to that table (`other!B2`) with the cell
translated.

Verdict: doable, and as a module, but a large project (the size of the
formulas module). Storing and formulas are not the hard part; the number of
interactions on the sheet is.

## Design

### Stored in the markdown

- Each table is its own block, as now. Its metadata row says which sheet it
  is on and where its top left corner is (its header's first cell), and
  names it: `<meta name='income' sheet='Budget' at='B3'>`. A page can have
  several sheets, by name; a table is on one sheet at most.
- Every table on a sheet has a name: a reference from another table, to a
  cell (`income!B2`) or to a named cell (`income!total`, as cell names are
  their table's since 2026-10-22), needs it. Out of the sheet nothing names a
  table by itself (a name is metadata written into it; a bare name of another
  table's cell is `#NAME?` saying to name that table); a table on a sheet has
  metadata anyway (`sheet`, `at`), so a name there adds nothing a user of the
  sheet does not expect.
- What belongs to the sheet itself (its columns' widths:
  `sheet.width.E='120'`) is in the metadata row of its first table (the
  first in the page's order); a table leaving the sheet first hands it on to
  the next. A sheet has no block of its own.
- Out of the sheet the page is ordinary tables, readable anywhere; the sheet
  is only another view of them. A table moved on the sheet changes its `at`,
  not its place in the page.

A whole example, the sheet's first table, sorted:

```markdown
| <meta name='costs' sheet='Budget' at='B3' sort.price='desc' sheet.width.E='120'> |
```

### Tables on a sheet

- **Added by hand**: *Add to sheet…* in a table's menu lists the page's
  sheets (or a new one); the tables to add are listed by name, and tables
  without a name by their first three column names, row count and place
  (`Name, Qty, Price… · 12 rows · 3rd table`), the table outlined on the
  page while hovered, and named in the same dialog.
- **Opened**: the toolbar icon of a table on a sheet opens its sheet; on the
  sheet a switcher of the page's sheets (as Excel's sheet tabs); a command
  *Silverware Table: Open sheet…*.
- **Removed** (*Remove from sheet*): its `sheet` and `at` go, its name stays
  (formulas may refer to it). The last table removed, the sheet is gone.
- **A sheet deleted** (a command, *Silverware Table: Delete sheet…*, and the
  sheet's menu, asked first): every table's `sheet`, `at` and the sheet's
  `sheet.*` go, the tables stay as they are, with their names.
- **Moved** by dragging: onto another table refused (the outline shows the
  overlap, letting go does nothing). Tables may touch.

### The view

- Over the whole window (as the fullScreen module lays a box over it), its
  own grid: column letters, row numbers, empty cells in every direction, the
  tables drawn at their places.
- Drawn by the module from the markdown model of the page's tables (as the
  formulas read them), not from SilverBullet's rendered tables: independent
  of when SilverBullet renders the tables anew.
- Only the part in view is drawn (an endless grid), as largeTables places
  only the rows in view.
- **Widths** are the sheet's (`sheet.width.<letter>` in its first table). A
  column the sheet has no width for takes the width of the first table on it
  that has one (`width.<column>`), not written anywhere until changed on the
  sheet.
- **Pins** are a table's: its pinned rows and columns hold at the view's
  edge while that table is in view, as today's held header, and go with it
  past its end.
- **Sorting** is a table's and a view, as today (`sort.<column>`, stored
  with the metadata setting, else for the visit): it changes which record
  shows on which row of the sheet, never the markdown.
- **Filters** hide whole rows of the sheet, as Excel's: a row is hidden when
  any table's filter hides it, so a table beside a filtered one loses those
  rows too.
- Desktop first; phones later, so nothing may rule them out (touch, scrolling
  sideways, today's touch handles and taps).

### Editing

- A cell of the sheet is (table, row, column). A write goes to that table's
  markdown as today (`host.write`): its write steps, so tables referring to
  it are recalculated in the same edit; one undo step per edit, tables moved
  by it (their `at`) in the same edit.
- **Everything acts within one table**: a selection stops at its table's
  edge; AutoFill fills within its table and goes no further (more rows or
  columns are added first); moving, inserting and deleting rows or columns
  are the table's, not the sheet's (no *Insert sheet column*); pins the
  table's.
- **Growth**: typing into an empty cell right beside a table grows it by
  that row or column. Typing into an empty cell far from every table asks
  first, in a dialog that names the new table: a new block after the sheet's
  last table in the page, its first row the header (as markdown has it).
  Pasting over a table's edge grows the table to hold all of it. A table
  that grows moves everything below it down, or right of it right, as
  inserting rows or columns in Excel does; a table that shrinks (rows or
  columns deleted) moves them back up or left.
- **A new column's header** is a default, `Column 5` (one more than the
  table's columns, the next free number where taken: how a column inserted
  is named already): SilverBullet makes a column key of it and formulas
  refer to it.
- A sorted or filtered table takes no paste and no AutoFill, as today
  (`rearranged`): a fill down a sorted view would write irregular references
  (D9, D3, D12). The hint says to unsort.
- The core would need generic additions only: writing a table of the page by
  its key without it being rendered at that moment, maybe the cell editor
  usable outside SilverBullet's tables. No knowledge of the module.

### Formulas: addresses translated

- Stored as today: within the table `B2`, another table `income!B2`.
- On the sheet, shown and edited in the sheet's addresses: a table `costs`
  at `B3`, its header on row 3, has its own `A1` at the sheet's `B4`; `=E7`
  is stored as `costs!D4` (E is its fourth column, 7 its fourth row under the
  header), as `D4` in `costs` itself. A `$` goes with the reference both ways
  (`costs!$D$4`).
- **A reference is to a record**, its row in the markdown, as today:
  sorting a table on the sheet changes the address shown (`=E7` may read
  `=E3` once sorted), not the value. Nothing more is stored for it: the
  markdown's order does not change by sorting, and Silverware Table's edits
  (rows inserted, deleted, moved, sorted into the markdown) move references
  already. Rows reordered by hand in the markdown are not followed, as
  today; a name (`pear[price]`, `costs!total`) is. (Excel and Google Sheets
  keep an address, so a value changes when its range is sorted; here a value
  written into the markdown would then depend on how a viewer sorted.)
- A range is within one table (`=SUM(C3:F10)` across two tables: the sheet
  does not let it be selected). In a sorted table a range cannot be pointed
  (its rows need not follow each other in the markdown): the hint offers the
  whole column, `[price]`. A range stored shows in the table's unsorted
  addresses, its outline on the cells it holds.
- A reference to an empty cell of the sheet is refused: no table holds it.
- A table's header clicked while typing a formula inserts its whole column
  (`[price]`, `costs![price]`), as today; the sheet's column letter inserts
  nothing (`E:E` would span tables).
- Out of the sheet a table's formulas read in its own addresses, on the sheet
  in the sheet's: the price of valid markdown tables and a sheet. References
  to tables not on this sheet (the page's others, other pages') show as
  stored (`rates!B2`, `[[Page]]t!B2`).
- Named cells: a bare name is the formula's own table's only; another
  table's is `costs!total`. On the sheet the list while typing offers the
  other tables' cells so already (every table there has a name), and saving
  a formula qualifies a bare name another table of the page has
  (`qualifyCellNames`), so a name typed on the sheet is stored as it reads
  in the markdown.
- The formulas' parser and their reference edits exist; the module would use
  their API as `excel/` does (the formulas know nothing of the sheet).

### Excel

- A sheet downloaded as .xlsx is one worksheet: each table at its `at`, its
  rows in the markdown's order (as today's download), references translated
  to the worksheet's addresses (each is to one record, so its cell is
  certain), so Excel calculates what Silverware Table did. A range within a
  table stays one range in that order. Another table's named cell is written
  as its address or as an Excel defined name (to decide when built; today's
  export writes such a formula as its value). Not verified until built.

### What is hard

- Growth and moving the tables around it, in one edit.
- Interactions: today's modules (selection, clipboard, AutoFill, filters,
  sorting, column types, widths, pins) work on one table SilverBullet
  rendered; on the sheet they act within one table too, but on the sheet's
  own drawing, so each needs taking over. Column types (formatting) and
  formulas work on the model and are the easiest.
- Performance: the endless grid drawn only in view.

### Order

1. **Excel-like view of one table** (decided to come first): full screen
   with the grid, letters and numbers, empty rows and columns around it;
   typing into an empty cell grows the table. The smallest step, useful at
   once; it proves the grid, drawing in view and the editor outside
   SilverBullet's tables.
2. **The sheet, read only**: several tables by `sheet` and `at`, adding and
   removing tables, a table moved on the sheet, formulas shown in the
   sheet's addresses.
3. **Editing on the sheet**: values and formulas with addresses translated,
   growth and moving the tables around.
4. **Selecting, copying, AutoFill, filters, sorting, widths, pins on the
   sheet**, each within its table; the .xlsx of a sheet.

Rendering (2026-10-22, see CLAUDE.md, *Which tables are in the DOM*): with
tables rendered by SilverBullet and laid on the sheet (variant A), only the
open page's tables can be on a sheet, and only those CodeMirror keeps in the
DOM: within about the view's height + 1000 px of the page, text between them
included (some 40 to 50 rows on a laptop). The sheet would scroll the page to
its tables when it opens; new tables are written after its last one already,
*Add to sheet…* of a table far from the others would offer to move its block
there, a table not drawn would show as a place with why. The largeTables
module keeps a tall table to a box of the window's height in the page. A
sheet drawing its tables itself (variant B) has no such limit. It was thought
to lose what SilverBullet renders in cells (`${…}`, links, hashtags,
formatting, tasks), and A was leaned to for that; probed on 2026-10-22, it
need not (*Cells of a table the sheet draws*, below). Tables of other pages
are reached by formulas (`[[Page]]t!B2`), not placed on the sheet.

### Cells of a table the sheet draws (probed 2026-10-22)

SilverBullet's table widget renders with `renderMarkdownInto` and the live
context (`client/codemirror/syntax/table.ts`), not a syscall. Two syscalls
render markdown the same way; probed in the local build (2.12.1, main of
2026-10-16), a table with a page link, bold, a link out, hashtags, `${…}` (a
number, a text, an index query) and a `<meta>`:

- `markdown.renderToDom(markdown)`: a live DOM node (`span.wrapper` holding a
  `<table>`), the whole table at once; every cell the same as the widget's,
  `${…}` evaluated live (`span.sb-slot`), `<meta>` kept (hidden); only the
  widget's `data-pos` missing, which a sheet drawing from the markdown does not
  need. 100 rows with a link, a tag and `${…}` each: 14 ms. "Space Lua only":
  handed to the JS through the library page's Lua, as the bridge's other calls.
- `markdown.markdownToHtml(markdown, { expand = true })`: HTML text, the same
  cells, `${…}` evaluated, its results static (event handlers dropped), links'
  `href` with a leading `/`. 100 rows: 6 ms. Without `expand`, `${…}` stays as
  its source.
- **A click on a link or a hashtag in that DOM loads the window anew** (the
  page's state gone, verified): the widget's handlers are attached by
  `attachWidgetEventHandlers`, internal, not by the syscall. A sheet drawing
  its tables takes such clicks itself: `a[data-ref]` to SilverBullet's
  navigation (`editor.navigate(ref)`, through the bridge); links out open a
  tab as they are.
- Both came with SilverBullet's commit `1dd7556f` (2026-10-10, Lua
  expressions and widgets evaluated anew); which release has them is not
  verified. Not verified either: interactive widgets in `${…}` (buttons), which
  the live context should keep working.

So a sheet drawing its tables (variant B) renders each table with
`renderToDom`, its links' clicks routed to SilverBullet's navigation; where
SilverBullet has no such syscall, `markdownToHtml` with `expand`, else an
own plain rendering (text, links, hashtags, `${…}` as written).

Open before step 4: how today's modules (selection, clipboard, AutoFill,
widths, pins) work on the sheet's drawing. (A) The sheet makes its own: the
core stays as it is, the features twice. (B) The core takes a table that
is not SilverBullet's rendered one: the sheet offers each of its tables to
the core as a rendered table, and today's modules run on it unchanged; a
large change of the core (`TableRows`, geometry, hover, controls), still
generic, which also loosens the core's tie to SilverBullet's DOM (`dom.ts`
becomes one source of tables among others). Leaning to B (2026-10-22);
steps 1 to 3 do not need it and show how close the drawn grid is to a
table.

Size: step 1 a medium feature; steps 2 and 3 large (as the formulas module);
step 4 by how much of today's features the sheet takes over.

## Decisions (2026-10-22)

**Storing and names**

1. A table joins a sheet by hand (*Add to sheet…*), named tables listed and
   unnamed ones by their columns, rows and place; a page has several sheets.
2. Sheets are named (`sheet='Budget'`).
3. A table on a sheet is always named (named in the dialog adding or making
   it); out of a sheet tables are not named automatically.
4. A table is on one sheet at most.
5. The sheet's own data (widths) is in its first table's metadata row.
6. *Remove from sheet* keeps the table's name; *Delete sheet…* (a command and
   the sheet's menu) removes the sheet's metadata from every table, the
   tables stay.

**Empty cells and growth**

7. Typing right beside a table grows it.
8. Typing far from every table asks to make a new table, named in the
   dialog, written after the sheet's last table.
9. A new table's first row is its header.
10. A new column's header is `Column N` (one more than the table's
    columns, the next free number where taken, as inserted columns are named).
11. Growth moves everything below or right of it, as Excel; shrinking moves
    it back. Pasting over the edge grows the table; AutoFill stays within it.
12. Tables may touch; a table dragged onto another is refused.

**Formulas**

13. A range is within one table; the sheet does not let one be selected
    across tables.
14. A reference to an empty cell of the sheet is refused.
15. A header clicked inserts its column (`[price]`); the sheet's letter
    nothing.
16. A formula reads in the sheet's addresses on the sheet, in the table's
    out of it.
17. Sorting stays a view and a reference stays on its record (variant A):
    the address shown follows the sort, the value does not change; a range
    is not pointed in a sorted table; nothing more stored.

**Interactions**

18. Selection, copy and paste, AutoFill, moving and inserting rows and
    columns, pins: all within one table. Widths: the sheet's.
19. Sorting per table (a view); a filter hides the sheet's whole rows.

**Scope and order**

20. Step 1 first (one table, Excel-like).
21. Desktop first; phones to follow, so nothing rules them out.
