---
name: Library/damesene/table-plus
tags: meta/library
description: "Table Plus: sort, filter and edit markdown tables in place, and move, add or delete rows and columns."
files:
- table-plus.js
---
# Table Plus

Makes the markdown tables in your pages interactive: edit cells in place, sort, filter, and add, move or delete rows and columns. The tables stay plain markdown, and every change is an ordinary edit you can undo.

## At a glance

* **Edit a cell**: click it and type (or click it again, or double-click it), press Enter. The *Edit mode* button (✎, left of ⋯ in the toolbar) edits on the first click. See [[#Editing cells]].
* **Move between cells**: Tab / Shift+Tab, or Ctrl+arrows while editing; Ctrl+Alt+arrows move the row or column (with cells selected, all their rows or columns). See [[#Keyboard]].
* **See the markdown**: hover the table and click *Edit markdown* in the toolbar's ⋯ menu, or Alt+click a cell. See [[#Showing the markdown]].
* **Sort**: click ⇅ in a column header. See [[#Sorting]].
* **Filter**: hover the table and click *Filter*; `>10`, `/regex/`, `=text` and `!text` work too. See [[#Filtering]].
* **Add, move or delete rows and columns**: click the ⠿ grip next to a row or above a column. See [[#Rows and columns]].
* **Copy or empty cells**: drag across cells to select them; Ctrl+C copies them for Excel or Google Sheets, Delete empties them. See [[#Copying cells]].
* **Paste from a spreadsheet**: copy cells in Excel or Google Sheets, click a cell, Ctrl+V; Ctrl+Shift+V adds them as new rows. See [[#Pasting from a spreadsheet]].
* **Column types**: `| Price #currency |` shows `12.99` as `€12.99`, `#stars` a rating as stars, `#check` yes / no as ✅ / ❌. See [[#Column types]].
* **Formulas**: type `=SUM(B1:B3)` or `=SUM([qty])` into a cell; the result is written into the markdown. See [[#Formulas]].
* **Pin rows and columns** to the edges, where they stay in view (needs *Store table metadata*). See [[#Pinning]].
* **Change how Enter or filters work**: *Configuration: Open*, category *Table Plus*. See [[#Settings]].

## Editing cells

* A click selects a cell, as in a spreadsheet: then **type** to replace its text, or click it again, double-click it, press **Enter** or **F2** to edit its text. **Backspace** empties it for typing. Arrows move to the cell beside.
* **Edit mode** (the ✎ button in the table's toolbar, left of ⋯; off by default): a click edits the cell right away. This browser remembers the choice.
* In the editor, Enter or clicking elsewhere saves; Esc cancels and leaves the cell selected (a second Esc ends that).
* A click puts the cursor at the end of the cell's text; with the *Click selects the cell's text* setting it selects the whole text, to type over it, and so do Enter, Tab and Ctrl+arrows moving to the next cell. See [[#Settings]].
* Shift+click selects cells, as in a spreadsheet: see [[#Copying cells]].
* Links, tasks and buttons in cells work as before: clicking them does not start editing.
* A column always needs a name: emptying a header cell keeps the old name.

### Keyboard

| Key | While editing a cell |
|---|---|
| Enter | Save, edit the cell below (with the `save` setting: only save) |
| Ctrl+Enter | Save, add a row below, edit it |
| Esc | Cancel; the cell stays selected (marked) for the keys of [[#Copying cells]], a second Esc ends that |
| F2 | Go on in the cell's popup: the whole text wrapped (a long text or formula), see [[#Long text in cells (`tablePlus.modules.longText`)]] |
| Tab | Save, edit the next cell |
| Shift+Tab | Save, edit the previous cell |
| Ctrl+arrows | Save, edit the cell beside |
| Ctrl+Home | Save, edit the row's first cell |
| Ctrl+End | Save, edit the row's last cell |
| Ctrl+PageUp / PageDown | Save, edit the cell 10 rows up / down |
| Ctrl+Shift+arrows | Save, select the cells from this one on (see [[#Copying cells]]) |
| Ctrl+Alt+↑ / ↓ | Move the row up / down |
| Ctrl+Alt+← / → | Move the column left / right |
| Ctrl+Alt+Home / End | Move the column to the start / end |
| Ctrl+Alt+PageUp / PageDown | Move the row 10 places up / down |

* Tab on the last cell adds a row.
* Shift+Enter opens the cell below the other way round: with its whole text selected, or with the cursor at the end when the *Click selects the cell's text* setting is on. See [[#Settings]].
* Ctrl+Alt+arrows save the cell and move it with its row or column, and keep editing it. Rows cannot move while sorted or filtered, nor the header row.
* Enter (and Shift+Enter) also moves to the cell below; with the `save` setting it only saves. See [[#Settings]].
* Browsers use Ctrl+PageUp / PageDown to switch tabs and do not pass them to the page. They work where SilverBullet runs without tabs (installed as an app).
* While Ctrl is held, the pointer shows a move cursor. Without Ctrl, arrows, Home and End move within the cell's text as usual.

## Copying cells

* Press on a cell and drag across others, the header included if you like: the cells in between are selected. A click selects one cell (in *Edit mode* it edits it, see [[#Editing cells]]).
* **Shift+click** a cell: the cells from the one being edited (it is saved) to this one are selected; with cells selected already, from the first of them; else just this cell.
* **Shift+arrows** (Ctrl+Shift+arrows too) move the selection's far corner by a cell; in a cell editor, Ctrl+Shift+arrows start a selection there.
* With cells selected, **arrows** (and Ctrl+arrows) go to the cell beside, **Home / End** to the row's first / last cell, **Ctrl+Home / End** to the table's first / last cell, **PageUp / PageDown** 10 rows up / down (PageUp stops at the first row under the header). The selection is then that cell; with Shift it extends to it.
* **Ctrl+C** copies them as a spreadsheet does, so Excel, Google Sheets or LibreOffice paste them into cells, and other editors as text (a tab between cells, a line break between rows).
* Cells copy what they show: a formula's result, a link's text.
* The selection follows the rows as shown: in a sorted or filtered table it takes the rows in their order on the screen, without the hidden ones.
* **Delete** empties the selected cells, formulas included, as one edit (Ctrl+Z brings them back). Header cells keep their names: a column needs one. Names of rows and cells stay with their cells.
* **Delete whole rows or columns**: select them (click a row's or column's grip; for more, Shift+click a grip or *Select rows* in its menu, see [[#Rows and columns]]), then Delete: the first press empties them, a second deletes the rows (columns) once they are empty. A column is deleted only when it is empty in every row, also the rows a filter hides. *Delete N rows* and *Delete N columns* in the cell menu or the grip menu delete them right away.
* **Ctrl+Alt+arrows** move the rows of the selection up / down (PageUp / PageDown: 10 places) or its columns left / right (Home / End: to the start / end), together, as one edit; the selection goes with them. Rows do not move while the table is sorted or filtered, nor with the header selected; pinned and unpinned rows (columns) do not move together.
* Typing, Enter or F2 edits the first cell selected (see [[#Editing cells]]).
* Esc or a click elsewhere ends the selection.
* **Copy as CSV** in the ⋯ menu of the table's toolbar (the `export` module) copies the whole table as CSV (commas between cells, quotes where a cell needs them): its header and its rows as shown, sorted and filtered, cells as Ctrl+C copies them.

## Cell menu

Right-click a cell (on a touch screen: press and hold it; in the cell editor: the Menu key or Shift+F10) for its menu: the cell is selected (marked, not edited), and stays so afterwards for Ctrl+C and Delete. Right-click a cell of a selection for the selection's menu. Shift+right-click, and a right click in the cell editor, give the browser's menu.

| Item | What it does |
|---|---|
| *Name cell*, *Name row* | Names the cell, see [[#Named cells]], or its row, see [[#Named rows]]; on a header *Name column*, see [[#Named columns]]. |
| *Copy* | Copies the cell (the cells selected) as Ctrl+C does. |
| *Clear* | Empties the cell (the cells selected) as Delete does; a header keeps its name. |
| *Filter: = value* | Shows only the rows with this value in this column (with the values of the cells selected in one column: any of them). A column filtered by values already gets this one added: `=open\|blocked`. |
| *Filter: ≠ value* | Hides the rows with this value in this column. |
| *Delete N rows*, *Delete N columns* | On a selection: deletes the rows (columns) its cells are in. A table keeps at least one column. |

Each comes from a module (`names`, `selection`, `filters`, see [[#Settings]]): a module turned off leaves its items out, and with none left the right click gives the browser's menu.

## Pasting from a spreadsheet

Copy cells in Excel, Google Sheets or LibreOffice, click a cell of a table (selected or edited) and paste:

* **Ctrl+V** pastes them from that cell to the right and down, over the cells there. Where the table ends, rows and columns are added (before the rows and columns pinned to the bottom and right).
* **Ctrl+Shift+V** overwrites nothing: the pasted rows are added as new rows at the cell's row (under the header when pasted there). Columns are added where the rows are wider than the table.
* Cells with a formula keep it; the values pasted onto them are left out (the message says how many). In new rows, a calculated column's cell gets its formula unless a value is pasted into it, see [[#Formulas]]. Names of rows and cells stay with their cells.
* Pasted onto the header, the first row names the columns; an empty value keeps the old name.
* Spreadsheets copy values as they show them (`1 234,50 Kč`), not their formulas. A line break inside a cell becomes a space, as a markdown table cell has one line.
* A single value (no tab, no line break) is pasted into the cell's editor as usual.
* The paste is one edit: one Ctrl+Z undoes it. It is not possible while the table is sorted or filtered, as the rows shown are not where the cells would go.

## Showing the markdown

A plain click edits a cell and no longer switches the table to its markdown. To see or edit the markdown:
* hover the table and click *Edit markdown* in the ⋯ menu of the toolbar above it, or
* Alt+click a cell: the cursor lands in that cell (at the clicked character, for plain text).

## Sorting

* Click the ⇅ control that appears in a column header on hover (on a touch screen it is always shown): ascending, descending, then back to the order as written. The column menu (see [[#Rows and columns]]) has the same options.
* Sorting only changes what you see, never the markdown, unless the *Store table metadata* setting is on: then the sorting is also stored in the table, see [[#Table metadata]].
* While sorted, the toolbar shows *Sorted by …*; its × shows the rows as written again, and its ✓ sorts the rows in the markdown that way (after asking) and ends the sorting view. Rows a filter hides are sorted too, pinned rows stay where they are, and one Ctrl+Z undoes it.
* Numbers sort as numbers (`1 000`, `2,5`, `-3`, `15 %`, `12,99 €`, `$5`, `3 kg` included); empty cells always come last.
* A row you are editing (or have just added) stays where it is while you type and Tab through its cells; it moves to its place once you leave it (Escape, Enter, another row, a click elsewhere).

## Filtering

* **One column**: *Filter* in its column menu opens its filter in a bubble under the header, nothing in the table moves. While a column filters, its header shows a filter icon: click it to change the filter.
* **All columns**: the filter icon in the table's toolbar shows a filter field under each header; click it again to hide them. Hidden, the filters still apply.
* While filtered, the toolbar shows *3 of 10 rows*; its × clears all filters. A field's × clears that one.
* Under the field you type in, a bubble shows what it understands (click one to put it in the field) and, for a column with up to 12 different values, those values with how many rows have each: tick them to show only those rows (`=open|blocked`).
* A row you are editing (or have just added) stays shown until you leave it, even when the filters do not match it.
* With *Store table metadata* on, the filters are stored in the table once you leave their field, so it shows filtered next time too (see [[#Table metadata]]). Filtering is a module: see [[#Settings]] to turn it off.

Plain text is found anywhere in a cell, ignoring case and diacritics (`cesky` finds `Český`). With *Smart filters* (on by default, see [[#Settings]]) a field also understands:

| Filter | Shows cells that |
|---|---|
| `>10` `>=10` | are numbers above 10 |
| `<10` `<=10` | are numbers below 10 |
| `/pattern/` | match a regular expression |
| `/pattern/c` | match it, with case |
| `=text` | are exactly `text` |
| `a\|b` | match `a` or `b` (each may be any filter: `<2\|>10`) |
| `=a\|b` | are exactly `a` or `b` (`=\|a`: also empty cells) |
| `!filter` | do **not** match `filter` |

* Number filters hide cells that are not numbers. Numbers are read as for sorting.
* Regular expressions ignore case unless flagged `c` (other flags: `m`, `s`, `u`), and see the cell text as shown, e.g. the alias of a link. Example: `/^item 1[0-9]$/`.
* `=text` ignores case and diacritics, like plain text.
* `!` works in front of any filter: `!done`, `!>10`, `!/^$/` (cells that are not empty), `!=open|done` (neither).
* A filter that is still being typed (only `>`, or a regular expression without its closing `/`) does not filter yet.
* An invalid regular expression filters nothing; its field turns red and its tooltip says why.

## Formulas

With the *Store table metadata* setting on (see [[#Settings]]), type a formula into a body cell, starting with `=`: `=B1*2`, `=SUM(B1:B3)`, `=SUM([qty])`. Table Plus writes the result into the cell, followed by the formula in a hidden `<meta>` tag:

```
| Name  | Qty |
| ----- | --: |
| Pear  |   3 |
| Apple |  10 |
| Total |  13 <meta f="=SUM([qty])"> |
```

* Formulas are metadata, as the sorting stored in a table is: with the setting off, a typed formula is saved as text (Table Plus says so, and shows it while it is typed). Formulas already in a table keep working: they can be edited, are recalculated, and fill new rows of calculated columns.
* SilverBullet and browsers show only the result, other renderers (GitHub, Obsidian) drop the tag. Queries over the table (`index.tag "table"`) see the cell's text with the tag, e.g. `13 <meta f="=SUM([qty])">`.
* Saving a formula fixes mistakes that have only one possible fix, and says what it changed: missing `)` at the end are added (`=SUM(A1:A3` becomes `=SUM(A1:A3)`), a text in quotes or a `[column]` left open at the end is closed, and extra `)` at the very end are dropped. Anything else stays as typed and shows `#ERROR!`.
* **Calculated columns**: when every row of a column holds the same formula, such as `=[@qty]*[@price]`, a new row (the **+** on a border, Ctrl+Enter, Tab on the last cell, *Insert row*) gets it too. Total rows (with a formula over a whole column, such as `=SUM([qty])`) do not count.
* Click the cell to edit its formula. Typing a plain value removes the formula. To type a text that starts with `=`, start it with `'=`; such a text opens with the `'` again, so it stays text.
* Results are written whenever Table Plus edits the table, in the same edit (one Ctrl+Z undoes both). Viewing a table never changes it. The toolbar of a table with formulas has *Recalculate* (the ↻ icon), which writes the current results; it is highlighted when some are out of date, e.g. after the table was changed outside Table Plus (by typing in the markdown).
* A formula's result has a dotted underline; hover it to see its formula, or why it shows an error.
* Numbers are read as for sorting (`12,99 €`, `1 000`, `15 %`). Results use a decimal comma when most numbers in the table do. A text that is not read as a number (e.g. `1,234.50`, with a thousands comma) is skipped by `SUM` and the other number functions.

### References

| Reference | Means |
|---|---|
| `B1` | Column B, the first row under the header |
| `A1:B3` | The range from A1 to B3 |
| `[qty]` | The whole column named Qty (written by its key, see below), without the table's total rows: rows with a cell whose formula refers to its own whole column (a total or an average under it) |
| `[qty:2]` | The second column named Qty, when several share the name |
| `[@qty]` | The Qty cell in the formula's own row, e.g. `=[@price]*[@qty]` |

* Edits made with Table Plus keep references on their cells, as in a spreadsheet: inserting, deleting, moving and sorting rows (*Sort the rows in the markdown*), and inserting, deleting and moving columns. A row inserted inside a range widens it, a deleted one narrows it, and a reference to deleted cells becomes `#REF!`. Renaming a column renames its `[Name]` references.
* Edits made in the markdown do not change references. `[qty]` and `[@qty]` are not affected by added or moved rows at all, so they are the safest choice for totals.
* `A1` counts rows in the markdown, not as a sorting or filter shows them.
* Column names match as SilverBullet's queries name columns: in lower case, with every run of other characters than `A-Z`, `a-z` and `0-9` as one `_`. So `[Unit price]`, `[unit price]` and `[unit_price]` are the same column, the one a query reads as `unit_price`. Letters with diacritics count as other characters there too (`Množství` is `mno_stv_`), so names that differ only in them are the same name; `[Name:2]` tells them apart. Table Plus writes column references by that key, as a query names the column: a formula saved as `=[@Unit price]*2` is stored as `=[@unit_price]*2`, and clicking a header inserts `[unit_price]`. References to a column the table does not have stay as typed (and show `#REF!`).
* Not supported: absolute references (`$A$1`) and references to other tables.
* **Point instead of typing**: where the formula expects a reference (after `=`, `(`, `,` or an operator, not inside a text in quotes), the pointer over the table becomes a move cursor: click a cell to insert it, drag across cells for a range, or click a column's header for `[Name]`. Pointing again right away replaces that reference, Shift+click extends its range. After a typed reference or another complete operand, a click ends editing as usual.
* While you edit a formula, each reference is outlined in the table in its own color. Drag an outline's edge to move the reference, a range's corner to resize it; Esc while dragging puts it back.
* Under the cell, the formula shows with its references in the same colors, with help for the function being typed.
* **Tab completes a function name**: `=AVE` and Tab gives `=AVERAGE(`. It works when the name can only be one function (or is one's whole name, as `IF` next to `IFERROR`); the help shows *Tab: AVERAGE(* then. Elsewhere Tab moves to the next cell as usual.

### Named columns

A column can have a name of its own, by which formulas and the stored sorting name it whatever its header says: renaming the header (also in the markdown) breaks nothing, nor references to the column from other pages. Open the column's menu (the ⠿ grip above the column), click *Name column* at its top and type the name (letters, digits and `_`); an empty name removes it.

* It is stored in the header cell as a hidden `<meta n="price">`: `| Unit price <meta n="price"> |`. SilverBullet does not show it, and a query still reads the column as `unit_price`. The header has a mark in its corner; hover it for the name.
* `[price]` is the column with that name before any column whose header is Price, which is then `[price:2]`.
* Setting or removing it rewrites the references to the column on the page: `[unit_price]` becomes `[price]`.
* Editing the header changes only the header's text: the column's name stays. It needs the *Store table metadata* setting, as formulas do; *Remove metadata* removes it.

### Named cells

A cell can have a name, by which formulas on the page use it: `=[@price]*(1+vat)`, or on another page `[[Prices]]vat`. The name stays with the cell wherever it is moved (also in the markdown), so such references never need to change. Open the cell's menu (right-click it, see [[#Cell menu]]), click *Name cell* and type the name (letters, digits and `_`); an empty name removes it.

* It is stored in the cell as a hidden `<meta cn="vat">`: `| VAT | 0.21 <meta cn="vat"> |`. A named cell has a mark in its corner; hover it for the name.
* A name is the page's: two cells on a page cannot have the same one, and it cannot be a function's name or read as a cell (`A1`). A formula looks for it in its own table first, then in the page's other tables.
* When a table with named cells is edited, the tables that use them get their new results in the same edit. When the cell is changed in the markdown, *Recalculate* is highlighted.
* Editing the cell changes its value only: the name stays. It needs the *Store table metadata* setting; *Remove metadata* removes it.

### Named rows

A row can have a name, by which formulas use its cells: `pear[price]` is the Price cell of the row named pear, `prices!pear[price]` of the table named prices, `[[Shop]]prices!pear[price]` on another page. The name stays with the row wherever it is moved or sorted (also in the markdown), and does not depend on what the row's cells say. Open the row's menu (the ⠿ grip left of the row) or the menu of one of its cells (right-click it), click *Name row* and type the name; an empty name removes it.

* It is stored in the row's first cell as a hidden `<meta n="pear">`: `| Pear <meta n="pear"> | 12 |`, as a column's name is in its header. A named row has a mark in the top left corner of its first cell; hover it for the name. A first cell that is also a named cell holds both in one tag: `<meta n="pear" cn="first">`.
* A row's name is its table's: two rows of a table cannot have the same one. The column after it is written as any column reference (`[price]`, a column's name, `[price:2]`) and follows the column when it is renamed or moved.
* `XLOOKUP("Pear", prices![name], prices![price])` does the same by a key column's value; a row's name works without one, and is not changed by editing the row's cells.
* Deleting the column that holds rows' or cells' names removes the names with it: Table Plus says which and asks first, as the formulas that use them then show `#REF!` or `#NAME?`.

### Other tables

A formula can use the cells of another table on the same page, once that table has a name (see [[#Table names]]): the name and `!` go before the reference.

| Reference | Means |
|---|---|
| `prices!B2` | Cell B2 of the table named prices |
| `prices!A1:B3` | A range of it |
| `prices![price]` | Its column Price, without its total rows (as `[price]` in its own table) |

```
| Fruit | Qty | Total                                                  |
| ----- | --: | -----------------------------------------------------: |
| Pear  |   3 | 38.97 <meta f="=[@qty]*XLOOKUP([@fruit], prices![name], prices![price])"> |
```

* `XLOOKUP(value, lookup_range, result_range)` finds a value in one column and gives the one beside it in another: the usual way to take a price, a rate or a name from another table, whatever its order. See [[#Functions]].
* The other table's formulas are calculated too, so a total over its column is up to date, and tables can refer to each other in turn (not in a circle: that is `#CYCLE!`).
* When Table Plus edits a table, the tables that refer to it get their new results in the same edit (one Ctrl+Z undoes both). When the other table is changed in the markdown, *Recalculate* in the toolbar is highlighted.
* `[@column]` is always the formula's own row: another table's rows are reached with `XLOOKUP` or by cell.
* References to another table follow its edits made with Table Plus, as references in a table do (see [[#References]]): `prices!B2` follows its rows and columns when they are inserted, deleted, moved or sorted into the markdown, `prices![price]` a renamed or moved column, and a reference to deleted cells becomes `prices!#REF!`. Renaming the table with *Name* renames the references to it on the page. Edits made in the markdown do not change references.

### Tables on other pages

The page's name in double brackets goes before the table's name: `[[Prices]]fruit!B2`, `[[Shop/Prices]]fruit![price]`, `XLOOKUP([@name], [[Prices]]fruit![name], [[Prices]]fruit![price])`.

* Table Plus reads the other page when a table that refers to it shows, and again each time it writes that table (or one it refers to), so the results written are up to date. When the other page is changed (SilverBullet indexes it again), *Recalculate* in the toolbar is highlighted.
* The other page's formulas are calculated too, and references there without a page are to tables on that page.
* Edits on the other page do not change the references to it here, and renaming that page or its table leaves them showing `#REF!`. Column references (`[[Prices]]fruit![price]`) and `XLOOKUP` keep working when its rows are moved.
* The page is the name as SilverBullet writes it in links, without `#` or `|`.
* With the `pageLinks` module off (see [[#Settings]]) Table Plus reads no other page: formulas that refer to one keep the results they have, and a new one shows `#REF!`.

### Operators and values

* `+ - * / ^` (power), `%` after a number (`50%` is 0.5), `&` joins text, `= <> < > <= >=` compare (numbers as numbers, text ignoring case).
* Numbers with a decimal point (`1.5`), text in double quotes (`"a ""quoted"" word"`), `TRUE`, `FALSE`.
* Function arguments are separated by `,` or `;`. Function names may be in any case.

### Dates

* A date is written as cells write it: `2025-11-06`, with a time `2025-11-06 14:30` (or `14:30:15`). Formulas read dates written so, in cells and in quotes (`"2025-11-06"`), and write the dates they give the same way, so the markdown stays readable and a `#date` column shows them as the locale writes dates (see [[#Column types]]).
* As in a spreadsheet, a number added to a date is days, a fraction of a day a time: `=[@start]+7` is a week later, `=[@start]+0.5` twelve hours later. A date minus a date is the days between them, with a fraction for the time: `=[@end]-[@start]`.
* A time is written `14:30` (or `9:05:30`), a length of time the same way with as many hours as it has (`40:00`). Formulas compute with times and write time results so: `=[@end]-[@start]` of `17:30` and `9:00` is `08:30`, `=SUM([hours])` of `14:00` and `20:00` is `34:00`, a time times or divided by a number is a time. Times compare by length (`9:05` is before `14:30`). Where a number is expected, a time is a fraction of a day, as in spreadsheets (`12:00` is 0.5). The hours of a time as a number are the time divided by an hour, `=[@total]/"1:00"` (minutes: `/"0:01"`); unlike in a spreadsheet, `*24` gives a time 24 times as long. So a text such as `3:15` is a time in formulas too.
* A time added to a date gives the date at that time: `=DATE(2025, 11, 6) + TIME(14, 30)` or `=[@day] + [@at]` is `2025-11-06 14:30`. A `#time` column shows times of day as the locale writes them.
* `TEXT` writes a date or a time in another format: `=TEXT([@due], "dd.mm.yyyy")`, `=TEXT([@total], "[h]:mm")`. For days and hours of a length of time: `=INT([@total]) & " d " & HOUR([@total]) & " h"` gives `1 d 10 h` for `34:00`.
* `DATEADD` adds seconds, minutes, hours, days, weeks, months or years: `=DATEADD([@start], 90, "min")`, `=DATEADD(A1, -1, "y")`. Months and years go by the calendar: a month after January 31 is February 28 (29 in a leap year).
* `DATEDIF` counts whole units between two dates: `=DATEDIF([@born], TODAY(), "y")` is an age in years.
* Dates and times are taken as written, with no time zone: an hour added across the change to summer time is an hour on the clock.
* `TODAY()` and `NOW()` give the date (and time) when the table is calculated, and the result is written into the cell. It does not change by itself: when it is out of date, *Recalculate* in the toolbar is highlighted.

### Functions

| Function | Description |
|---|---|
| `SUM(number1, [number2], …)` | Adds numbers, cells and ranges; times add up to a time (14:00 and 20:00 are 34:00). |
| `AVERAGE(number1, [number2], …)` | The arithmetic mean of the numbers, or of the times. |
| `MIN(number1, [number2], …)` | The smallest of the numbers (0 if there are none), the shortest of the times, or the earliest of the dates. |
| `MAX(number1, [number2], …)` | The largest of the numbers (0 if there are none), the longest of the times, or the latest of the dates. |
| `PRODUCT(number1, [number2], …)` | Multiplies the numbers. |
| `COUNT(value1, [value2], …)` | How many of the values are numbers. |
| `COUNTA(value1, [value2], …)` | How many of the values are not empty. |
| `INT(number)` | The number rounded down to a whole number; for a time, its whole days (INT(SUM(A1:A2)) of 14:00 and 20:00 is 1). |
| `ROUND(number, [digits])` | Rounds to the given number of decimal places (default 0), halves away from zero. |
| `ABS(number)` | The number without its sign. |
| `IF(condition, value_if_true, [value_if_false])` | One value if the condition is true, another if it is false (default FALSE). |
| `IFERROR(value, value_if_error)` | The value, or the second value if the first is an error. |
| `AND(logical1, [logical2], …)` | TRUE if all of the values are true. |
| `OR(logical1, [logical2], …)` | TRUE if any of the values is true. |
| `NOT(logical)` | TRUE if the value is false, FALSE if it is true. |
| `CONCAT(text1, [text2], …)` | Joins the values into one text. |
| `ROW()` | The row of the cell the formula is in, counted in the table as written: 1 is the first row under the header. =ROW() in every row of a column numbers the rows. |
| `XLOOKUP(value, lookup_range, result_range, [if_not_found])` | Finds the value in one range or column and gives the value in the same place of another, e.g. XLOOKUP("Pear", prices![Name], prices![Price]); text is found ignoring case. Not found: if_not_found, else #N/A. |
| `TEXT(value, format)` | A date or a time as text in a format: TEXT(A1, "dd.mm.yyyy hh:mm"), TEXT(A1, "[h]:mm") for all the hours of a length of time. Codes: yyyy, yy, m, mm, d, dd, h, hh, m, mm (minutes), s, ss, [h], [m], [s]; text in quotes as it is. |
| `TODAY()` | Today's date, e.g. 2025-11-06. The result is written when the table is calculated: the next day, Recalculate updates it. |
| `NOW()` | The date and time now, e.g. 2025-11-06 14:30:15. The result is written when the table is calculated: Recalculate updates it. |
| `DATE(year, month, day)` | The date of a year, month and day; a month or day past its end carries over (DATE(2025, 13, 1) is 2026-01-01). |
| `TIME(hour, [minute], [second])` | A time of day, e.g. 14:30; past midnight it starts again (TIME(25, 0) is 01:00). Added to a date it gives the date with that time: DATE(2025, 11, 6) + TIME(14, 30) is 2025-11-06 14:30. |
| `DATEADD(date, amount, unit)` | The date plus an amount of a unit: "s", "min", "h", "d", "w", "m" (months) or "y" (or their names, "hours"). A negative amount goes back. Months and years keep the day or take the month's last. |
| `DATEDIF(start, end, unit)` | How many whole units lie from one date to another, in "s", "min", "h", "d", "w", "m" (months) or "y"; negative when the end is earlier. For days with a fraction, subtract the dates: end - start. |
| `YEAR(date)` | The year of a date. |
| `MONTH(date)` | The month of a date, 1 to 12. |
| `DAY(date)` | The day of a date's month, 1 to 31. |
| `HOUR(time)` | The hour of a time, or of a date's time, 0 to 23 (0 for a date without a time). |
| `MINUTE(time)` | The minute of a time, or of a date's time, 0 to 59. |
| `SECOND(time)` | The second of a time, or of a date's time, 0 to 59. |
| `WEEKDAY(date, [type])` | The day of the week as a number: Sunday 1 to Saturday 7 (type 1, the default), or Monday 1 to Sunday 7 (type 2). |

In ranges, empty cells and text that is not a number are skipped by the number functions.

### Errors

| Shows | Because |
|---|---|
| `#REF!` | A reference outside the table, a column name that does not exist, or a table name that no table on the page (or on the page named) has |
| `#NAME?` | An unknown function, or a name no cell on the page (or on the page named) has |
| `#VALUE!` | A value of the wrong kind (text where a number is needed), or a wrong number of arguments |
| `#DIV/0!` | Division by zero, or an average of no numbers |
| `#NUM!` | A result that is not a finite number |
| `#N/A` | `XLOOKUP` did not find the value |
| `#CYCLE!` | The formula depends on its own result |
| `#ERROR!` | The formula cannot be read (e.g. a missing `)`) |

## Column types

A hashtag in a column's header gives the column a type, which changes how its cells show. Pick it in the column's menu (the ⠿ grip above the column, *Type*): the types show in the same menu (hover one to see how it is written and what it shows), the arrow before the menu's title (or the Left key) returns to the column's menu, and the type picked is written as a hashtag in the header. Editing a header changes only the column's name: its type's hashtag stays. In the markdown, the hashtag can also be typed by hand, e.g. for a parameter the menu does not offer (`#currency-usd`).

```
| Item | Price #currency-usd | Rating #stars | Done #check |
| ---- | ------------------- | ------------- | ----------- |
| Pear | 12.99               | 4             | yes         |
```

shows `$12.99`, `★★★★☆` and `✅`.

* The markdown keeps the value as written: the type only changes what the cell shows. The cell editor shows the value. Sorting, filters and copying (Ctrl+C) use the value too, so a rating sorts by its number.
* The type's hashtag is hidden in the header, and the type's icon shows after the column's name (hover it for the type); the menu marks the types with the same icons. SilverBullet leaves hashtags out of a column's key, so a query still reads `Price #currency-usd` as `price`, and the hashtag tags neither the rows nor the page.
* A parameter goes after a dash: `#currency-usd`, `#number-2`, `#stars-10`. A hashtag that is not a type (or a type with a parameter it does not take) is an ordinary hashtag.
* A cell whose value is not one of the type shows as written, in red; hover it to see why. Empty cells are left alone.
* The cell editor offers the type's values where it has a few (`#stars`, `#check`, `#trend`) in a list under the cell, all of them even when the cell has one: click one, or move along them with ↑ / ↓ and take one with Enter. Typing narrows the list. A value saved that is not of the type is kept as typed, and Table Plus says so.
* A formula's result is shown in its column's type, e.g. `=SUM([price])` as an amount of money.
* The hashtags of MdTableRender also work for these types: `#euro`, `#usd`, `#int`, `#float`, `#kg`, `#km`, `#watt`, `#logical`, `#evaluation`, `#gauge`.

| Type | Shows |
|---|---|
| `#currency, #currency-usd` | An amount of money: the currency's three-letter code after the dash (default EUR). Its sign goes where the currency's country writes it: $12.99, 12.99 €, 12.99 Kč. |
| `#number, #number-2` | A number with thousands separators: the decimal places after the dash (default: as written). |
| `#percent, #percent-1` | A fraction as a percentage, 0.15 is 15 % (15 % stays 15 %): the decimal places after the dash (default 0). |
| `#unit-kg` | A number with a unit: the unit after the dash. |
| `#stars, #stars-10` | A rating as stars: a whole number from 0 to the most stars after the dash (default 5). |
| `#check` | Yes or no as a check mark: yes, true, x, ✅ or a number above 0 shows ✅; no, false, ❌, 0 or a number below it shows ❌. |
| `#date, #date-long` | A date written as 2025-11-06 (with a time: 2025-11-06 14:30), shown as the locale writes it: short, medium (default) or long after the dash. |
| `#time` | A time of day written as 14:30 or 14:30:15 (or as a fraction of a day, 0.5 is 12:00), shown as the locale writes times. |
| `#trend` | A trend as an arrow: + or a number above 0 shows 🔼, - or one below 0 shows 🔽, = or 0 shows ➡️. |
| `#progress, #progress-10` | Progress as a bar: a number from 0 to the maximum after the dash (default 100). |
| `#link` | A web address as a link, shown without its https://. |

Numbers and dates are written as your browser's language writes them.

## Rows and columns

Hover a cell to show two grips: ⠿ left of its row, and ⠿ above its column; moving the pointer along the left of the table (above it) takes them from row to row (column to column). Hovering a grip tints its row or column. While a cell is edited, they stay with it.

* **Click a grip**: the row (column) is selected, for Ctrl+C or Delete, and its menu opens:
  * Row: insert above or below, duplicate, move up or down, select rows, delete.
  * Column: sort, filter, type (see [[#Column types]]), align (left, center, right), insert left or right, move, select columns, delete.
* **Select rows** (*Select columns*) in the menu: from that row, the rows up to the one under the pointer are selected as you move it; a click anywhere in the table ends the selection there (without editing the cell). Esc keeps just the first row. **Shift+click on a grip** does the same without the menu: from the first of the rows already selected, else from that row. A click on the grip of a selected row then opens its menu with *Delete N rows*.
* **Drag a grip** to move the row or column: a copy follows the pointer and the others move aside to show where it goes; near the top or bottom of the view the page scrolls. Esc cancels the drag.
* **Insert with +**: with a mouse or a pen, hover just left of the row grips, or just above the column grips: a **+** shows on the border nearest the pointer and inserts a row (column) there. On the last border it adds one at the end; while a cell of the last row (column) is hovered, selected or edited, a faint **+** under the table (right of the header) adds one at the end. A new column is named *Column N*, ready to rename. On a touch screen, insert from the row's or column's menu.
* **Numbered column**: *Insert numbered column left* in a column's menu adds a column `#` with `=ROW()` in every row: it numbers the rows as written (sorting or filtering the view does not renumber them), rows added later get the formula too, and inserting, deleting or moving rows numbers them again. Add as many as you like. It needs the *Store table metadata* setting, as every new formula.
* Rows can be moved only in the original order (no sorting, no filter), so a row always lands where you see it.
* **Column width**: drag the right edge of a column's header (a faint dashed line shows there while the header cell is hovered, selected or edited; the pointer shows ↔ on it) to set its width; text wraps (or is cut) within it, see [[#Long text in cells (`tablePlus.modules.longText`)]]. Double-click that edge, or *Auto width* in the column's menu, for the automatic width again (as wide as the text, up to the maximum column width); *Reset column widths* in the ⋯ menu of the table's toolbar does it for every column. With the *Store table metadata* setting the width is stored in the table (`width.price="180"`, see [[#Table metadata]]) and follows the column when it is renamed or moved; without it, it holds until the page is opened again.

## Pinning

With the *Store table metadata* setting on, the row menu has *Pin to top* and *Pin to bottom*, the column menu *Pin left* and *Pin right* (click a checked item again to unpin).

* Pinning moves the row (column) in the markdown, to the edge of the table, next to the rows (columns) already pinned there. The table stores how many are pinned at each edge, see [[#Table metadata]].
* Pinned rows and columns stay in view: rows pinned to the top move with the header, rows pinned to the bottom stay at the bottom of the view, columns stay at the left or right edge while a wide table scrolls sideways.
* They are kept at the edges through every edit: rows added at the end go above the rows pinned to the bottom, columns added at the end left of the columns pinned to the right, and nothing is inserted above the first row pinned to the top or below the last one pinned to the bottom. A row inserted between pinned rows is pinned too.
* Moving (drag, menu, Ctrl+Alt+arrows) keeps a pinned row (column) among the pinned ones and the others outside them.
* Pinned rows are not sorted or filtered: they always show.
* Unpinning moves the row (column) out of its edge, next to the unpinned ones; it does not go back to where it was before pinning (Ctrl+Z does).
* *Unpin all* in the ⋯ menu of the table's toolbar unpins every row and column at once; they stay where they are (at the edges) and scroll and sort with the others again.
* "Pinned" means a number of rows (columns) at an edge: a row typed by hand above the first pinned row becomes the pinned one.
* Rows pinned to the top look like the header.

## Touch screens

On a phone or a tablet:

* Tap a cell to select it, tap it again to edit it (with *Edit mode* on, the first tap edits). The handles of its row and column show next to it: tap one for the row's or column's menu (insert rows and columns there), or drag it to move the row or column. A pen that hovers (such as the S Pen) also gets the **+** on the borders, as a mouse does.
* The sort buttons in the header are always shown (there is no hover to show them on). The toolbar (the filter icon, the ⋯ menu) shows while a cell of the table is edited.
* Swiping scrolls a wide table sideways and the page up and down, as usual.
* Press and hold a cell for its menu (copy, clear, filter by its value, name it).
* Not on touch screens: selecting cells by dragging, the keyboard shortcuts (unless the device has a keyboard) and middle-button scrolling.

## Large tables

* **Sticky header**: while you scroll past a long table, its header stays at the top of the view, with the toolbar above it.
* **Maximum height**: with the *Maximum table height* setting, a taller table scrolls inside its own box; its header stays at the top of that box. See [[#Settings]].
* **Wide tables** scroll sideways; Table Plus keeps the scroll position after edits, and new rows open their editor in a column you can see.
* **Autoscroll**: the middle mouse button over a wide table scrolls the table sideways and the page up and down together. Hold and drag, or click and move; the next click ends it.

## Settings

These settings are for every table in the space (a table's own sorting, filters, widths and names are in its menus).

**Table Plus settings** (*Table Plus settings…* in a table's ⋯ menu, or the *Table Plus: Settings* command) shows them all in one dialog: *General*, and *Modules*, each with its switch and its own settings under it. Nothing changes until *Save*: then they are written into SilverBullet's configuration, where the Configuration Manager keeps its settings (the managed block of your [[CONFIG]] page), so both always show the same. Turning a module on or off saves and reloads the page (*Save and reload*), as modules start with Table Plus. *Cancel* (or Esc) closes it unsaved.

You can also open *Configuration: Open* (Ctrl+, / Cmd+,) and find the *Table Plus* and *Table Plus: Modules* categories, or set them in your [[CONFIG]]. Settings of whole tables are `tablePlus.<setting>`, those of a part of Table Plus `tablePlus.<part>.<setting>`, and those of a module (a part that can be turned off) `tablePlus.modules.<module>.<setting>`. A part is set in one go, with only what you change (the rest keeps its default):

```lua
config.set("tablePlus.metadata", true)
config.set("tablePlus.editor", { enterKey = "moveDown", selectOnClick = true })
config.set("tablePlus.modules.formulas", { enabled = false })
config.set("tablePlus.expressions", { refreshDelay = 1000 })
```

Setting a part replaces what an earlier `config.set` of the same part set: set each part once, or one setting at a time (`config.set("tablePlus.editor.enterKey", "moveDown")`).

### Tables

* **Store table metadata** (`tablePlus.metadata`), default `false`
  * `true`: table settings (the sorting and pinned rows and columns) can be stored in any table, see [[#Table metadata]], rows and columns can be pinned, see [[#Pinning]], and formulas can be added, see [[#Formulas]].
  * `false`: tables without metadata get none: sorting is a view only, and a formula typed into a cell is saved as text. Tables that already have metadata keep using it: their sorting is still stored, rows and columns can be unpinned and their formulas keep working, but nothing new can be pinned and no new formula added.
* **Maximum table height (px)** (`tablePlus.maxHeight`), default `0`
  * `0`: no limit, a table is as tall as its rows.
  * A number of pixels, e.g. `400`: a taller table gets its own vertical scrollbar.
* **Format tables** (`tablePlus.autoFormat`), default `true`
  * `true`: a table edited with Table Plus is written with aligned pipes, padded to the widest cell of each column and aligned as its delimiter row says.
  * `false`: each table keeps its own style: aligned tables stay aligned, compact tables stay compact, untouched rows are kept byte for byte.
  * Either way, *Format table* in the ⋯ menu of a table's toolbar aligns that table now (e.g. one typed by hand); an aligned table stays as it is.

### Cell editor (`tablePlus.editor`)

* **Enter in a cell editor** (`enterKey`), default `moveDown`
  * `save`: Enter saves the cell.
  * `moveDown`: Enter saves and edits the cell below; Shift+Enter too, opening it with its text selected (with *Click selects the cell's text*: with the cursor at the end).
* **Click selects the cell's text** (`selectOnClick`), default `false`
  * `false`: a click, Enter, Tab and Ctrl+arrows open a cell with the cursor at the end of its text; Shift+Enter opens the cell below with its whole text selected.
  * `true`: they open it with its whole text selected; Shift+Enter with the cursor at the end.
  * Without the `selection` module, Shift+click and Ctrl+Shift+arrows open the cell as Shift+Enter does.
* **Ctrl+Enter adds a row** (`ctrlEnterAddsRow`), default `true`
  * `true`: Ctrl+Enter in a cell editor saves the cell, adds an empty row below its row and edits it.
  * `false`: Ctrl+Enter works like Enter.

### Long text in cells (`tablePlus.modules.longText`)

The `longText` module (see [[#Modules]]); off, cells show as SilverBullet renders them: on one line, as wide as their text.

* **Text that does not fit** (`overflow`), default `wrap`
  * `wrap`: text longer than the column's maximum width wraps onto more lines, up to the maximum cell height; the rest is cut and fades out.
  * `ellipsis`: it stays on one line, cut with `…`.
  * A cell whose text is cut shows an expand button at its top right when hovered: it opens the cell in a popup, its whole text wrapped, to read and edit (Enter saves, Esc closes). While a cell is edited, F2 (or the same button, shown when the text does not fit the field, e.g. a long formula) goes on in the popup.
* **Maximum column width (px)** (`maxWidth`), default `500`: wider text wraps or is cut. `0`: no limit, a cell is as wide as its text.
* **Maximum cell height (px)** (`maxHeight`), default `200`: a wrapped cell no taller than this. `0`: no limit.

### Cells with Lua expressions (`tablePlus.expressions`)

* **Delay before refreshing (ms)** (`refreshDelay`), default `500`
  * After you edit a table, a cell that holds a Lua expression (`${…}`) reading the page index (a query, or a formula of a spreadsheet library such as MdTableSheet) shows its new result once SilverBullet has indexed the page again. This is how many milliseconds it waits for the index: raise it if such cells still show old results (a slow device, a large space).

### Modules (`tablePlus.modules`)

Each module can be turned off with `enabled = false`, e.g. `config.set("tablePlus.modules.paste", { enabled = false })`; all are on by default. A change applies when the page is loaded again. A module turned off is not loaded at all: what it stored in tables stays as it is, and is not used. Editing cells, sorting and the toolbar are always on.

| Module | When on |
|---|---|
| `formulas` | Formulas can be typed into cells, with their help and references; *Recalculate* in the toolbar; every edit recalculates the table and the tables referring to it, and references follow moved rows and columns. Off: nothing is recalculated, results stay as written, and references do not follow moves. A typed formula is saved as text; a formula cell edited, pasted over or emptied keeps its formula (hidden), which is used again once formulas are on. See [[#Formulas]]. |
| `names` | Tables, columns, rows and cells can be named: *Name table* in a table's ⋯ menu, *Name column* in the column menu, *Name row* in the row and cell menus, *Name cell* in the cell menu; named headers and cells show a mark. Off: none of these, and no marks; names already in tables are kept and formulas still use them, but a duplicated row copies them too. See [[#Table names]]. |
| `pageLinks` | Formulas can refer to tables and named cells on other pages (`[[Prices]]fruit!B2`), which Table Plus reads for them. Off: it reads no other page; formulas that refer to one keep the results they have (the formulas using them too), a new one shows `#REF!`. It needs the `formulas` module. See [[#Tables on other pages]]. |
| `filters` | Rows can be filtered: the toolbar's filter icon shows a filter field under each header, *Filter* in a column menu opens that column's filter, *Filter: = value* in the cell menu filters by a cell's value; with *Store table metadata* the filters are stored in the table. Its setting `smart` (default `true`): fields understand `>10`, `/pattern/`, `=text`, `a\|b` and `!filter`; `false`: everything typed is text to find. Off: no filtering; filters stored in a table are kept but not used. See [[#Filtering]]. |
| `columnTypes` | A header's type hashtag formats its column, the cell editor offers the type's values, and the column menu has *Type*. Off: cells show as written. See [[#Column types]]. |
| `selection` | Dragging across cells, Shift+click and Shift+arrows select them; Ctrl+C copies them, Delete empties them (whole rows or columns already empty: deletes them); *Copy*, *Clear* and *Delete N rows / columns* in the cell menu. A click selects a cell, a second one edits it; the toolbar's *Edit mode* button edits on the first click. Off: a click always edits; Shift+click opens the cell as Shift+Enter does. |
| `export` | *Copy as CSV* in the table's ⋯ menu copies the whole table. |
| `paste` | Ctrl+V pastes cells copied from a spreadsheet over the table, Ctrl+Shift+V as new rows. Off: a paste goes into the cell editor as text. |
| `handles` | The handles beside rows and above columns: drag them to move rows and columns, click them for the row and column menus. Off: rows and columns still move with Ctrl+Alt+arrows, and the **+** on a border still inserts them. |
| `longText` | Long text wraps (up to a maximum cell height) or is cut with an ellipsis at a maximum column width; a cut cell shows an expand button for its popup. Settings: see [[#Long text in cells (`tablePlus.modules.longText`)]]. Off: cells on one line, as wide as their text (F2 still opens a cell's popup while editing). |
| `widths` | A column's width set by dragging the right edge of its header, *Auto width* in the column's menu, *Reset column widths* in the table's ⋯ menu; with *Store table metadata* stored in the table. Off: columns are as wide as their text; widths stored in tables are kept but not used. |
| `sticky` | A table's header stays in view while the page scrolls past the table, and rows pinned to the bottom stay at the bottom of the view. |
| `autoscroll` | The middle mouse button over a table scrolls it. |
| `largeTables` | Off by default. A table with many rows (setting `minRows`, default `200`) scrolls in a box of its own: as tall as *Maximum table height*, else the window. Only the rows in and around the box's view are in the page, so editing, sorting and filtering a table of thousands of rows stays quick. The browser's find (Ctrl+F) finds only those rows. Off: every row is in the page, the table as tall as its rows (unless *Maximum table height* is set). |

## Table names

A table can have a name, so formulas in other tables can refer to it. Click *Name table* in the ⋯ menu of the table's toolbar and type it; an empty name removes it. The name is stored in the table's metadata row (`<meta name="prices">`), so it needs the *Store table metadata* setting, or a table that has a metadata row already.

* A name is letters, digits and `_`, not starting with a digit, e.g. `prices` or `price_list`. Names that read as a cell (`A1`, `AB12`) or as `TRUE` / `FALSE` are refused.
* Names are compared ignoring case, and two tables on a page cannot have the same name.
* The toolbar shows the name at its left; click it to rename the table.
* Renaming a table renames the references to it in the formulas on the page; removing the name (or the table's metadata) leaves them as they are, showing `#REF!`.

## Table metadata

With the *Store table metadata* setting on, Table Plus stores a table's settings in a last row that holds only a `<meta …>` tag: the sorting, the filters and the pinned rows and columns.

```
| Name  | Qty |
| ----- | --: |
| Pear  |   3 |
| Apple |  10 |
| Total |  13 |
| <meta sort.qty="desc" pin-bottom="1"> |
```

* `sort.qty` is the sorting (by the column Qty, `asc` or `desc`), `filter.qty` a column's filter (as typed), `pin-top`, `pin-bottom`, `pin-left` and `pin-right` how many rows (columns) at each edge are pinned, `name` the table's name (see [[#Table names]]).

* The row is hidden in SilverBullet. Browsers never show `<meta>`, and other markdown renderers (GitHub, Obsidian) drop it, leaving at most an empty row.
* It is always the last row: new rows go above it, and it is not sorted, filtered or moved.
* Attributes of a column name it after a dot: `sort.qty`, `filter.status`, `width.notes` (its width in pixels). Names are keys, as for formula references (see [[#References]]): the column `Unit price` is `sort.unit_price`, and any spelling with that key names it; a column with a name of its own goes by it. With several columns of the same name, the occurrence is added: `filter.qty:2` is the second column named Qty. They follow their column when it is renamed or moved, and are removed with it.
* A filter is stored as typed, once you leave its field; a `|` in it is written `\|`, as everywhere in a table: `filter.status="=open\|blocked"`.
* When nothing is left in it (no sorting, no filter, nothing pinned, no name), the row is removed.
* With the setting off, a table without a `<meta>` row gets none. A table with one keeps using it: its sorting and filters are still stored, and its rows and columns can be unpinned, but nothing new can be pinned. When the row is left empty, it is removed.
* To remove metadata: *Remove metadata* in the ⋯ menu of a table's toolbar removes that table's `<meta>` tags; the *Table Plus: Remove table metadata* command removes them from all tables on the page (it says how many). That is the metadata row (a sorting and filters stored there end: the rows show as written; the table's name goes too) and the formulas stored in cells (see [[#Formulas]]): those cells keep their current results as plain values. Both ask first, saying how many formulas go, and one Ctrl+Z brings everything back.
* SilverBullet indexes the row like any other: a query over the table's rows (`index.tag "table"`) also returns it, with the `<meta …>` text in its first column.

## How your markdown is kept

* Every change is one ordinary edit: Ctrl+Z undoes it.
* With *Format tables* on (the default), every table you edit is written with aligned pipes. Tables are formatted only when edited, never just by viewing them. With it off, rows you did not change are kept byte for byte, and aligned tables stay aligned, compact ones compact. See [[#Settings]].
* Cells that are one `${…}` expression (e.g. formulas of a spreadsheet library such as MdTableSheet) are re-evaluated once the page is re-indexed after an edit, so they do not keep a stale result.
* Sorting (unless stored as [[#Table metadata]]), filters and scroll positions (sideways and, with a maximum height, up and down) are views only: they are remembered per table until the page is reloaded, and never written to the page.
* SilverBullet does not show columns without a name, which shifts the header against the data. For such a table Table Plus shows a notice with a *Name them* button instead of enhancing it.

## Limits

* Works on tables written in the page. Query and Lua output, and tables in block quotes, are left as they are.
* If a SilverBullet update renders tables differently, Table Plus switches itself off with one notification, and tables behave as without it.

## Implementation

```space-lua
-- Settings, shown in the Configuration Manager (Configuration: Open)
config.defineCategory {
  name = "Table Plus",
  description = "Interactive markdown tables.",
  priority = 5,
}

config.defineCategory {
  name = "Table Plus: Modules",
  description = "Parts of Table Plus that can be turned off. A change applies when the page is loaded again.",
  priority = 4.9,
}

-- Settings of whole tables are tablePlus.<setting>; those of a part of Table
-- Plus are tablePlus.<part>.<setting>, and those of a module (a part that can
-- be turned off) tablePlus.modules.<module>.<setting>. A part is set in one go
-- with config.set("tablePlus.<part>", { … }): settings left out keep their defaults
config.define("tablePlus", {
  description = "Table Plus settings",
  type = "object",
  properties = {
    metadata = {
      type = "boolean",
      default = false,
      description = "Allow storing table settings (sorting, filters, pinned rows and columns, names) in a hidden last row <meta …> of tables, and pinning. Off: tables without a <meta> row get none (sorting and filters are a view only); tables with one keep using it, their sorting and filters are still stored and pinned rows and columns can be unpinned, but nothing new can be pinned. Formulas are stored in cells (<meta f>) and need it too: off, a typed formula is saved as text; existing formulas keep working.",
      ui = { category = "Table Plus", label = "Store table metadata", priority = 6 },
    },
    maxHeight = {
      type = "number",
      default = 0,
      description = "Maximum table height in pixels; a taller table gets its own vertical scrollbar. 0: no limit.",
      ui = { category = "Table Plus", label = "Maximum table height (px)", priority = 5 },
    },
    autoFormat = {
      type = "boolean",
      default = true,
      description = "Write tables edited with Table Plus with aligned pipes. Off: each table keeps its own style (aligned or compact).",
      ui = { category = "Table Plus", label = "Format tables", priority = 4 },
    },
    editor = {
      type = "object",
      additionalProperties = false,
      properties = {
        enterKey = {
          type = "string",
          enum = { "save", "moveDown" },
          default = "moveDown",
          description = "What Enter does in a cell editor. save: save the value. moveDown: save it and edit the cell below (Shift+Enter: opened with its text selected, or the reverse with selectOnClick).",
          ui = { category = "Table Plus", label = "Enter in a cell editor", priority = 3 },
        },
        selectOnClick = {
          type = "boolean",
          default = false,
          description = "A click on a cell, Enter, Tab and Ctrl+arrows open its editor with all its text selected, Shift+Enter with the cursor at the end. Off: the reverse.",
          ui = { category = "Table Plus", label = "Click selects the cell's text", priority = 2.5 },
        },
        ctrlEnterAddsRow = {
          type = "boolean",
          default = true,
          description = "Ctrl+Enter in a cell editor saves the cell, adds an empty row below and edits it. Off: Ctrl+Enter works like Enter.",
          ui = { category = "Table Plus", label = "Ctrl+Enter adds a row", priority = 2 },
        },
      },
    },
    expressions = {
      type = "object",
      additionalProperties = false,
      properties = {
        refreshDelay = {
          type = "number",
          default = 500,
          description = "After you edit a table, a cell that holds a Lua expression (${…}) reading the page index (a query, or a formula of a spreadsheet library) shows its new result once SilverBullet has indexed the page again: this is how many milliseconds it waits for that. Raise it if such cells still show old results (a slow device, a large space).",
          ui = { category = "Table Plus", label = "Cells with Lua expressions: delay before refreshing (ms)", priority = 0.5 },
        },
      },
    },
    modules = {
      type = "object",
      additionalProperties = false,
      properties = {
        formulas = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Formulas in cells (=SUM(B1:B3)): typing them, their help and references, Recalculate, and recalculating every table edited and the tables referring to it. Off: nothing is recalculated, results stay as written; a typed formula is saved as text, a formula cell edited keeps its formula for when formulas are on again.",
              ui = { category = "Table Plus: Modules", label = "Formulas", priority = 13 },
            },
          },
        },
        names = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Naming tables (Name table in the toolbar's ⋯ menu), columns (Name column in the column menu), rows and cells (Name row in the row menu, Name cell in the cell menu), so formulas refer to them by name; named headers and cells show a mark. Off: none of these; names already in tables are kept and formulas still use them.",
              ui = { category = "Table Plus: Modules", label = "Names", priority = 12 },
            },
          },
        },
        pageLinks = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Formulas referring to tables and named cells on other pages ([[Prices]]fruit!B2), which Table Plus reads for them. Off: no other page is read; formulas referring to one keep the results they have, a new one shows #REF!.",
              ui = { category = "Table Plus: Modules", label = "Links to other pages", priority = 11 },
            },
          },
        },
        filters = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Filtering rows: the filter row (the toolbar's filter icon), a column's filter (Filter in its menu), filters stored in the table with the metadata setting. Off: no filtering; filters stored in a table are kept but not used.",
              ui = { category = "Table Plus: Modules", label = "Filters", priority = 10 },
            },
            smart = {
              type = "boolean",
              default = true,
              description = "Filter fields understand >10 <10 >=10 <=10 (numbers), /pattern/ (regular expressions), =text (whole cell), a|b (either) and !filter (not). Off: everything typed is text to find.",
              ui = { category = "Table Plus: Modules", label = "Smart filters", priority = 9 },
            },
          },
        },
        columnTypes = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Column types from a header's hashtag (#currency, #stars, #date…): cells shown as the type, the type's values in the cell editor, Type in the column menu. Off: cells show as written.",
              ui = { category = "Table Plus: Modules", label = "Column types", priority = 8 },
            },
          },
        },
        selection = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "A click selects a cell (a second click edits it; the Edit mode button in the toolbar edits on the first click); dragging, Shift+click and Shift+arrows select more; Ctrl+C copies them for a spreadsheet, Delete empties them. Off: a click edits.",
              ui = { category = "Table Plus: Modules", label = "Cell selection", priority = 7 },
            },
          },
        },
        paste = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Ctrl+V pastes cells copied from a spreadsheet over the table, Ctrl+Shift+V as new rows. Off: a paste goes into the cell editor as text.",
              ui = { category = "Table Plus: Modules", label = "Paste from spreadsheets", priority = 6 },
            },
          },
        },
        export = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Copy as CSV in a table's ⋯ menu: the whole table, its rows as shown.",
              ui = { category = "Table Plus: Modules", label = "Export", priority = 5 },
            },
          },
        },
        handles = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "The handles beside rows and above columns: drag them to move rows and columns, click them for the row and column menus (insert, duplicate, pin, sort, type, delete…).",
              ui = { category = "Table Plus: Modules", label = "Row and column handles", priority = 4 },
            },
          },
        },
        longText = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Long text in cells: it wraps (up to a maximum cell height) or is cut with an ellipsis at a maximum column width, and a cell whose text is cut shows an expand button for its popup. Off: cells show as SilverBullet renders them, on one line, as wide as their text.",
              ui = { category = "Table Plus: Modules", label = "Long text in cells", priority = 3.45 },
            },
            overflow = {
              type = "string",
              enum = { "wrap", "ellipsis" },
              default = "wrap",
              description = "Text longer than a column's maximum width. wrap: it wraps onto more lines, up to the maximum cell height. ellipsis: it stays on one line, cut with …. A cell whose text is cut shows an expand button that shows it whole (F2 while editing it).",
              ui = { category = "Table Plus: Modules", label = "Text that does not fit", priority = 3.4 },
            },
            maxWidth = {
              type = "number",
              default = 500,
              description = "A column's maximum width in pixels: longer text wraps or is cut (Long text in cells). 0: no limit, a cell is as wide as its text.",
              ui = { category = "Table Plus: Modules", label = "Maximum column width (px)", priority = 3.3 },
            },
            maxHeight = {
              type = "number",
              default = 200,
              description = "A wrapped cell's maximum height in pixels; the rest is cut (the expand button shows it). 0: no limit.",
              ui = { category = "Table Plus: Modules", label = "Maximum cell height (px)", priority = 3.2 },
            },
          },
        },
        widths = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Column widths: drag the right edge of a column's header to set its width, double-click it (or Auto width in the column's menu) for the automatic width; with Store table metadata the width is stored in the table. Off: columns are as wide as their text; stored widths are kept but not used.",
              ui = { category = "Table Plus: Modules", label = "Column widths", priority = 3.5 },
            },
          },
        },
        sticky = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "A table's header (and rows pinned to the top) stays in view while the page scrolls past the table, rows pinned to the bottom stay at the bottom of the view.",
              ui = { category = "Table Plus: Modules", label = "Sticky header", priority = 3 },
            },
          },
        },
        autoscroll = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Pressing the middle mouse button over a table scrolls it in the direction the pointer moves.",
              ui = { category = "Table Plus: Modules", label = "Middle-button scrolling", priority = 2 },
            },
          },
        },
        largeTables = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = false,
              description = "Tables with many rows scroll in a box of their own (Maximum table height, else the window's height), and only the rows in view are in the page, so editing them stays quick. The browser's find (Ctrl+F) sees only those rows.",
              ui = { category = "Table Plus: Modules", label = "Large tables", priority = 1.9 },
            },
            minRows = {
              type = "number",
              default = 200,
              description = "A table with at least this many rows is a large table (Large tables).",
              ui = { category = "Table Plus: Modules", label = "Large tables: applies from (rows)", priority = 1.8 },
            },
          },
        },
      },
    },
  },
})

-- Table Plus only uses the public editor and config API, handed over here
if js and js.window then
  local tablePlus = js.importFromSpace("Library/damesene/table-plus.js")
  tablePlus.init({
    getText = editor.getText,
    replaceRange = editor.replaceRange,
    moveCursor = editor.moveCursor,
    getCurrentPage = editor.getCurrentPage,
    flash = editor.flashNotification,
    getConfig = config.get,
    setSelection = editor.setSelection,
    getCursor = editor.getCursor,
    undo = editor.undo,
    redo = editor.redo,
    evalExpression = lua.evalExpression,
    confirm = editor.confirm,
    prompt = editor.prompt,
    readPage = space.readPage,
    -- The settings dialog: saved as SilverBullet's Configuration Manager saves
    -- (the CONFIG page, indexed, the configuration loaded again)
    saveConfigPage = function(text)
      space.writePage("CONFIG", text)
      -- Written: the rest only loads it; a failure there says so, the page is saved
      local ok, err = pcall(function()
        if sync and sync.performFileSync then sync.performFileSync("CONFIG.md") end
        mq.send("indexQueue", "CONFIG.md")
        mq.awaitEmptyQueue("indexQueue")
        editor.reloadConfigAndCommands()
        if editor.rebuildEditorState then editor.rebuildEditorState() end
      end)
      if not ok then
        editor.flashNotification("Table Plus: the settings are saved in CONFIG, but loading them failed (" .. tostring(err) .. "): reload the page", "error")
      end
    end,
    reloadUI = editor.reloadUI,
  })
  -- Once the page is re-indexed, `${…}` cells show results from the new index
  event.listen {
    name = "page:index",
    run = function(e)
      tablePlus.pageIndexed(e.data.name)
    end,
  }
  command.define {
    name = "Table Plus: Settings",
    run = function()
      tablePlus.openSettings()
    end,
  }
  command.define {
    name = "Table Plus: Remove table metadata",
    run = function()
      tablePlus.removeAllMetadata()
    end,
  }
end
```

```space-style
.sb-table-widget.tp-table td {
  cursor: text;
}
/* An empty row is as tall as a row with text (zero-width space, not in the text) */
.sb-table-widget.tp-table td:not(.tp-editing)::before {
  content: "\200b";
}
/* An empty column stays wide enough to click into */
.sb-table-widget.tp-table td {
  min-width: 4em;
}
.sb-table-widget.tp-table td a,
.sb-table-widget.tp-table td button,
.sb-table-widget.tp-table td input[type="checkbox"] {
  cursor: pointer;
}

/* Offer to name unnamed columns, which SilverBullet does not render */
.tp-notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;
  padding: 6px 10px;
  font-family: var(--ui-font, system-ui, sans-serif);
  font-size: 13px;
  white-space: normal;
  color: var(--root-color);
  background: color-mix(in srgb, var(--ui-accent-color) 10%, transparent);
  border-left: 3px solid var(--ui-accent-color);
  border-radius: 4px;
}
.tp-notice button {
  padding: 2px 10px;
  font: inherit;
  color: inherit;
  background: var(--root-background-color);
  border: 1px solid var(--ui-accent-color);
  border-radius: 4px;
  cursor: pointer;
}

/* A header on one line (layOutHeaderCell): its name, then the icons after it,
   which always show; where the name does not fit (a width set), it is cut
   (with an ellipsis by the longText module) */
.sb-table-widget.tp-table thead tr:first-child > td {
  white-space: nowrap;
}
.sb-table-widget.tp-table .tp-head {
  display: inline-flex;
  align-items: center;
  vertical-align: top;
}
.sb-table-widget.tp-table .tp-head-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.sb-table-widget.tp-table .tp-head > .tp-ui {
  flex: none;
}
/* Sort control: shown on header hover, always while it sorts */
.tp-sort {
  margin-left: 6px;
  padding: 0 2px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.8em;
  font-weight: normal;
  color: inherit;
  cursor: pointer !important;
  opacity: 0;
  transition: opacity 0.12s;
}
.sb-table-widget.tp-table thead tr:hover .tp-sort {
  opacity: 0.5;
}
/* A touch screen has no hover to show it on: always shown there, faint
   (lighter than a column type's icon, so the two do not compete) */
@media (hover: none) {
  .sb-table-widget.tp-table thead tr .tp-sort:not(.tp-active) {
    opacity: 0.3;
  }
  /* A long press opens the cell menu: not the system's text selection and callout */
  .sb-table-widget.tp-table td:not(.tp-editing) {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
}
.sb-table-widget.tp-table thead tr .tp-sort:hover,
.sb-table-widget.tp-table thead tr .tp-sort.tp-active {
  opacity: 1;
}
.sb-table-widget .tp-hidden,
.sb-table-widget tr.tp-meta-row {
  display: none !important;
}

/* A table that fits its width, without a maximum height (the script sets
   tp-sticky-native): its box is clipped, not scrolled, so it captures no
   sticky positioning, and the header (with the rows pinned to the top) and the
   rows pinned to the bottom stick to the page, moved by the browser itself
   (smooth on a phone too). The gap above the header is STICKY_GAP in the
   script; keep both in step. */
.sb-table-widget.tp-table.tp-sticky-native {
  overflow: clip !important;
}
.sb-table-widget.tp-sticky-native thead,
.sb-table-widget.tp-sticky-native thead.tp-stuck {
  position: sticky;
  top: 42px;
  z-index: 3;
}
.sb-table-widget.tp-sticky-native tfoot,
.sb-table-widget.tp-sticky-native tfoot.tp-stuck {
  position: sticky;
  bottom: 0;
  z-index: 3;
}

/* Header held at the top of the view while the table scrolls past (moved by
   script, or by the browser with tp-sticky-native) */
.sb-table-widget thead.tp-stuck {
  /* above the rows it is moved over */
  position: relative;
  z-index: 3;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.25));
}
/* The header color may be see-through (dark theme): lay it over the page color.
   A shadow upwards fills the gap above the held header (STICKY_GAP in the
   script) with the page color, so no row shows there. */
.sb-table-widget thead.tp-stuck td {
  background: linear-gradient(
      var(--editor-table-head-background-color, transparent),
      var(--editor-table-head-background-color, transparent)
    ),
    var(--root-background-color, #fff);
}
/* Only the top row casts it: from the filter row it would cover the header row */
.sb-table-widget thead.tp-stuck tr:first-child td {
  box-shadow: 0 -42px 0 0 var(--root-background-color, #fff);
}
/* With the tint of a selected or edited cell, or of a hovered grip's line (inset shadows too) */
.sb-table-widget.tp-table thead.tp-stuck tr:first-child td:is(.tp-selected, .tp-editing) {
  box-shadow:
    0 -42px 0 0 var(--root-background-color, #fff),
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.sb-table-widget.tp-table thead.tp-stuck tr:first-child td.tp-handle-hover {
  box-shadow:
    0 -42px 0 0 var(--root-background-color, #fff),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 10%, transparent);
}

/* Pinned rows and columns stay in view (moved there by script); they need an
   opaque background over the rows and columns scrolling under them.
   SilverBullet clips tables with overflow: hidden, which would make the table
   the box sticky columns stick in; clip cuts the same without that. */
.sb-table-widget.tp-table table {
  overflow: clip !important;
}
.sb-table-widget tfoot.tp-stuck {
  position: relative;
  z-index: 3;
  filter: drop-shadow(0 -2px 3px rgba(0, 0, 0, 0.25));
}
.sb-table-widget tfoot.tp-stuck td {
  background: var(--root-background-color, #fff);
}
.sb-table-widget td.tp-pin-left,
.sb-table-widget td.tp-pin-right {
  position: sticky;
  z-index: 1;
  background: var(--root-background-color, #fff);
}
.sb-table-widget tbody tr:nth-of-type(even) td.tp-pin-left,
.sb-table-widget tbody tr:nth-of-type(even) td.tp-pin-right {
  background: linear-gradient(
      var(--editor-table-even-background-color, transparent),
      var(--editor-table-even-background-color, transparent)
    ),
    var(--root-background-color, #fff);
}
.sb-table-widget thead td.tp-pin-left,
.sb-table-widget thead td.tp-pin-right {
  background: linear-gradient(
      var(--editor-table-head-background-color, transparent),
      var(--editor-table-head-background-color, transparent)
    ),
    var(--root-background-color, #fff);
}
.sb-table-widget td.tp-pin-left.tp-pin-edge {
  box-shadow: 3px 0 4px -2px rgba(0, 0, 0, 0.3);
}
.sb-table-widget td.tp-pin-right.tp-pin-edge {
  box-shadow: -3px 0 4px -2px rgba(0, 0, 0, 0.3);
}

/* The pin icon on pinned rows (first cell) and columns (header): at the
   cell's right edge, out of the layout, so no text moves when pinning */
.sb-table-widget td:has(> .tp-pin-mark) {
  position: relative;
}
.sb-table-widget td.tp-pin-left:has(> .tp-pin-mark),
.sb-table-widget td.tp-pin-right:has(> .tp-pin-mark) {
  position: sticky;
}
.tp-pin-mark {
  position: absolute;
  top: 50%;
  right: 2px;
  display: inline-flex;
  transform: translateY(-50%);
  opacity: 0.8;
}
.tp-pin-mark svg {
  width: 14px;
  height: 14px;
}
/* In a header the name ends in the sort control: the pin icon gets its own
   room there instead of covering it (SilverBullet's header padding is 8px) */
.sb-table-widget thead tr:first-child > td:has(> .tp-pin-mark) {
  padding-right: 22px !important;
}

/* Ctrl held in a cell editor: arrows move between cells */
body.tp-navigating .sb-table-widget.tp-table,
body.tp-navigating .sb-table-widget.tp-table * {
  cursor: move !important;
}

/* Inline editing: the field takes the text's place and size; the cell is
   highlighted as selected cells are. The tint is an inset shadow over the
   cell's background, not a background color: a pinned cell, or one of a
   header held at the top, keeps its opaque background, so the rows and
   columns scrolling under it do not show through */
.sb-table-widget td.tp-editing {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.tp-cell-editor {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  text-align: inherit;
  color: inherit;
  background: transparent;
  outline: none;
}

/* A body cell's content is in a box as wide as its text (layOutCells), which
   modules size and limit. An inline block, so the column's alignment still
   applies. Alone it shows the cell as SilverBullet does. */
.sb-table-widget.tp-table .tp-cell-content {
  display: inline-block;
  vertical-align: top;
  width: max-content;
}

/* The largeTables module: a large table scrolls in its own box, at most the
   window's height (the Maximum table height setting, set inline, wins); the
   empty rows standing in for the rows out of the document take no room but their height */
.sb-table-widget.tp-large-table {
  max-height: calc(100vh - 120px);
  max-height: calc(100dvh - 120px);
  overflow: auto;
}
.sb-table-widget tr.tp-large-spacer > td {
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
}

/* The longText module (tablePlus.modules.longText): only on the tables it
   marks tp-long-text. The box, and a header's line, at most the maximum width
   (--tp-cell-max-width, set by the script); longer text wraps (tp-cells-wrap:
   up to the maximum height, the rest cut and faded) or is cut with an ellipsis
   (tp-cells-ellipsis); a header's name, or the text of a column with a width
   set, cut with an ellipsis. Off: none of this, cells as SilverBullet shows them. */
.sb-table-widget.tp-long-text .tp-cell-content,
.sb-table-widget.tp-long-text .tp-head {
  max-width: var(--tp-cell-max-width, none);
}
.sb-table-widget.tp-long-text .tp-head-name,
.sb-table-widget.tp-long-text td.tp-sized > .tp-cell-content {
  text-overflow: ellipsis;
}
/* SilverBullet keeps cells on one line (white-space: nowrap): the box wraps */
.sb-table-widget.tp-cells-wrap .tp-cell-content {
  white-space: normal;
  overflow-wrap: anywhere;
  max-height: var(--tp-cell-max-height, none);
  overflow: hidden;
}
.sb-table-widget.tp-cells-wrap td.tp-cut .tp-cell-content {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 1.4em), transparent);
}
.sb-table-widget.tp-cells-ellipsis .tp-cell-content {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* The expand button of a cell whose text does not fit: opens its popup */
.tp-expand {
  z-index: 52;
  width: 18px;
  height: 18px;
  padding: 0;
  align-items: center;
  justify-content: center;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 4px;
  opacity: 0.75;
  cursor: pointer;
}
.tp-expand:hover {
  color: var(--ui-accent-color);
  opacity: 1;
}
.tp-expand svg {
  width: 12px;
  height: 12px;
}
/* The widths module: a handle on a header cell's right edge sets the column's
   width (a line shows on it while hovered or dragged) */
.sb-table-widget.tp-table thead tr:first-child > td:not(.tp-pin-left):not(.tp-pin-right) {
  position: relative;
}
.sb-table-widget .tp-col-resize {
  /* Inside its cell, at its right edge: past it, the table clips it (the last
     column) or a pinned neighbour covers it (pinned cells stack) */
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  z-index: 2;
  width: 8px;
  cursor: col-resize;
}
.sb-table-widget .tp-col-resize::after {
  content: "";
  position: absolute;
  top: 20%;
  bottom: 20%;
  right: 0;
  width: 2px;
  border-radius: 1px;
}
.sb-table-widget .tp-col-resize:hover::after,
.sb-table-widget .tp-col-resize.tp-active::after {
  background: var(--ui-accent-color);
}
/* While its header cell is hovered, selected or edited: quiet (a grey dashed
   line) until the pointer is on it, as the quiet + */
@media not (pointer: coarse) {
  .sb-table-widget.tp-table thead tr:first-child > td:is(:hover, .tp-selected, .tp-editing) > .tp-col-resize:not(:hover):not(.tp-active)::after {
    width: 0;
    background: none;
    border-right: 1px dashed color-mix(in srgb, var(--root-color) 45%, transparent);
  }
}
@media (pointer: coarse) {
  .sb-table-widget .tp-col-resize {
    pointer-events: none;
  }
}
body.tp-resizing,
body.tp-resizing * {
  cursor: col-resize !important;
  user-select: none;
}

/* A column with a width set: its cells' text never spills over (cut; with an
   ellipsis by the longText module) */
.sb-table-widget.tp-table td.tp-sized > .tp-cell-content {
  overflow: hidden;
}

/* The settings dialog (Table Plus settings… in a table's ⋯ menu, "Table Plus:
   Settings"): tabs, rows in cards (the name and what it does left, the control
   right), switches */
.tp-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--modal-backdrop-color, rgba(0, 0, 0, 0.35));
  font-family: var(--ui-font, system-ui, sans-serif);
}
.tp-settings {
  --tp-settings-line: var(--button-border-color, rgba(128, 128, 128, 0.3));
  --tp-settings-card: color-mix(in srgb, var(--root-color) 4%, var(--root-background-color));
  /* As tall as its content, as far as the window has room; then its body scrolls */
  display: flex;
  flex-direction: column;
  width: min(600px, calc(100vw - 24px));
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--tp-settings-line);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  font-size: 14px;
  overflow: hidden;
}
.tp-settings:focus {
  outline: none;
}
.tp-settings button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.tp-settings-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 16px 8px;
}
.tp-settings-titles {
  flex: 1;
  min-width: 0;
}
.tp-settings-title {
  margin: 0;
  font-size: 17px;
  line-height: 1.3;
}
.tp-settings-scope {
  margin: 2px 0 0;
  font-size: 12px;
  opacity: 0.65;
}
.tp-settings-close {
  display: inline-flex;
  padding: 5px;
  background: none;
  border: 0;
  border-radius: 6px;
  opacity: 0.65;
}
.tp-settings-close:hover {
  opacity: 1;
  background: var(--tp-settings-card);
}
.tp-settings-close svg {
  width: 16px;
  height: 16px;
}
.tp-settings-tabs {
  display: flex;
  gap: 2px;
  padding: 0 12px;
  border-bottom: 1px solid var(--tp-settings-line);
}
.tp-settings-tab {
  padding: 7px 10px;
  margin-bottom: -1px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  opacity: 0.7;
}
.tp-settings-tab:hover {
  opacity: 1;
}
.tp-settings-tab[aria-selected="true"] {
  opacity: 1;
  font-weight: 600;
  border-bottom-color: var(--ui-accent-color);
}
.tp-settings-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 12px;
}
.tp-settings-panel[hidden] {
  display: none;
}
.tp-settings-group {
  margin: 14px 2px 6px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
}
.tp-settings-panel > .tp-settings-card:first-child {
  margin-top: 12px;
}
.tp-settings-card {
  background: var(--tp-settings-card);
  border: 1px solid var(--tp-settings-line);
  border-radius: 8px;
}
.tp-settings-card > :not(:first-child) {
  border-top: 1px solid var(--tp-settings-line);
}
.tp-settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
}
.tp-settings-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.tp-settings-module-name,
.tp-settings-name {
  font-weight: 500;
}
.tp-settings-hint {
  font-size: 12px;
  line-height: 1.35;
  opacity: 0.62;
}
.tp-settings-row select,
.tp-settings-row input[type="number"] {
  flex: none;
  font: inherit;
  color: inherit;
  background: var(--root-background-color);
  border: 1px solid var(--tp-settings-line);
  border-radius: 6px;
  padding: 4px 8px;
}
.tp-settings-row select {
  max-width: 55%;
}
.tp-settings-row input[type="number"] {
  width: 6.5em;
}
.tp-settings-row input.tp-settings-invalid {
  border-color: var(--danger-color, #c62828);
}
/* A switch: the checkbox (invisible, still focusable) drawn as a track and a knob */
.tp-settings-switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
}
.tp-settings-switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.tp-settings-knob {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--root-color) 22%, var(--root-background-color));
  transition: background 0.15s;
  pointer-events: none;
}
.tp-settings-knob::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s;
}
.tp-settings-switch input:checked + .tp-settings-knob {
  background: var(--ui-accent-color);
}
.tp-settings-switch input:checked + .tp-settings-knob::after {
  transform: translateX(14px);
}
.tp-settings-switch input:focus-visible + .tp-settings-knob {
  outline: 2px solid var(--ui-accent-color);
  outline-offset: 2px;
}
.tp-settings-switch input:disabled + .tp-settings-knob {
  opacity: 0.5;
}
/* A module's own settings: under it, indented, while it is on */
.tp-settings-module-settings {
  margin: 0 12px 10px 24px;
  border-left: 2px solid var(--tp-settings-line);
}
.tp-settings-module-settings .tp-settings-row {
  padding: 6px 0 6px 12px;
}
.tp-settings-module-settings[hidden] {
  display: none;
}
.tp-settings-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--tp-settings-line);
}
.tp-settings-note {
  flex: 1;
  font-size: 12px;
  opacity: 0.75;
}
.tp-settings-cancel,
.tp-settings-save {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--tp-settings-line);
  background: var(--root-background-color);
}
.tp-settings-save {
  color: #fff !important;
  background: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
}
.tp-settings-save:disabled {
  opacity: 0.45;
  cursor: default;
}
/* A phone: the dialog takes the screen (the buttons always at its bottom), fields
   in 16px (no zoom on focus), larger targets for a finger */
@media (max-width: 480px), (pointer: coarse) and (max-height: 600px) {
  .tp-settings {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }
  .tp-settings-body {
    flex: 1 1 auto;
  }
  .tp-settings-tab {
    padding: 10px 12px;
  }
  .tp-settings-row {
    min-height: 44px;
  }
  .tp-settings-cancel,
  .tp-settings-save {
    padding: 10px 18px;
  }
  .tp-settings-row {
    flex-wrap: wrap;
  }
  .tp-settings-row select {
    max-width: 100%;
  }
  .tp-settings-row select,
  .tp-settings-row input[type="number"] {
    font-size: 16px;
  }
}

/* The cell's popup: its editor over the cell, the whole text wrapped */
.tp-floating.tp-cell-popup.tp-visible {
  display: block !important;
}
.tp-cell-popup {
  z-index: 55;
  box-sizing: border-box;
  /* The font is the cell's (set by the script) */
  padding: 6px 8px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--ui-accent-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
.tp-cell-popup .tp-cell-popup-field {
  min-height: 1.5em;
  max-height: 50vh;
  overflow-y: auto;
  resize: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Filter row: a field per column; the one filtering is marked */
.sb-table-widget .tp-filter-row td {
  padding: 4px 6px !important;
  vertical-align: middle;
}
/* Its field gives the row its height: no empty line before it */
.sb-table-widget.tp-table .tp-filter-row td::before {
  content: none;
}
.tp-filter-box {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 2px 4px;
  border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
  border-radius: 4px;
  font-family: var(--ui-font, system-ui, sans-serif);
  font-size: 12px;
  font-weight: normal;
}
.tp-filter-box:focus-within {
  border-color: var(--ui-accent-color);
}
.tp-filter-active .tp-filter-box,
.tp-filter-popover.tp-filter-typed .tp-filter-box {
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-accent-color) 60%, transparent);
}
.tp-filter-icon {
  display: inline-flex;
  flex: none;
  opacity: 0.45;
}
.tp-filter-active .tp-filter-icon {
  color: var(--ui-accent-color);
  opacity: 1;
}
.tp-filter-icon svg {
  width: 12px;
  height: 12px;
}
/* Fills its box without widening the column (the cell has a minimum width) */
.tp-filter {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  outline: none;
  cursor: text !important;
}
.tp-filter::placeholder {
  color: inherit;
  opacity: 0.5;
}
/* An invalid regular expression: it filters nothing, the tooltip says why */
.tp-filter-box:has(.tp-filter.tp-invalid) {
  border-color: var(--danger-color, #c62828);
}
/* Clears the field: shown while it holds something (!important: see .tp-floating) */
.tp-filter-clear {
  display: none !important;
  flex: none;
  padding: 0;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0.6;
}
.tp-filter-typed .tp-filter-clear {
  display: inline-flex !important;
}
.tp-filter-clear:hover {
  opacity: 1;
  color: var(--ui-accent-color);
}
.tp-filter-clear svg {
  width: 12px;
  height: 12px;
}
/* In a filtered column's header (also while the filter row is hidden): opens its filter */
.tp-filter-mark {
  display: none;
  margin-left: 4px;
  color: var(--ui-accent-color);
  vertical-align: -2px;
  cursor: pointer;
}
.sb-table-widget.tp-table td.tp-filtered .tp-filter-mark {
  display: inline-flex;
}
.tp-filter-mark svg {
  width: 13px;
  height: 13px;
}
/* Under the field typed in, or a column's filter on its own: what the field
   understands, and a column's few values to tick */
.tp-filter-bubble.tp-visible {
  flex-direction: column;
  gap: 6px;
  max-width: 300px;
  padding: 6px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
}
.tp-filter-popover.tp-visible {
  min-width: 220px;
}
.tp-filter-popover .tp-filter-box {
  padding: 4px 6px;
  font-size: 13px;
}
.tp-filter-bubble-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tp-filter-bubble-body:empty {
  display: none;
}
.tp-filter-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tp-filter-hint {
  padding: 1px 6px;
  font: inherit;
  color: inherit;
  background: none;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.tp-filter-hint:hover {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
}
.tp-filter-hint code {
  font-size: 11px;
  color: var(--ui-accent-color);
}
.tp-filter-values {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
  border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  padding-top: 4px;
}
.tp-filter-value {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
}
.tp-filter-value:hover {
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
}
.tp-filter-value input {
  margin: 0;
  cursor: pointer;
}
.tp-filter-value-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tp-filter-value-count {
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}
/* A toolbar chip's icon before its text (the filters') */
.tp-chip > svg {
  width: 12px;
  height: 12px;
  margin-right: 4px;
}

/* Floating controls. Shown and hidden with !important: themes may set display
   on every button with !important (grips and the + are buttons), which would
   leave them in view where they no longer act */
.tp-floating {
  position: fixed;
  z-index: 50;
  display: none !important;
  font-family: var(--ui-font, system-ui, sans-serif);
}
.tp-floating.tp-visible {
  display: flex !important;
}
.tp-bar {
  align-items: center;
  gap: 2px;
  padding: 2px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.tp-bar button {
  padding: 2px 8px;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.tp-bar button:hover,
.tp-bar button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
/* At the left, what the table is and how it is shown: its name, its sorting,
   its rows filtered; set off from the icons at the right */
.tp-bar .tp-bar-label {
  padding: 2px 6px;
  font-weight: 600;
  color: var(--ui-accent-color);
}
.tp-bar .tp-bar-label,
.tp-bar .tp-chip,
.tp-bar .tp-status {
  margin-right: 4px;
}
/* The ⋯ button while its menu is open */
.tp-bar button.tp-bar-more.tp-active {
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
/* Icon buttons (Recalculate, Filter, ⋯), highlighted when they ask to be used */
.tp-bar button.tp-bar-icon {
  display: inline-flex;
  align-items: center;
  padding: 3px 5px;
}
.tp-bar-icon svg {
  width: 14px;
  height: 14px;
}
.tp-bar button.tp-attention {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
.tp-status {
  padding: 0 6px;
  font-weight: 600;
}
.tp-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 2px 1px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
}
.tp-bar .tp-chip-clear,
.tp-bar .tp-chip-apply {
  display: inline-flex;
  padding: 2px;
  border-radius: 3px;
}
.tp-bar .tp-chip-clear:hover,
.tp-bar .tp-chip-apply:hover {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.tp-chip-clear svg,
.tp-chip-apply svg {
  width: 12px;
  height: 12px;
}
/* The row and column grips: quiet bars until hovered (their size is set where
   they are placed); hovered, opaque, as they lie half over a cell */
.tp-handle {
  padding: 0;
  align-items: center;
  justify-content: center;
  color: var(--root-color);
  background: none;
  opacity: 0.5;
  border: 0;
  border-radius: 4px;
  cursor: grab;
  touch-action: none;
}
.tp-handle:hover,
.tp-handle.tp-active {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 18%, var(--root-background-color));
  /* A border that takes no room: set off from the tinted row (column) */
  box-shadow: 0 0 0 1px var(--ui-accent-color);
  opacity: 1;
}
.tp-handle.tp-no-drag {
  cursor: pointer;
}
.tp-handle svg {
  width: 10px;
  height: 10px;
}
.tp-grip-column svg {
  transform: rotate(90deg);
}
/* What the hovered grip acts on */
.sb-table-widget.tp-table .tp-handle-hover {
  box-shadow: inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 10%, transparent);
}
/* Select rows (columns): the pointer picks the last one */
body.tp-picking-rows .sb-table-widget.tp-table :is(td, th),
body.tp-picking-columns .sb-table-widget.tp-table :is(td, th) {
  cursor: cell;
}
.tp-insert {
  /* Over its line */
  z-index: 51;
  width: 18px;
  height: 18px;
  padding: 0;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: var(--ui-accent-color);
  border: 0;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
.tp-insert svg {
  width: 12px;
  height: 12px;
}
/* Under the last row while it is hovered, selected or edited: quiet (grey,
   see-through, a dashed outline) until the pointer is on it */
.tp-insert.tp-quiet:not(:hover) {
  box-sizing: border-box;
  color: color-mix(in srgb, var(--root-color) 45%, transparent);
  background: color-mix(in srgb, var(--root-color) 6%, transparent);
  border: 1px dashed color-mix(in srgb, var(--root-color) 40%, transparent);
  box-shadow: none;
}
/* The border a row (column) goes to: over the table, not taking the pointer */
.tp-insert-line {
  background: var(--ui-accent-color);
  pointer-events: none;
}

/* Row and column menus */
.tp-menu {
  z-index: 60;
  flex-direction: column;
  min-width: 200px;
  padding: 4px;
  font-size: 13px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  outline: none;
}
/* The title centered; a submenu's back arrow at the left */
.tp-menu-title {
  display: grid;
  grid-template-columns: 1fr minmax(0, max-content) 1fr;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 6px;
  font-size: 12px;
  font-weight: 600;
}
.tp-menu-back {
  justify-self: start;
}
.tp-menu-title-text {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A submenu's way back: an arrow before its title */
.tp-menu-back {
  display: inline-flex;
  margin: -3px 0 -3px -5px;
  padding: 3px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.tp-menu-back:hover,
.tp-menu-back:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
  outline: none;
}
.tp-menu .tp-menu-back svg {
  width: 14px;
  height: 14px;
}
.tp-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.tp-menu-item:hover,
.tp-menu-item:focus-visible,
.tp-segment:hover,
.tp-segment:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
  outline: none;
}
.tp-menu-item[aria-disabled="true"] {
  cursor: default;
  opacity: 0.45;
}
.tp-menu-item[aria-disabled="true"]:hover {
  background: none;
}
.tp-menu-item .tp-label {
  flex: 1;
}
.tp-menu-item[aria-checked="true"]::after {
  content: "\2713";
  color: var(--ui-accent-color);
}
.tp-menu-item.tp-danger {
  color: var(--danger-color, #c62828);
}
.tp-icon {
  display: inline-flex;
}
.tp-menu svg {
  width: 16px;
  height: 16px;
}
/* An item's detail: a bubble beside the menu, at the item's height */
.tp-menu-detail {
  position: absolute;
  left: calc(100% + 8px);
  width: max-content;
  max-width: 280px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  pointer-events: none;
}
.tp-menu-detail.tp-left {
  left: auto;
  right: calc(100% + 8px);
}
.tp-menu-detail[hidden] {
  display: none;
}
.tp-menu-detail-title {
  margin-bottom: 4px;
  font-weight: 600;
}
.tp-menu-detail-code {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.tp-menu-detail-code code {
  padding: 1px 5px;
  font-size: 11px;
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
  border-radius: 4px;
}
.tp-menu-detail p {
  margin: 0;
}
.tp-menu-detail .tp-menu-detail-note {
  margin-top: 6px;
  opacity: 0.7;
}
/* The icon of an item's value: Type: ☆ Stars */
.tp-menu-value-icon {
  display: inline-flex;
  margin-right: 3px;
  vertical-align: -2px;
}
.tp-menu .tp-menu-value-icon svg {
  width: 14px;
  height: 14px;
}
/* The values a typed cell offers, under its editor */
.tp-choices {
  z-index: 57;
  flex-direction: column;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
  font-size: 13px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
}
.tp-choice {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
  white-space: nowrap;
  border-radius: 5px;
  cursor: pointer;
}
.tp-choice:hover,
.tp-choice.tp-active {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
}
.tp-choice.tp-current::after {
  content: "\2713";
  margin-left: auto;
  color: var(--ui-accent-color);
}
.tp-menu-separator {
  height: 1px;
  margin: 4px 2px;
  background: var(--button-border-color, rgba(128, 128, 128, 0.3));
}
.tp-menu-segmented {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 2px 8px;
}
.tp-segments {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--root-color) 6%, transparent);
}
.tp-segment {
  display: inline-flex;
  padding: 4px 6px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.tp-segment[aria-checked="true"] {
  color: var(--ui-accent-color);
  background: var(--root-background-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

/* Middle-button autoscroll over a wide table: the start point */
.tp-autoscroll {
  z-index: 70;
  width: 24px;
  height: 24px;
  box-sizing: border-box;
  pointer-events: none;
  border: 2px solid var(--root-color);
  border-radius: 50%;
  background:
    radial-gradient(circle, var(--root-color) 2px, transparent 3px),
    var(--root-background-color);
  opacity: 0.8;
}
body.tp-autoscrolling,
body.tp-autoscrolling * {
  cursor: all-scroll !important;
}

/* Formulas */
/* Names: a mark in a cell's corner, as a spreadsheet marks a comment. A named
   cell or column (its header) at the top right, a named row at its first
   cell's top left; one overlay draws both, drawn over the cell, so a pinned
   or striped cell's background does not hide them */
.sb-table-widget.tp-table td:is(.tp-named, .tp-row-named):not(.tp-pin-left):not(.tp-pin-right) {
  position: relative;
}
.sb-table-widget.tp-table td.tp-named {
  --tp-name-mark: linear-gradient(225deg, color-mix(in srgb, var(--ui-accent-color) 70%, transparent) 50%, transparent 50%);
}
.sb-table-widget.tp-table td.tp-row-named {
  --tp-row-name-mark: linear-gradient(135deg, color-mix(in srgb, var(--ui-accent-color) 70%, transparent) 50%, transparent 50%);
}
.sb-table-widget.tp-table td:is(.tp-named, .tp-row-named)::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    var(--tp-name-mark, none) top right / 6px 6px no-repeat,
    var(--tp-row-name-mark, none) top left / 6px 6px no-repeat;
  pointer-events: none;
}
/* Column types: the type's hashtag is hidden, its icon shows after the
   column's name; a value not of the type is red */
.sb-table-widget .tp-type-tag {
  display: none;
}
.tp-type-icon {
  display: inline-flex;
  margin-left: 4px;
  vertical-align: -2px;
  opacity: 0.6;
}
.tp-type-icon svg {
  width: 14px;
  height: 14px;
}
.sb-table-widget.tp-table td.tp-type-invalid {
  color: var(--danger-color);
}

/* Cells selected by dragging, to copy */
.sb-table-widget.tp-table td.tp-selected {
  /* An inset shadow over the background, as for the cell edited (td.tp-editing) */
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
/* A pinned column's edge keeps its shadow when selected or edited */
.sb-table-widget.tp-table td.tp-pin-left.tp-pin-edge:is(.tp-selected, .tp-editing) {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent),
    3px 0 4px -2px rgba(0, 0, 0, 0.3);
}
.sb-table-widget.tp-table td.tp-pin-right.tp-pin-edge:is(.tp-selected, .tp-editing) {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent),
    -3px 0 4px -2px rgba(0, 0, 0, 0.3);
}
/* While a formula waits for a reference, cells can be pointed at */
.sb-table-widget.tp-table.tp-pointing td:not(.tp-editing) {
  cursor: move;
}
/* A formula's result: a dotted underline (not while the cell is edited). On
   the content box too: a decoration does not reach into an inline block. */
.sb-table-widget.tp-table td.tp-formula:not(.tp-editing),
.sb-table-widget.tp-table td.tp-formula:not(.tp-editing) > .tp-cell-content {
  text-decoration: underline dotted color-mix(in srgb, var(--ui-accent-color) 75%, transparent);
  text-decoration-thickness: 2px;
  /* Clear of the digits, which have no descenders to leave room */
  text-underline-offset: 0.3em;
}
.sb-table-widget.tp-table td.tp-formula-error {
  color: var(--danger-color);
}
.tp-formula-hint {
  z-index: 56;
  flex-direction: column;
  gap: 3px;
  max-width: 460px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  pointer-events: none;
}
.tp-formula-preview {
  font-family: var(--editor-font, monospace);
  font-weight: 600;
  white-space: pre-wrap;
  word-break: break-all;
}
.tp-formula-tab {
  opacity: 0.7;
}
.tp-formula-help code {
  margin-right: 6px;
  font-weight: 600;
}
.tp-floating.tp-ref-mark {
  z-index: 49;
  box-sizing: border-box;
  pointer-events: none;
  border: 2px solid var(--tp-ref-color);
  background: color-mix(in srgb, var(--tp-ref-color) 10%, transparent);
}
.tp-floating.tp-ref-mark.tp-visible {
  display: block !important;
}
.tp-ref-edge {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
  cursor: move;
}
.tp-ref-top,
.tp-ref-bottom {
  left: -4px;
  right: -4px;
  height: 7px;
}
.tp-ref-top {
  top: -5px;
}
.tp-ref-bottom {
  bottom: -5px;
}
.tp-ref-left,
.tp-ref-right {
  top: -4px;
  bottom: -4px;
  width: 7px;
}
.tp-ref-left {
  left: -5px;
}
.tp-ref-right {
  right: -5px;
}
.tp-ref-corner {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 8px;
  height: 8px;
  pointer-events: auto;
  touch-action: none;
  cursor: nwse-resize;
  background: var(--tp-ref-color);
  border: 1px solid var(--root-background-color);
}
body.tp-ref-dragging,
body.tp-ref-dragging * {
  cursor: move !important;
  user-select: none;
}

/* Dragging */
/* A row (column) dragged: its copy follows the pointer, the others move aside */
.tp-drag-ghost {
  z-index: 55;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
/* Opaque: the table's cells take their background from their rows */
.tp-drag-ghost table {
  border-collapse: collapse;
  background: var(--root-background-color);
}
/* Its place is covered by the rows (columns) moving aside: the gap left is where it goes */
.sb-table-widget .tp-dragged {
  opacity: 0;
}
body.tp-dragging .sb-table-widget.tp-table :is(td, th) {
  transition: transform 0.15s ease;
}
@media (prefers-reduced-motion: reduce) {
  body.tp-dragging .sb-table-widget.tp-table :is(td, th) {
    transition: none;
  }
}
body.tp-dragging,
body.tp-dragging * {
  cursor: grabbing !important;
  user-select: none;
}
```
