# Silverware Table: an Excel-like sheet of several tables (analysis, not started)

Status: analysed on 2026-10-22, nothing built. To be picked up later; the
decisions below come first.

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

## Proposed design

### Stored in the markdown

- Each table is its own block, as now. Its metadata row says which sheet it
  is on and where its top left corner is, and names it (references from
  other tables need a name): `<meta name='income' sheet='Budget' at='B3'>`.
- Out of the sheet the page is ordinary tables, readable anywhere; the sheet
  is only another view of them.

### The view

- Over the whole window (as the fullScreen module lays a box over it), its
  own grid: column letters, row numbers, empty cells in every direction, the
  tables drawn at their places.
- Drawn by the module from the markdown model of the page's tables (as the
  formulas read them), not from SilverBullet's rendered tables: independent
  of when SilverBullet renders the tables anew.
- Only the part in view is drawn (an endless grid), as largeTables places
  only the rows in view.

### Editing

- A cell of the sheet is (table, row, column). A write goes to that table's
  markdown as today (`host.write`): its write steps, so tables referring to
  it are recalculated in the same edit; one undo step per edit.
- The core would need generic additions only: writing a table of the page by
  its key without it being rendered at that moment, maybe the cell editor
  usable outside SilverBullet's tables. No knowledge of the module.

### Formulas: addresses translated

- Stored as today: within the table `B2`, another table `income!B2`.
- On the sheet, shown and edited in the sheet's addresses: a table at `B3`,
  its header on row 3, has its own `A1` at the sheet's `B4`. Saved back
  translated: `=E7` is stored as `costs!B3` when E7 is in the table `costs`.
- The formulas' parser and their reference edits exist; the module would use
  their API as `excel/` does (the formulas know nothing of the sheet).
- Limits to decide (below): a range across two tables (one range in the
  markdown cannot hold it), a reference to an empty cell of the sheet (it
  points nowhere), the header (a row on the sheet, not counted by a table's
  formulas: A1 is the first row under it).

### What is hard

- Typing into an empty cell: beside a table it can grow the table; far from
  every table a new table (a new block) or nothing.
- Collisions: a table that grows runs into the one under it.
- Interactions: selecting across tables, copy and paste, AutoFill, moving a
  table on the sheet by dragging (its `at` changes). Today's modules
  (selection, clipboard, AutoFill, filters, sorting, column types, widths,
  pins) work on one table SilverBullet rendered: on the sheet they need
  rework or are left out at first. Column types (formatting) and formulas
  work on the model and are the easiest to take over.
- Performance: the endless grid drawn only in view.

### Order proposed

1. **Excel-like view of one table**: full screen with the grid, letters and
   numbers, empty rows and columns around it; typing into an empty cell
   grows the table. The smallest step, useful at once; it proves the grid,
   drawing in view and the editor outside SilverBullet's tables.
2. **The sheet, read only**: several tables by `sheet` and `at`, a table
   moved on the sheet, formulas shown in the sheet's addresses.
3. **Editing on the sheet**: values and formulas with addresses translated,
   no ranges across tables yet.
4. **Selecting, copying, AutoFill on the sheet**, and the decisions on
   collisions and new tables.

Size: step 1 a medium feature; steps 2 and 3 large (as the formulas module);
step 4 open, by how much of today's features the sheet is to have.

## Decisions needed (recommendation after each)

Storing and names
1. How a table joins a sheet: by hand (*Add to sheet…* in its menu), or
   every table of the page? Recommended: by hand; a page can have tables
   that do not belong on it.
2. Several sheets on a page: one per page, or named sheets
   (`sheet='Budget'`)? Recommended: named; the attribute is needed anyway.
3. A table without a name on the sheet: named automatically (`table1`), or
   asked? Without a name no other table can refer to it. Recommended:
   automatically, renamed with the pencil as today.

Empty cells and growth
4. Typing into an empty cell right beside a table: grow the table by a row
   or column? Recommended: yes.
5. Typing into an empty cell far from every table: a new table (a new block
   at the page's end), or refused? Recommended: refused in the first
   version, with a hint; a new table from a menu.
6. A new table made on the sheet needs a header: its first row as the
   header (as markdown has it), or an automatic one (`A`, `B`, …)?
7. A table growing into another: move the others down or right, refuse the
   growth, or only mark the overlap? Recommended: move the tables under it
   (as inserting rows in Excel does).

Formulas
8. A range across tables (`=SUM(C3:F10)`): refused, or split into
   `SUM(a!…, b!…)`? Recommended: refused in the first version, with why.
9. A reference to an empty cell of the sheet (outside every table): refused,
   or the table grown? Recommended: refused.
10. A table's header cell clicked in a formula: a reference to its whole
    column (`[price]`, as today), or nothing? Recommended: the column.
11. Out of the sheet a table's formulas show its own addresses (`B2`,
    `income!B2`), on the sheet the sheet's: the same formula reads
    differently by where it is edited. Acceptable? (The price of valid
    markdown tables and a sheet.)

Interactions in the first version
12. What works on the sheet from the start? Recommended: editing values and
    formulas, arrows and Tab across tables' borders, moving a table by
    dragging, column types (formatting). Later: selecting across tables,
    copy and paste, AutoFill, filters, sorting, widths, pins.
13. Sorting and filters of a table on the sheet: off, or per table?
    Recommended: off; a sorted table would change what is on which row of
    the sheet, which confuses its addresses.

Scope and order
14. Start with step 1 (one table, Excel-like, empty rows and columns), or
    the sheet of several tables at once? Recommended: step 1.
15. Phones: the sheet on a touch screen (touch, scrolling sideways), or
    desktop only at first? Recommended: desktop first.
