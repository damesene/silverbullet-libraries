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

* **Edit a cell**: click it, type, press Enter. See [[#Editing cells]].
* **Move between cells**: Tab / Shift+Tab, or Ctrl+arrows while editing; Ctrl+Alt+arrows move the row or column. See [[#Keyboard]].
* **See the markdown**: hover the table and click *Edit markdown*, or Alt+click a cell. See [[#Showing the markdown]].
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

* Click a cell to edit it in place. Enter or clicking elsewhere saves, Esc cancels.
* Shift+click opens the editor with the cell's whole text selected, to type over it. The *Click selects the cell's text* setting swaps the two. See [[#Settings]].
* Links, tasks and buttons in cells work as before: clicking them does not start editing.
* A column always needs a name: emptying a header cell keeps the old name.

### Keyboard

| Key | While editing a cell |
|---|---|
| Enter | Save, edit the cell below (with the `save` setting: only save) |
| Ctrl+Enter | Save, add a row below, edit it |
| Esc | Cancel |
| Tab | Save, edit the next cell |
| Shift+Tab | Save, edit the previous cell |
| Ctrl+arrows | Save, edit the cell beside |
| Ctrl+Home | Save, edit the row's first cell |
| Ctrl+End | Save, edit the row's last cell |
| Ctrl+PageUp / PageDown | Save, edit the cell 10 rows up / down |
| Ctrl+Alt+↑ / ↓ | Move the row up / down |
| Ctrl+Alt+← / → | Move the column left / right |
| Ctrl+Alt+Home / End | Move the column to the start / end |
| Ctrl+Alt+PageUp / PageDown | Move the row 10 places up / down |

* Tab on the last cell adds a row.
* With Shift, Enter and the Ctrl keys open the next cell as Shift+click does: with its whole text selected, or with the cursor at the end when the *Click selects the cell's text* setting is on. See [[#Settings]].
* Ctrl+Alt+arrows save the cell and move it with its row or column, and keep editing it. Rows cannot move while sorted or filtered, nor the header row.
* Enter (and Shift+Enter) also moves to the cell below; with the `save` setting it only saves. See [[#Settings]].
* Browsers use Ctrl+PageUp / PageDown to switch tabs and do not pass them to the page. They work where SilverBullet runs without tabs (installed as an app).
* While Ctrl is held, the pointer shows a move cursor. Without Ctrl, arrows, Home and End move within the cell's text as usual.

## Copying cells

* Press on a cell and drag across others, the header included if you like: the cells in between are selected. A plain click still edits the cell.
* **Ctrl+C** copies them as a spreadsheet does, so Excel, Google Sheets or LibreOffice paste them into cells, and other editors as text (a tab between cells, a line break between rows).
* Cells copy what they show: a formula's result, a link's text.
* The selection follows the rows as shown: in a sorted or filtered table it takes the rows in their order on the screen, without the hidden ones.
* **Delete** empties the selected cells, formulas included, as one edit (Ctrl+Z brings them back). Header cells keep their names: a column needs one.
* Esc or a click elsewhere ends the selection.

## Pasting from a spreadsheet

Copy cells in Excel, Google Sheets or LibreOffice, click a cell of a table and paste:

* **Ctrl+V** pastes them from that cell to the right and down, over the cells there. Where the table ends, rows and columns are added (before the rows and columns pinned to the bottom and right).
* **Ctrl+Shift+V** overwrites nothing: the pasted rows are added as new rows at the cell's row (under the header when pasted there). Columns are added where the rows are wider than the table.
* Cells with a formula keep it; the values pasted onto them are left out (the message says how many). New rows get the formulas of calculated columns, see [[#Formulas]].
* Pasted onto the header, the first row names the columns; an empty value keeps the old name.
* Spreadsheets copy values as they show them (`1 234,50 Kč`), not their formulas. A line break inside a cell becomes a space, as a markdown table cell has one line.
* A single value (no tab, no line break) is pasted into the cell's editor as usual.
* The paste is one edit: one Ctrl+Z undoes it. It is not possible while the table is sorted or filtered, as the rows shown are not where the cells would go.

## Showing the markdown

A plain click edits a cell and no longer switches the table to its markdown. To see or edit the markdown:
* hover the table and click *Edit markdown* in the toolbar above it, or
* Alt+click a cell: the cursor lands in that cell (at the clicked character, for plain text).

## Sorting

* Click the ⇅ control that appears in a column header on hover (on a touch screen it is always shown): ascending, descending, then back to the order as written. The column menu (see [[#Rows and columns]]) has the same options.
* Sorting only changes what you see, never the markdown, unless the *Store table metadata* setting is on: then the sorting is also stored in the table, see [[#Table metadata]].
* While sorted, the toolbar shows *Sorted by …*; its × shows the rows as written again, and its ✓ sorts the rows in the markdown that way (after asking) and ends the sorting view. Rows a filter hides are sorted too, pinned rows stay where they are, and one Ctrl+Z undoes it.
* Numbers sort as numbers (`1 000`, `2,5`, `-3`, `15 %`, `12,99 €`, `$5`, `3 kg` included); empty cells always come last.

## Filtering

Hover the table and click *Filter* (or *Filter* in a column menu) to show a filter field under each header. The toolbar shows how many rows match. Hiding the filter row clears the filters.

Plain text is found anywhere in a cell, ignoring case and diacritics (`cesky` finds `Český`). With *Smart filters* (on by default, see [[#Settings]]) a field also understands:

| Filter | Shows cells that |
|---|---|
| `>10` `>=10` | are numbers above 10 |
| `<10` `<=10` | are numbers below 10 |
| `/pattern/` | match a regular expression |
| `/pattern/c` | match it, with case |
| `=text` | are exactly `text` |
| `!filter` | do **not** match `filter` |

* Number filters hide cells that are not numbers. Numbers are read as for sorting.
* Regular expressions ignore case unless flagged `c` (other flags: `m`, `s`, `u`), and see the cell text as shown, e.g. the alias of a link. Example: `/^item 1[0-9]$/`.
* `=text` ignores case and diacritics, like plain text.
* `!` works in front of any filter: `!done`, `!>10`, `!/^$/` (cells that are not empty).
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
* **Calculated columns**: when every row of a column holds the same formula, such as `=[@qty]*[@price]`, a new row (*+ Row*, Ctrl+Enter, Tab on the last cell, *Insert row*) gets it too. Total rows (with a formula over a whole column, such as `=SUM([qty])`) do not count.
* Click the cell to edit its formula. Typing a plain value removes the formula. To type a text that starts with `=`, start it with `'=`; such a text opens with the `'` again, so it stays text.
* Results are written whenever Table Plus edits the table, in the same edit (one Ctrl+Z undoes both). Viewing a table never changes it. The toolbar of a table with formulas starts with *Recalculate* (the ↻ icon), which writes the current results; it is highlighted when some are out of date, e.g. after the table was changed outside Table Plus (by typing in the markdown).
* A formula's result has a dotted underline; hover it to see its formula, or why it shows an error.
* Numbers are read as for sorting (`12,99 €`, `1 000`, `15 %`). Results use a decimal comma when most numbers in the table do. A text that is not read as a number (e.g. `1,234.50`, with a thousands comma) is skipped by `SUM` and the other number functions.

### References

| Reference | Means |
|---|---|
| `B1` | Column B, the first row under the header |
| `A1:B3` | The range from A1 to B3 |
| `[qty]` | The whole column named Qty (written by its key, see below), without the cells whose formulas refer to the whole column (a total or an average under it) |
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
| `#REF!` | A reference outside the table, or a column name that does not exist |
| `#NAME?` | An unknown function or name |
| `#VALUE!` | A value of the wrong kind (text where a number is needed), or a wrong number of arguments |
| `#DIV/0!` | Division by zero, or an average of no numbers |
| `#NUM!` | A result that is not a finite number |
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

Hover a cell to show two grips: ⠿ left of its row, and ⠿ above its column. While a cell is edited, they stay with it.

* **Click a grip** for a menu:
  * Row: insert above or below, duplicate, move up or down, delete.
  * Column: sort, filter, type (see [[#Column types]]), align (left, center, right), insert left or right, move, delete.
* **Drag a grip** to move the row or column; Esc cancels the drag.
* **Add at the end**: *+ Row* below the table adds a row, *+* right of the header adds a column (named *Column N*, ready to rename).
* Rows can be moved only in the original order (no sorting, no filter), so a row always lands where you see it.

## Pinning

With the *Store table metadata* setting on, the row menu has *Pin to top* and *Pin to bottom*, the column menu *Pin left* and *Pin right* (click a checked item again to unpin).

* Pinning moves the row (column) in the markdown, to the edge of the table, next to the rows (columns) already pinned there. The table stores how many are pinned at each edge, see [[#Table metadata]].
* Pinned rows and columns stay in view: rows pinned to the top move with the header, rows pinned to the bottom stay at the bottom of the view, columns stay at the left or right edge while a wide table scrolls sideways.
* They are kept at the edges through every edit: rows added at the end go above the rows pinned to the bottom, columns added at the end left of the columns pinned to the right, and nothing is inserted above the first row pinned to the top or below the last one pinned to the bottom. A row inserted between pinned rows is pinned too.
* Moving (drag, menu, Ctrl+Alt+arrows) keeps a pinned row (column) among the pinned ones and the others outside them.
* Pinned rows are not sorted or filtered: they always show.
* Unpinning moves the row (column) out of its edge, next to the unpinned ones; it does not go back to where it was before pinning (Ctrl+Z does).
* "Pinned" means a number of rows (columns) at an edge: a row typed by hand above the first pinned row becomes the pinned one.
* Rows pinned to the top look like the header.

## Touch screens

On a phone or a tablet:

* Tap a cell to edit it. The handles of its row and column show next to it: tap one for the row's or column's menu, or drag it to move the row or column.
* The sort buttons in the header are always shown (there is no hover to show them on). The toolbar (*Filter*, *Edit markdown*) shows while a cell of the table is edited.
* Swiping scrolls a wide table sideways and the page up and down, as usual.
* Not on touch screens: selecting cells by dragging, the keyboard shortcuts (unless the device has a keyboard) and middle-button scrolling.

## Large tables

* **Sticky header**: while you scroll past a long table, its header stays at the top of the view, with the toolbar above it.
* **Maximum height**: with the *Maximum table height* setting, a taller table scrolls inside its own box; its header stays at the top of that box. See [[#Settings]].
* **Wide tables** scroll sideways; Table Plus keeps the scroll position after edits, and new rows open their editor in a column you can see.
* **Autoscroll**: the middle mouse button over a wide table scrolls the table sideways and the page up and down together. Hold and drag, or click and move; the next click ends it.

## Settings

Open *Configuration: Open* (Ctrl+, / Cmd+,) and find the *Table Plus* and *Table Plus: Modules* categories, or set them in your [[CONFIG]]. Settings of whole tables are `tablePlus.<setting>`, those of a part of Table Plus `tablePlus.<part>.<setting>`, and those of a module (a part that can be turned off) `tablePlus.modules.<module>.<setting>`. A part is set in one go, with only what you change (the rest keeps its default):

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

### Cell editor (`tablePlus.editor`)

* **Enter in a cell editor** (`enterKey`), default `moveDown`
  * `save`: Enter saves the cell.
  * `moveDown`: Enter saves and edits the cell below; Shift+Enter too, opening it as Shift+click does.
* **Click selects the cell's text** (`selectOnClick`), default `false`
  * `false`: a click puts the cursor at the end of the cell's text, Shift+click selects the whole text.
  * `true`: the reverse. With Shift, Enter and the Ctrl keys follow Shift+click; without Shift they put the cursor at the end either way.
* **Ctrl+Enter adds a row** (`ctrlEnterAddsRow`), default `true`
  * `true`: Ctrl+Enter in a cell editor saves the cell, adds an empty row below its row and edits it.
  * `false`: Ctrl+Enter works like Enter.

### Filters (`tablePlus.filter`)

* **Smart filters** (`smart`), default `true`
  * `true`: filter fields understand `>10`, `/pattern/`, `=text` and `!filter`.
  * `false`: everything typed in a filter field is text to find.

### `${…}` cells (`tablePlus.expressions`)

* **Refresh ${…} cells after (ms)** (`refreshDelay`), default `500`
  * After you edit a table, a cell that holds a `${…}` expression reading the page index (a query, or a formula of a spreadsheet library such as MdTableSheet) shows its new result once SilverBullet has indexed the page again. This is how many milliseconds it waits for the index: raise it if such cells still show old results (a slow device, a large space).

### Modules (`tablePlus.modules`)

Each module can be turned off with `enabled = false`, e.g. `config.set("tablePlus.modules.paste", { enabled = false })`; all are on by default. A change applies when the page is loaded again. Editing cells, sorting, filtering and the toolbar are always on.

| Module | When on |
|---|---|
| `formulas` | Formulas can be typed into cells, with their help and references; *Recalculate* in the toolbar. Off: a typed formula is saved as text. Formulas already in a table keep their results and are still recalculated when Table Plus edits the table, so their references stay right. See [[#Formulas]]. |
| `columnTypes` | A header's type hashtag formats its column, the cell editor offers the type's values, and the column menu has *Type*. Off: cells show as written. See [[#Column types]]. |
| `selection` | Dragging across cells selects them; Ctrl+C copies them, Delete empties them. |
| `paste` | Ctrl+V pastes cells copied from a spreadsheet over the table, Ctrl+Shift+V as new rows. Off: a paste goes into the cell editor as text. |
| `handles` | The handles beside rows and above columns: drag them to move rows and columns, click them for the row and column menus. Off: rows and columns still move with Ctrl+Alt+arrows, and *+ Row* and *+* still add them. |
| `sticky` | A table's header stays in view while the page scrolls past the table, and rows pinned to the bottom stay at the bottom of the view. |
| `autoscroll` | The middle mouse button over a table scrolls it. |

## Table names

A table can have a name, so formulas in other tables can refer to it. Click *Name* in the table's toolbar and type it; an empty name removes it. The name is stored in the table's metadata row (`<meta name="prices">`), so it needs the *Store table metadata* setting, or a table that has a metadata row already.

* A name is letters, digits and `_`, not starting with a digit, e.g. `prices` or `price_list`. Names that read as a cell (`A1`, `AB12`) or as `TRUE` / `FALSE` are refused.
* Names are compared ignoring case, and two tables on a page cannot have the same name.
* The toolbar shows the name: *Name: prices*.

## Table metadata

With the *Store table metadata* setting on, Table Plus stores a table's settings in a last row that holds only a `<meta …>` tag: the sorting and the pinned rows and columns.

```
| Name  | Qty |
| ----- | --: |
| Pear  |   3 |
| Apple |  10 |
| Total |  13 |
| <meta sort="qty:desc" pin-bottom="1"> |
```

* `sort` is the sorting, `pin-top`, `pin-bottom`, `pin-left` and `pin-right` how many rows (columns) at each edge are pinned, `name` the table's name (see [[#Table names]]).

* The row is hidden in SilverBullet. Browsers never show `<meta>`, and other markdown renderers (GitHub, Obsidian) drop it, leaving at most an empty row.
* It is always the last row: new rows go above it, and it is not sorted, filtered or moved.
* The sorting is stored by column name: `qty:desc`. Names are keys, as for formula references (see [[#References]]): the column `Unit price` is stored as `unit_price`, and any spelling with that key names it. With several columns of the same name, the occurrence is added: `qty:desc:2` is the second column named Qty. It follows its column when the column is renamed or moved, and is removed with it.
* When the sorting is cleared and nothing is pinned, the row is removed.
* With the setting off, a table without a `<meta>` row gets none. A table with one keeps using it: its sorting is still stored, and its rows and columns can be unpinned, but nothing new can be pinned. When the row is left empty, it is removed.
* To remove metadata: *Remove metadata* in a table's toolbar removes that table's `<meta>` tags; the *Table Plus: Remove table metadata* command removes them from all tables on the page (it says how many). That is the metadata row (a sorting stored there ends: the rows show as written; the table's name goes too) and the formulas stored in cells (see [[#Formulas]]): those cells keep their current results as plain values. Both ask first, saying how many formulas go, and one Ctrl+Z brings everything back.
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
      description = "Allow storing table settings (sorting, pinned rows and columns) in a hidden last row <meta …> of tables, and pinning. Off: tables without a <meta> row get none (sorting is a view only); tables with one keep using it, their sorting is still stored and pinned rows and columns can be unpinned, but nothing new can be pinned. Formulas are stored in cells (<meta f>) and need it too: off, a typed formula is saved as text; existing formulas keep working.",
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
          description = "What Enter does in a cell editor. save: save the value. moveDown: save it and edit the cell below (Shift+Enter: opened as on a Shift+click).",
          ui = { category = "Table Plus", label = "Enter in a cell editor", priority = 3 },
        },
        selectOnClick = {
          type = "boolean",
          default = false,
          description = "A click on a cell opens its editor with all its text selected, Shift+click with the cursor at the end. Off: the reverse (Shift+click selects the text). Shift+Enter and Ctrl+Shift+arrows follow Shift+click.",
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
          description = "After you edit a table, a cell that holds a ${…} expression reading the page index (a query, or a formula of a spreadsheet library) shows its new result once SilverBullet has indexed the page again: this is how many milliseconds it waits for that. Raise it if such cells still show old results (a slow device, a large space).",
          ui = { category = "Table Plus", label = "Refresh ${…} cells after (ms)", priority = 0.5 },
        },
      },
    },
    filter = {
      type = "object",
      additionalProperties = false,
      properties = {
        smart = {
          type = "boolean",
          default = true,
          description = "Filter fields understand >10 <10 >=10 <=10 (numbers), /pattern/ (regular expressions), =text (whole cell) and !filter (not). Off: everything typed is text to find.",
          ui = { category = "Table Plus", label = "Smart filters", priority = 1 },
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
              description = "Formulas in cells (=SUM(B1:B3)): typing them, their help and references, and Recalculate. Off: a typed formula is saved as text; formulas already in a table keep their results and are still recalculated when Table Plus edits the table.",
              ui = { category = "Table Plus: Modules", label = "Formulas", priority = 8 },
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
              ui = { category = "Table Plus: Modules", label = "Column types", priority = 7 },
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
              description = "Dragging across cells selects them; Ctrl+C copies them for a spreadsheet, Delete empties them.",
              ui = { category = "Table Plus: Modules", label = "Cell selection", priority = 6 },
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
              ui = { category = "Table Plus: Modules", label = "Paste from spreadsheets", priority = 5 },
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
  })
  -- Once the page is re-indexed, `${…}` cells show results from the new index
  event.listen {
    name = "page:index",
    run = function(e)
      tablePlus.pageIndexed(e.data.name)
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

/* The last word of a header's name and the icons after it: never wrapped apart */
.tp-keep {
  white-space: nowrap;
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
}
.sb-table-widget.tp-table thead tr .tp-sort:hover,
.sb-table-widget.tp-table thead tr .tp-sort.tp-active {
  opacity: 1;
}
.sb-table-widget .tp-hidden,
.sb-table-widget tr.tp-meta-row {
  display: none !important;
}

/* Header held at the top of the view while the table scrolls past (moved by script) */
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
  box-shadow: 0 -38px 0 0 var(--root-background-color, #fff);
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
   highlighted as selected cells are */
.sb-table-widget td.tp-editing {
  background-color: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent);
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

/* Filter row */
.sb-table-widget .tp-filter-row td {
  padding: 4px 8px !important;
}
.tp-filter {
  width: 100%;
  min-width: 4em;
  box-sizing: border-box;
  padding: 2px 0;
  font: inherit;
  font-size: 0.85em;
  font-weight: normal;
  color: inherit;
  background: transparent;
  border: 0;
  border-bottom: 1px solid currentColor;
  border-radius: 0;
  outline: none;
  cursor: text !important;
}
.tp-filter:focus {
  border-bottom-color: var(--ui-accent-color);
  box-shadow: 0 1px 0 0 var(--ui-accent-color);
}
/* An invalid regular expression: it filters nothing, the tooltip says why */
.tp-filter.tp-invalid {
  border-bottom-color: var(--danger-color, #c62828);
  box-shadow: 0 1px 0 0 var(--danger-color, #c62828);
}
.tp-filter::placeholder {
  color: inherit;
  opacity: 0.6;
}

/* Floating controls */
.tp-floating {
  position: fixed;
  z-index: 50;
  display: none;
  font-family: var(--ui-font, system-ui, sans-serif);
}
.tp-floating.tp-visible {
  display: flex;
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
/* Icon buttons (Recalculate), first in the toolbar; highlighted when they ask to be used */
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
.tp-handle {
  width: 18px;
  height: 18px;
  padding: 0;
  align-items: center;
  justify-content: center;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 4px;
  cursor: grab;
  touch-action: none;
}
.tp-handle:hover,
.tp-handle.tp-active {
  color: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
}
.tp-handle.tp-no-drag {
  cursor: pointer;
}
.tp-handle svg {
  width: 14px;
  height: 14px;
}
.tp-grip-column svg {
  transform: rotate(90deg);
}
.tp-add {
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 6px 0 3px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px dashed var(--button-border-color, rgba(128, 128, 128, 0.5));
  border-radius: 4px;
  cursor: pointer;
}
.tp-add-column {
  width: 20px;
  padding: 0;
  justify-content: center;
}
.tp-add:hover {
  color: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
  border-style: solid;
}
.tp-add svg {
  width: 14px;
  height: 14px;
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
  background-color: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent);
}
/* While a formula waits for a reference, cells can be pointed at */
.sb-table-widget.tp-table.tp-pointing td:not(.tp-editing) {
  cursor: move;
}
/* A formula's result: a dotted underline (not while the cell is edited) */
.sb-table-widget.tp-table td.tp-formula:not(.tp-editing) {
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
  display: block;
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
.tp-drop {
  z-index: 55;
  pointer-events: none;
  background: var(--ui-accent-color);
}
.sb-table-widget .tp-dragged {
  opacity: 0.4;
}
body.tp-dragging,
body.tp-dragging * {
  cursor: grabbing !important;
  user-select: none;
}
```
