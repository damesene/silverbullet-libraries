# Silverware Table: modules isolated from the rendering

Status: started 2026-10-22, branch `core-view-isolation`. Done: step 1, and of
step 2 the column types (looks, the choice list as a panel) and the filters'
header mark.

## Why

Silverware Table decorates the tables SilverBullet renders. Every module
(formulas, selection, filters, AutoFill, …) works on that DOM itself: classes
on `<td>`, elements put into cells, cells measured, rows found by `<tr>`. So a
change of SilverBullet's DOM in a new version breaks modules all over, and the
rendering cannot be swapped: the sheet of several tables needs tables drawn by
Silverware Table itself (SilverBullet keeps only the part of the page near the
view in the DOM, see silverware-table-sheets.md), and drawing them would mean
writing every module again.

## The boundary

- **Modules** (`src/features/`) work in model terms only: a table by its key
  (`WidgetInfo` without its element), a cell by its row in the markdown (the
  header 0) and its column, ranges of those. They never touch the rendered
  table: no `<table>`, `<tr>`, `<td>`, the widget, their classes, styles,
  content, size or place, nor `querySelector` on the page.
- A module may build **its own UI** as DOM (the content of a panel, a dialog,
  a bubble, a list), inside a container the core gives it (`openDialog`,
  `panel`, menus from `MenuEntry` data) and placed by the core by what it is
  anchored to in model terms (a cell, a header, the cell editor, a point).
- **The core** (`src/core/`, `controller.ts`) holds the model of each table
  shown, the view (sorting, rows hidden, their order), the cell editor's state,
  writes, menus, and routes events to the modules in model terms. It does not
  touch the DOM of the tables either: it asks **the adapter**.
- **The adapter** (`core/adapter.ts` the interface `TableAdapter`,
  `core/silverbullet/` its implementation for SilverBullet) is part of the core
  but behind that interface: it knows the rendering. SilverBullet's adapter
  finds the tables SilverBullet rendered, applies to them what the modules
  asked for (the looks of cells, marks, outlines, handles), turns DOM events
  into events on cells and answers geometry; everything about SilverBullet's
  DOM is in it (with `dom.ts`). What is really rendering moves there from the
  modules: the sticky header, large tables' rows in view, long text wrapped or
  cut, columns' widths applied, pinned columns, the expand button,
  middle-button autoscroll, `${…}` cells re-evaluated. A rendering drawing
  tables itself (the sheet; later perhaps the page's tables too) is another
  adapter of the same interface.
- **Mechanisms in the core, decisions in the modules**: the core and the
  adapter offer what a rendering can show and what events it gives, in
  general terms (a cell's display, value, marks and title; icons in a header;
  a panel at an anchor; the editor's text and caret); what to highlight,
  format or offer is the module's. Neither names a module, its classes or its
  settings in code (as CLAUDE.md asks of the core already).
- A test fails when a module refers to the rendered table (its element types,
  its selectors and classes, the host's methods that hand out its elements).

## The API, in model terms

What replaces what the modules do on the DOM (the inventory of 2026-10-22):

- **Reading**: `shownOrder(info)` (the rows shown, display order, the header
  first), `shownText(info, ref)` (a cell's text as rendered: a link's text, a
  `${…}` result), `shownValue(info, ref)` (what sorting and filters compare:
  a type's value, the edited cell's text), `tableFor(key)`.
- **Writing by key**: `write(info, change, options)` and the structural edits
  (`core/structure.ts`) by the table's key, rendered or not (`writeTable`).
- **Looks of cells**: `Feature.cellLook(info, ref, markdown)` returns what a
  cell shows and is (`display`: text or a link, `value` for sorting, `marks`,
  `title`), the core merges the modules' looks in their order and the renderer
  applies them; `Feature.headerLook(info, column)`: icons after the name (the
  type's, the filter mark), marks, the type hashtag hidden.
- **Marks** that change without a new rendering (the selection, the column a
  grip hovers): `host.marks(layer).set(info, cells, mark)`; kept by table key
  and cell, so a table rendered anew shows them again.
- **Outlines** of ranges (copied, cut, filled, a move's target, a formula's
  references) and **handles** at a range's corner (the fill handle, the
  selection's handles), drawn by the renderer, reporting presses and drags.
- **Events** in cell terms: a press on a cell (with its keys, button, pointer
  kind, a tap told from a long press), hovering a cell, **drag sessions** that
  report the cell under the pointer (clamped to the table where asked), with
  autoscroll near the edges and Esc in the core; picking the next cell
  pressed (*Move to…*, *AutoFill to…*).
- **Panels**: a floating container a module fills, anchored to a cell, a header,
  the cell editor or a point, placed below or above where it fits, following
  scrolling, hidden when its anchor is out of view; a tip at the pointer.
- **The cell editor's state**: the cell, its text and selection, and calls to
  insert text (undoable), set the text and caret, save; an input hook.
- **The clipboard**: copy and cut of cells asked from the core (it owns the
  window's events and the active field's checks), paste into the editor.
- **Line drags** (a row's or column's grip): the core carries the lines (the
  ghost, the room opened, rows out of the document), the module says where
  they may go and writes the move.

## Order

Each step leaves `npm run verify` and the UI tests passing; the old host
methods stay until no module uses them.

1. The model API beside the old one (reading, geometry by ref, looks, marks,
   writing by key); names, metadata, export, excel, lazy, pagelinks, themes,
   history, fullScreen moved onto it.
2. Column types (looks, the editor's choice list as a panel), filters (header
   icons, the filter row as a container the module fills, its bubble a panel).
3. Selection, paste, AutoFill, grips (outlines, handles, drag sessions,
   clipboard, line drags).
4. Formulas (looks, the hint as a panel at the editor, reference outlines with
   drag handles, pointing as cell presses).
5. The rendering modules into the renderer (sticky, largeTables, longText,
   widths, popup, autoscroll, expressions, the views over the window).
6. The old DOM members of `TableHost` and `Feature` removed, the isolation test
   on; the sheet's own tables as a second renderer.
