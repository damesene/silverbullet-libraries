---
name: Library/damesene/silverware-table
tags: meta/library
description: "Silverware Table: sort, filter and edit markdown tables in place, and move, add or delete rows and columns."
files:
- silverware-table.js
---
# Silverware Table

Makes the markdown tables in your pages interactive: edit cells in place, sort, filter, and add, move or delete rows and columns. The tables stay plain markdown, and every change is an ordinary edit you can undo.

## At a glance

* **Edit a cell**: click it and type (or click it again, or double-click it), press Enter. The *Edit mode* button (✎, left of ⋯ in the toolbar) edits on the first click. See [[#Editing cells]].
* **Move between cells**: Tab / Shift+Tab, or Ctrl+arrows while editing; Ctrl+Alt+arrows move the row or column (with cells selected, all their rows or columns). See [[#Keyboard]].
* **See the markdown**: hover the table and click *Edit markdown* in the toolbar's ⋯ menu, or Alt+click a cell. See [[#Showing the markdown]].
* **Delete a table**: *Delete table*, last in its ⋯ menu, removes the whole table from the page. It asks first and says what goes with it (formulas in other tables that refer to it show `#REF!`, or use another table of the same name from then on; a sheet whose only table it is); Ctrl+Z brings it back.
* **Sort**: click ⇅ in a column header. See [[#Sorting]].
* **Filter**: hover the table and click *Filter*; `>10`, `/regex/`, `=text` and `!text` work too. See [[#Filtering]].
* **Add, move or delete rows and columns**: click the ⠿ grip next to a row or above a column. See [[#Rows and columns]].
* **Copy or empty cells**: drag across cells to select them; Ctrl+C copies them for Excel or Google Sheets, Delete empties them. See [[#Copying cells]].
* **Paste from a spreadsheet**: copy cells in Excel or Google Sheets, click a cell, Ctrl+V; Ctrl+Shift+V adds them as new rows. See [[#Pasting from a spreadsheet]].
* **Column types**: `| Price #currency |` shows `12.99` as `€12.99`, `#stars` a rating as stars, `#check` yes / no as ☑ / ☐. See [[#Column types]].
* **Formulas**: type `=SUM(B1:B3)` or `=SUM([qty])` into a cell; the result is written into the markdown. See [[#Formulas]].
* **The table's names**: the title of a table's ⋯ menu is its name (the pencil after it names it); under *Full screen* and *Sheet view*, the row *Sheet* says the sheet it is on (*Sheet: Budget*), its pencil to type another sheet's name, its × to take the table off it. Hold Shift and the toolbar shows both names too, left of its icons (above them where both do not fit); the *Names in the toolbar* setting shows them always, or never.
* **Sheet view** (in a table's ⋯ menu) shows the table like a spreadsheet over the whole window, with empty rows and columns around it; type into one to grow the table. See [[#Sheet view]].
* **Pin rows and columns** to the edges, where they stay in view (needs *Store table metadata*). See [[#Pinning]].
* **Themes**: how tables look (header, lines, stripes, spacing), for all tables in the settings or for one in its ⋯ menu; your own in a `space-style` block. See [[#Themes]].
* **Change how Enter or filters work**: *Configuration: Open*, category *Silverware Table*. See [[#Settings]].

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
| Enter | Save, edit the cell below; on the last row, add a row and edit it (with the `save` setting: only save) |
| Ctrl+Enter | Save, add a row below, edit it |
| Esc | Cancel; the cell stays selected (marked) for the keys of [[#Copying cells]], a second Esc ends that |
| F4 | In a formula: the cell or range reference at the cursor cycles its `$`: `A1`, `$A$1`, `A$1`, `$A1`, see [[#References]] |
| Shift+F3 | In a formula: the *Functions* dialog, to find a function and insert it, see [[#Functions]] |
| F2 | Go on in the cell's popup: the whole text wrapped (a long text or formula), see [[#Long text in cells (`silverware.table.modules.longText`)]]. In the popup Ctrl+arrows, Ctrl+Home / End and Ctrl+Alt+arrows work in the text only (by words, to its start or end), not on the table; Ctrl+Enter saves as Enter does. |
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

* Tab on the last cell adds a row; so does Enter on the last row (not with the `save` setting).
* While a name is typed in a formula, its list takes ↑ / ↓, Tab and Esc; Enter saves the formula as typed. See [[#References]].
* Shift+Enter opens the cell below the other way round: with its whole text selected, or with the cursor at the end when the *Click selects the cell's text* setting is on. See [[#Settings]].
* Ctrl+Alt+arrows save the cell and move it with its row or column, and keep editing it. Rows cannot move while sorted or filtered, nor the header row.
* Enter (and Shift+Enter) also moves to the cell below; with the `save` setting it only saves. See [[#Settings]].
* Browsers use Ctrl+PageUp / PageDown to switch tabs and do not pass them to the page. They work where SilverBullet runs without tabs (installed as an app).
* While Ctrl is held, the pointer shows a move cursor. Without Ctrl, arrows, Home and End move within the cell's text as usual.

## Copying cells

* Press on a cell and drag across others, the header included if you like: the cells in between are selected. A click selects one cell (in *Edit mode* it edits it, see [[#Editing cells]]). On a touch screen, drag the dots at the selection's corners, see [[#Touch screens]].
* **Shift+click** a cell: the cells from the one being edited (it is saved) to this one are selected; with cells selected already, from the first of them; else just this cell.
* **Shift+arrows** (Ctrl+Shift+arrows too) move the selection's far corner by a cell; in a cell editor, Ctrl+Shift+arrows start a selection there.
* With cells selected, **arrows** (and Ctrl+arrows) go to the cell beside, **Home / End** to the row's first / last cell, **Ctrl+Home / End** to the table's first / last cell, **PageUp / PageDown** 10 rows up / down (PageUp stops at the first row under the header). The selection is then that cell; with Shift it extends to it. **Tab / Shift+Tab** select the next / previous cell, along the row and on to the next, as they do in a cell editor; Tab on the table's last cell adds a row and edits its first cell.
* **Ctrl+C** copies them as a spreadsheet does, so Excel, Google Sheets or LibreOffice paste them into cells, and other editors as text (a tab between cells, a line break between rows). The cells copied are outlined with a dashed line, as in a spreadsheet, until they are pasted, or Esc, another copy or a change of them; they can be pasted again after that too (the clipboard keeps them). **Ctrl+X** cuts them: see [[#Cut and paste]].
* Cells copy what they show: a formula's result, a link's text.
* The selection follows the rows as shown: in a sorted or filtered table it takes the rows in their order on the screen, without the hidden ones.
* **Delete** empties the selected cells, formulas included, as one edit (Ctrl+Z brings them back). Header cells keep their names: a column needs one. Names of rows and cells stay with their cells.
* **Delete whole rows or columns**: select them (click a row's or column's grip; for more, Shift+click another grip, see [[#Rows and columns]]), then Delete: the first press empties them, a second deletes the rows (columns) once they are empty. A column is deleted only when it is empty in every row, also the rows a filter hides. *Delete N rows* and *Delete N columns* in the cell menu or the grip menu delete them right away. Deleted, the row (column) that took their place is selected whole, so the keyboard goes on from there.
* **Delete a whole table**: select all of it (its header and every row; on a sheet, click the handle at its top left corner), then Delete: the first press empties it, a second deletes the table from the page once its rows are empty, without asking, unless something goes with it (formulas referring to it, a sheet whose only table it is); on a sheet its cell stays selected where the table was. Ctrl+Z brings it back.
* **Ctrl+Alt+arrows** move the rows of the selection up / down (PageUp / PageDown: 10 places) or its columns left / right (Home / End: to the start / end), together, as one edit; the selection goes with them. Rows do not move while the table is sorted or filtered, nor with the header selected; pinned and unpinned rows (columns) do not move together.
* Typing, Enter or F2 edits the first cell selected (see [[#Editing cells]]). **Ctrl+Enter** adds a row under the cell selected and edits it in the same column, as in a cell editor (with the *Ctrl+Enter adds a row* setting; off, it edits the cell, as Enter does).
* Esc or a click elsewhere ends the selection.
* **Copy as CSV** in the ⋯ menu of the table's toolbar (the `export` module) copies the whole table as CSV (commas between cells, quotes where a cell needs them): its header and its rows as shown, sorted and filtered, cells as Ctrl+C copies them. **Copy as Markdown** beside it copies the same rows as a plain markdown table: each cell as written (links, formatting, a formula's result), without formulas, names and the table's other hidden data, so it can go into any page or tool as an ordinary table.
* **Export to Excel…** in the same menu: see [[#Excel]].

## Excel

**Export to Excel…** in the ⋯ menu of a table's toolbar (the `excel` module) opens a dialog with two ways, what each keeps and loses; after one is taken, the dialog says how it went (*Close* or Esc closes it):

* **Copy for Excel** copies the table for pasting into Excel: its header and its rows as shown, sorted and filtered. Numbers (`12,50 €`, `15 %`), dates (`2025-11-06`), times (`14:30`) and `TRUE` / `FALSE` paste as Excel's numbers, dates and logical values, whatever the language of your Excel; other cells as text. A number only when nothing written would be lost: `007`, `+420 777 123 456`, `3 kg` and numbers of more than 15 digits stay text. Values only: formulas paste as their results.
* **Download .xlsx** downloads the whole table as an Excel file of one sheet, named after the table (its name, else the page; the file's name can be changed in the dialog, Enter downloads too): an Excel table (as *Insert > Table* makes one): named as the table (else `Table1`), its columns named as its header (a name twice gets a number, `Qty2`; an empty one is `Column3`), filters in its header, banded rows, its last row its totals row where that is the table's only total row; the header in row 1 (kept in view), every row under it in the order of the markdown (not as sorted or filtered: formulas refer to rows by their place), values as above, and the formulas as Excel writes them (with the `formulas` module off, the cells' values only). A calculated column stays one: a row added in Excel gets its formula. The file is made in the browser; nothing is sent anywhere.

Formulas in the file:

* References become Excel's: `[qty]` the table's column (`Table1[Qty]`, Excel's totals row not among its rows; with a total row elsewhere in the table, the column's rows as cells, such as `B2:B9`), `[@qty]` the cell in the formula's row (`[@Qty]`), `[@[jan]:[mar]]` the row's columns (`Table1[@[Jan]:[Mar]]`), `A1` (the first row under the header) Excel's `A2`, a named cell or row its cells. Functions are written as Excel has them: `CEILING` as `CEILING.MATH`, `ROW()` counting from the first row under the header, `DATEADD` with `+` or `EDATE`, `DATEDIF`'s units with Excel's.
* A formula Excel cannot have is written as its value: one that refers to another table or page, a whole column with total rows between its rows, `TEXT` (Excel reads its format codes in its own language), `DATEADD` or `DATEDIF` whose unit comes from a cell, a custom function without an Excel form. The dialog lists them under *Download .xlsx* before the file is made, each with its cell (as Excel names it) and why, or says that every formula will be an Excel formula.
* In Excel, dates, times, percentages and amounts are numbers: a formula that takes them as text (`[@due] & " due"`, `LEN`, `CONCAT`) gives Excel's number there (`45967 due`), where Silverware Table gives the text as written.
* Excel calculates the formulas again when it opens the file. Formulas with operators on whole ranges (`SUM([qty] * [price])`) are written as array formulas, so older versions of Excel calculate them too; `XLOOKUP`, `TEXTJOIN`, `MAXIFS` and the like need Excel 2019, 2021 or 365.
* Your custom functions are written as Excel formulas by templates in the setting `silverware.table.modules.excel.functions`: `{1}`, `{2}`… are the function's arguments (as Excel writes them), `false` writes the function's cells as their values. Write the template as Excel's English formulas are, with commas:

```lua
config.set("silverware.table.modules.excel.functions", {
  VAT = "ROUND(({1})*1.21,2)",
  MARGIN = "({1}-{2})/{1}",
  SLUG = false,
})
```

## AutoFill

Select cells and drag the small square at the bottom right corner of the selection (the fill handle) down, up, right or left: the cells you drag over go on from the selected ones, as in a spreadsheet. While you drag, the cells are outlined and the value the last one will get shows by the pointer; let go to fill them (one edit, one Ctrl+Z), Esc cancels. Double-click the square to fill down as far as the column beside the selection (left, else right) has values.

Without dragging (on a touch screen, or for a long way): **AutoFill to…** in the menu of the cells selected (right-click them; on a touch screen tap them, see [[#Touch screens]]), then click (tap) the last cell to fill: the cells up to it are filled as dragging there would fill them, written over whatever they hold. Meanwhile the page and the table scroll as usual (swipe on a touch screen, the wheel), so the last cell can be far away. Hovering a cell first outlines what a click fills; Esc, or a press outside the table, cancels.

| Selected | Goes on with |
|---|---|
| `1`, `2` | `3`, `4`, `5` … (the step between them; several uneven numbers: their trend; written as they are: `1,5`, `2,5` → `3,5`, `001`, `002` → `003`) |
| `1` | `1`, `1` … (one number repeats, as in a spreadsheet, `9.99` and `-3` too; select two for a series. Numbers of more than 15 digits always repeat: they would not be kept exactly) |
| `Item 1` | `Item 2`, `Item 3` … (text with a number; `A-01` → `A-02`, `Q1`, `Q3` → `Q5`) |
| `Mon`, `Tue` | `Wed`, `Thu` … (days and months, long and short, English and Czech: `Po`, `Út` → `St`; typed without diacritics, `Po`, `Ut` → `St`, `Ct`; their case kept. The short Czech ones, also everyday words (`ne`, `po`, `so`, `pro`), need two selected: one repeats) |
| `2025-11-06` | `2025-11-07` … (dates day by day, also written `6.11.2025` or `06. 11. 2025`, kept so; `2025-01-31`, `2025-02-28` → `2025-03-31` month by month; any other step between them) |
| `14:30` | `15:30` … (times hour by hour, or by the step between them) |
| a formula | the formula in each cell, its references moved as far as the cell is from the formula's: `=B1*2` filled down gives `=B2*2`; a reference with `$` keeps that part (`=$B$1*2`, see [[#References]]); one moved off the table is `#REF!` (references to another table move without that check). `[@column]` and `[column]` need no moving. A new formula needs *Store table metadata*: without it, the formulas' results are filled as values (as a series where they make one). |
| anything else | the selected cells over again |

* Each column of the selection (each row, filling right or left) is filled on its own: numbers in one column, days in the next.
* It fills within the table: dragging past its last row or column adds none. Rows pinned to the top or bottom (totals) and pinned columns are filled only from cells of their own: a fill from the other rows stops before them.
* It needs the `selection` module (the cells selected are what it fills from).
* Not while the table is sorted or filtered: the rows shown are not where the cells would go (the square does not show).
* Cells filled over keep the hidden tags they had (a cell's name).

### Custom series

Your own series, for words AutoFill should go round (quarters, statuses, sprints) or values it should go on with in a way of your own, are written in JavaScript, in a file of your space, and given to Silverware Table from Space Lua, as [[#Custom functions]] are. For example `Library/me/series.js`:

```js
export default () => [
  { name: "quarters", words: ["Q1", "Q2", "Q3", "Q4"] },
  { name: "status", words: ["todo", "doing", "review", "done"], alone: false },
  {
    name: "fiscal weeks",
    // FW52 → FW1: the year's weeks round, by the step between the weeks selected
    match: (values) => {
      const weeks = values.map((v) => Number(/^FW(\d+)$/.exec(v)?.[1]));
      if (!weeks.every((w) => w >= 1 && w <= 52)) return undefined;
      const step = weeks.length > 1 ? weeks[1] - weeks[0] : 1;
      return (i) => `FW${((((weeks[0] - 1 + i * step) % 52) + 52) % 52) + 1}`;
    },
  },
];
```

and in a `space-lua` block of any page (with a priority of its own, one below 50):

```lua
silverware.table.defineSeries(js.importFromSpace("Library/me/series.js"))
```

Then `Q3` filled down gives `Q4`, `Q1`, `Q2` (not `Q5`), and `todo`, `doing` gives `review`, `done`.

* The file's default export is the list of series, or a function that gets Silverware Table's helpers (below) and returns the list. Each has a `name` (letters, digits, `_` and spaces, starting with a letter) and either:
  * `words`: a list of two or more words to go round, matched as the built-in days and months are (any case, with or without diacritics; several selected a step apart go on by that step). Typed as your list writes them, the words are written so (`iPhone` → `iPad`, `L` → `XL`); typed otherwise, in the case of the first selected (`to do` → `in progress`). One word selected starts the series too, unless `alone: false`: then two are needed, and one is copied (for words also used otherwise, as `ne`, `po` are in Czech);
  * or `match(values)`: given the selected cells' texts (in their order, empty cells `""`), a function giving the text of each cell filled, or nothing when the values are not the series'. The function gets the cell's index: `0` to one less than the number of values are the values themselves, the cells after them (filling down or right) are counted on, those before them (up or left) are `-1`, `-2` … A number it gives is written as text. `alone` is for `words` only and is ignored with `match`, which decides itself how many values it takes (`if (values.length < 2) return undefined`).
* Your series are tried before the built-in ones (`dates`, `times`, `numbers`, `lists`, `numbered text`, in this order), so they can take values a built-in one would. One with a built-in series' name (in any case) replaces it, in its place (`lists`: your words instead of the days and months). Of two series of one name, the last defined counts.
* They must give their results at once. A `match` that throws, or gives something else, is no match (the next series is tried); a result that is not a text or a number gives that cell the value repeated. Both are logged in the browser's console.
* The helpers are `parseDate` (a date written as `2025-11-06` as `{ ms, time }`) and `formatDate` (written back).
* Series are defined again whenever SilverBullet loads Space Lua again; a change of the file shows after reloading the page. A mistake in a definition is shown in a notification until you close it, with the pages whose `space-lua` blocks call `silverware.table.defineSeries` and a button opening each; the other series are defined.

## Cell menu

Right-click a cell (on a touch screen: press and hold it; in the cell editor: the Menu key or Shift+F10) for its menu: the cell is selected (marked, not edited), and stays so afterwards for Ctrl+C and Delete. Right-click a cell of a selection for the selection's menu. A header (right-click or press and hold it, or the Menu key while its name is edited) gives its column's menu, the column selected, as its ⠿ grip does; with other cells selected along with it, the selection's menu. Shift+right-click, and a right click in the cell editor, give the browser's menu.

| Item | What it does |
|---|---|
| *Copy* | Copies the cell (the cells selected) as Ctrl+C does. |
| *Cut* | Cuts the cells as Ctrl+X does: copied and outlined, they move where they are pasted, see [[#Cut and paste]]. Not with a header among the cells selected (a column's name stays). |
| *Paste*, *Paste as new rows* | Pastes the clipboard from the cell (the top left one selected) as Ctrl+V (Ctrl+Shift+V) does, see [[#Pasting from a spreadsheet]]; with cells cut, *Paste (move N cells)* moves them. Greyed out where the page cannot read the clipboard or it holds nothing (cells cut move all the same). |
| *Clear* | Empties the cell (the cells selected) as Delete does; a header keeps its name. |
| *Move to…* | Moves the cells selected to the cell you click (tap) next, see [[#Moving cells]]. |
| *Insert function…* | Edits the cell (its formula, or a new one) with the *Functions* dialog, see [[#Functions]]. Needs *Store table metadata* for a new formula. |
| *AutoFill to…* | Fills from the cells selected to the cell you click (tap) next, see [[#AutoFill]]. |
| *Filter: = value* | Shows only the rows with this value in this column (with the values of the cells selected in one column: any of them). A column filtered by values already gets this one added: `=open\|blocked`. |
| *Filter: ≠ value* | Hides the rows with this value in this column. |
| *Delete N rows*, *Delete N columns* | On a selection: deletes the rows (columns) its cells are in. A table keeps at least one column. |

The menu of one cell is titled with the cell's name (*Cell: vat*), else its column and row; the pencil after the title names the cell, see [[#Named cells]]. A row is named in its row menu, see [[#Named rows]].

The menus of a cell, of a row and of a column keep one order, so the same actions are in the same place: first a bar of icons for the clipboard (*Copy*, *Cut*, *Paste* and, for rows, *+ Rows*: paste as new rows; their full names show on hover), then *Clear*, then inserting, moving and pinning, the column's type, sorting and filtering, and deleting last. Pairs of actions sit in one row of icon buttons after their name (*Insert* above / below, *Move* up / down, *Pin* top / bottom, *Sort*, *Filter* and its ×, *Align*); a button that cannot be used now is greyed out, and hovering it says why. The × at the title's right closes a menu, as Esc or a press beside it do.

Each comes from a module (`formulas`, `names`, `selection`, `paste`, `autofill`, `filters`, see [[#Settings]]): a module turned off leaves its items out, and with none left the right click gives the browser's menu.

## Pasting from a spreadsheet

Copy cells in Excel, Google Sheets or LibreOffice, click a cell of a table (selected or edited) and paste:

* **Ctrl+V** pastes them from that cell to the right and down, over the cells there. Where the table ends, rows and columns are added (before the rows and columns pinned to the bottom and right).
* **Ctrl+Shift+V** overwrites nothing: the pasted rows are added as new rows at the cell's row (under the header when pasted there). Columns are added where the rows are wider than the table.
* Cells with a formula keep it; the values pasted onto them are left out (the message says how many). In new rows, a calculated column's cell gets its formula unless a value is pasted into it, see [[#Formulas]]. Names of rows and cells stay with their cells.
* Pasted onto the header, the first row names the columns; an empty value keeps the old name.
* Spreadsheets copy values as they show them (`1 234,50 Kč`), not their formulas. A line break inside a cell becomes a space, as a markdown table cell has one line.
* A single value (no tab, no line break) is pasted into the cell's editor as usual.
* **Paste** and **Paste as new rows** in the cell menu (right click, or a long press or a tap on cells selected on a touch screen) do the same as Ctrl+V and Ctrl+Shift+V from the first cell selected; a single value goes straight into that cell. They read the clipboard, whatever application filled it: the browser may ask first, or show its own *Paste* button. In Chrome, once reading is allowed, *Paste* is greyed out while the clipboard holds no text (checked when you come back to the page and on each click). A page opened over plain http (SilverBullet on a phone in your network, without https) may not read the clipboard at all: there *Paste* is greyed out, and Ctrl+V or the keyboard's paste in a cell's editor still work.
* The paste is one edit: one Ctrl+Z undoes it. It is not possible while the table is sorted or filtered, as the rows shown are not where the cells would go.
* Ctrl+V and *Paste* paste from the top left cell selected, as a spreadsheet does.

## Moving cells

**Drag them by their edge**: with a mouse, point at the edge of the cells selected (the pointer becomes a move cross), press and drag: the cells where they would go are outlined, with their address (`B4:C5`); let go to move them there. Hold **Ctrl** while letting go to copy them instead, as in a spreadsheet (`+` shows before the address). Esc cancels.

**Move to…** in the menu of the cells selected (on a touch screen: tap them, or press and hold), then click (tap) the cell where the first of them goes: they move there. With a mouse, where they would go is outlined under the pointer, with its address, as while dragging them. Meanwhile the page scrolls as usual; Esc, or a press outside the table, cancels.

* They move as with cut and paste (below): with their formulas, over what the cells there held, names staying where they are; one edit, one Ctrl+Z.
* A copy writes a formula with its references moved as far as the cell is (`=A1*2` copied a row down is `=A2*2`), as AutoFill does; the cells written over keep their names.
* They stay within the table: no rows or columns are added, and they go under the header. Not while the table is sorted or filtered, nor with the header among them.
* Formulas elsewhere that refer to the cells moved are not changed, and a formula moved keeps its references as written (a spreadsheet would follow them).

### Cut and paste

Select cells and press **Ctrl+X** (or *Cut* in their menu): they are copied, as Ctrl+C copies them, and outlined with a dashed line; nothing changes yet. Paste into the same table, with Ctrl+V on a cell or *Paste (move N cells)* in its menu: the cells move there, as in a spreadsheet, as one edit (one Ctrl+Z).

* They move with their formulas, written over what the cells there held (formulas there too); where they were, the cells are left empty. Names stay where they are: a row's name with its row, a cell's name with its place, at both ends, so formulas using them still find them. Where the table ends, rows and columns are added, as for any paste.
* A formula that moves keeps its references as written (`=A1*2` still refers to A1); formulas elsewhere that refer to the cells moved are not changed.
* The cut ends with Esc, another copy, a change of the cells cut, or rows or columns added or deleted: what is pasted then is a copy. If the clipboard holds something else when you paste (copied in another application), that is pasted, and the cells cut stay.
* Within one table: pasted into another table, the cells are copied, not moved.
* Header cells are not cut (a column keeps its name), and cells cut move under the header, not into it: with the header in the selection, Ctrl+X only copies. Sorted or filtered, cells are copied, not cut.
* Ctrl+V in a cell being typed in pastes the text into it, as usual; a move needs the cell selected (Ctrl+V then opens it for the paste) or *Paste (move N cells)* in the menu.
* On a touch screen, *Cut* and *Paste (move N cells)* work also where the page cannot read the clipboard (SilverBullet over plain http): moving needs no reading.

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

* **One column**: the filter icon after *Filter* in its column menu opens its filter in a bubble under the header, nothing in the table moves; the × beside it removes the column's filter (greyed out while the column has none). In the bubble, the × in the field clears what is typed, the × beside the field closes the bubble (as Esc does), the filter kept. While a column filters, its header shows a filter icon: click it to change the filter.
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

With the *Store table metadata* setting on (see [[#Settings]]), type a formula into a body cell, starting with `=`: `=B1*2`, `=SUM(B1:B3)`, `=SUM([qty])`. Silverware Table writes the result into the cell, followed by the formula in a hidden `<meta>` tag:

```
| Name  | Qty |
| ----- | --: |
| Pear  |   3 |
| Apple |  10 |
| Total |  13 <meta formulas.f='=SUM([qty])'> |
```

* Formulas are metadata, as the sorting stored in a table is: with the setting off, a typed formula is saved as text (Silverware Table says so, and shows it while it is typed). Formulas already in a table keep working: they can be edited, are recalculated, and fill new rows of calculated columns.
* SilverBullet and browsers show only the result, other renderers (GitHub, Obsidian) drop the tag. Queries over the table (`index.tag "table"`) see the cell's text with the tag, e.g. `13 <meta formulas.f='=SUM([qty])'>`.
* Hidden tags are written with their values in apostrophes, so the quotes of a formula's texts stay as typed (`<meta formulas.f='=IF([@status]="done", "✓", "")'>`); an apostrophe in a value is written `&#39;`, a `>` `&gt;` (SilverBullet ends a tag at its first `>`). Tags written by hand with quotes (`formulas.f="…"`) are read too.
* Saving a formula fixes mistakes that have only one possible fix, and says what it changed: missing `)` at the end are added (`=SUM(A1:A3` becomes `=SUM(A1:A3)`), a text in quotes or a `[column]` left open at the end is closed, and extra `)` at the very end are dropped. Anything else stays as typed and shows `#ERROR!`.
* **Calculated columns**: when every row of a column holds the same formula, such as `=[@qty]*[@price]`, a new row (the **+** on a border, Ctrl+Enter, Tab on the last cell, *Insert row*) gets it too. Total rows (with a formula over a whole column, such as `=SUM([qty])`) do not count.
* Click the cell to edit its formula. Typing a plain value removes the formula. To type a text that starts with `=`, start it with `'=`; such a text opens with the `'` again, so it stays text.
* Results are written whenever Silverware Table edits the table, in the same edit (one Ctrl+Z undoes both). Viewing a table never changes it. The toolbar of a table with formulas has *Recalculate* (the ↻ icon), which writes the current results; it is highlighted when some are out of date, e.g. after the table was changed outside Silverware Table (by typing in the markdown).
* A formula's result has a dotted underline; hover it to see its formula, or why it shows an error.
* Numbers are read as for sorting (`12,99 €`, `1 000`, `15 %`). Results use a decimal comma when most numbers in the table do. A text that is not read as a number (e.g. `1,234.50`, with a thousands comma) is skipped by `SUM` and the other number functions.

### References

| Reference | Means |
|---|---|
| `B1` | Column B, the first row under the header |
| `A1:B3` | The range from A1 to B3 |
| `$A$1`, `A$1`, `$A1` | A1 with its column, its row or both kept where they are when the formula is filled into other cells (in ranges too: `$A$1:B3`); F4 in a formula cycles them |
| `[qty]` | The whole column named Qty (written by its key, see below), without the table's total rows: rows with a cell whose formula refers to its own whole column (a total or an average under it) |
| `[qty:2]` | The second column named Qty, when several share the name |
| `[@qty]` | The Qty cell in the formula's own row, e.g. `=[@price]*[@qty]` |
| `[@[jan]:[mar]]` | The formula's own row from the column Jan to Mar, e.g. `=SUM([@[jan]:[mar]])`, as Excel's tables write it; the formula's own column outside it, else `#CYCLE!` |
| `prices![@price]`, `prices![@[jan]:[mar]]` | The same of a table by its name: of its own, its row; of another table, that table's row of the same number (the formula in the third row reads prices' third row; a row prices does not have is `#REF!`) |

* Edits made with Silverware Table keep references on their cells, as in a spreadsheet: inserting, deleting, moving and sorting rows (*Sort the rows in the markdown*), and inserting, deleting and moving columns. A row inserted inside a range widens it, a deleted one narrows it, and a reference to deleted cells becomes `#REF!`. Renaming a column renames its `[Name]` references.
* Edits made in the markdown do not change references. `[qty]` and `[@qty]` are not affected by added or moved rows at all, so they are the safest choice for totals.
* `A1` counts rows in the markdown, not as a sorting or filter shows them.
* Column names match as SilverBullet's queries name columns: in lower case, with every run of other characters than `A-Z`, `a-z` and `0-9` as one `_`. So `[Unit price]`, `[unit price]` and `[unit_price]` are the same column, the one a query reads as `unit_price`. Letters with diacritics count as other characters there too (`Množství` is `mno_stv_`), so names that differ only in them are the same name; `[Name:2]` tells them apart. Silverware Table writes column references by that key, as a query names the column: a formula saved as `=[@Unit price]*2` is stored as `=[@unit_price]*2`, and clicking a header inserts `[unit_price]`. References to a column the table does not have stay as typed (and show `#REF!`).
* A `$` only matters where a formula is filled into other cells: edits made with Silverware Table move `$A$1` with its cell as they move `A1`, as a spreadsheet does.
* **Point instead of typing**: where the formula expects a reference (after `=`, `(`, `,` or an operator, not inside a text in quotes), the pointer over the table becomes a move cursor: click a cell to insert it, drag across cells for a range, or click a column's header for `[Name]`. Pointing again right away replaces that reference, Shift+click extends its range. After a typed reference or another complete operand, a click ends editing as usual.
* While you edit a formula, each reference is outlined in the table in its own color. Drag an outline's edge to move the reference, a range's corner to resize it; Esc while dragging puts it back.
* Under the cell, the formula shows with its references in the same colors, and help for the function the cursor is in: its syntax, with the argument being typed underlined (`ROUND(number, `**`[digits]`**`)` after `=ROUND(A1, `), and what it does.
* **Functions and names as you type them**: `=A` lists the functions whose names start so (`ABS`, `AND`, `AVERAGE`; your custom functions too) and the names of the page that do: named cells, named rows of the table and named tables, marked as such. A name typed in full comes first, the page's names before the functions. Under the list is the picked one's syntax and description. ↑ / ↓ pick another, Tab or a click inserts it: a function with its `(` (`=AVERAGE(`), a row with its `[` (`=pear[`), a table with its `!` (`=prices!`), a cell as its name. Enter always saves the formula as typed, as in a spreadsheet, so `=day` saves a reference to a cell named `day` even though `DAY` is a function. Esc closes the list and leaves what is typed. Elsewhere Tab moves to the next cell, as usual.

### Named columns

A column can have a name of its own, by which formulas and the stored sorting name it whatever its header says: renaming the header (also in the markdown) breaks nothing, nor references to the column from other pages. Open the column's menu (the ⠿ grip above the column, or right-click its header), click the pencil after its title, type the name (letters, digits and `_`) and press Enter (Esc leaves it as it was); an empty name removes it. A name that cannot be used is refused with why, under the field. Named, the menu's title is the name.

* It is stored in the header cell as a hidden `<meta core.n='price'>`: `| Unit price <meta core.n='price'> |`. SilverBullet does not show it, and a query still reads the column as `unit_price`. The header has a mark in its corner; hover it for the name.
* `[price]` is the column with that name before any column whose header is Price, which is then `[price:2]`.
* Setting or removing it rewrites the references to the column on the page: `[unit_price]` becomes `[price]`.
* Editing the header changes only the header's text: the column's name stays. It needs the *Store table metadata* setting, as formulas do; *Remove metadata* removes it.

### Named cells

A cell can have a name, by which formulas use it: in its own table by the name alone (`=[@price]*(1+vat)`), in another table with its table's name (`=[@price]*(1+rates!vat)`), on another page with the page's too (`[[Prices]]rates!vat`). The name stays with the cell wherever it is moved (also in the markdown), so such references never need to change. Open the cell's menu (right-click it, see [[#Cell menu]]), click the pencil after its title, type the name (letters, digits and `_`) and press Enter; an empty name removes it.

* It is stored in the cell as a hidden `<meta core.cn='vat'>`: `| VAT | 0.21 <meta core.cn='vat'> |`. A named cell has a mark in its corner; hover it for the name.
* A name is its table's: two cells of a table cannot have the same one, cells of different tables can. It cannot be a function's name or read as a cell (`A1`). A name alone is always the formula's own table's; another table's cell needs that table to have a name (the pencil in the title of its toolbar's ⋯ menu).
* A formula written with another table's cell name alone (as written before a cell's name was its table's) keeps its result until the table is recalculated (its *Recalculate* is highlighted), then shows `#NAME?` saying how to write it; saving the formula writes it so itself (`vat` becomes `rates!vat`, also `[[Prices]]vat`) where one named table of the page has that name.
* When a table with named cells is edited, the tables that use them get their new results in the same edit. When the cell is changed in the markdown, *Recalculate* is highlighted.
* Editing the cell changes its value only: the name stays. It needs the *Store table metadata* setting; *Remove metadata* removes it.

### Named rows

A row can have a name, by which formulas use its cells: `pear[price]` is the Price cell of the row named pear, `prices!pear[price]` of the table named prices, `[[Shop]]prices!pear[price]` on another page. The name stays with the row wherever it is moved or sorted (also in the markdown), and does not depend on what the row's cells say. Open the row's menu (the ⠿ grip left of the row), click the pencil after its title (*Row 3*, or the row's name), type the name and press Enter; an empty name removes it.

* It is stored in the row's first cell as a hidden `<meta core.n='pear'>`: `| Pear <meta core.n='pear'> | 12 |`, as a column's name is in its header. A named row has a mark in the top left corner of its first cell; hover it for the name. A first cell that is also a named cell holds both in one tag: `<meta core.n='pear' core.cn='first'>`.
* The name alone is the row's cells as a range, as `[price]` is a column's: `=SUM(pear)`, `=MAX(prices!pear)`. It is every cell of the row: a formula in that row is in its own range, `#CYCLE!` (put a row's total in another row, or another table). Where one value is asked for (`=pear*2`), it is `#VALUE!`. A cell named as the row (see [[#Named cells]]) goes first. In an Excel file it is the row's cells (`SUM(A2:D2)`).
* A row's name is its table's: two rows of a table cannot have the same one. The column after it is written as any column reference (`[price]`, a column's name, `[price:2]`) and follows the column when it is renamed or moved.
* `XLOOKUP("Pear", prices![name], prices![price])` does the same by a key column's value; a row's name works without one, and is not changed by editing the row's cells.
* Deleting the column that holds rows' or cells' names removes the names with it: Silverware Table says which and asks first, as the formulas that use them then show `#REF!` or `#NAME?`.

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
| Pear  |   3 | 38.97 <meta formulas.f='=[@qty]*XLOOKUP([@fruit], prices![name], prices![price])'> |
```

* `XLOOKUP(value, lookup_range, result_range)` finds a value in one column and gives the one beside it in another: the usual way to take a price, a rate or a name from another table, whatever its order. See [[#Functions]].
* The other table's formulas are calculated too, so a total over its column is up to date, and tables can refer to each other in turn (not in a circle: that is `#CYCLE!`).
* When Silverware Table edits a table, the tables that refer to it get their new results in the same edit (one Ctrl+Z undoes both). When the other table is changed in the markdown, *Recalculate* in the toolbar is highlighted.
* `[@column]` is always the formula's own row: another table's rows are reached with `XLOOKUP` or by cell.
* References to another table follow its edits made with Silverware Table, as references in a table do (see [[#References]]): `prices!B2` follows its rows and columns when they are inserted, deleted, moved or sorted into the markdown, `prices![price]` a renamed or moved column, and a reference to deleted cells becomes `prices!#REF!`. Renaming the table (the pencil in its ⋯ menu's title) renames the references to it on the page; an empty name removes it. Edits made in the markdown do not change references.
* **Two tables of one name** (a table copied in the markdown with its metadata row): formulas use the first of them on the page, and edits of the others do not move references. A message at the top says so until you close it, and each such table's name shows in red in its toolbar, whether the toolbar shows names or not: click it to rename the table.

### Tables on other pages

The page's name in double brackets goes before the table's name: `[[Prices]]fruit!B2`, `[[Shop/Prices]]fruit![price]`, `XLOOKUP([@name], [[Prices]]fruit![name], [[Prices]]fruit![price])`.

* Silverware Table reads the other page when a table that refers to it shows, and again each time it writes that table (or one it refers to), so the results written are up to date. When the other page is changed (SilverBullet indexes it again), *Recalculate* in the toolbar is highlighted.
* The other page's formulas are calculated too, and references there without a page are to tables on that page.
* Edits on the other page do not change the references to it here, and renaming that page or its table leaves them showing `#REF!`. Column references (`[[Prices]]fruit![price]`) and `XLOOKUP` keep working when its rows are moved.
* The page is the name as SilverBullet writes it in links, without `#` or `|`.
* With the `pageLinks` module off (see [[#Settings]]) Silverware Table reads no other page: formulas that refer to one keep the results they have, and a new one shows `#REF!`.

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

The *Functions* dialog shows them all: **Functions…** (fx) under a formula being edited, Shift+F3 in it, or *Insert function…* in a cell's menu. Search by a name or by what a function does (`date`, `decimal places`), or pick a group (*Math*, *Logic*, *Text*, *Date & time*, *Lookup & table*, *Custom* for your own); each shows its syntax, what it does and an example. ↑ / ↓ pick one, Enter (or *Insert*, or a double click) puts it into the formula where the cursor was, in place of a name typed there (after a `+` where it would follow a value: `=A1` gives `=A1+SUM(`); Esc leaves the formula as it was. The cell's editor stays open behind the dialog.

| Function | Description |
|---|---|
| `SUM(number1, [number2], …)` | Adds numbers, cells and ranges; times add up to a time (14:00 and 20:00 are 34:00). |
| `AVERAGE(number1, [number2], …)` | The arithmetic mean of the numbers, or of the times. |
| `MIN(number1, [number2], …)` | The smallest of the numbers (0 if there are none), the shortest of the times, or the earliest of the dates. |
| `MAX(number1, [number2], …)` | The largest of the numbers (0 if there are none), the longest of the times, or the latest of the dates. |
| `PRODUCT(number1, [number2], …)` | Multiplies the numbers. |
| `COUNT(value1, [value2], …)` | How many of the values are numbers. |
| `COUNTA(value1, [value2], …)` | How many of the values are not empty. |
| `SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)` | Adds the cells of sum_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). |
| `COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], …)` | How many places of the ranges have cells that meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). |
| `AVERAGEIFS(average_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)` | The arithmetic mean of the cells of average_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: #DIV/0!. |
| `MAXIFS(max_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)` | The largest of the cells of max_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: 0. |
| `MINIFS(min_range, criteria_range1, criteria1, [criteria_range2, criteria2], …)` | The smallest of the cells of min_range in the places whose cells meet every condition: a value, ">10", "<>done", "app*" (* any text, ? one character), "" (empty) or "<>" (not empty). None: 0. |
| `SUMPRODUCT(array1, [array2], …)` | Multiplies the ranges' cells in the same places and adds the products; a cell that is not a number counts as 0. |
| `MEDIAN(number1, [number2], …)` | The middle of the numbers (or of the times) in order; of an even count, the mean of the two in the middle. |
| `LARGE(array, k)` | The k-th largest of the numbers (or of the times): LARGE(A1:A9, 1) is the largest. |
| `SMALL(array, k)` | The k-th smallest of the numbers (or of the times): SMALL(A1:A9, 1) is the smallest. |
| `RANK(number, ref, [order])` | The number's place among the numbers of ref: 1 for the largest (order 0, the default), or for the smallest (order 1); equal numbers share a place. |
| `STDEV(number1, [number2], …)` | The standard deviation of the numbers as a sample (divided by their count less one); of times, a time. |
| `INT(number)` | The number rounded down to a whole number; for a time, its whole days (INT(SUM(A1:A2)) of 14:00 and 20:00 is 1). |
| `ROUND(number, [digits])` | Rounds to the given number of decimal places (default 0), halves away from zero. |
| `ROUNDUP(number, [digits])` | Rounds away from zero to the given number of decimal places (default 0; negative: tens, hundreds…). |
| `ROUNDDOWN(number, [digits])` | Rounds toward zero to the given number of decimal places (default 0; negative: tens, hundreds…). |
| `MROUND(number, multiple)` | Rounds to the nearest multiple, halves away from zero. Of a time, a time: MROUND("9:08", "0:15") is 09:15. |
| `CEILING(number, [significance])` | Rounds up to a multiple of the significance (default 1). Of a time, a time: CEILING("9:07", "0:15") is 09:15. |
| `FLOOR(number, [significance])` | Rounds down to a multiple of the significance (default 1). Of a time, a time: FLOOR("9:07", "0:15") is 09:00. |
| `MOD(number, divisor)` | The remainder after dividing the number by the divisor, with the divisor's sign. Of a time, a time: MOD([@end] - [@start], 1) is the length of a shift past midnight. |
| `ABS(number)` | The number without its sign. |
| `IF(condition, value_if_true, [value_if_false])` | One value if the condition is true, another if it is false (default FALSE). |
| `IFERROR(value, value_if_error)` | The value, or the second value if the first is an error. |
| `AND(logical1, [logical2], …)` | TRUE if all of the values are true. |
| `OR(logical1, [logical2], …)` | TRUE if any of the values is true. |
| `NOT(logical)` | TRUE if the value is false, FALSE if it is true. |
| `ISNUMBER(value)` | TRUE if the value is a number, a time or text that reads as a number (12.5, 12,99 €, 15 %), as COUNT counts them; FALSE otherwise. |
| `CONCAT(text1, [text2], …)` | Joins the values into one text. |
| `TEXTJOIN(delimiter, ignore_empty, text1, [text2], …)` | Joins the values (ranges too) into one text with the delimiter between them; with ignore_empty TRUE, empty ones are left out: TEXTJOIN(", ", TRUE, [name]). |
| `LEN(text)` | How many characters the text has. |
| `MID(text, start, count)` | The given count of characters of the text, from the start (1 is the first character). |
| `SEARCH(find_text, within_text, [start])` | Where find_text first is in within_text, from the start (default 1, the first character), ignoring case; * any text, ? one character, ~ before either for itself. Not found: #VALUE!. |
| `SUBSTITUTE(text, old_text, new_text, [instance])` | The text with old_text (matching case) replaced by new_text: everywhere, or only its instance-th occurrence. |
| `UPPER(text)` | The text in capital letters. |
| `LOWER(text)` | The text in small letters. |
| `PROPER(text)` | The text with each word's first letter capital and the others small. |
| `TRIM(text)` | The text without spaces at its start and end, and with one space where there were several. |
| `ROW()` | The row of the cell the formula is in, counted in the table as written: 1 is the first row under the header. =ROW() in every row of a column numbers the rows. |
| `XLOOKUP(value, lookup_range, result_range, [if_not_found], [match_mode], [search_mode])` | Finds the value in one range or column and gives the value in the same place of another, e.g. XLOOKUP("Pear", prices![Name], prices![Price]); text is found ignoring case. Not found: if_not_found, else #N/A. match_mode: 0 the same value (the default), -1 or else the next smaller, 1 or else the next larger, 2 with wildcards (* any text, ? one character). search_mode: 1 from the first (the default), -1 from the last. |
| `TEXT(value, format)` | A number, a date or a time as text in a format: TEXT(A1, "#,##0.00"), TEXT(A1, "0%"), TEXT(A1, "dd.mm.yyyy hh:mm"), TEXT(A1, "[h]:mm") for all the hours of a length of time. Number codes: 0 (a digit), # (a digit where it counts), , (thousands), . (decimals), %, and ; between formats of positive;negative;zero numbers ("0.00;(0.00)"); date codes: yyyy, yy, m, mm, d, dd, h, hh, m, mm (minutes), s, ss, [h], [m], [s]; text in quotes as it is. |
| `TODAY()` | Today's date, e.g. 2025-11-06. The result is written when the table is calculated: the next day, Recalculate updates it. |
| `NOW()` | The date and time now, e.g. 2025-11-06 14:30:15. The result is written when the table is calculated: Recalculate updates it. |
| `DATE(year, month, day)` | The date of a year, month and day; a month or day past its end carries over (DATE(2025, 13, 1) is 2026-01-01). |
| `TIME(hour, [minute], [second])` | A time of day, e.g. 14:30; past midnight it starts again (TIME(25, 0) is 01:00). Added to a date it gives the date with that time: DATE(2025, 11, 6) + TIME(14, 30) is 2025-11-06 14:30. |
| `DATEADD(date, amount, unit)` | The date plus an amount of a unit: "s", "min", "h", "d", "w", "m" (months) or "y" (or their names, "hours"). A negative amount goes back. Months and years keep the day or take the month's last. |
| `DATEDIF(start, end, unit)` | How many whole units lie from one date to another, in "s", "min", "h", "d", "w", "m" (months) or "y"; negative when the end is earlier. "md", "ym" and "yd" leave out the larger units: the days past the whole months, the months past the whole years, the days past the whole years. For days with a fraction, subtract the dates: end - start. |
| `YEAR(date)` | The year of a date. |
| `MONTH(date)` | The month of a date, 1 to 12. |
| `DAY(date)` | The day of a date's month, 1 to 31. |
| `HOUR(time)` | The hour of a time, or of a date's time, 0 to 23 (0 for a date without a time). |
| `MINUTE(time)` | The minute of a time, or of a date's time, 0 to 59. |
| `SECOND(time)` | The second of a time, or of a date's time, 0 to 59. |
| `WEEKDAY(date, [type])` | The day of the week as a number: Sunday 1 to Saturday 7 (type 1, the default, and 17), Monday 1 to Sunday 7 (type 2 and 11), Monday 0 to Sunday 6 (type 3), or 1 from Tuesday (12), Wednesday (13), Thursday (14), Friday (15) or Saturday (16). |
| `ISOWEEKNUM(date)` | The week of the year by ISO 8601, 1 to 53: weeks start on Monday, and week 1 is the one with the year's first Thursday. |
| `EOMONTH(start, months)` | The last day of the month the given count of months after the start's (0: its own month; negative: before). |
| `NETWORKDAYS(start, end, [holidays])` | How many working days (Monday to Friday) there are from the start to the end, both counted, without the holidays (dates, a range of them); negative when the end is earlier. |
| `WORKDAY(start, days, [holidays])` | The date the given count of working days (Monday to Friday) after the start, leaving out the holidays (dates, a range of them); a negative count goes back. |

In ranges, empty cells and text that is not a number are skipped by the number functions.

Operators work on a range cell by cell, for a function to take the result: `TEXTJOIN(", ", TRUE, "**" & [name] & "**")` joins the names in bold, `SUM([qty] * [price])` adds the products of each row, `SUMPRODUCT(([status] = "open") * [qty])` the quantities of open rows. Two ranges must be the same size. A cell shows one value, so `=[qty] * 2` alone is `#VALUE!`. Number functions skip TRUE and FALSE in a range: count with `COUNTIFS`, or multiply the comparison (`* 1`) first.

Conditions of `SUMIFS`, `COUNTIFS`, `AVERAGEIFS`, `MAXIFS` and `MINIFS` are written as in spreadsheets, in quotes: `"open"` (the same text, ignoring case), `">10"`, `"<=2025-12-31"`, `"<>done"`, `"app*"` (`*` any text, `?` one character, `~*` a star), `""` (an empty cell), `"<>"` (a cell that is not empty), or joined with a value: `">"&[@limit]`, `"<"&TODAY()`. They are not the filter row's syntax.

An optional argument can be left out between others: `XLOOKUP([@score], [min], [grade], , -1)`.

### Custom functions

Custom functions, your own, are written in JavaScript, in a file of your space, the way the built-in ones are, and given to Silverware Table from Space Lua. For example `Library/me/functions.js`:

```js
export default ({ toNumber, isError }) => [
  {
    name: "VAT",
    syntax: "VAT(amount, [rate])",
    description: "The amount with VAT, 21 % unless a rate is given.",
    minArgs: 1,
    maxArgs: 2,
    call: ([amount, rate = 0.21]) => {
      const a = toNumber(amount);
      const r = toNumber(rate);
      if (isError(a)) return a;
      if (isError(r)) return r;
      return a * (1 + r);
    },
  },
];
```

and in a `space-lua` block of any page (your [[CONFIG]], say; a block with a priority of its own must have one below 50, Silverware Table's own):

```lua
silverware.table.defineFunctions(js.importFromSpace("Library/me/functions.js"))
```

Then `=VAT([@price])` works in every table, and typing it shows its syntax and description.

* The file's default export is the list of functions, or a function that gets Silverware Table's helpers (below) and returns the list. Each function has a `name` (letters, digits, `_` and `.`, starting with a letter, not one that reads as a cell such as `LOG2`; formulas may write it in any case), a `call`, and optionally `syntax` and `description` (shown while typing a formula), `category` (its group in the *Functions* dialog: `math`, `logic`, `text`, `date` or `lookup`; none: *Custom*), `example` (a formula using it, shown there), `minArgs` (default 0) and `maxArgs` (default: any number).
* `call(args, place)` gets the arguments' values: a number, a text, `true` or `false`, `null` for an empty cell, a time (`TimeValue`) or an error (`FormulaError`); a reference (`A1`, `[@price]`, `A1:A5`, `[qty]`) is the list of its cells' values, one for one cell, as the built-in functions get them (so `SUM(A1)` skips a text there as in a range). `toNumber`, `toText` and `single` take a one-cell list as its value. `place` is where the formula is: `{ row, column }`, 1 the first row under the header and the first column. It returns one value: a number, a text, `true` or `false`, `null` (empty), a time or an error.
* It must give its result at once, from its arguments only: it is called whenever the table is calculated, and its result is written into the cell. It cannot wait for anything (a query, another page): a function that returns a promise gives `#VALUE!`. For data from SilverBullet, a cell with a Lua expression (`${…}`) shows it.
* A function that throws gives `#VALUE!` with its message (on the cell's hover), as does one that returns a list or an object; one that throws a `FormulaError` gives that error.
* A function with a built-in function's name replaces it.
* The helpers are the conversions the built-in functions use: `toNumber`, `toText`, `toBoolean` (an error for a value that is none), `numbers` (the numbers of all the arguments, ranges skipping empty cells and text), `flatten` (all the values of the arguments, ranges taken apart), `single` (a range's first value), `firstError`, `isError`, `isRange`, `toDate` / `parseDate` (a date as `{ ms, time }`), `formatDate` (written back), and `FormulaError` (`new FormulaError("#N/A", "why")`) and `TimeValue` (`new TimeValue(seconds)`). An error given to them comes back, so a function passes errors in its arguments on by returning it.
* Functions are defined again whenever SilverBullet loads Space Lua again: a change of the file shows after reloading the page (the browser keeps a module it loaded). A formula calling a function that is not defined (its file missing, or not loaded) keeps the result written, and *Recalculate* in the toolbar is highlighted: an edit of that table writes `#NAME?` there.
* A mistake in a definition (no `call`, a name formulas cannot write) is shown in a notification until you close it, with the pages whose `space-lua` blocks call `silverware.table.defineFunctions` and a button opening each; the other functions are defined.

### Errors

| Shows | Because |
|---|---|
| `#REF!` | A reference outside the table, a column name that does not exist, or a table name that no table on the page (or on the page named) has |
| `#NAME?` | An unknown function, or a name no cell of the table has (of the table named before it: `rates!vat`) |
| `#VALUE!` | A value of the wrong kind (text where a number is needed), or a wrong number of arguments |
| `#DIV/0!` | Division by zero, or an average of no numbers |
| `#NUM!` | A result that is not a finite number, or a number a function cannot take (`LARGE` with k past the count, `WEEKDAY` with an unknown type) |
| `#N/A` | `XLOOKUP` did not find the value, or `RANK` the number |
| `#CYCLE!` | The formula depends on its own result |
| `#ERROR!` | The formula cannot be read (e.g. a missing `)`) |

## Column types

A hashtag in a column's header gives the column a type, which changes how its cells show. Pick it in the column's menu (the ⠿ grip above the column, or right-click its header): *Type* shows the column's type, the icon after it opens the types in the same menu, the × beside it removes the type (greyed out while there is none). The types show (hover one to see how it is written and what it shows), the arrow before the menu's title (or the Left key) returns to the column's menu, and the type picked is written as a hashtag in the header. Editing a header changes only the column's name: its type's hashtag stays. In the markdown, the hashtag can also be typed by hand, e.g. for a parameter the menu does not offer (`#currency-usd`).

```
| Item | Price #currency-usd | Rating #stars | Done #check |
| ---- | ------------------- | ------------- | ----------- |
| Pear | 12.99               | 4             | yes         |
```

shows `$12.99`, `★★★★☆` and `☑`.

* The markdown keeps the value as written: the type only changes what the cell shows. The cell editor shows the value. Sorting, filters and copying (Ctrl+C) use the value too, so a rating sorts by its number.
* The type's hashtag is hidden in the header, and the type's icon shows after the column's name (hover it for the type); the menu marks the types with the same icons. SilverBullet leaves hashtags out of a column's key, so a query still reads `Price #currency-usd` as `price`, and the hashtag tags neither the rows nor the page.
* A parameter goes after a dash: `#currency-usd`, `#number-2`, `#stars-10`. A hashtag that is not a type (or a type with a parameter it does not take) is an ordinary hashtag.
* A cell whose value is not one of the type shows as written, in red; hover it to see why. Empty cells are left alone.
* The cell editor offers the type's values where it has a few (`#stars`, `#check`, `#trend`) in a list under the cell, all of them even when the cell has one: click one, or move along them with ↑ / ↓ and take one with Enter. Typing narrows the list. A value saved that is not of the type is kept as typed, and Silverware Table says so.
* A formula's result is shown in its column's type, e.g. `=SUM([price])` as an amount of money.
* The hashtags of MdTableRender also work for these types: `#euro`, `#usd`, `#int`, `#float`, `#kg`, `#km`, `#watt`, `#logical`, `#evaluation`, `#gauge`.

| Type | Shows |
|---|---|
| `#currency, #currency-usd` | An amount of money: the currency's three-letter code after the dash (default EUR). Its sign goes where the currency's country writes it: $12.99, 12.99 €, 12.99 Kč. |
| `#number, #number-2` | A number with thousands separators: the decimal places after the dash (default: as written). |
| `#percent, #percent-1` | A fraction as a percentage, 0.15 is 15 % (15 % stays 15 %): the decimal places after the dash (default 0). |
| `#unit-kg` | A number with a unit: the unit after the dash. |
| `#stars, #stars-10` | A rating as stars: a whole number from 0 to the most stars after the dash (default 5). |
| `#check` | Yes or no as a check box: yes, true, x, ☑ or a number above 0 shows ☑; no, false, ☐, 0 or a number below it shows ☐. |
| `#date, #date-long` | A date written as 2025-11-06 (with a time: 2025-11-06 14:30), shown as the locale writes it: short, medium (default) or long after the dash. |
| `#time` | A time of day written as 14:30 or 14:30:15 (or as a fraction of a day, 0.5 is 12:00), shown as the locale writes times. |
| `#trend` | A trend as an arrow: + or a number above 0 shows ↑, - or one below 0 shows ↓, = or 0 shows =. |
| `#progress, #progress-10` | Progress as a bar: a number from 0 to the maximum after the dash (default 100). |
| `#link` | A web address as a link, shown without its https://. |

Numbers and dates are written as your browser's language writes them.

### Custom column types

Custom column types, your own, are written in JavaScript, in a file of your space, the way the built-in ones are, and given to Silverware Table from Space Lua, as [[#Custom functions]] are. For example `Library/me/types.js`:

```js
export default ({ numberOf, notANumber, formatNumber, lineIcon }) => [
  {
    name: "temp",
    syntax: "#temp, #temp-f",
    description: "A temperature in °C, or in °F after the dash.",
    icon: lineIcon('<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/>'),
    params: { scale: { kind: "choice", values: ["c", "f"], default: "c" } },
    check: notANumber,
    format: (text, { scale }, locale) => `${formatNumber(numberOf(text), locale)} °${scale.toUpperCase()}`,
  },
];
```

and in a `space-lua` block of any page (with a priority of its own, one below 50):

```lua
silverware.table.defineTypes(js.importFromSpace("Library/me/types.js"))
```

Then `| Outside #temp |` and `| Oven #temp-f |` show their cells so, the *Type* menu offers it, and its hashtag is hidden in headers.

* The file's default export is the list of types, or a function that gets Silverware Table's helpers (below) and returns the list. Each type has a `name` (letters, digits and `_`, starting with a letter: its hashtag) and optionally:
  * `syntax` and `description`, shown in the *Type* menu, and `icon`, an SVG (`lineIcon` draws one from SVG paths, 24 by 24);
  * `params`, the parameters written after the dash, one after another separated by dashes (the last takes the rest: `#unit-m-s`). Each is `{ kind: "number", integer, min, max, default }`, `{ kind: "choice", values: [...], default }` (any case) or `{ kind: "text", pattern, default }`. Silverware Table reads them from the hashtag: the type gets their values (a number as a number, a choice as listed, a parameter not written as its default, or `undefined`). A hashtag whose parameters do not fit is an ordinary hashtag;
  * `aliases`: other hashtags that mean the type, with its parameters as written after the dash: `{ fahrenheit: "f" }`;
  * `check(text, params)`: why a cell's text is not a value of the type (it shows in red, with the reason on hover), or nothing when it is one. Empty cells are not checked. None: every text is one;
  * `format(text, params, locale)`: what a valid cell shows, a text, a link `{ text, href }`, or a meter `{ text, meter }` (a bar filled to `meter`, from 0 to 1, the text in a box over it, as `#progress` shows); `locale` is the browser's language. None: the text as written;
  * `sortValue(text, params)`: what sorting and filters compare instead of the text, e.g. `1` and `0` for yes and no;
  * `choices(params)`: the values the cell editor offers, texts or `{ value, label }`.
* A type with a built-in type's name replaces it (its aliases too). Its own name comes before another type's alias, and its aliases before the built-in types' ones; of two types of one name, the last defined counts.
* A method must give its result at once. One that throws, or gives something else, marks the cell in red with why; the table shows the rest as usual.
* The helpers are those the built-in types use: `numberOf` (a cell's text as a number, as sorting reads it: `12,99`, `1 000`, `15 %`; else `undefined`), `notANumber` (a `check` for numbers), `formatNumber(n, locale, options)`, `numberFormat` and `dateTimeFormat` (`Intl` formatters, made once), `parseDate` (a date written as `2025-11-06` as `{ ms, time }`) and `lineIcon`.
* Types are defined while SilverBullet loads Space Lua, before the page's tables show. A change of the file shows after reloading the page. A mistake in a definition is shown in a notification until you close it, with the pages whose `space-lua` blocks call `silverware.table.defineTypes` and a button opening each; the other types are defined.

## Rows and columns

Hover a cell to show two grips: ⠿ left of its row, and ⠿ above its column; moving the pointer along the left of the table (above it) takes them from row to row (column to column). Hovering a grip tints its row or column. While a cell is edited, they stay with it.

* **Click a grip**: the row (column) is selected, for Ctrl+C or Delete, as a click selects a cell; **click it again** (the pointer shows a menu on the grip of a row selected), or **right-click** it, for its menu. With *Edit mode* on, as a click edits a cell at once, the first click opens the menu too. On a touch screen: tap to select, tap again or press and hold for the menu.
  * Row: copy, cut, paste (also as new rows), clear, insert above or below, duplicate, move up or down, select rows, delete.
  * Column: copy (with its header), cut (the cells under it), paste, clear (the cells under it), sort, filter, type (see [[#Column types]]), align (left, center, right), insert left or right, move, select columns, delete.
  * With several rows (columns) selected, it acts on them all (*Copy 3 rows*, *Delete 3 rows*).
  * With rows (columns) selected whole, a right click on one of their cells (on a touch screen: a tap or a long press) gives this menu too, not a cell's, as in a spreadsheet. A right click on a header (a long press) gives its column's menu, the column selected.
  * *Paste* in a column's menu pastes from its header a column copied with its header (*Copy column*), which names it; anything else (cells from a spreadsheet, cells cut) goes under the header, the column keeping its name. *Paste as new rows* with rows cut moves them there (as a spreadsheet inserts cut cells).
* **Shift+click on a grip** selects at once the rows from the one selected with a click (else the first of the rows or cells selected) to that one; Shift+click another grip to change where they end. A click on the grip of a selected row then opens its menu with *Delete N rows*.
* **Drag a grip** to move the row or column: a copy follows the pointer and the others move aside to show where it goes; near the top or bottom of the view the page scrolls. Esc cancels the drag.
* **Several rows (columns) at once**: select them whole (a grip's click, then Shift+click another, or on a touch screen the dots at the selection's edges), then drag the grip of any of them: they move together, in their order, as one edit. *Move up* / *Move down* (*Move left* / *Move right*) in the menu of one of them move them all (*Move 3 rows down*). They must follow each other and be in one zone of pinned rows (columns).
* **Insert with +**: with a mouse or a pen, hover just left of the row grips, or just above the column grips: a **+** shows on the border nearest the pointer and inserts a row (column) there. On the last border it adds one at the end; while a cell of the last row (column) is hovered, selected or edited, a faint **+** under the table (right of the header) adds one at the end. A new column is named *Column N*, ready to rename. On a touch screen, insert from the row's or column's menu.
* **Numbered column**: *Insert numbered column left* in a column's menu adds a column `#` with `=ROW()` in every row: it numbers the rows as written (sorting or filtering the view does not renumber them), rows added later get the formula too, and inserting, deleting or moving rows numbers them again. Add as many as you like. It needs the *Store table metadata* setting, as every new formula.
* Rows can be moved only in the original order (no sorting, no filter), so a row always lands where you see it.
* **Column width**: drag the right edge of a column's header (a faint dashed line shows there while the header cell is hovered, selected or edited; the pointer shows ↔ on it) to set its width; text wraps (or is cut) within it, see [[#Long text in cells (`silverware.table.modules.longText`)]]. Double-click that edge, or *Auto width* in the column's menu, for the automatic width again (as wide as the text, up to the maximum column width); *Reset column widths* in the ⋯ menu of the table's toolbar does it for every column. With the *Store table metadata* setting the width is stored in the table (`widths.-c-price.size='180'`, see [[#Table metadata]]) and follows the column when it is renamed or moved; without it, it holds until the page is opened again.

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

* Tap a cell to select it, tap it again to edit it (with *Edit mode* on, the first tap edits). The handles of its row and column show next to it: tap one to select the row or column, tap it again (or press and hold it) for its menu (insert rows and columns there), or drag it to move the row or column. A pen that hovers (such as the S Pen) also gets the **+** on the borders, as a mouse does.
* The sort buttons in the header are always shown (there is no hover to show them on). The toolbar (the filter icon, the ⋯ menu) shows while a cell of the table is edited.
* Swiping scrolls a wide table sideways and the page up and down, as usual.
* **Selecting more cells**: tap a cell, then drag one of the dots at the selection's corners (top left, bottom right) across other cells; near the edge of the screen the page scrolls along. Tap a row's or column's handle to select the whole row (column), then drag a dot to select more rows (columns): they stay whole. For whole rows (columns) the dots sit in the middle of what you see of them, on the first row's top and the last row's bottom (the first column's left, the last column's right), and stay there as the page or the table scrolls, as in a spreadsheet's app.
* **Tap a cell of a selection** of several cells for their menu (copy, clear, delete the rows or columns, *Move to…*), as in a spreadsheet's app.
* Press and hold a cell for its menu (copy, cut, paste, clear, filter by its value, name it); a header for its column's menu.
* **AutoFill**: select the cells to go on from, tap them for their menu, *AutoFill to…*, then tap the last cell to fill, see [[#AutoFill]]. The fill handle does not show after a touch: the corner's dot selects.
* Not on touch screens: the keyboard shortcuts (unless the device has a keyboard) and middle-button scrolling.

## Lazy saving

Every edit rewrites the whole table in your page, which takes a moment in a large table. **Lazy saving** (the clock icon in the table's toolbar, the `lazy` module) keeps the cells you edit and saves them together once you stop editing:

* Click the clock: it shows as switched on (tinted) while lazy saving is on, for that table, until you leave the page.
* Cells you edit show their new text at once (marked in their bottom right corner); they are saved together when no cell has been edited for half a second (the *Saves after (ms)* setting, `silverware.table.modules.lazy.delay`). While edits are not saved yet the clock is highlighted.
* Click the clock again: what is not saved yet is saved at once, and lazy saving is off.
* Anything else that changes the table (adding or moving a row, pasting, Delete) saves the cells edited along with it.
* **Ctrl+Z** while cells are not saved yet takes them all back at once (Ctrl+Y brings them back); while a cell is being edited it undoes your typing as usual.
* Until they are saved, a cell shows its text as typed (a link or a formula's result shows once saved), and sorting, filters and formulas use the values saved.
* Leaving the page saves them: opening another page writes them into this page; switching to another tab or app saves them at once; closing the tab saves them, and the browser asks whether to leave.
* A cell changed elsewhere meanwhile (in the markdown, on another device) keeps that change, and a message says the edit there was not saved.

## Themes

A theme sets how tables look: their header, the lines between rows and columns, the striping, corners, shadow and spacing. *Native* (the default) leaves tables as SilverBullet shows them.

* **For every table**: the *Theme* setting (`silverware.table.modules.themes.theme`, in *Silverware Table settings…* or `config.set("silverware.table.modules.themes", { theme = "slate" })`).
* **For one table**: *Theme* in the ⋯ menu of its toolbar picks a theme of its own, stored in the table (`<meta core.table themes.name='slate'>`, needs *Store table metadata*, see [[#Table metadata]]). Hovering a theme there (or moving to it with the arrow keys) shows a small table in it beside the list, with the table's stripes (not for *Global theme*: its theme is the one marked *(default)*). *Global theme*, first in that list, makes the table follow the settings again, its theme and its stripes; a theme (or stripes, the icons under it) picked stays the table's whatever the settings become, also the settings' own one (marked *(default)*).
* **Light or dark**: each theme has both, and SilverBullet decides which one shows (its own light or dark mode).
* **Stripes** are not the theme's: the *Stripes* setting (`silverware.table.modules.themes.stripes`) tints every other row (`rows`, the default, as SilverBullet does), every other column (`columns`) or nothing (`none`), in the theme's color; for one table, the three icons in *Theme* in its ⋯ menu (no stripes, rows, columns) choose (`<meta core.table themes.stripes='columns'>`), *Global theme* there the setting's again. It works with *Native* too.
* Built in: *Native*, *Plain* (no lines, fills nor bold header: plain text in rows and columns, e.g. for a layout), *Playground* (the look of the Silverware Table playground: a light header, soft striping), *Minimal* (a small-caps header, thin lines, no other fills), *Slate* (a card with rounded corners and a soft shadow, sans-serif type), *Grid* (a spreadsheet, every cell outlined, compact, sans-serif type), *Ocean* (a deep teal header, teal striping), *Paper* (warm tones, serif type), *Contrast* (high contrast: a black header, strong lines, roomy cells), *Compact* (small type, tight cells, for tables of data), *Bold* (thick lines, square corners, a hard shadow, yellow on black), *Soft* (airy: a pastel header, large corners, rounded type where the device has it), *Ledger* (an account book: lines between columns, green-bar stripes, figures in a monospace font, so they line up).
* The `themes` module can be turned off (see [[#Modules]]): tables look as SilverBullet shows them, and a theme stored in a table is kept but not used.

### Your own theme

A theme is a `space-style` block on any page of your space; Silverware Table finds it there and offers it in the setting and in a table's menu by its name. Set the variables you want, in a block for the light look and one for the dark; any you leave out stay as SilverBullet has them:

```css
.sb-table-widget[data-swt-theme="sand"] {
  --swt-head-bg: #f3ead8;
  --swt-head-color: #4a3b2a;
  --swt-stripe: #fbf7ef;
  --swt-border: #e6dcc8;
  --swt-row-line: 1px;
  --swt-radius: 8px;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="sand"] {
  --swt-head-bg: #3b3326;
  --swt-head-color: #f3ead8;
  --swt-stripe: rgba(243, 234, 216, 0.05);
  --swt-border: #4b4234;
}
```

A theme's name is letters, digits, `-` and `_`; menus show it capitalized (`sand` is *Sand*).

| Variable | What it sets | Example |
|---|---|---|
| `--swt-head-bg` | The header's background | `#f1f5f9` |
| `--swt-head-color` | The header's text color (`currentColor`: as the rows) | `#334155` |
| `--swt-head-weight` | The header's font weight | `600` |
| `--swt-head-size` | The header's font size | `0.8em` |
| `--swt-head-transform` | The header's letter case | `uppercase` |
| `--swt-head-spacing` | The header's letter spacing | `0.05em` |
| `--swt-head-padding` | The header cells' padding (else as `--swt-padding`) | `10px 12px` |
| `--swt-stripe` | The color of stripes (rows, columns or none is the *Stripes* setting's) | `#f8fafc` |
| `--swt-hover` | The row under the pointer | `rgba(0, 0, 0, 0.04)` |
| `--swt-color` | The rows' text color | `#1f2937` |
| `--swt-accent` | Selection, pinned rows and columns, formula marks | `#2563eb` |
| `--swt-border` | The color of every line below | `#e5e7eb` |
| `--swt-row-line` | Lines between rows | `1px` |
| `--swt-head-line` | The line under the header (else as `--swt-row-line`) | `2px` |
| `--swt-column-line` | Lines between columns | `1px` |
| `--swt-outline` | A line around the table | `1px` |
| `--swt-sheet-table-line` | The line around a table in the sheet view, where it ends among the empty cells | the text's color, 40 % |
| `--swt-radius` | The table's corners | `8px` |
| `--swt-shadow` | The table's shadow | `0 2px 8px rgba(0, 0, 0, 0.1)` |
| `--swt-padding` | The cells' padding (density) | `6px 10px` |
| `--swt-font-size` | The table's font size | `0.9em` |
| `--swt-font` | The table's font (fonts on the device; none downloaded) | `ui-monospace, monospace` |
| `--swt-head-font` | The header's font (else as `--swt-font`) | `Georgia, serif` |

The header's background and its text color go together: SilverBullet's header is dark with light text, so a light header needs `--swt-head-color` too. For more than these, a theme's block can style the table further (`.sb-table-widget[data-swt-theme="sand"] td { … }`).

## Sheet view

The sheet icon (a grid, before the sheet's name in the first row of a table's ⋯ menu, or in its toolbar while you hold Shift) shows the table like a spreadsheet, over the whole window: the columns' letters above, the rows' numbers beside them (as formulas refer to cells, `B3`), and empty rows and columns past the table's last row and column. More appear as you scroll on.

* **Select an empty cell** as a table's cell: a click selects it (in *Edit mode* it edits it at once); typing, a second click, Enter or F2 edits it; Esc unselects it, a second Esc closes the view. An arrow on a table's edge cell goes on out of the table, as Ctrl+arrow does too: from a cell selected it selects the cell past the edge, from a cell edited it saves it and edits the cell past the edge. Among the empty cells Ctrl+arrows move as arrows do; in an empty cell's editor Ctrl+arrow saves it and edits the next cell that way. Arrows go on from the table's last row or column into the empty cells and back.
* **Grow the table**: click the empty cell right under its last row, or right next to its last column, and type. Enter or Tab saves it, and the table grows by that row or column, in one edit (one Ctrl+Z), as a spreadsheet's table grows; a new column is named *Column 5* (rename it like any header). Typing into the header's line right next to the table adds a column with that name. A value typed farther from the table makes a table of its own there (see *Sheets of several tables*); cells pasted there (Ctrl+V, from a spreadsheet or a table) make a table too, its top left at that cell and their first row its header (a single row pasted goes under *Column 1*, *Column 2*…), where it does not cover another table. As in the table, Enter then edits the cell below, Tab the next one (Shift the other way), Esc leaves the cell selected.
* **Paste into an empty cell**: Ctrl+V on the cell right under or next to the table pastes cells copied from a spreadsheet there, and the table grows to hold all of them; a single value goes into the cell's editor. Farther from the table, what is pasted goes into the cell's editor as text.
* **Nothing is added for a cell left empty**: Enter on an empty cell, or Esc, writes nothing.
* **Rows pinned to the bottom stay last**: a new row goes above them, as Tab on the last cell does; a column, left of the columns pinned to the right.
* **Sheets' tabs**: at the bottom, one tab per sheet of the page, in the page's order; click one (or press Ctrl+Shift+PageDown / Ctrl+Shift+PageUp) to show that sheet; the sheet view of a table on no sheet has that table's tab first (*Table*). **+** shows a new empty sheet (*Sheet1*, *Sheet2*… as the page has none of that name); a value typed, cells pasted or a table added there make its first table, and the sheet exists from then on; left empty, it goes. Click the tab shown (or right-click any) for its menu: the pencil in its title renames the sheet in all its tables at once, *Remove sheet* takes its tables off it (they stay in the page with their names). These need *Store table metadata*.
* **Close it** with the same icon (*Exit sheet view*) or Esc. *Full screen* stays as it was: the table over the window without empty cells.

### Sheets of several tables

A page's tables can share a sheet, as a spreadsheet's sheet holds several tables. The row *Sheet* of the table's ⋯ menu shows the sheet it is on (*Sheet: Budget*; *Sheet* alone on none); click its pencil and type another to put the table on that sheet: one of the page's, or a new one. It keeps its place there where nothing is in its way, else it goes in column A, one empty row under the sheet's lowest table; the sheet's other tables stay where they are. A table without a name is named for it (`table1`): the sheet's other tables refer to its cells by its name (`costs!B2`). An empty name, *Remove from sheet* under the field, or the × of the row *Sheet* takes the table off its sheet, its name kept. The table keeps its place in the page, which shows it as before; its metadata row says which sheet it is on and where (`<meta core.table core.name='costs' sheet.name='Budget' sheet.at='B3'>`). It needs the *Store table metadata* setting (without it, a table on a sheet can still move to another one, or off it). A sheet view showing the table goes to its new sheet. In the sheet view, right-click an empty cell (or long-press it, or press the Menu key on it selected) and choose *Add table here*: it lists the page's tables not on this sheet, by their name, else their header; hover one to see where it would go, click it to put it on the sheet with its top left in that cell. One that would cover a table of the sheet is offered disabled. A table moved from another sheet whose only table it is asks first, as that sheet goes with it. *Delete table* in its ⋯ menu takes it off the sheet with the page; the sheet's column widths, kept in its first table, go to the next one (with the *Store table metadata* setting off they stay in the table that has them, also when it is no longer the first, and go when it is deleted: you are asked first).

To move a table on its sheet:

* Drag the handle at its top left corner (it shows while the pointer is over the table; on a touch screen, while a cell of it is selected). Its outline shows where it would go, with the address of its top left cell; red where another table is in the way, and there it does not go. Esc cancels.
* Or select the whole table (a click on that handle) and drag the selection by its edge, as you move cells.
* Or pick *Move table…* in its ⋯ menu or a cell's menu, then click or tap the cell where its top left corner goes; Esc cancels. This is the easy way on a phone.

Moving changes only the table's place on the sheet (`sheet.at`); the page keeps the table where it is, and its formulas stay as they are. A table never goes over another one, nor pushes one aside. A table shown alone (on no sheet) is put on a sheet first: its toolbar says *No sheet* in red there, whatever the *Names in the toolbar* setting; click it and type a sheet's name.

Rows and columns pinned in a table (see [[#Pinning]]) stay in view there while their table is: as the sheet scrolls, the header with the rows pinned to the top stays at the top of the view, the rows pinned to the bottom at its bottom and pinned columns at its sides, never past their table. A table still grows as in the page: a value typed under a row pinned to the bottom (a total) goes into a new row above it, and one typed right of a column pinned to the right into a new column left of it, so the pinned ones stay last.

The sheet view of a table on a sheet shows all the sheet's tables, each at its place (its `sheet.at` cell), however far apart they are in the page. The sheet's rows have one height, and each column is as wide as the widest of the tables' columns in it. The empty cell right next to a table's last column (in its rows) or right under its last row (in its columns) grows that table, as for a table alone (the one left of it, where a cell is both).

**A value typed into an empty cell that no table grows to makes a new table there**: its header *Column 1* goes in the cell above, the value under it (on the sheet's first row the table starts there and the value goes one row lower, so the header fits), named like `table1` and placed after the page's last table; Enter then goes on under the value, which grows the new table. A formula typed there is saved as text, as its table does not exist yet: edit the cell in the sheet view and remove the `'` before the `=` to make it a formula. On a table that is on no sheet, its sheet view becomes a sheet so: the table goes on a new sheet (`Sheet1`) at A1, named if it has no name, with the new table, in the same edit (one Ctrl+Z undoes it all). Both need the *Store table metadata* setting.

**A table that grows makes room on its sheet**, so the layout you made stays as it is:

* Rows added to a table (Tab on its last row, the +, *Insert row*, *Paste as new rows*) move every table that starts below it down by as many rows, whatever its columns, so tables side by side stay in line. Columns added move every table that starts right of it to the right.
* A value typed or pasted into empty cells past a table takes those cells: nothing moves while they are empty, and where the table would reach into another one, every table below it (or right of it) moves as far as needed.
* A table beside it (starting next to it, above its bottom) stays where it is.
* A table that gets smaller moves nothing back.
* It is one edit: one Ctrl+Z puts everything back.

In the sheet view a column with no width of its own is as wide as its widest cell, at most 300 px (or the *Maximum column width* of long text, where it is smaller); text longer than its column is cut there: a header's name with an ellipsis, a cell's as the longText module's setting says (wrapped within the row's height, or on one line with an ellipsis). A table's header and pinned rows and columns stay in view while the table is, as frozen rows and columns do in a spreadsheet, each table on its own. A column's width dragged there (the handle on a header's right edge, or the right edge of the column's letter above the sheet, also for a column no table has) is the sheet's column's, for every table in that column, as a spreadsheet's columns are (kept in the sheet's first table, `sheet.width.B='140'`); a double-click makes it automatic again. A table's own widths still apply in the page. The sheet view of a table alone works the same: the width dragged is its sheet view's column's, kept in the table.

In the sheet view formulas read in the sheet's addresses, as the letters and numbers show them: in a table at `D1`, whose own `A1` is the sheet's `D2`, `=prices!B1*2` reads `=B2*2` where `prices` is at `A1`, and a formula typed or pointed at there is stored in its tables' addresses again (`=B3*2` as `prices!B2*2`). A reference stays on its row: sorting a table changes the address shown, not the value. In a sorted or filtered table a range of several rows cannot be pointed at there, as its rows are not in the markdown's order (the hint under the cell says so); a click on a header gives the whole column (`[qty]`). While a formula waits for a reference, the sheet's other tables can be pointed at too: a cell gives its sheet's address (stored by the table's name, `prices!B2`), a header the table's column (`prices![price]`). A range is always within one table. A reference to a table on no sheet, or on another page, reads as stored; one to the sheet's empty cells is written as `#REF!`. Out of the sheet view a formula reads as stored.

Everything else works as in the page: editing, selecting, menus, formulas. A table sorted or filtered shows a row added so where its sorting or filter puts it (or hides it); the rows' numbers are the sheet's. The empty cells are not cells yet: a selection, AutoFill or a drag stays within the table, a formula cannot refer to them, and the cell menu has nothing for them.

## Large tables

* **Sticky header**: while you scroll past a long table, its header stays at the top of the view, with the toolbar above it.
* **Maximum height**: with the *Maximum table height* setting, a taller table scrolls inside its own box; its header stays at the top of that box. See [[#Settings]].
* **Wide tables** scroll sideways; Silverware Table keeps the scroll position after edits, and new rows open their editor in a column you can see.
* **Autoscroll**: the middle mouse button over a wide table scrolls the table sideways and the page up and down together; in the sheet view, anywhere on the sheet (a table or an empty cell), it scrolls the sheet both ways. Hold and drag, or click and move; the next click ends it.

## Settings

These settings are for every table in the space (a table's own sorting, filters, widths and names are in its menus).

**Silverware Table settings** (*Silverware Table settings…* in a table's ⋯ menu, or the *Silverware Table: Settings* command) shows them all in one dialog: *General*, then the modules by kind (*Editing*, *Data*, *Look*, *View*, *Export*), each with its switch and its own settings under it. Nothing changes until *Save*: then they are written into SilverBullet's configuration, where the Configuration Manager keeps its settings (the managed block of your [[CONFIG]] page), so both always show the same. Turning a module on or off saves and reloads the page (*Save and reload*), as modules start with Silverware Table. *Cancel* (or Esc) closes it unsaved.

You can also open *Configuration: Open* (Ctrl+, / Cmd+,) and find the *Silverware Table* and *Silverware Table: Modules* categories, or set them in your [[CONFIG]]. Settings of whole tables are `silverware.table.<setting>`, those of a part of Silverware Table `silverware.table.<part>.<setting>`, and those of a module (a part that can be turned off) `silverware.table.modules.<module>.<setting>`. A part is set in one go, with only what you change (the rest keeps its default):

```lua
config.set("silverware.table.metadata", true)
config.set("silverware.table.editor", { enterKey = "moveDown", selectOnClick = true })
config.set("silverware.table.modules.formulas", { enabled = false })
config.set("silverware.table.expressions", { refreshDelay = 1000 })
```

Setting a part replaces what an earlier `config.set` of the same part set: set each part once, or one setting at a time (`config.set("silverware.table.editor.enterKey", "moveDown")`).

### Tables

* **Store table metadata** (`silverware.table.metadata`), default `false`
  * `true`: table settings (the sorting and pinned rows and columns) can be stored in any table, see [[#Table metadata]], rows and columns can be pinned, see [[#Pinning]], and formulas can be added, see [[#Formulas]].
  * `false`: tables without metadata get none: sorting is a view only, and a formula typed into a cell is saved as text. Tables that already have metadata keep using it: their sorting is still stored, rows and columns can be unpinned and their formulas keep working, but nothing new can be pinned and no new formula added.
* **Maximum table height (px)** (`silverware.table.maxHeight`), default `0`
  * `0`: no limit, a table is as tall as its rows.
  * A number of pixels, e.g. `400`: a taller table gets its own vertical scrollbar.
* **Format tables** (`silverware.table.autoFormat`), default `true`
  * `true`: a table edited with Silverware Table is written with aligned pipes, padded to the widest cell of each column and aligned as its delimiter row says.
  * `false`: each table keeps its own style: aligned tables stay aligned, compact tables stay compact, untouched rows are kept byte for byte.
  * Either way, *Format table* in the ⋯ menu of a table's toolbar aligns that table now (e.g. one typed by hand); an aligned table stays as it is.

### Cell editor (`silverware.table.editor`)

* **Enter in a cell editor** (`enterKey`), default `moveDown`
  * `save`: Enter saves the cell.
  * `moveDown`: Enter saves and edits the cell below (on the last row: a row added under it, edited); Shift+Enter too, opening it with its text selected (with *Click selects the cell's text*: with the cursor at the end).
* **Click selects the cell's text** (`selectOnClick`), default `false`
  * `false`: a click, Enter, Tab and Ctrl+arrows open a cell with the cursor at the end of its text; Shift+Enter opens the cell below with its whole text selected.
  * `true`: they open it with its whole text selected; Shift+Enter with the cursor at the end.
  * Without the `selection` module, Shift+click and Ctrl+Shift+arrows open the cell as Shift+Enter does.
* **Ctrl+Enter adds a row** (`ctrlEnterAddsRow`), default `true`
  * `true`: Ctrl+Enter in a cell editor saves the cell, adds an empty row below its row and edits it.
  * `false`: Ctrl+Enter works like Enter.

### Long text in cells (`silverware.table.modules.longText`)

The `longText` module (see [[#Modules]]); off, cells show as SilverBullet renders them: on one line, as wide as their text.

* **Text that does not fit** (`overflow`), default `wrap`
  * `wrap`: text longer than the column's maximum width wraps onto more lines, up to the maximum cell height; the rest is cut and fades out.
  * `ellipsis`: it stays on one line, cut with `…`.
  * A cell whose text is cut shows an expand button at its top right when hovered: it opens the cell in a popup, its whole text wrapped, to read and edit (Enter saves, Esc closes; Ctrl+arrows and Ctrl+Alt+arrows move in the text only, not to other cells or rows). While a cell is edited, F2 (or the same button, shown when the text does not fit the field, e.g. a long formula) goes on in the popup.
* **Maximum column width (px)** (`maxWidth`), default `500`: wider text wraps or is cut. `0`: no limit, a cell is as wide as its text.
* **Maximum cell height (px)** (`maxHeight`), default `200`: a wrapped cell no taller than this. `0`: no limit.

### Cells with Lua expressions (`silverware.table.expressions`)

* **Delay before refreshing (ms)** (`refreshDelay`), default `500`
  * After you edit a table, a cell that holds a Lua expression (`${…}`) reading the page index (a query, or a formula of a spreadsheet library such as MdTableSheet) shows its new result once SilverBullet has indexed the page again. This is how many milliseconds it waits for the index: raise it if such cells still show old results (a slow device, a large space).

### Modules (`silverware.table.modules`)

Each module can be turned off with `enabled = false`, e.g. `config.set("silverware.table.modules.paste", { enabled = false })`; all are on by default. A change applies when the page is loaded again. A module turned off is not loaded at all: what it stored in tables stays as it is, and is not used. Editing cells, sorting and the toolbar are always on.

| Module | When on |
|---|---|
| `formulas` | Formulas can be typed into cells, with their help and references; *Recalculate* in the toolbar; every edit recalculates the table and the tables referring to it, and references follow moved rows and columns. Off: nothing is recalculated, results stay as written, and references do not follow moves. A typed formula is saved as text; a formula cell edited, pasted over or emptied keeps its formula (hidden), which is used again once formulas are on. See [[#Formulas]]. |
| `names` | Tables, columns, rows and cells can be named: the pencil in the title of a table's ⋯ menu, a column's, a row's or a cell's menu; named headers and cells show a mark. Off: none of these, and no marks; names already in tables are kept and formulas still use them, but a duplicated row copies them too. See [[#Table names]]. |
| `pageLinks` | Formulas can refer to tables and named cells on other pages (`[[Prices]]fruit!B2`), which Silverware Table reads for them. Off: it reads no other page; formulas that refer to one keep the results they have (the formulas using them too), a new one shows `#REF!`. It needs the `formulas` module. See [[#Tables on other pages]]. |
| `filters` | Rows can be filtered: the toolbar's filter icon shows a filter field under each header, *Filter* in a column menu opens that column's filter, *Filter: = value* in the cell menu filters by a cell's value; with *Store table metadata* the filters are stored in the table. Its setting `smart` (default `true`): fields understand `>10`, `/pattern/`, `=text`, `a\|b` and `!filter`; `false`: everything typed is text to find. Off: no filtering; filters stored in a table are kept but not used. See [[#Filtering]]. |
| `columnTypes` | A header's type hashtag formats its column, the cell editor offers the type's values, and the column menu has *Type*. Off: cells show as written. See [[#Column types]]. |
| `selection` | Dragging across cells, Shift+click and Shift+arrows select them; Ctrl+C copies them, Delete empties them (whole rows, columns or a whole table already empty: deletes them); *Copy*, *Clear* and *Delete N rows / columns* in the cell menu. A click selects a cell, a second one edits it; the toolbar's *Edit mode* button edits on the first click. Off: a click always edits; Shift+click opens the cell as Shift+Enter does. |
| `themes` | Tables look as their theme sets: the *Theme* setting (`theme`, default `native`), or a table's own from *Theme* in its ⋯ menu; stripes from *Stripes* (`stripes`: `rows`, the default, `columns` or `none`), or as the icons in *Theme* in a table's ⋯ menu say. See [[#Themes]]. Off: tables look as SilverBullet shows them (striped); a theme stored in a table is kept but not used. |
| `lazy` | The toolbar's lazy saving icon (a clock) switches a table to saving its cells edited together, a moment after editing stops. Setting `delay` (milliseconds, default `500`). See [[#Lazy saving]]. Off: every cell is saved as you leave it. |
| `export` | *Copy as CSV* and *Copy as Markdown* in the table's ⋯ menu copy the whole table. |
| `autofill` | The fill handle at the corner of the cells selected: drag it to fill the cells after them, double-click it to fill down. See [[#AutoFill]]. Needs `selection`. Off: no handle. |
| `excel` | *Export to Excel…* in the table's ⋯ menu: copy for Excel, or download an .xlsx file with the formulas. Setting `functions`: templates for your custom functions in the file. See [[#Excel]]. |
| `paste` | Copy, Cut and Paste in the cell menu; Ctrl+X cuts cells (they move where they are pasted); Ctrl+V pastes cells copied from a spreadsheet over the table, Ctrl+Shift+V as new rows. Off: a paste goes into the cell editor as text, no Cut or Paste in the cell menu (Copy and Ctrl+C stay, with the `selection` module). |
| `handles` | The handles beside rows and above columns: drag them to move rows and columns, click them for the row and column menus. Off: rows and columns still move with Ctrl+Alt+arrows, and the **+** on a border still inserts them. |
| `longText` | Long text wraps (up to a maximum cell height) or is cut with an ellipsis at a maximum column width; a cut cell shows an expand button for its popup. Settings: see [[#Long text in cells (`silverware.table.modules.longText`)]]. Off: cells on one line, as wide as their text (F2 still opens a cell's popup while editing). |
| `widths` | A column's width set by dragging the right edge of its header, *Auto width* in the column's menu, *Reset column widths* in the table's ⋯ menu; with *Store table metadata* stored in the table. Off: columns are as wide as their text; widths stored in tables are kept but not used. |
| `sticky` | A table's header stays in view while the page scrolls past the table, and rows pinned to the bottom stay at the bottom of the view. |
| `autoscroll` | The middle mouse button over a table scrolls it. |
| `fullScreen` | The table's icon (in the first row of its ⋯ menu, or in its toolbar while you hold Shift) shows the table over the whole window (not the browser's full screen), with its toolbar, menus and editing as in the page, the columns' letters above the header and the rows' numbers left of them, as formulas refer to them (`B3`); the same icon (*Exit full screen*) or Esc closes it. |
| `sheet` | The sheet's name in the table's ⋯ menu (a table is put on a sheet, moved and taken off it there) and the sheet icon, which shows the table's sheet as a spreadsheet over the whole window, as `fullScreen` does, with empty rows and columns around its tables (more as you scroll on), their letters and numbers too. Type into the empty cell right under or next to a table: Enter or Tab saves it, and the table grows by that row or column, a new column named *Column 4*; farther from the tables, a value makes a table of its own. A cell left empty adds nothing; Esc drops it. The same icon (*Exit sheet view*) or Esc closes it. See [[#Sheet view]]. |
| `tableLabels` | A named table shows its name in a small tab at its top right corner, so you can tell tables apart at a glance, in the page and on the sheet. The tab stays on the header while the header is held at the top, and it hides while you hover the table, where the toolbar shows instead. |
| `largeTables` | Off by default. A table with many rows (setting `minRows`, default `200`) scrolls in a box of its own: as tall as *Maximum table height*, else the window. Only the rows in and around the box's view are in the page, so editing, sorting and filtering a table of thousands of rows stays quick. The browser's find (Ctrl+F) finds only those rows. Off: every row is in the page, the table as tall as its rows (unless *Maximum table height* is set). |

## Table names

A table can have a name, so formulas in other tables can refer to it. The title of the table's ⋯ menu is its name (*Table* while it has none): click the pencil after it, type the name and press Enter; an empty name removes it. While you hold Shift the toolbar shows the name too: a click on it names it as well. The name is stored in the table's metadata row (`<meta core.table core.name='prices'>`), so it needs the *Store table metadata* setting; without it, a name the table has can still be changed or removed.

* A name is letters, digits and `_`, not starting with a digit, e.g. `prices` or `price_list`. Names that read as a cell (`A1`, `AB12`) or as `TRUE` / `FALSE` are refused.
* Names are compared ignoring case, and two tables on a page cannot have the same name.
* Renaming a table renames the references to it in the formulas on the page; removing the name (or the table's metadata) leaves them as they are, showing `#REF!`.

## Table metadata

With the *Store table metadata* setting on, Silverware Table stores a table's settings in a last row that holds only a `<meta …>` tag: the sorting, the filters and the pinned rows and columns.

```
| Name  | Qty |
| ----- | --: |
| Pear  |   3 |
| Apple |  10 |
| Total |  13 |
| <meta core.table core.-c-qty.sort='desc' core.pin-bottom='1'> |
```

* `core.table` marks the row as the table's metadata. Every other attribute starts with whose it is: `core.` for Silverware Table's own, else the module's name (`filters.`, `widths.`, `themes.`, `sheet.`).
* `core.-c-qty.sort` is the sorting (by the column Qty, `asc` or `desc`), `core.pin-top`, `core.pin-bottom`, `core.pin-left` and `core.pin-right` how many rows (columns) at each edge are pinned, `core.name` the table's name (see [[#Table names]]). `filters.-c-qty.condition` is a column's filter (as typed), `widths.-c-qty.size` its width in pixels, `themes.name` the table's own theme and `themes.stripes` its stripes (`rows`, `columns` or `none`, see [[#Themes]]), `sheet.name` and `sheet.at` its sheet and its place there (see [[#Sheet view]]).

* The row is hidden in SilverBullet. Browsers never show `<meta>`, and other markdown renderers (GitHub, Obsidian) drop it, leaving at most an empty row.
* It is always the last row: new rows go above it, and it is not sorted, filtered or moved.
* Attributes of a column name it after `-c-`: `core.-c-qty.sort`, `filters.-c-status.condition`. Names are keys, as for formula references (see [[#References]]): the column `Unit price` is `-c-unit_price`, and any spelling with that key names it; a column with a name of its own goes by it. With several columns of the same name, the occurrence is added: `filters.-c-qty:2.condition` is the second column named Qty. They follow their column when it is renamed or moved, and are removed with it.
* A filter is stored as typed, once you leave its field; a `|` in it is written `\|`, as everywhere in a table: `filters.-c-status.condition='=open\|blocked'`.
* When nothing is left in it (no sorting, no filter, nothing pinned, no name, no theme, no stripes), the row is removed.
* With the setting off, nothing new is stored, also in a table that has a `<meta>` row: what a table has may change or go (its sorting, also by another column; a filter or width of a column that has one; its theme, stripes, name, sheet and place; pins at an edge that has them), nothing is added. In cells the same: a formula or a name a cell has may change, a new one is left out of the write (you are told so), the cell keeping its text; a calculated column still fills new rows, its formula being the table's already. When the row is left empty, it is removed.
* To remove metadata: *Remove metadata* in the ⋯ menu of a table's toolbar removes that table's `<meta>` tags; the *Silverware Table: Remove table metadata* command removes them from all tables on the page (it says how many). That is the metadata row (a sorting and filters stored there end: the rows show as written; the table's name, theme and stripes go too) and the formulas stored in cells (see [[#Formulas]]): those cells keep their current results as plain values. *Remove metadata* in the menu of a cell, of the cells selected, or of a row or a column (its handle's menu, or a header's) removes only theirs: the hidden tags of those cells (a column's header included) and, for a column, what the metadata row keeps of it (its stored sorting, filter, width); the table's own metadata stays. It shows only where there is some. All of them ask first, saying whose data goes (Silverware Table's own, each module's by its name, also a module turned off) and in how many cells, and one Ctrl+Z brings everything back.
* SilverBullet indexes the row like any other: a query over the table's rows (`index.tag "table"`) also returns it, with the `<meta …>` text in its first column.

## How your markdown is kept

* Every change is one ordinary edit: Ctrl+Z undoes it.
* With *Format tables* on (the default), every table you edit is written with aligned pipes. Tables are formatted only when edited, never just by viewing them. With it off, rows you did not change are kept byte for byte, and aligned tables stay aligned, compact ones compact. See [[#Settings]].
* Cells that are one `${…}` expression (e.g. formulas of a spreadsheet library such as MdTableSheet) are re-evaluated once the page is re-indexed after an edit, so they do not keep a stale result.
* Sorting (unless stored as [[#Table metadata]]), filters and scroll positions (sideways and, with a maximum height, up and down) are views only: they are remembered per table until the page is reloaded, and never written to the page.
* SilverBullet does not show columns without a name, which shifts the header against the data. For such a table Silverware Table shows a notice with a *Name them* button instead of enhancing it.

## Limits

* Works on tables written in the page. Query and Lua output, and tables in block quotes, are left as they are.
* If a SilverBullet update renders tables differently, Silverware Table switches itself off with one notification, and tables behave as without it.

## Implementation

```space-lua
-- priority: 50
-- Silverware Table's Space Lua API, loaded before your scripts (they have priority 0
-- unless they say otherwise): silverware.table.defineFunctions, silverware.table.defineTypes and
-- silverware.table.defineSeries, see "Custom functions", "Custom column types" and "Custom series"
silverware = silverware or {}
silverware.table = silverware.table or {}
if js and js.window then
  local silverwareTableJs = js.importFromSpace("Library/damesene/silverware-table.js")
  -- Space Lua is loaded (again): the scripts' definitions replace those of before (kept until then)
  silverwareTableJs.resetDefinitions()
  -- The pages whose space-lua blocks call silverware.table.<api> (the definitions do not say where they come from),
  -- each with its first such block's ref (Page@123)
  local function callers(api)
    local pages = {}
    local seen = {}
    for _, block in ipairs(query[[from index.tag "space-lua"]]) do
      local calls = string.find(block.script, "silverware.table." .. api .. "(", 1, true)
      local defines = string.find(block.script, "function silverware.table." .. api, 1, true)
      -- Its ref is the page and where the block starts (Page@123)
      local page = block.ref
      local at = string.find(page, "@", 1, true)
      while at do
        local next = string.find(page, "@", at + 1, true)
        if not next then break end
        at = next
      end
      if at then page = string.sub(page, 1, at - 1) end
      if calls and not defines and not seen[page] then
        seen[page] = true
        pages[#pages + 1] = { name = page, ref = block.ref }
      end
    end
    return pages
  end
  -- The others are defined; a mistake is shown until it is closed, with where it may come from and a way there,
  -- the rest of the script goes on
  local function shown(problem, api)
    if problem then
      local pages = callers(api)
      local names = {}
      local actions = {}
      for i, page in ipairs(pages) do
        names[i] = page.name
        if i <= 3 then
          actions[#actions + 1] = { name = "Open " .. page.name, run = function() editor.navigate(page.ref) end }
        end
      end
      if #pages > 0 then
        problem = problem .. " Called on " .. table.concat(names, ", ") .. "."
      else
        problem = problem .. " Search the space for silverware.table." .. api .. " to find the script."
      end
      editor.flashNotification(problem, "error", { timeout = 0, actions = actions })
    end
  end
  function silverware.table.defineFunctions(definitions)
    shown(silverwareTableJs.defineFunctions(definitions), "defineFunctions")
  end
  function silverware.table.defineTypes(definitions)
    shown(silverwareTableJs.defineTypes(definitions), "defineTypes")
  end
  function silverware.table.defineSeries(definitions)
    shown(silverwareTableJs.defineSeries(definitions), "defineSeries")
  end
else
  -- Space Lua without a window (no tables to show): nothing to define
  function silverware.table.defineFunctions() end
  function silverware.table.defineTypes() end
  function silverware.table.defineSeries() end
end
```

```space-lua
-- Settings, shown in the Configuration Manager (Configuration: Open)
config.defineCategory {
  name = "Silverware Table",
  description = "Interactive markdown tables.",
  priority = 5,
}

config.defineCategory {
  name = "Silverware Table: Modules",
  description = "Parts of Silverware Table that can be turned off. A change applies when the page is loaded again.",
  priority = 4.9,
}

-- Settings of whole tables are silverware.table.<setting>; those of a part of
-- Silverware Table are silverware.table.<part>.<setting>, and those of a module (a part that can
-- be turned off) silverware.table.modules.<module>.<setting>. A part is set in one go
-- with config.set("silverware.table.<part>", { … }): settings left out keep their defaults
config.define("silverware.table", {
  description = "Silverware Table settings",
  type = "object",
  properties = {
    metadata = {
      type = "boolean",
      default = false,
      description = "Allow storing table settings (sorting, filters, pinned rows and columns, names) in a hidden last row <meta …> of tables, and pinning. Off: nothing new is stored (sorting and filters are a view only), what a table has may change or go: its sorting, a column's filter or width, its theme, name and pins at an edge that has them. Formulas are stored in cells (<meta formulas.f>) and need it too: off, a typed formula is saved as text; existing formulas keep working, calculated columns too.",
      ui = { category = "Silverware Table", label = "Store table metadata", priority = 6 },
    },
    maxHeight = {
      type = "number",
      default = 0,
      description = "Maximum table height in pixels; a taller table gets its own vertical scrollbar. 0: no limit.",
      ui = { category = "Silverware Table", label = "Maximum table height (px)", priority = 5 },
    },
    autoFormat = {
      type = "boolean",
      default = true,
      description = "Write tables edited with Silverware Table with aligned pipes. Off: each table keeps its own style (aligned or compact).",
      ui = { category = "Silverware Table", label = "Format tables", priority = 4 },
    },
    toolbarNames = {
      type = "string",
      enum = { "never", "always", "shift" },
      default = "shift",
      description = "A table's toolbar shows the sheet it is on and its name (each after its icon: the sheet view, the full screen), as its ⋯ menu does: always, or (shift) while you hold Shift alone. never: they are in the menu only.",
      ui = { category = "Silverware Table", label = "Names in the toolbar", priority = 3.5 },
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
          ui = { category = "Silverware Table", label = "Enter in a cell editor", priority = 3 },
        },
        selectOnClick = {
          type = "boolean",
          default = false,
          description = "A click on a cell, Enter, Tab and Ctrl+arrows open its editor with all its text selected, Shift+Enter with the cursor at the end. Off: the reverse.",
          ui = { category = "Silverware Table", label = "Click selects the cell's text", priority = 2.5 },
        },
        ctrlEnterAddsRow = {
          type = "boolean",
          default = true,
          description = "Ctrl+Enter in a cell editor saves the cell, adds an empty row below and edits it. Off: Ctrl+Enter works like Enter.",
          ui = { category = "Silverware Table", label = "Ctrl+Enter adds a row", priority = 2 },
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
          ui = { category = "Silverware Table", label = "Cells with Lua expressions: delay before refreshing (ms)", priority = 0.5 },
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
              ui = { category = "Silverware Table: Modules", label = "Formulas", priority = 13 },
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
              description = "Naming tables, columns, rows and cells (the pencil in the title of the table's ⋯ menu, a column's, a row's or a cell's menu), so formulas refer to them by name; named headers and cells show a mark. Off: none of these; names already in tables are kept and formulas still use them.",
              ui = { category = "Silverware Table: Modules", label = "Names", priority = 12 },
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
              description = "Formulas referring to tables and named cells on other pages ([[Prices]]fruit!B2), which Silverware Table reads for them. Off: no other page is read; formulas referring to one keep the results they have, a new one shows #REF!.",
              ui = { category = "Silverware Table: Modules", label = "Links to other pages", priority = 11 },
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
              ui = { category = "Silverware Table: Modules", label = "Filters", priority = 10 },
            },
            smart = {
              type = "boolean",
              default = true,
              description = "Filter fields understand >10 <10 >=10 <=10 (numbers), /pattern/ (regular expressions), =text (whole cell), a|b (either) and !filter (not). Off: everything typed is text to find.",
              ui = { category = "Silverware Table: Modules", label = "Smart filters", priority = 9 },
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
              ui = { category = "Silverware Table: Modules", label = "Column types", priority = 8 },
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
              ui = { category = "Silverware Table: Modules", label = "Cell selection", priority = 7 },
            },
          },
        },
        autofill = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "A square at the bottom right corner of the cells selected: drag it to fill the cells after them (1, 2 → 3, 4; Mon → Tue; Item 1 → Item 2; formulas with their references moved), double-click it to fill down as far as the column beside has values.",
              ui = { category = "Silverware Table: Modules", label = "AutoFill", priority = 6.95 },
            },
          },
        },
        lazy = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "An icon in a table's toolbar switches it to lazy saving: the cells edited are saved together, a moment after no cell is being edited (quicker typing in large tables); the icon is highlighted while edits are not saved. Clicking it again saves at once and turns it off.",
              ui = { category = "Silverware Table: Modules", label = "Lazy saving", priority = 6.9 },
            },
            delay = {
              type = "number",
              default = 500,
              description = "In lazy saving, the cells edited are saved this many milliseconds after no cell is being edited.",
              ui = { category = "Silverware Table: Modules", label = "Saves after (ms)", priority = 6.8 },
            },
          },
        },
        themes = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Tables look as their theme sets (header, lines, stripes, spacing): the Theme setting, or a table's own from Theme in its ⋯ menu. Off: tables look as SilverBullet shows them.",
              ui = { category = "Silverware Table: Modules", label = "Themes", priority = 6.7 },
            },
            theme = {
              type = "string",
              default = "native",
              description = "The theme of every table (a table's ⋯ menu can choose another for it). Built in: native (SilverBullet's look), plain, playground, minimal, slate, grid, ocean, paper, contrast, compact, bold, soft, ledger; or the name of your own theme (see the library page, Themes).",
              ui = { category = "Silverware Table: Modules", label = "Theme", priority = 6.6 },
            },
            stripes = {
              type = "string",
              enum = { "none", "rows", "columns" },
              default = "rows",
              description = "Every other row (rows, as SilverBullet does) or column (columns) of a table is tinted, in its theme's color, or nothing (none). The icons in Theme in a table's ⋯ menu can choose otherwise for that table.",
              ui = { category = "Silverware Table: Modules", label = "Stripes", priority = 6.5 },
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
              description = "Copy, Cut and Paste in the cell menu; Ctrl+X cuts cells (they move where they are pasted); Ctrl+V pastes cells copied from a spreadsheet over the table, Ctrl+Shift+V as new rows. Off: a paste goes into the cell editor as text, no Cut or Paste in the cell menu (Copy and Ctrl+C stay, with the selection module).",
              ui = { category = "Silverware Table: Modules", label = "Copy, cut and paste", priority = 6 },
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
              description = "Copy as CSV and Copy as Markdown in a table's ⋯ menu: the whole table, its rows as shown.",
              ui = { category = "Silverware Table: Modules", label = "Export", priority = 5 },
            },
          },
        },
        excel = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "Export to Excel… in a table's ⋯ menu: copy for Excel (numbers and dates as Excel's values), or download an .xlsx file with the formulas.",
              ui = { category = "Silverware Table: Modules", label = "Excel", priority = 4.9 },
            },
            functions = {
              -- No default: an empty Lua table could read as a list
              type = "object",
              description = "How your custom functions are written in an Excel file: a template by the function's name, {1}, {2}… its arguments (VAT = \"ROUND(({1})*1.21,2)\"), or false: its cells as their values.",
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
              ui = { category = "Silverware Table: Modules", label = "Row and column handles", priority = 4 },
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
              ui = { category = "Silverware Table: Modules", label = "Long text in cells", priority = 3.45 },
            },
            overflow = {
              type = "string",
              enum = { "wrap", "ellipsis" },
              default = "wrap",
              description = "Text longer than a column's maximum width. wrap: it wraps onto more lines, up to the maximum cell height. ellipsis: it stays on one line, cut with …. A cell whose text is cut shows an expand button that shows it whole (F2 while editing it).",
              ui = { category = "Silverware Table: Modules", label = "Text that does not fit", priority = 3.4 },
            },
            maxWidth = {
              type = "number",
              default = 500,
              description = "A column's maximum width in pixels: longer text wraps or is cut (Long text in cells). 0: no limit, a cell is as wide as its text.",
              ui = { category = "Silverware Table: Modules", label = "Maximum column width (px)", priority = 3.3 },
            },
            maxHeight = {
              type = "number",
              default = 200,
              description = "A wrapped cell's maximum height in pixels; the rest is cut (the expand button shows it). 0: no limit.",
              ui = { category = "Silverware Table: Modules", label = "Maximum cell height (px)", priority = 3.2 },
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
              ui = { category = "Silverware Table: Modules", label = "Column widths", priority = 3.5 },
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
              ui = { category = "Silverware Table: Modules", label = "Sticky header", priority = 3 },
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
              ui = { category = "Silverware Table: Modules", label = "Middle-button scrolling", priority = 2 },
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
              ui = { category = "Silverware Table: Modules", label = "Large tables", priority = 1.9 },
            },
            minRows = {
              type = "number",
              default = 200,
              description = "A table with at least this many rows is a large table (Large tables).",
              ui = { category = "Silverware Table: Modules", label = "Large tables: applies from (rows)", priority = 1.8 },
            },
          },
        },
        fullScreen = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "An icon in a table's toolbar shows the table over the whole window (not the browser's full screen); the same icon or Esc closes it.",
              ui = { category = "Silverware Table: Modules", label = "Full screen", priority = 1.7 },
            },
          },
        },
        sheet = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "An icon in a table's toolbar shows the table as a spreadsheet over the whole window, with empty rows and columns past it: a value typed into one grows the table.",
              ui = { category = "Silverware Table: Modules", label = "Sheet view", priority = 1.75 },
            },
          },
        },
        tableLabels = {
          type = "object",
          additionalProperties = false,
          properties = {
            enabled = {
              type = "boolean",
              default = true,
              description = "A named table shows its name in a small tab at its top right corner, in the page and on the sheet, while it is not hovered.",
              ui = { category = "Silverware Table: Modules", label = "Table labels", priority = 1.8 },
            },
          },
        },
      },
    },
  },
})

-- Silverware Table only uses the public editor and config API, handed over here
if js and js.window then
  local silverwareTableJs = js.importFromSpace("Library/damesene/silverware-table.js")
  silverwareTableJs.init({
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
    readPage = space.readPage,
    writePage = space.writePage,
    -- Tables Silverware Table draws itself (the sheet): cells rendered as SilverBullet's
    -- tables render them, `${…}` evaluated; their links followed by SilverBullet
    markdownToHtml = function(text)
      return markdown.markdownToHtml(text, { expand = true })
    end,
    navigate = editor.navigate,
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
        editor.flashNotification("Silverware Table: the settings are saved in CONFIG, but loading them failed (" .. tostring(err) .. "): reload the page", "error")
      end
    end,
    reloadUI = editor.reloadUI,
  })
  -- Another page in the editor: edits held for the page left (lazy saving) go into its file
  event.listen {
    name = "editor:pageLoaded",
    run = function()
      silverwareTableJs.pageLoaded()
    end,
  }
  -- Once the page is re-indexed, `${…}` cells show results from the new index
  event.listen {
    name = "page:index",
    run = function(e)
      silverwareTableJs.pageIndexed(e.data.name)
    end,
  }
  command.define {
    name = "Silverware Table: Settings",
    run = function()
      silverwareTableJs.openSettings()
    end,
  }
  command.define {
    name = "Silverware Table: Remove table metadata",
    run = function()
      silverwareTableJs.removeAllMetadata()
    end,
  }
end
```

```space-style
.sb-table-widget.swt-table td {
  cursor: text;
}
/* Select mode (Edit mode off): a click selects a cell, so the default pointer;
   on the cell selected alone the next click edits it, so the text cursor */
body.swt-select-mode .sb-table-widget.swt-table td {
  cursor: default;
}
body.swt-select-mode .sb-table-widget.swt-table td.swt-selected-alone {
  cursor: text;
}
/* An empty row is as tall as a row with text (zero-width space, not in the text) */
.sb-table-widget.swt-table td:not(.swt-editing)::before {
  content: "\200b";
}
/* An empty column stays wide enough to click into */
.sb-table-widget.swt-table td {
  min-width: 4em;
}
.sb-table-widget.swt-table td a,
.sb-table-widget.swt-table td button,
.sb-table-widget.swt-table td input[type="checkbox"] {
  cursor: pointer;
}

/* Offer to name unnamed columns, which SilverBullet does not render */
.swt-notice {
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
.swt-notice button {
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
.sb-table-widget.swt-table thead tr:first-child > td {
  white-space: nowrap;
}
.sb-table-widget.swt-table .swt-head {
  display: inline-flex;
  align-items: center;
  vertical-align: top;
}
.sb-table-widget.swt-table .swt-head-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.sb-table-widget.swt-table .swt-head > .swt-ui {
  flex: none;
}
/* Sort control: shown on header hover, always while it sorts */
.swt-sort {
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
.sb-table-widget.swt-table thead tr:hover .swt-sort {
  opacity: 0.5;
}
/* A touch screen has no hover to show it on: always shown there, faint
   (lighter than a column type's icon, so the two do not compete) */
@media (hover: none) {
  .sb-table-widget.swt-table thead tr .swt-sort:not(.swt-active) {
    opacity: 0.3;
  }
  /* A long press opens the cell menu: not the system's text selection and callout */
  .sb-table-widget.swt-table td:not(.swt-editing) {
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }
}
.sb-table-widget.swt-table thead tr .swt-sort:hover,
.sb-table-widget.swt-table thead tr .swt-sort.swt-active {
  opacity: 1;
}
.sb-table-widget .swt-hidden,
.sb-table-widget tr.swt-meta-row {
  display: none !important;
}

/* A table that fits its width, without a maximum height (the script sets
   swt-sticky-native): its box is clipped, not scrolled, so it captures no
   sticky positioning, and the header (with the rows pinned to the top) and the
   rows pinned to the bottom stick to the page, moved by the browser itself
   (smooth on a phone too). The gap above the header is STICKY_GAP in the
   script; keep both in step. */
.sb-table-widget.swt-table.swt-sticky-native {
  overflow: clip !important;
}
.sb-table-widget.swt-sticky-native thead,
.sb-table-widget.swt-sticky-native thead.swt-stuck {
  position: sticky;
  /* STICKY_GAP, less for a table nearer the page's top (the script: --swt-sticky-top) */
  top: var(--swt-sticky-top, 66px);
  z-index: 3;
}
.sb-table-widget.swt-sticky-native tfoot,
.sb-table-widget.swt-sticky-native tfoot.swt-stuck {
  position: sticky;
  /* The view's bottom: less the scrolling box's bottom padding, which sticky positioning leaves out (the script:
     --swt-sticky-bottom; SilverBullet's scroller has 360px) */
  bottom: var(--swt-sticky-bottom, 0px);
  z-index: 3;
}
/* A table laid over the window (full screen, swt-sticky-box): it scrolls in
   its own box only, which captures the sticky positioning: the header held
   STICKY_GAP below the box's top (room for the toolbar), the bottom rows at
   its bottom, moved by the browser */
.sb-table-widget.swt-sticky-box thead,
.sb-table-widget.swt-sticky-box thead.swt-stuck {
  position: sticky;
  top: 66px;
  z-index: 3;
}
.sb-table-widget.swt-sticky-box tfoot,
.sb-table-widget.swt-sticky-box tfoot.swt-stuck {
  position: sticky;
  bottom: 0;
  z-index: 3;
}
/* The room above a held header (STICKY_GAP) covered in the page's color: a
   band above each of the header's top cells (positioned: relative, or sticky
   where pinned), under the cell's own content (the columns' letters) as it is
   behind it in the header's stacking context (z-index 3). Not a shadow of the
   cells: a theme collapsing the table's borders (border-collapse: collapse)
   has the browser paint no cell's box-shadow, and rows showed there. Only the
   top row has it: from the filter row it would cover the header row. */
.sb-table-widget.swt-sticky-box thead tr:first-child > td::after,
.sb-table-widget thead.swt-stuck tr:first-child > td::after {
  content: "";
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: 100%;
  height: 66px;
  background: var(--root-background-color, #fff);
  pointer-events: none;
  z-index: -1;
}
/* Its header opaque, and the room above it covered, at all times: the browser
   holds the header at once while the script marks it held (swt-stuck) only a
   frame later, so a fast scroll showed rows there.
   (:where: a selected or edited header cell's own marks still win.) */
.sb-table-widget.swt-sticky-box :where(thead td) {
  background: linear-gradient(
      var(--editor-table-head-background-color, transparent),
      var(--editor-table-head-background-color, transparent)
    ),
    var(--root-background-color, #fff);
}

/* Header held at the top of the view while the table scrolls past (moved by
   script, or by the browser with swt-sticky-native) */
.sb-table-widget thead.swt-stuck {
  /* above the rows it is moved over */
  position: relative;
  z-index: 3;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.25));
}
/* The header color may be see-through (dark theme): lay it over the page color
   (the gap above it is covered by the band above) */
.sb-table-widget thead.swt-stuck td {
  background: linear-gradient(
      var(--editor-table-head-background-color, transparent),
      var(--editor-table-head-background-color, transparent)
    ),
    var(--root-background-color, #fff);
}

/* Pinned rows and columns stay in view (moved there by script); they need an
   opaque background over the rows and columns scrolling under them.
   SilverBullet clips tables with overflow: hidden, which would make the table
   the box sticky columns stick in; clip cuts the same without that. */
.sb-table-widget.swt-table table {
  overflow: clip !important;
}
.sb-table-widget tfoot.swt-stuck {
  position: relative;
  z-index: 3;
  filter: drop-shadow(0 -2px 3px rgba(0, 0, 0, 0.25));
}
.sb-table-widget tfoot.swt-stuck td {
  background: var(--root-background-color, #fff);
}
.sb-table-widget td.swt-pin-left,
.sb-table-widget td.swt-pin-right {
  position: sticky;
  z-index: 1;
  background: var(--root-background-color, #fff);
}
.sb-table-widget tbody tr:nth-of-type(even) td.swt-pin-left,
.sb-table-widget tbody tr:nth-of-type(even) td.swt-pin-right {
  background: linear-gradient(
      var(--editor-table-even-background-color, transparent),
      var(--editor-table-even-background-color, transparent)
    ),
    var(--root-background-color, #fff);
}
.sb-table-widget thead td.swt-pin-left,
.sb-table-widget thead td.swt-pin-right {
  background: linear-gradient(
      var(--editor-table-head-background-color, transparent),
      var(--editor-table-head-background-color, transparent)
    ),
    var(--root-background-color, #fff);
}
/* Pinned rows and the body cells of pinned columns: a light tint of the accent
   color, so they show apart from the rows and columns that scroll (still
   opaque, over the page color; a selected or edited cell's tint, an inset
   shadow, shows over it) */
.sb-table-widget.swt-table {
  --swt-pinned-tint: color-mix(in srgb, var(--ui-accent-color, #464cfc) 12%, transparent);
}
.sb-table-widget.swt-table :is(tbody, tfoot) td:is(.swt-pin-left, .swt-pin-right),
.sb-table-widget.swt-table :is(thead, tfoot) tr[data-swt-row] > td {
  background: linear-gradient(var(--swt-pinned-tint), var(--swt-pinned-tint)), var(--root-background-color, #fff);
}
.sb-table-widget.swt-table tbody tr:nth-of-type(even) td:is(.swt-pin-left, .swt-pin-right) {
  background: linear-gradient(var(--swt-pinned-tint), var(--swt-pinned-tint)),
    linear-gradient(var(--editor-table-even-background-color, transparent), var(--editor-table-even-background-color, transparent)),
    var(--root-background-color, #fff);
}
.sb-table-widget td.swt-pin-left.swt-pin-edge {
  box-shadow: 3px 0 4px -2px rgba(0, 0, 0, 0.3);
}
.sb-table-widget td.swt-pin-right.swt-pin-edge {
  box-shadow: -3px 0 4px -2px rgba(0, 0, 0, 0.3);
}

/* The pin icon on pinned rows (first cell) and columns (header): at the
   cell's right edge, out of the layout, so no text moves when pinning */
.sb-table-widget td:has(> .swt-pin-mark) {
  position: relative;
}
.sb-table-widget td.swt-pin-left:has(> .swt-pin-mark),
.sb-table-widget td.swt-pin-right:has(> .swt-pin-mark) {
  position: sticky;
}
.swt-pin-mark {
  position: absolute;
  top: 50%;
  right: 2px;
  display: inline-flex;
  transform: translateY(-50%);
  opacity: 0.8;
}
.swt-pin-mark svg {
  width: 14px;
  height: 14px;
}
/* In a header the name ends in the sort control: the pin icon gets its own
   room there instead of covering it (SilverBullet's header padding is 8px) */
.sb-table-widget thead tr:first-child > td:has(> .swt-pin-mark) {
  padding-right: 22px !important;
}

/* Ctrl held in a cell editor: arrows move between cells */
/* Ctrl held in a cell editor: the move cursor on the cell under the pointer
   (a class on that cell only: one on an ancestor of every cell made the
   browser recalculate the whole page's style on every press of Ctrl) */
.sb-table-widget.swt-table.swt-navigating-here,
.sb-table-widget.swt-table :is(td, th).swt-navigating-here,
.sb-table-widget.swt-table :is(td, th).swt-navigating-here * {
  cursor: move !important;
}

/* Inline editing: the field takes the text's place and size; the cell is
   highlighted as selected cells are. The tint is an inset shadow over the
   cell's background, not a background color: a pinned cell, or one of a
   header held at the top, keeps its opaque background, so the rows and
   columns scrolling under it do not show through */
.sb-table-widget td.swt-editing {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.swt-cell-editor {
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
.sb-table-widget.swt-table .swt-cell-content {
  display: inline-block;
  vertical-align: top;
  width: max-content;
}

/* A table over the whole window (core/overwindow.ts: the fullScreen module, the
   sheet view): the table's box over the window, under
   Silverware Table's controls (toolbar, grips, menus: z-index 49 and up) and SilverBullet's
   dialogs, over its page and top bar; the Maximum table height (set inline) does not apply */
.sb-table-widget.swt-over-window {
  position: fixed !important;
  inset: 0;
  z-index: 45;
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  max-height: none !important;
  margin: 0;
  /* Room only where Silverware Table's controls need it: left of the rows (the +,
     the grips) and above the header (the toolbar). At the left a border, not
     padding: a border does not scroll away with the table. At the top the
     table's margin, as high as the header is held below the box's top
     (STICKY_GAP, swt-sticky-box); rows scrolled into it are covered by the
     held header's shadow in the page's color. */
  padding: 0;
  border: 0;
  border-left: 28px solid var(--root-background-color, #fff);
  overflow: auto;
  background: var(--root-background-color, #fff);
}
.sb-table-widget.swt-over-window > table {
  margin-top: 66px;
}
/* A table Silverware Table draws itself (the sheet: core/silverbullet/drawn.ts),
   outside SilverBullet's editor: SilverBullet's own rules for its tables
   (#sb-main .cm-editor) do not reach it, so they are said again here */
.sb-table-widget.swt-drawn {
  display: inline-block;
  vertical-align: top;
  font-family: var(--editor-font);
  font-weight: normal;
  border-radius: 4px 4px 0 0;
}
.sb-table-widget.swt-drawn table {
  width: 100%;
  border-spacing: 0;
  border-radius: 4px 4px 0 0;
}
.sb-table-widget.swt-drawn thead tr {
  font-weight: bold;
}
.sb-table-widget.swt-drawn thead tr td {
  padding: 11px 8px;
}
.sb-table-widget.swt-drawn td {
  padding: 8px;
  white-space: nowrap;
}
.sb-table-widget.swt-drawn .sb-table-align-left {
  text-align: left;
}
.sb-table-widget.swt-drawn .sb-table-align-right {
  text-align: right;
}
.sb-table-widget.swt-drawn .sb-table-align-center {
  text-align: center;
}
/* Full screen keeps the same room right of the table: else the table ends at the
   window's edge, the + of a new column is pushed back over the toolbar and its
   line drawn on the edge (the sheet view shows its empty columns there) */
.sb-table-widget.swt-over-window.swt-fullscreen {
  border-right: 28px solid var(--root-background-color, #fff);
}
/* The columns' letters above the header and the rows' numbers left of the
   rows, in that room (as formulas count them). Shown over the window only. The
   table lets them out of its box (it is clipped in the page), each header cell
   holds its letter (a pinned one is sticky, which holds it too). */
.sb-table-widget .swt-col-letter {
  display: none;
}
.sb-table-widget.swt-over-window.swt-table > table {
  overflow: visible !important;
}
.sb-table-widget.swt-over-window thead tr:first-child > td:not(.swt-pin-left):not(.swt-pin-right) {
  position: relative;
}
.sb-table-widget.swt-over-window .swt-col-letter {
  display: block;
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 22px;
  line-height: 22px;
  text-align: center;
  font: 12px/22px var(--ui-font, system-ui, sans-serif);
  font-weight: normal;
  font-variant-numeric: tabular-nums;
  color: var(--root-color, #333);
  opacity: 0.5;
  pointer-events: none;
}
.swt-floating.swt-over-window-rows {
  z-index: 46;
  left: 0;
  width: 28px;
  overflow: hidden;
  pointer-events: none;
  display: block !important;
}
.swt-floating.swt-over-window-rows:not(.swt-visible) {
  display: none !important;
}
.swt-floating.swt-over-window-rows.swt-at-right {
  left: auto;
  right: 0;
}
.swt-over-window-rows > span {
  position: absolute;
  left: 0;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font: 11px var(--ui-font, system-ui, sans-serif);
  font-variant-numeric: tabular-nums;
  color: var(--root-color, #333);
  opacity: 0.5;
}
.swt-over-window-rows.swt-at-right > span {
  left: 2px;
  right: 0;
  justify-content: flex-start;
}
.swt-over-window-rows > span[hidden] {
  display: none;
}

/* The sheet module (core/silverbullet/modules/sheet.ts): the board, one box
   over the window holding the sheet's tables (drawn by the module), each at
   its place, on a grid of rows of one height (--swt-sheet-row) and the
   sheet's columns' widths. The room for the letters (above) and the numbers
   (beside) is the box's border: it does not scroll away. The rows' lines are
   a gradient, the columns' (their widths differ) elements. The empty cell
   selected or edited is a td laid over its place. */
.swt-sheet-board {
  --swt-sheet-line: var(--swt-border, color-mix(in srgb, currentColor 14%, transparent));
  position: fixed;
  inset: 0;
  z-index: 45;
  box-sizing: border-box;
  border-left: 28px solid var(--root-background-color, #fff);
  border-top: 66px solid var(--root-background-color, #fff);
  /* The room for the sheets' tabs (TABS_ROOM) */
  border-bottom: 30px solid var(--root-background-color, #fff);
  overflow: auto;
  background: var(--root-background-color, #fff);
  color: var(--root-color, #333);
}
.swt-sheet-board:focus {
  outline: none;
}
.swt-sheet-content {
  position: relative;
  cursor: cell;
  background-image: linear-gradient(to bottom, transparent calc(var(--swt-sheet-row) - 1px), var(--swt-sheet-line) 0);
  background-size: 100% var(--swt-sheet-row);
}
.swt-sheet-column-lines > div {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--swt-sheet-line);
  pointer-events: none;
}
.swt-sheet-column-lines > div[hidden] {
  display: none;
}
/* A table on the board: at its place, as wide as the sheet's columns it takes;
   it scrolls with the board. Its box is clipped, not scrolled (overflow: clip),
   so it captures no sticky positioning: its header with the rows pinned to the
   top, its rows pinned to the bottom and its pinned columns are held at the
   board's edges while the table is in view, never past the table */
.sb-table-widget.swt-table.swt-sheet-table {
  position: absolute;
  display: block;
  overflow: clip !important;
  max-height: none !important;
  cursor: auto;
  /* A light line round it, stronger than the grid's: where the table ends among the empty cells (a shadow: its box
     clips what is in it, not what is drawn round it) */
  box-shadow: 0 0 0 1px var(--swt-sheet-table-line, color-mix(in srgb, currentColor 40%, transparent));
}
/* Held by the browser against the board (its scrolling box, under the letters' room, right of the numbers'):
   the header with the rows pinned to the top at its top (not STICKY_GAP below it: the toolbar has the room above),
   the rows pinned to the bottom at its bottom, pinned columns at its sides (their offsets the core's) */
/* A table drawn anew, until it is laid out: the copy of what it replaced shows in its place (presses go through
   to the table, unseen under it) */
.sb-table-widget.swt-stand-in {
  pointer-events: none;
}
.sb-table-widget.swt-stand-in + .sb-table-widget.swt-sheet-table {
  opacity: 0;
}
.sb-table-widget.swt-table.swt-sheet-table :is(thead, thead.swt-stuck) {
  position: sticky !important;
  top: 0 !important;
  transform: none !important;
  z-index: 3;
}
.sb-table-widget.swt-table.swt-sheet-table :is(tfoot, tfoot.swt-stuck) {
  position: sticky !important;
  bottom: 0 !important;
  transform: none !important;
  z-index: 3;
}
.sb-table-widget.swt-sheet-table table {
  border-spacing: 0;
}
.sb-table-widget.swt-sheet-table tr > td {
  box-sizing: border-box;
  height: var(--swt-sheet-row);
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
/* The cell is not clipped itself (what sits on its edges stays reachable: the
   fill handle, the pin mark, the selection's handles); its content is, at the
   cell's width (not as wide as its text: the sheet's columns have theirs) and
   the row's height: on one line cut with an ellipsis, or wrapped and cut at the
   row's height (the longText module's wrap) */
.sb-table-widget.swt-sheet-table tr > td > .swt-cell-content {
  display: block;
  box-sizing: border-box;
  width: auto;
  max-width: none;
  max-height: var(--swt-sheet-row);
  /* Room above and below the line, the same (the text stays in the row's middle): what is drawn under the text, a
     formula result's underline, is within the box its overflow clips to */
  padding-block: 0.35em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-table-widget.swt-sheet-table.swt-cells-wrap tr > td > .swt-cell-content {
  white-space: normal;
  overflow-wrap: anywhere;
  text-overflow: clip;
}
/* A header at its cell's width: its name cut with an ellipsis, its icons after it */
.sb-table-widget.swt-sheet-table .swt-head {
  display: flex;
  max-width: 100%;
}
.sb-table-widget.swt-sheet-table .swt-head-name {
  text-overflow: ellipsis;
}
/* The sheet's rows have their height: no zero-width space keeps an empty one tall, which before a block (the content
   above) would be a line of its own and push the content to the row's bottom */
.sb-table-widget.swt-sheet-table.swt-table td:not(.swt-editing)::before {
  content: none;
}
.swt-sheet-content > td.swt-sheet-cell {
  position: absolute;
  z-index: 1;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  padding: 0 6px;
  background: var(--root-background-color, #fff);
  box-shadow: inset 0 0 0 2px var(--ui-accent-color, #3b82f6);
}
.swt-floating.swt-sheet-letters {
  z-index: 46;
  overflow: hidden;
  background: var(--root-background-color, #fff);
  pointer-events: none;
  display: block !important;
}
.swt-floating.swt-sheet-letters:not(.swt-visible) {
  display: none !important;
}
.swt-sheet-letters > span {
  position: absolute;
  bottom: 0;
  height: 22px;
  text-align: center;
  font: 12px/22px var(--ui-font, system-ui, sans-serif);
  font-variant-numeric: tabular-nums;
  color: var(--root-color, #333);
  opacity: 0.5;
}
.swt-sheet-letters > span[hidden] {
  display: none;
}
/* A column's letter's right edge: dragged, the column's width (a table there or none); a line under the pointer */
.swt-sheet-letters > span > .swt-sheet-width {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  pointer-events: auto;
}
.swt-sheet-letters > span > .swt-sheet-width:hover,
.swt-sheet-letters > span > .swt-sheet-width.swt-active {
  background: linear-gradient(var(--ui-accent-color), var(--ui-accent-color)) center / 2px 100% no-repeat;
}
/* A letter's edge lit: its letter whole */
.swt-sheet-letters > span:has(> .swt-sheet-width:is(:hover, .swt-active)) {
  opacity: 1;
}
/* Off for a finger, as a table's width handles are */
@media (pointer: coarse) {
  .swt-sheet-letters > span > .swt-sheet-width {
    display: none;
  }
}
.swt-floating.swt-sheet-numbers {
  background: var(--root-background-color, #fff);
}
/* The page's sheets, one tab each, at the board's bottom (as a spreadsheet's): the one shown marked, + a new one */
.swt-floating.swt-sheet-tabs {
  z-index: 46;
  display: flex !important;
  align-items: stretch;
  gap: 2px;
  box-sizing: border-box;
  padding: 0 8px 4px 28px;
  overflow-x: auto;
  background: var(--root-background-color, #fff);
  border-top: 1px solid var(--swt-border, color-mix(in srgb, currentColor 14%, transparent));
  font: 12px var(--ui-font, system-ui, sans-serif);
  color: var(--root-color, #333);
}
.swt-floating.swt-sheet-tabs:not(.swt-visible) {
  display: none !important;
}
.swt-sheet-tabs > button {
  display: inline-flex;
  flex: none;
  align-items: center;
  padding: 0 12px;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 0 0 6px 6px;
  opacity: 0.7;
  cursor: pointer;
}
.swt-sheet-tabs > button.swt-sheet-tab {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.swt-sheet-tabs > button:hover,
.swt-sheet-tabs > button:focus-visible,
.swt-sheet-tabs > button.swt-active {
  opacity: 1;
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
  outline: none;
}
.swt-sheet-tabs > .swt-sheet-tab[aria-selected="true"] {
  font-weight: 600;
  color: var(--ui-accent-color);
  opacity: 1;
  box-shadow: inset 0 2px 0 var(--ui-accent-color);
}
.swt-sheet-tabs > .swt-sheet-tab.swt-muted {
  font-style: italic;
}
.swt-sheet-tabs > .swt-sheet-tab-add {
  padding: 0 8px;
}
.swt-sheet-tabs > .swt-sheet-tab-add svg {
  width: 14px;
  height: 14px;
}
.swt-sheet-tabs > .swt-sheet-tab-add[aria-disabled="true"] {
  opacity: 0.3;
  cursor: default;
}

/* CodeMirror's scroller is a stacking context (z-index 0) under SilverBullet's
   top bar (z-index 20): lifted over it while it holds a table shown so */
.cm-scroller:has(.sb-table-widget.swt-over-window) {
  z-index: 30 !important;
}
/* The largeTables module: a large table scrolls in its own box, at most the
   window's height (the Maximum table height setting, set inline, wins); the
   empty rows standing in for the rows out of the document take no room but their height */
.sb-table-widget.swt-large-table {
  max-height: calc(100vh - 120px);
  max-height: calc(100dvh - 120px);
  overflow: auto;
}
.sb-table-widget tr.swt-large-spacer > td {
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
}

/* The longText module (silverware.table.modules.longText): only on the tables it
   marks swt-long-text. The box, and a header's line, at most the maximum width
   (--swt-cell-max-width, set by the script); longer text wraps (swt-cells-wrap:
   up to the maximum height, the rest cut and faded) or is cut with an ellipsis
   (swt-cells-ellipsis); a header's name, or the text of a column with a width
   set, cut with an ellipsis. Off: none of this, cells as SilverBullet shows them. */
.sb-table-widget.swt-long-text .swt-cell-content,
.sb-table-widget.swt-long-text .swt-head {
  max-width: var(--swt-cell-max-width, none);
}
.sb-table-widget.swt-long-text .swt-head-name,
.sb-table-widget.swt-long-text td.swt-sized > .swt-cell-content {
  text-overflow: ellipsis;
}
/* SilverBullet keeps cells on one line (white-space: nowrap): the box wraps */
.sb-table-widget.swt-cells-wrap .swt-cell-content {
  white-space: normal;
  overflow-wrap: anywhere;
  max-height: var(--swt-cell-max-height, none);
  overflow: hidden;
}
.sb-table-widget.swt-cells-wrap td.swt-cut .swt-cell-content {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 1.4em), transparent);
}
.sb-table-widget.swt-cells-ellipsis .swt-cell-content {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* A meter (#progress, or a custom type's { text, meter }): a bar filled to its share in the text's color (as a
   rating's full stars are); its text (the percentage) in a small box over the middle, in the page's own colors, so it
   reads whatever the theme, its type smaller than the bar is high */
.swt-meter {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 6em;
  max-width: 100%;
  height: 1em;
  vertical-align: middle;
  overflow: hidden;
  border-radius: 0.25em;
  background: color-mix(in srgb, currentColor 14%, transparent);
}
.swt-meter-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: currentColor;
}
.swt-meter-text {
  position: relative;
  padding: 0 0.35em;
  font-size: 0.6em;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--root-color, #222);
  background: var(--root-background-color, #fff);
  border-radius: 0.2em;
}
/* A named table's tab (the tableLabels module): its name on a quiet tint of the page's text color at its top right corner, above it, or in
   its header's corner where the view leaves no room above (swt-inside); over the sheet's board, under the controls;
   it takes no presses */
.swt-floating.swt-table-label {
  z-index: 47;
  box-sizing: border-box;
  height: 18px;
  padding: 1px 7px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: color-mix(in srgb, var(--root-color, #222) 70%, transparent);
  background: color-mix(in srgb, var(--root-color, #222) 9%, var(--root-background-color, #fff));
  border-radius: 5px 5px 0 0;
  pointer-events: none;
}
.swt-floating.swt-table-label.swt-visible {
  display: block !important;
}
.swt-floating.swt-table-label.swt-inside {
  border-radius: 0 0 0 5px;
  opacity: 0.9;
}

/* The expand button of a cell whose text does not fit: opens its popup */
.swt-expand {
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
.swt-expand:hover {
  color: var(--ui-accent-color);
  opacity: 1;
}
.swt-expand svg {
  width: 12px;
  height: 12px;
}
/* The widths module: a handle on a header cell's right edge sets the column's
   width (a line shows on it while hovered or dragged) */
.sb-table-widget.swt-table thead tr:first-child > td:not(.swt-pin-left):not(.swt-pin-right) {
  position: relative;
}
.sb-table-widget .swt-col-resize {
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
.sb-table-widget .swt-col-resize::after {
  content: "";
  position: absolute;
  top: 20%;
  bottom: 20%;
  right: 0;
  width: 2px;
  border-radius: 1px;
}
.sb-table-widget .swt-col-resize:hover::after,
.sb-table-widget .swt-col-resize.swt-active::after {
  background: var(--ui-accent-color);
}
/* While its header cell is hovered, selected or edited: quiet (a grey dashed
   line) until the pointer is on it, as the quiet + */
@media not (pointer: coarse) {
  .sb-table-widget.swt-table thead tr:first-child > td:is(:hover, .swt-selected, .swt-editing) > .swt-col-resize:not(:hover):not(.swt-active)::after {
    width: 0;
    background: none;
    border-right: 1px dashed color-mix(in srgb, var(--root-color) 45%, transparent);
  }
}
@media (pointer: coarse) {
  .sb-table-widget .swt-col-resize {
    pointer-events: none;
  }
}
body.swt-resizing,
body.swt-resizing * {
  cursor: col-resize !important;
  user-select: none;
}

/* A column with a width set: its cells' text never spills over (cut; with an
   ellipsis by the longText module) */
.sb-table-widget.swt-table td.swt-sized > .swt-cell-content {
  overflow: hidden;
}

/* The settings dialog (Silverware Table settings… in a table's ⋯ menu, "Silverware Table:
   Settings"): tabs, rows in cards (the name and what it does left, the control
   right), switches */
.swt-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--modal-backdrop-color, rgba(0, 0, 0, 0.35));
  font-family: var(--ui-font, system-ui, sans-serif);
}
.swt-settings {
  --swt-settings-line: var(--button-border-color, rgba(128, 128, 128, 0.3));
  --swt-settings-card: color-mix(in srgb, var(--root-color) 4%, var(--root-background-color));
  /* As tall as its content, as far as the window has room; then its body scrolls */
  display: flex;
  flex-direction: column;
  width: min(600px, calc(100vw - 24px));
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--swt-settings-line);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  font-size: 14px;
  overflow: hidden;
}
.swt-settings:focus {
  outline: none;
}
.swt-settings button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.swt-settings-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 16px 8px;
}
.swt-settings-titles {
  flex: 1;
  min-width: 0;
}
.swt-settings-title {
  margin: 0;
  font-size: 17px;
  line-height: 1.3;
}
.swt-settings-scope {
  margin: 2px 0 0;
  font-size: 12px;
  opacity: 0.65;
}
.swt-settings-close {
  display: inline-flex;
  padding: 5px;
  background: none;
  border: 0;
  border-radius: 6px;
  opacity: 0.65;
}
.swt-settings-close:hover {
  opacity: 1;
  background: var(--swt-settings-card);
}
.swt-settings-close svg {
  width: 16px;
  height: 16px;
}
/* One row however many tabs: too wide for the dialog (a phone), it scrolls sideways */
.swt-settings-tabs {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  gap: 2px;
  padding: 0 12px;
  border-bottom: 1px solid var(--swt-settings-line);
}
.swt-settings-tab {
  flex: none;
  white-space: nowrap;
  padding: 7px 10px;
  margin-bottom: -1px;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  opacity: 0.7;
}
.swt-settings-tab:hover {
  opacity: 1;
}
.swt-settings-tab[aria-selected="true"] {
  opacity: 1;
  font-weight: 600;
  border-bottom-color: var(--ui-accent-color);
}
.swt-settings-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 12px;
}
.swt-settings-panel[hidden] {
  display: none;
}
.swt-settings-group {
  margin: 14px 2px 6px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
}
.swt-settings-panel > .swt-settings-card:first-child {
  margin-top: 12px;
}
.swt-settings-card {
  background: var(--swt-settings-card);
  border: 1px solid var(--swt-settings-line);
  border-radius: 8px;
}
.swt-settings-card > :not(:first-child) {
  border-top: 1px solid var(--swt-settings-line);
}
.swt-settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
}
.swt-settings-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.swt-settings-module-name,
.swt-settings-name {
  font-weight: 500;
}
.swt-settings-hint {
  font-size: 12px;
  line-height: 1.35;
  opacity: 0.62;
}
.swt-settings-row select,
.swt-settings-row input[type="number"] {
  flex: none;
  font: inherit;
  color: inherit;
  background: var(--root-background-color);
  border: 1px solid var(--swt-settings-line);
  border-radius: 6px;
  padding: 4px 8px;
}
.swt-settings-row select {
  max-width: 55%;
}
.swt-settings-row input[type="number"] {
  width: 6.5em;
}
.swt-settings-row input.swt-settings-invalid {
  border-color: var(--danger-color, #c62828);
}
/* A switch: the checkbox (invisible, still focusable) drawn as a track and a knob */
.swt-settings-switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
}
.swt-settings-switch input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.swt-settings-knob {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--root-color) 22%, var(--root-background-color));
  transition: background 0.15s;
  pointer-events: none;
}
.swt-settings-knob::after {
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
.swt-settings-switch input:checked + .swt-settings-knob {
  background: var(--ui-accent-color);
}
.swt-settings-switch input:checked + .swt-settings-knob::after {
  transform: translateX(14px);
}
.swt-settings-switch input:focus-visible + .swt-settings-knob {
  outline: 2px solid var(--ui-accent-color);
  outline-offset: 2px;
}
.swt-settings-switch input:disabled + .swt-settings-knob {
  opacity: 0.5;
}
/* A module's own settings: under it, indented, while it is on */
.swt-settings-module-settings {
  margin: 0 12px 10px 24px;
  border-left: 2px solid var(--swt-settings-line);
}
.swt-settings-module-settings .swt-settings-row {
  padding: 6px 0 6px 12px;
}
.swt-settings-module-settings[hidden] {
  display: none;
}
.swt-settings-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--swt-settings-line);
}
.swt-settings-note {
  flex: 1;
  font-size: 12px;
  opacity: 0.75;
}
.swt-settings-cancel,
.swt-settings-save {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--swt-settings-line);
  background: var(--root-background-color);
}
.swt-settings-save {
  color: #fff !important;
  background: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
}
.swt-settings-save:disabled {
  opacity: 0.45;
  cursor: default;
}
/* A feature's dialog (the Functions dialog): as the settings dialog looks */
.swt-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--modal-backdrop-color, rgba(0, 0, 0, 0.35));
  font-family: var(--ui-font, system-ui, sans-serif);
}
.swt-dialog {
  --swt-dialog-line: var(--button-border-color, rgba(128, 128, 128, 0.3));
  --swt-dialog-card: color-mix(in srgb, var(--root-color) 4%, var(--root-background-color));
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 24px));
  max-height: calc(100vh - 32px);
  max-height: calc(100dvh - 32px);
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--swt-dialog-line);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
  font-size: 14px;
  overflow: hidden;
}
.swt-dialog:focus {
  outline: none;
}
.swt-dialog button {
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.swt-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 16px 8px;
}
.swt-dialog-titles {
  flex: 1;
  min-width: 0;
}
.swt-dialog-title {
  margin: 0;
  font-size: 17px;
  line-height: 1.3;
}
.swt-dialog-subtitle {
  margin: 2px 0 0;
  overflow: hidden;
  font-family: var(--editor-font, monospace);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.65;
}
.swt-dialog-close {
  display: inline-flex;
  padding: 5px;
  background: none;
  border: 0;
  border-radius: 6px;
  opacity: 0.65;
}
.swt-dialog-close:hover {
  opacity: 1;
  background: var(--swt-dialog-card);
}
.swt-dialog-close svg {
  width: 16px;
  height: 16px;
}
.swt-dialog-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 16px 12px;
}
.swt-dialog-foot {
  padding: 10px 16px 12px;
  border-top: 1px solid var(--swt-dialog-line);
}
.swt-dialog-button,
.swt-dialog-primary {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--swt-dialog-line);
  background: var(--root-background-color);
}
.swt-dialog-primary {
  color: #fff !important;
  background: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
}
.swt-dialog-primary:disabled {
  opacity: 0.45;
  cursor: default;
}
.swt-dialog-note {
  flex: 1;
  font-size: 12px;
  opacity: 0.75;
}
/* The Functions dialog: a search, the groups, the list beside the one picked */
.swt-functions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}
.swt-functions-search {
  padding: 7px 10px;
  font: inherit;
  color: inherit;
  background: var(--root-background-color);
  border: 1px solid var(--swt-dialog-line);
  border-radius: 6px;
}
.swt-functions-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.swt-functions-group {
  padding: 3px 10px;
  font-size: 13px !important;
  background: none;
  border: 1px solid var(--swt-dialog-line);
  border-radius: 999px;
}
.swt-functions-group[aria-pressed="true"] {
  color: #fff !important;
  background: var(--ui-accent-color);
  border-color: var(--ui-accent-color);
}
.swt-functions-main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 12px;
  height: min(340px, 50vh);
  min-height: 0;
}
.swt-functions-list {
  position: relative;
  overflow-y: auto;
  border: 1px solid var(--swt-dialog-line);
  border-radius: 6px;
}
.swt-functions-option {
  display: flex;
  flex-direction: column;
  padding: 5px 10px;
  cursor: pointer;
}
.swt-functions-option code {
  font-weight: 600;
}
.swt-functions-option span {
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0.7;
}
.swt-functions-option:hover {
  background: var(--swt-dialog-card);
}
.swt-functions-option[aria-selected="true"] {
  background: color-mix(in srgb, var(--ui-accent-color, #4a7cc7) 18%, transparent);
}
.swt-functions-none {
  margin: 10px;
  opacity: 0.7;
}
.swt-functions-detail {
  overflow-y: auto;
}
.swt-functions-name {
  margin: 0 0 6px;
  font-size: 15px;
}
.swt-functions-syntax {
  display: block;
  font-weight: 600;
  white-space: pre-wrap;
}
.swt-functions-description {
  margin: 8px 0;
  line-height: 1.45;
}
.swt-functions-example {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  background: var(--swt-dialog-card);
  border-radius: 6px;
}
.swt-functions-example code {
  white-space: pre-wrap;
}
.swt-functions-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
}
.swt-functions-group-name {
  margin: 8px 0 0;
  font-size: 12px;
  opacity: 0.6;
}
.swt-functions-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* The Excel dialog: the formulas written as values, each with its cell and why */
.swt-excel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.swt-excel-option {
  padding: 8px 10px;
  border: 1px solid var(--button-border-color);
  border-radius: 6px;
}
.swt-excel-option-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.swt-excel-option-title {
  margin: 0;
  font-size: 14px;
}
.swt-excel-option-text {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
.swt-excel-option-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
/* The file's name edited in place: text with a dashed line under it, as wide as it is, .xlsx right after it */
.swt-excel-file {
  display: flex;
  align-items: baseline;
  min-width: 0;
  font-size: 13px;
}
.swt-excel-file-label {
  margin-right: 4px;
  opacity: 0.75;
}
.swt-excel-file-input {
  /* As wide as its text where the browser can (else the size attribute set by script) */
  field-sizing: content;
  min-width: 1ch;
  max-width: 22em;
  padding: 0;
  font: inherit;
  color: inherit;
  background: none;
  border: none;
  border-bottom: 1px dashed currentColor;
  border-radius: 0;
  outline: none;
}
.swt-excel-file-input:focus {
  border-bottom-style: solid;
  border-bottom-color: var(--ui-accent-color, currentColor);
}
.swt-excel-formulas {
  margin-top: 8px;
  font-size: 13px;
}
.swt-excel-formulas-title {
  margin-bottom: 4px;
}
.swt-excel-ok {
  color: var(--swt-excel-ok, #2e7d32);
}
.swt-excel-error {
  color: var(--swt-excel-error, #c62828);
}
html[data-theme="dark"] .swt-excel-ok {
  color: var(--swt-excel-ok, #81c784);
}
html[data-theme="dark"] .swt-excel-error {
  color: var(--swt-excel-error, #ef9a9a);
}
.swt-excel-status:empty {
  display: none;
}
.swt-excel-skipped {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 30vh;
  overflow-y: auto;
  font-size: 13px;
}
.swt-excel-skipped-item {
  display: grid;
  grid-template-columns: 4em minmax(0, 1fr);
  column-gap: 8px;
}
.swt-excel-skipped-cell {
  grid-row: span 2;
  font-weight: 600;
}
.swt-excel-skipped-formula {
  overflow-wrap: anywhere;
}
.swt-excel-skipped-reason {
  opacity: 0.75;
}
.swt-excel-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
/* A phone: the dialog takes the screen, the list above the one picked, larger targets for a finger */
@media (max-width: 480px), (pointer: coarse) and (max-height: 600px) {
  .swt-dialog {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }
  .swt-dialog-body {
    flex: 1 1 auto;
  }
  .swt-functions {
    flex: 1 1 auto;
  }
  .swt-functions-search {
    font-size: 16px;
  }
  .swt-functions-main {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    flex: 1 1 auto;
    height: auto;
  }
  .swt-functions-detail {
    max-height: 40vh;
  }
  .swt-functions-option {
    padding: 9px 12px;
  }
  .swt-dialog-button,
  .swt-dialog-primary {
    padding: 10px 18px;
  }
}
/* A phone: the dialog takes the screen (the buttons always at its bottom), fields
   in 16px (no zoom on focus), larger targets for a finger */
@media (max-width: 480px), (pointer: coarse) and (max-height: 600px) {
  .swt-settings {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }
  .swt-settings-body {
    flex: 1 1 auto;
  }
  .swt-settings-tab {
    padding: 10px 12px;
  }
  .swt-settings-row {
    min-height: 44px;
  }
  .swt-settings-cancel,
  .swt-settings-save {
    padding: 10px 18px;
  }
  .swt-settings-row {
    flex-wrap: wrap;
  }
  .swt-settings-row select {
    max-width: 100%;
  }
  .swt-settings-row select,
  .swt-settings-row input[type="number"] {
    font-size: 16px;
  }
}

/* The cell's popup: its editor over the cell, the whole text wrapped */
.swt-floating.swt-cell-popup.swt-visible {
  display: block !important;
}
.swt-cell-popup {
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
.swt-cell-popup .swt-cell-popup-field {
  min-height: 1.5em;
  max-height: 50vh;
  overflow-y: auto;
  resize: none;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Filter row: a field per column; the one filtering is marked */
.sb-table-widget .swt-filter-row td {
  padding: 4px 6px !important;
  vertical-align: middle;
}
/* Its field gives the row its height: no empty line before it */
.sb-table-widget.swt-table .swt-filter-row td::before {
  content: none;
}
.swt-filter-box {
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
.swt-filter-box:focus-within {
  border-color: var(--ui-accent-color);
}
.swt-filter-active .swt-filter-box,
.swt-filter-popover.swt-filter-typed .swt-filter-box {
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--ui-accent-color) 60%, transparent);
}
.swt-filter-icon {
  display: inline-flex;
  flex: none;
  opacity: 0.45;
}
.swt-filter-active .swt-filter-icon {
  color: var(--ui-accent-color);
  opacity: 1;
}
.swt-filter-icon svg {
  width: 12px;
  height: 12px;
}
/* Fills its box without widening the column (the cell has a minimum width) */
.swt-filter {
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
.swt-filter::placeholder {
  color: inherit;
  opacity: 0.5;
}
/* An invalid regular expression: it filters nothing, the tooltip says why */
.swt-filter-box:has(.swt-filter.swt-invalid) {
  border-color: var(--danger-color, #c62828);
}
/* Clears the field: shown while it holds something (!important: see .swt-floating) */
.swt-filter-clear {
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
.swt-filter-typed .swt-filter-clear {
  display: inline-flex !important;
}
.swt-filter-clear:hover {
  opacity: 1;
  color: var(--ui-accent-color);
}
.swt-filter-clear svg {
  width: 12px;
  height: 12px;
}
/* In a filtered column's header (also while the filter row is hidden): opens its filter */
.swt-filter-mark {
  display: none;
  margin-left: 4px;
  color: var(--ui-accent-color);
  vertical-align: -2px;
  cursor: pointer;
}
.sb-table-widget.swt-table td.swt-filtered .swt-filter-mark {
  display: inline-flex;
}
.swt-filter-mark svg {
  width: 13px;
  height: 13px;
}
/* Under the field typed in, or a column's filter on its own: what the field
   understands, and a column's few values to tick */
.swt-filter-bubble.swt-visible {
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
.swt-filter-popover.swt-visible {
  min-width: 220px;
}
.swt-filter-popover .swt-filter-box {
  padding: 4px 6px;
  font-size: 13px;
}
/* A column's filter on its own: its field, and a × closing it beside */
.swt-filter-popover-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.swt-filter-popover-head .swt-filter-box {
  flex: 1;
  min-width: 0;
}
.swt-filter-close {
  display: inline-flex;
  flex: none;
  padding: 3px;
  color: inherit;
  opacity: 0.6;
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.swt-filter-close:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
}
.swt-filter-close svg {
  width: 14px;
  height: 14px;
}
.swt-filter-bubble-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.swt-filter-bubble-body:empty {
  display: none;
}
.swt-filter-hints {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.swt-filter-hint {
  padding: 1px 6px;
  font: inherit;
  color: inherit;
  background: none;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.swt-filter-hint:hover {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
}
.swt-filter-hint code {
  font-size: 11px;
  color: var(--ui-accent-color);
}
.swt-filter-values {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
  border-top: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  padding-top: 4px;
}
.swt-filter-value {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
}
.swt-filter-value:hover {
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
}
.swt-filter-value input {
  margin: 0;
  cursor: pointer;
}
.swt-filter-value-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.swt-filter-value-count {
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}
/* A toolbar chip's icon before its text (the filters') */
.swt-chip > svg {
  width: 12px;
  height: 12px;
  margin-right: 4px;
}

/* Floating controls. Shown and hidden with !important: themes may set display
   on every button with !important (grips and the + are buttons), which would
   leave them in view where they no longer act */
.swt-floating {
  position: fixed;
  z-index: 50;
  display: none !important;
  font-family: var(--ui-font, system-ui, sans-serif);
}
.swt-floating.swt-visible {
  display: flex !important;
}
/* Two boxes, each as wide as what it holds, at the toolbar's right edge: the
   names left of how the table is shown and the icons where both fit in the
   table's width (the toolbar's max-width, set as it is placed), else above
   them (both kept in the room above a held header, STICKY_GAP) */
.swt-bar {
  flex-flow: row wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 2px 4px;
  font-size: 12px;
  white-space: nowrap;
  color: var(--root-color);
}
/* Each of one height whatever it holds (a chip is taller than an icon): the
   two rows fit the room above a held header (STICKY_GAP) */
.swt-bar-names,
.swt-bar-main {
  flex: none;
  box-sizing: border-box;
  height: 24px;
  padding: 1px 2px;
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color, rgba(128, 128, 128, 0.4));
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.swt-bar button {
  padding: 2px 8px;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.swt-bar button:hover,
.swt-bar button[aria-pressed="true"] {
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
/* The toolbar's rows: the names (what holds the table, the table), then how it
   is shown and the icons */
.swt-bar-names,
.swt-bar-main {
  display: flex;
  align-items: center;
  gap: 2px;
}
.swt-bar-names {
  gap: 10px;
}
/* Between how the table is shown (at the left) and the icons (at the right) */
.swt-bar-gap {
  flex: 1;
}
.swt-bar-name-slot {
  display: inline-flex;
  align-items: center;
}
/* A name: the accent's, set; a stand-in for none (Table, No sheet) muted */
.swt-bar button.swt-bar-name {
  padding: 2px 4px;
  font-weight: 600;
  color: var(--ui-accent-color);
}
.swt-bar button.swt-bar-name.swt-muted {
  font-weight: normal;
  color: inherit;
  opacity: 0.55;
}
/* Something missing (a table shown as a sheet on none): in the danger color, in the toolbar and the ⋯ menu alike */
.swt-bar button.swt-bar-name.swt-attention,
.swt-menu-segmented .swt-label.swt-attention {
  font-weight: 600;
  color: var(--danger-color, #c62828);
  opacity: 1;
}
/* A long name cut, whole in its tooltip */
.swt-bar button.swt-bar-name {
  display: block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.swt-bar button.swt-bar-name.swt-active {
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
/* At the left, what the table is and how it is shown: its name, its sorting,
   its rows filtered; set off from the icons at the right */
.swt-bar .swt-bar-label {
  padding: 2px 6px;
  font-weight: 600;
  color: var(--ui-accent-color);
}
.swt-bar .swt-bar-label,
.swt-bar .swt-chip,
.swt-bar .swt-status {
  margin-right: 4px;
}
/* The ⋯ button while its menu is open */
.swt-bar button.swt-bar-more.swt-active {
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
/* Icon buttons (Recalculate, Filter, ⋯), highlighted when they ask to be used */
.swt-bar button.swt-bar-icon {
  display: inline-flex;
  align-items: center;
  padding: 3px 5px;
}
.swt-bar-icon svg {
  width: 14px;
  height: 14px;
}
.swt-bar button.swt-attention {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 16%, transparent);
}
/* A switch that is on and asks for attention (lazy saving with edits not saved
   yet): stronger than a switch that is only on, with a dot */
.swt-bar button.swt-attention[aria-pressed="true"] {
  position: relative;
  background: color-mix(in srgb, var(--ui-accent-color) 32%, transparent);
}
.swt-bar button.swt-attention[aria-pressed="true"]::after {
  content: "";
  position: absolute;
  top: 1px;
  right: 1px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ui-accent-color);
}

.swt-status {
  padding: 0 6px;
  font-weight: 600;
}
.swt-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 2px 1px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
}
.swt-bar .swt-chip-clear,
.swt-bar .swt-chip-apply {
  display: inline-flex;
  padding: 2px;
  border-radius: 3px;
}
.swt-bar .swt-chip-clear:hover,
.swt-bar .swt-chip-apply:hover {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.swt-chip-clear svg,
.swt-chip-apply svg {
  width: 12px;
  height: 12px;
}
/* The row and column grips: quiet bars until hovered (their size is set where
   they are placed); hovered, opaque, as they lie half over a cell */
.swt-handle {
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
/* The grip of a line selected: its click opens the line's menu */
.swt-handle.swt-line-selected {
  cursor: context-menu;
}
.swt-handle:hover,
.swt-handle.swt-active {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 18%, var(--root-background-color));
  /* A border that takes no room: set off from the tinted row (column) */
  box-shadow: 0 0 0 1px var(--ui-accent-color);
  opacity: 1;
}
.swt-handle.swt-no-drag {
  cursor: pointer;
}
.swt-handle svg {
  width: 10px;
  height: 10px;
}
.swt-grip-column svg {
  transform: rotate(90deg);
}
/* What the hovered grip acts on */
.sb-table-widget.swt-table .swt-handle-hover {
  box-shadow: inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 10%, transparent);
}
.swt-insert {
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
.swt-insert svg {
  width: 12px;
  height: 12px;
}
/* Under the last row while it is hovered, selected or edited: quiet (grey,
   see-through, a dashed outline) until the pointer is on it */
.swt-insert.swt-quiet:not(:hover) {
  box-sizing: border-box;
  color: color-mix(in srgb, var(--root-color) 45%, transparent);
  background: color-mix(in srgb, var(--root-color) 6%, transparent);
  border: 1px dashed color-mix(in srgb, var(--root-color) 40%, transparent);
  box-shadow: none;
}
/* The border a row (column) goes to: over the table, not taking the pointer */
.swt-insert-line {
  background: var(--ui-accent-color);
  pointer-events: none;
}

/* Row and column menus */
.swt-menu {
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
.swt-menu-title {
  /* No say in the menu's width: as wide as its items, a long title cut */
  contain: inline-size;
  display: grid;
  /* The back arrow | the title | its pencil | the ×: the sides keep room for the arrow and the ×, the title is cut first */
  grid-template-columns: minmax(22px, 1fr) minmax(0, max-content) auto minmax(22px, 1fr);
  align-items: center;
  gap: 4px;
  padding: 4px 8px 6px;
  font-size: 12px;
  font-weight: 600;
}
.swt-menu-back {
  justify-self: start;
}
.swt-menu-title-text {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A submenu's way back: an arrow before its title */
.swt-menu-back {
  display: inline-flex;
  margin: -3px 0 -3px -5px;
  padding: 3px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.swt-menu-back:hover,
.swt-menu-back:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
  outline: none;
}
.swt-menu .swt-menu-back svg {
  width: 14px;
  height: 14px;
}
/* The × closing the menu, at the title's right */
.swt-menu-close {
  grid-column: 4;
  grid-row: 1;
  justify-self: end;
  display: inline-flex;
  margin: -3px -5px -3px 0;
  padding: 3px;
  color: inherit;
  opacity: 0.6;
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.swt-menu-close:hover,
.swt-menu-close:focus-visible {
  opacity: 1;
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
  outline: none;
}
.swt-menu .swt-menu-close svg {
  width: 14px;
  height: 14px;
}
/* What the menu is about named in its title: a pencil after the title, the title a field once pressed */
.swt-menu-rename {
  grid-column: 3;
  grid-row: 1;
  justify-self: start;
  display: inline-flex;
  margin: -3px 0;
  padding: 3px;
  color: inherit;
  opacity: 0.6;
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.swt-menu-rename:hover,
.swt-menu-rename:focus-visible {
  opacity: 1;
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
  outline: none;
}
.swt-menu-rename[aria-disabled] {
  opacity: 0.3;
  cursor: default;
  background: none;
}
.swt-menu .swt-menu-rename svg {
  width: 14px;
  height: 14px;
}
.swt-menu-title.swt-naming {
  display: block;
  padding: 2px 6px 6px;
}
.swt-menu-name {
  box-sizing: border-box;
  width: 100%;
  padding: 3px 6px;
  font: inherit;
  font-weight: 400;
  color: inherit;
  background: var(--root-background-color);
  border: 1px solid var(--ui-accent-color);
  border-radius: 5px;
  outline: none;
}
.swt-menu-name-problem {
  max-width: 260px;
  padding: 0 8px 6px;
  font-size: 12px;
  color: var(--danger-color, #c62828);
}
.swt-menu-item {
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
.swt-menu-item:hover,
.swt-menu-item:focus-visible,
.swt-segment:not([aria-disabled="true"]):hover,
.swt-segment:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
  outline: none;
}
/* A list opened in the menu's place: its choice highlighted (focusMenu), not
   the item that came under the pointer, until the pointer moves */
.swt-menu.swt-menu-still .swt-menu-item:hover:not(:focus-visible) {
  background: none;
}
.swt-menu-item.swt-menu-current {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
}
.swt-menu-item[aria-disabled="true"] {
  cursor: default;
  opacity: 0.45;
}
.swt-menu-item[aria-disabled="true"]:hover {
  background: none;
}
.swt-menu-item .swt-label {
  flex: 1;
}
.swt-menu-item[aria-checked="true"]::after {
  content: "\2713";
  color: var(--ui-accent-color);
}
.swt-menu-item.swt-danger {
  color: var(--danger-color, #c62828);
}
.swt-icon {
  display: inline-flex;
}
.swt-menu svg {
  width: 16px;
  height: 16px;
}
/* An item's detail: a bubble beside the menu, at the item's height */
.swt-menu-detail {
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
/* A theme's preview in the Theme list's bubble: a small table, styled as a table
   in the page is (SilverBullet's own rules for tables are the editor's only) */
.swt-theme-preview {
  display: block;
  width: 240px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 4px 4px 0 0;
  font-weight: normal;
}
.swt-theme-preview table {
  width: 100%;
  border-spacing: 0;
}
.swt-theme-preview td {
  padding: 6px 8px;
  white-space: nowrap;
}
.swt-theme-preview thead tr {
  font-weight: bold;
}
.swt-theme-preview td:not(:first-child) {
  text-align: right;
}
.swt-menu-detail.swt-left {
  left: auto;
  right: calc(100% + 8px);
}
.swt-menu-detail[hidden] {
  display: none;
}
.swt-menu-detail-title {
  margin-bottom: 4px;
  font-weight: 600;
}
.swt-menu-detail-code {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.swt-menu-detail-code code {
  padding: 1px 5px;
  font-size: 11px;
  background: color-mix(in srgb, var(--ui-accent-color) 12%, transparent);
  border-radius: 4px;
}
.swt-menu-detail p {
  margin: 0;
}
.swt-menu-detail .swt-menu-detail-note {
  margin-top: 6px;
  opacity: 0.7;
}
/* The icon of an item's value: Type: ☆ Stars */
.swt-menu-value-icon {
  display: inline-flex;
  margin-right: 3px;
  vertical-align: -2px;
}
.swt-menu .swt-menu-value-icon svg {
  width: 14px;
  height: 14px;
}
/* The values a typed cell offers, under its editor */
.swt-choices {
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
.swt-choice {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
  white-space: nowrap;
  border-radius: 5px;
  cursor: pointer;
}
.swt-choice:hover,
.swt-choice.swt-active {
  background: color-mix(in srgb, var(--ui-accent-color) 14%, transparent);
}
.swt-choice.swt-current::after {
  content: "\2713";
  margin-left: auto;
  color: var(--ui-accent-color);
}
.swt-menu-separator {
  height: 1px;
  margin: 4px 2px;
  background: var(--button-border-color, rgba(128, 128, 128, 0.3));
}
.swt-menu-segmented {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 4px 2px 8px;
}
/* A long label (a sheet's name) cut, whole in its tooltip: the menu as wide as its items */
.swt-menu-segmented > .swt-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.swt-segments {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--root-color) 6%, transparent);
}
.swt-segment {
  display: inline-flex;
  padding: 4px 6px;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}
.swt-segment[aria-checked="true"] {
  color: var(--ui-accent-color);
  background: var(--root-background-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
.swt-segment[aria-disabled="true"],
.swt-action[aria-disabled="true"] {
  opacity: 0.35;
  cursor: default;
}
/* A bar of actions, a caption under each icon (Copy, Cut, Paste): first in a menu */
.swt-menu-actions {
  display: flex;
  gap: 2px;
  padding: 2px;
}
.swt-action {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 44px;
  padding: 6px 2px 4px;
  font: inherit;
  font-size: 11px;
  line-height: 1.2;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.swt-action .swt-icon {
  display: inline-flex;
}
.swt-action:not([aria-disabled="true"]):hover,
.swt-action:focus-visible {
  background: color-mix(in srgb, var(--ui-accent-color) 15%, transparent);
  outline: none;
}
.swt-action-caption {
  white-space: nowrap;
  opacity: 0.85;
}
/* A finger's targets: bigger buttons in a row */
@media (pointer: coarse) {
  .swt-segment {
    padding: 8px 10px;
  }
}

/* Middle-button autoscroll over a wide table: the start point */
.swt-autoscroll {
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
body.swt-autoscrolling,
body.swt-autoscrolling * {
  cursor: all-scroll !important;
}

/* Formulas */
/* Names: a mark in a cell's corner, as a spreadsheet marks a comment. A named
   cell or column (its header) at the top right, a named row at its first
   cell's top left; one overlay draws them (and lazy saving's mark of a cell not
   saved yet, at the bottom right), over the cell, so a pinned or striped cell's
   background does not hide them */
.sb-table-widget.swt-table td:is(.swt-named, .swt-row-named, .swt-lazy-pending):not(.swt-pin-left):not(.swt-pin-right) {
  position: relative;
}
.sb-table-widget.swt-table td.swt-named {
  --swt-name-mark: linear-gradient(225deg, color-mix(in srgb, var(--ui-accent-color) 70%, transparent) 50%, transparent 50%);
}
.sb-table-widget.swt-table td.swt-row-named {
  --swt-row-name-mark: linear-gradient(135deg, color-mix(in srgb, var(--ui-accent-color) 70%, transparent) 50%, transparent 50%);
}
/* A cell edited in lazy saving, not saved yet: a mark in its bottom right corner */
.sb-table-widget.swt-table td.swt-lazy-pending {
  --swt-lazy-mark: linear-gradient(315deg, var(--ui-accent-color) 50%, transparent 50%);
}
.sb-table-widget.swt-table td:is(.swt-named, .swt-row-named, .swt-lazy-pending)::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    var(--swt-name-mark, none) top right / 6px 6px no-repeat,
    var(--swt-row-name-mark, none) top left / 6px 6px no-repeat,
    var(--swt-lazy-mark, none) bottom right / 6px 6px no-repeat;
  pointer-events: none;
}
/* A header's hashtag a feature hides (a column type's: its icon shows after
   the column's name instead); a value not of a column's type is red */
.sb-table-widget .swt-hidden-tag {
  display: none;
}
.swt-type-icon {
  display: inline-flex;
  margin-left: 4px;
  vertical-align: -2px;
  opacity: 0.6;
}
.swt-type-icon svg {
  width: 14px;
  height: 14px;
}
.sb-table-widget.swt-table td.swt-type-invalid {
  color: var(--danger-color);
}

/* Cells selected by dragging, to copy */
.sb-table-widget.swt-table td.swt-selected {
  /* An inset shadow over the background, as for the cell edited (td.swt-editing) */
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
/* A pinned column's edge keeps its shadow when selected or edited */
.sb-table-widget.swt-table td.swt-pin-left.swt-pin-edge:is(.swt-selected, .swt-editing) {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent),
    3px 0 4px -2px rgba(0, 0, 0, 0.3);
}
.sb-table-widget.swt-table td.swt-pin-right.swt-pin-edge:is(.swt-selected, .swt-editing) {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--ui-accent-color) 45%, transparent),
    inset 0 0 0 9999px color-mix(in srgb, var(--ui-accent-color) 18%, transparent),
    -3px 0 4px -2px rgba(0, 0, 0, 0.3);
}
/* Cells copied or cut (Ctrl+C, Ctrl+X, Copy, Cut): outlined dashed, as a
   spreadsheet marks them, until they are pasted (or the outline ends); a piece
   in each cell on the edge, out of the layout, as AutoFill's outline */
.sb-table-widget td:has(> .swt-cut-edge) {
  position: relative;
}
.sb-table-widget td:is(.swt-pin-left, .swt-pin-right):has(> .swt-cut-edge) {
  position: sticky;
}
.swt-cut-edge {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 0 dashed var(--ui-accent-color, #4a7cc7);
  pointer-events: none;
}
.swt-cut-edge.swt-cut-top {
  border-top-width: 2px;
}
.swt-cut-edge.swt-cut-bottom {
  border-bottom-width: 2px;
}
.swt-cut-edge.swt-cut-left {
  border-left-width: 2px;
}
.swt-cut-edge.swt-cut-right {
  border-right-width: 2px;
}

/* The selection's handles, after a touch (data-swt-pointer on the page's root):
   a dot on the first cell's top left and the last cell's bottom right corner,
   in a bigger area for a finger, dragged to select more. In the cells, out of
   the layout, as the pin mark is; inside them on the table's edges, where its
   box would cut them */
.swt-select-handle {
  display: none;
}
html[data-swt-pointer="touch"] .sb-table-widget td:has(> .swt-select-handle) {
  position: relative;
}
html[data-swt-pointer="touch"] .sb-table-widget td:is(.swt-pin-left, .swt-pin-right):has(> .swt-select-handle) {
  position: sticky;
}
html[data-swt-pointer="touch"] .swt-select-handle {
  position: absolute;
  /* Over the cells beside, under pinned columns (sticky, z-index 1) a cell scrolls under */
  z-index: 0;
  display: block;
  width: 28px;
  height: 28px;
  touch-action: none;
}
html[data-swt-pointer="touch"] .swt-select-handle::after {
  content: "";
  position: absolute;
  inset: 7px;
  box-sizing: border-box;
  background: var(--ui-accent-color, #4a7cc7);
  border: 2px solid var(--root-background-color, #fff);
  border-radius: 50%;
}
.swt-select-start {
  top: -14px;
  left: -14px;
}
.swt-select-end {
  right: -14px;
  bottom: -14px;
}
.swt-select-start.swt-at-top {
  top: -7px;
}
.swt-select-start.swt-at-left {
  left: -7px;
}
.swt-select-end.swt-at-bottom {
  bottom: -7px;
}
.swt-select-end.swt-at-right {
  right: -7px;
}
/* The band on the selection's edge a mouse drags the cells by (not after a
   touch: there Move to… in their menu); the cells where they go outlined, and
   their address by the pointer */
.sb-table-widget td:has(> .swt-select-edge, > .swt-move-edge) {
  position: relative;
}
.sb-table-widget td:is(.swt-pin-left, .swt-pin-right):has(> .swt-select-edge, > .swt-move-edge) {
  position: sticky;
}
.swt-select-edge {
  position: absolute;
  z-index: 1;
  cursor: move;
}
html[data-swt-pointer="touch"] .swt-select-edge {
  display: none;
}
.swt-select-edge-top {
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
}
.swt-select-edge-bottom {
  bottom: -3px;
  left: 0;
  right: 0;
  height: 6px;
}
.swt-select-edge-left {
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
}
.swt-select-edge-right {
  right: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
}
.swt-move-edge {
  position: absolute;
  inset: 0;
  z-index: 0;
  border: 0 dashed var(--ui-accent-color, #4a7cc7);
  pointer-events: none;
}
.swt-move-edge.swt-move-top {
  border-top-width: 2px;
}
.swt-move-edge.swt-move-bottom {
  border-bottom-width: 2px;
}
.swt-move-edge.swt-move-left {
  border-left-width: 2px;
}
.swt-move-edge.swt-move-right {
  border-right-width: 2px;
}
.swt-move-tip {
  z-index: 57;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  pointer-events: none;
  white-space: nowrap;
}
body.swt-moving-cells,
body.swt-moving-cells * {
  cursor: move !important;
}
body.swt-move-picking .sb-table-widget.swt-table td {
  cursor: crosshair !important;
}
/* Moving a table on the sheet: the handle at its top left corner (where its
   row and column grips meet), the outline of where it would go with its
   address, red where another table is; Move table… waits for a cell */
.swt-floating.swt-sheet-grab {
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: inherit;
  background: var(--root-background-color, #fff);
  border: 1px solid var(--swt-line, rgba(127, 127, 127, 0.45));
  border-radius: 4px;
  cursor: move;
  /* A finger's drag is the handle's, not a scroll of the board */
  touch-action: none;
}
.swt-floating.swt-sheet-grab:hover {
  color: var(--ui-accent-color, #3b6fd4);
  border-color: var(--ui-accent-color, #3b6fd4);
}
.swt-sheet-grab svg {
  width: 14px;
  height: 14px;
}
.swt-sheet-move {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 2px dashed var(--ui-accent-color, #3b6fd4);
  pointer-events: none;
}
.swt-sheet-move[hidden] {
  display: none;
}
.swt-sheet-move.swt-invalid {
  border-color: var(--swt-invalid, #c62828);
  background: color-mix(in srgb, var(--swt-invalid, #c62828) 8%, transparent);
}
.swt-sheet-move-tip {
  position: absolute;
  left: -2px;
  bottom: 100%;
  margin-bottom: 2px;
  padding: 1px 6px;
  font: 12px var(--ui-font, system-ui, sans-serif);
  color: #fff;
  background: var(--ui-accent-color, #3b6fd4);
  border-radius: 4px;
  white-space: nowrap;
}
.swt-sheet-move.swt-invalid .swt-sheet-move-tip {
  background: var(--swt-invalid, #c62828);
}
body.swt-moving-table,
body.swt-moving-table * {
  cursor: move !important;
}
body.swt-table-picking .swt-sheet-board,
body.swt-table-picking .swt-sheet-board * {
  cursor: crosshair !important;
}

/* A handle dragged: the cell under the finger is found past the handles */
body.swt-select-dragging .swt-select-handle {
  pointer-events: none;
}

/* While a formula waits for a reference, cells can be pointed at */
.sb-table-widget.swt-table.swt-pointing td:not(.swt-editing) {
  cursor: move;
}
/* A formula's result: a dotted underline (not while the cell is edited). On
   the content box too: a decoration does not reach into an inline block. */
.sb-table-widget.swt-table td.swt-formula:not(.swt-editing),
.sb-table-widget.swt-table td.swt-formula:not(.swt-editing) > .swt-cell-content {
  text-decoration: underline dotted color-mix(in srgb, var(--ui-accent-color) 75%, transparent);
  text-decoration-thickness: 2px;
  /* Clear of the digits, which have no descenders to leave room */
  text-underline-offset: 0.3em;
}
.sb-table-widget.swt-table td.swt-formula-error {
  color: var(--danger-color);
}
.swt-formula-hint {
  z-index: 56;
  /* fx beside the formula and its help, at the edge by the cell (the top, or the bottom above the cell) */
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
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
.swt-formula-hint.swt-above {
  align-items: flex-end;
}
.swt-formula-hint-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.swt-formula-preview {
  font-family: var(--editor-font, monospace);
  font-weight: 600;
  white-space: pre-wrap;
  word-break: break-all;
}
.swt-formula-tab {
  opacity: 0.7;
}
.swt-formula-help code {
  margin-right: 6px;
  font-weight: 600;
}
/* The current argument in a function's syntax */
.swt-formula-argument {
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}
/* The functions and names a name typed may be: picked with the arrows,
   inserted with Tab or a click (the hint lets clicks through to the table, the
   list takes them) */
.swt-formula-choices {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: 11.5em;
  margin: 0 -8px 0 -4px;
  overflow-y: auto;
  pointer-events: auto;
}
.swt-formula-choice {
  display: flex;
  gap: 8px;
  padding: 2px 8px 2px 4px;
  cursor: pointer;
  white-space: nowrap;
}
.swt-formula-choice code {
  min-width: 6em;
  font-weight: 600;
}
.swt-formula-choice span {
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.75;
}
.swt-formula-choice:hover {
  background: color-mix(in srgb, var(--ui-accent-color, #4a7cc7) 10%, transparent);
}
.swt-formula-choice[aria-selected="true"] {
  background: color-mix(in srgb, var(--ui-accent-color, #4a7cc7) 22%, transparent);
}
.swt-formula-choices + .swt-formula-help {
  padding-top: 4px;
  border-top: 1px solid var(--button-border-color);
}
.swt-formula-functions {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 3px;
  font: inherit;
  color: inherit;
  background: none;
  border: 1px solid var(--button-border-color);
  border-radius: 4px;
  cursor: pointer;
  pointer-events: auto;
  opacity: 0.8;
}
/* The autofill module: the fill handle in the corner of the selection's last
   cell, the cells a drag fills outlined (a piece in each cell on the edge),
   the last one's value by the pointer. In the cells, out of the layout, as
   the pin mark is: they scroll with the table, under its held header */
.sb-table-widget td:has(> .swt-fill-handle, > .swt-fill-edge) {
  position: relative;
}
.sb-table-widget td:is(.swt-pin-left, .swt-pin-right):has(> .swt-fill-handle, > .swt-fill-edge) {
  position: sticky;
}
/* Centered on the cell's corner, as in a spreadsheet; inside the cell on the
   table's last row or column, where the table's box would cut it */
.swt-fill-handle {
  position: absolute;
  right: -4px;
  bottom: -4px;
  z-index: 2;
  box-sizing: border-box;
  width: 8px;
  height: 8px;
  background: var(--ui-accent-color, #4a7cc7);
  border: 1px solid var(--root-background-color, #fff);
  cursor: crosshair;
  touch-action: none;
}
@media (pointer: coarse) {
  .swt-fill-handle {
    right: -7px;
    bottom: -7px;
    width: 14px;
    height: 14px;
  }
}
.swt-fill-handle.swt-at-right {
  right: 0;
}
.swt-fill-handle.swt-at-bottom {
  bottom: 0;
}
/* After a touch the corner is the selection's handle, to select more */
html[data-swt-pointer="touch"] .swt-fill-handle {
  display: none;
}
.swt-fill-edge {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0 dashed var(--ui-accent-color, #4a7cc7);
  pointer-events: none;
}
.swt-fill-edge.swt-fill-top {
  border-top-width: 2px;
}
.swt-fill-edge.swt-fill-bottom {
  border-bottom-width: 2px;
}
.swt-fill-edge.swt-fill-left {
  border-left-width: 2px;
}
.swt-fill-edge.swt-fill-right {
  border-right-width: 2px;
}
.swt-fill-tip {
  z-index: 57;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--root-color);
  background: var(--root-background-color);
  border: 1px solid var(--button-border-color);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  pointer-events: none;
  white-space: nowrap;
}
body.swt-filling,
body.swt-filling * {
  cursor: crosshair !important;
}
/* AutoFill to…: the next click on a cell fills to it */
.sb-table-widget.swt-table.swt-fill-picking td {
  cursor: crosshair !important;
}
.swt-formula-functions:hover {
  opacity: 1;
}
.swt-formula-functions svg {
  width: 15px;
  height: 15px;
}
@media (pointer: coarse) {
  .swt-formula-functions {
    padding: 7px;
  }
}
.swt-floating.swt-ref-mark {
  z-index: 49;
  box-sizing: border-box;
  pointer-events: none;
  border: 2px solid var(--swt-ref-color);
  background: color-mix(in srgb, var(--swt-ref-color) 10%, transparent);
}
.swt-floating.swt-ref-mark.swt-visible {
  display: block !important;
}
.swt-ref-edge {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
  cursor: move;
}
.swt-ref-top,
.swt-ref-bottom {
  left: -4px;
  right: -4px;
  height: 7px;
}
.swt-ref-top {
  top: -5px;
}
.swt-ref-bottom {
  bottom: -5px;
}
.swt-ref-left,
.swt-ref-right {
  top: -4px;
  bottom: -4px;
  width: 7px;
}
.swt-ref-left {
  left: -5px;
}
.swt-ref-right {
  right: -5px;
}
.swt-ref-corner {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 8px;
  height: 8px;
  pointer-events: auto;
  touch-action: none;
  cursor: nwse-resize;
  background: var(--swt-ref-color);
  border: 1px solid var(--root-background-color);
}
body.swt-ref-dragging,
body.swt-ref-dragging * {
  cursor: move !important;
  user-select: none;
}

/* Dragging */
/* A row (column) dragged: its copy follows the pointer, the others move aside */
.swt-drag-ghost {
  z-index: 55;
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
}
/* Opaque: the table's cells take their background from their rows */
.swt-drag-ghost table {
  border-collapse: collapse;
  background: var(--root-background-color);
}
/* Its place is covered by the rows (columns) moving aside: the gap left is where it goes */
.sb-table-widget .swt-dragged {
  opacity: 0;
}
body.swt-dragging .sb-table-widget.swt-table :is(td, th) {
  transition: transform 0.15s ease;
}
@media (prefers-reduced-motion: reduce) {
  body.swt-dragging .sb-table-widget.swt-table :is(td, th) {
    transition: none;
  }
}
body.swt-dragging,
body.swt-dragging * {
  cursor: grabbing !important;
  user-select: none;
}
/* ---- Themes (the themes module) ----------------------------------------------
   A table with data-swt-theme="<name>" takes its look from --swt-* variables,
   set by the theme for that name (below, or a space-style block of your own):

   .sb-table-widget[data-swt-theme="mine"] { --swt-head-bg: #eef; --swt-row-line: 1px; }
   html[data-theme="dark"] .sb-table-widget[data-swt-theme="mine"] { --swt-head-bg: #223; }

   Every variable is optional: one a theme leaves out is as SilverBullet has it.
   The rules key on data-swt-theme (data-swt-stripes) alone, which only Silverware Table
   sets: the preview of a theme in the Theme list is a table of their own too.
   The rules below turn them into the table's look; :is(#sb-main, html) gives
   them the weight of SilverBullet's own table rules (#sb-main .cm-editor …), so
   a theme's spacing and header win over them, in SilverBullet and the playground. */

/* SilverBullet's colors as the page has them, for a theme that leaves one out */
html {
  --swt-sb-head-bg: var(--editor-table-head-background-color);
  --swt-sb-head-color: var(--editor-table-head-color);
  --swt-sb-stripe: var(--editor-table-even-background-color);
  --swt-sb-accent: var(--ui-accent-color);
}
/* The colors: SilverBullet's own variables, within the table, so its header,
   striping, the held header, pinned cells and selection follow the theme */
:is(#sb-main, html) .sb-table-widget[data-swt-theme] {
  --editor-table-head-background-color: var(--swt-head-bg, var(--swt-sb-head-bg));
  --editor-table-head-color: var(--swt-head-color, var(--swt-sb-head-color));
  --editor-table-even-background-color: var(--swt-stripe, var(--swt-sb-stripe));
  --ui-accent-color: var(--swt-accent, var(--swt-sb-accent));
  color: var(--swt-color, currentColor);
  font-size: var(--swt-font-size, 1em);
  /* No fallback: without --swt-font the declaration is invalid, so the font is inherited (as SilverBullet's) */
  font-family: var(--swt-font);
  /* The table's box: its corners, its shadow, a line around it (inside the box, so it follows the corners) */
  border-radius: var(--swt-radius, 4px 4px 0 0);
  box-shadow: var(--swt-shadow, none);
  outline: var(--swt-outline, 0px) solid var(--swt-border, transparent);
  outline-offset: calc(-1 * var(--swt-outline, 0px));
}
/* Over the whole window (full screen, the sheet view): a box without corners or shadow */
:is(#sb-main, html) .sb-table-widget.swt-over-window[data-swt-theme] {
  border-radius: 0;
  box-shadow: none;
}
:is(#sb-main, html) .sb-table-widget[data-swt-theme] thead tr {
  font-weight: var(--swt-head-weight, bold);
  font-family: var(--swt-head-font, var(--swt-font));
  /* As SilverBullet colors it (colors.scss), also where nothing else does (the playground) */
  color: var(--editor-table-head-color, currentColor);
}
:is(#sb-main, html) .sb-table-widget[data-swt-theme] thead tr:first-child > td {
  padding: var(--swt-head-padding, var(--swt-padding, 11px 8px));
  font-size: var(--swt-head-size, 1em);
  text-transform: var(--swt-head-transform, none);
  letter-spacing: var(--swt-head-spacing, normal);
  border-bottom: var(--swt-head-line, var(--swt-row-line, 0px)) solid var(--swt-border, transparent);
}
/* Lines between rows (the last one has the box's), between columns */
:is(#sb-main, html) .sb-table-widget[data-swt-theme] :is(tbody, tfoot) td {
  padding: var(--swt-padding, 8px);
  border-bottom: var(--swt-row-line, 0px) solid var(--swt-border, transparent);
}
:is(#sb-main, html) .sb-table-widget[data-swt-theme] :is(tbody, tfoot):last-child tr:last-child > td {
  border-bottom-width: 0;
}
:is(#sb-main, html) .sb-table-widget[data-swt-theme] tr > td + td {
  border-left: var(--swt-column-line, 0px) solid var(--swt-border, transparent);
}
/* Stripes (the setting, or the table's stripes="…"), whatever the theme: it
   gives only their color. Rows are SilverBullet's own (no mark); none: every
   row as the others; columns: every other column of the body instead (not the
   header, nor pinned columns, tinted as they are) */
:is(#sb-main, html) .sb-table-widget:is([data-swt-stripes="none"], [data-swt-stripes="columns"]) {
  --swt-stripe-color: var(--swt-stripe, var(--swt-sb-stripe));
  --editor-table-even-background-color: transparent;
}
:is(#sb-main, html) .sb-table-widget[data-swt-stripes="columns"] :is(tbody, tfoot) td:nth-child(even):not(.swt-pin-left):not(.swt-pin-right) {
  background-image: linear-gradient(var(--swt-stripe-color), var(--swt-stripe-color));
}
/* The row under the pointer: a tint over its striping (none if the theme sets none) */
:is(#sb-main, html) .sb-table-widget[data-swt-theme] tbody tr:not(.swt-large-spacer):hover {
  background-image: linear-gradient(var(--swt-hover), var(--swt-hover));
}

/* plain: no lines, fills nor bold header: text in rows and columns, as for a layout */
.sb-table-widget[data-swt-theme="plain"] {
  --swt-head-bg: transparent;
  --swt-head-color: currentColor;
  --swt-head-weight: normal;
  --swt-stripe: transparent;
  --swt-hover: transparent;
  --swt-radius: 0;
}

/* playground: the look of Silverware Table's playground (a light header, soft striping) */
.sb-table-widget[data-swt-theme="playground"] {
  --swt-head-bg: #e8e8ee;
  --swt-head-color: currentColor;
  --swt-stripe: #f4f4f8;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="playground"] {
  --swt-head-bg: #2e2f38;
  --swt-stripe: #26272e;
}

/* minimal: a quiet small-caps header over a line, thin lines between rows, barely tinted stripes */
.sb-table-widget[data-swt-theme="minimal"] {
  --swt-head-bg: transparent;
  --swt-head-color: #6b7280;
  --swt-head-weight: 600;
  --swt-head-size: 0.78em;
  --swt-head-transform: uppercase;
  --swt-head-spacing: 0.06em;
  --swt-stripe: rgba(0, 0, 0, 0.025);
  --swt-border: #e5e7eb;
  --swt-row-line: 1px;
  --swt-head-line: 2px;
  --swt-hover: rgba(0, 0, 0, 0.03);
  --swt-radius: 0;
  --swt-padding: 10px 12px;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="minimal"] {
  --swt-head-color: #9ca3af;
  --swt-stripe: rgba(255, 255, 255, 0.03);
  --swt-border: #30333b;
  --swt-hover: rgba(255, 255, 255, 0.04);
}

/* slate: a card with rounded corners and a soft shadow, a cool grey header */
.sb-table-widget[data-swt-theme="slate"] {
  --swt-head-bg: #f1f5f9;
  --swt-head-color: #334155;
  --swt-head-weight: 600;
  --swt-stripe: #f8fafc;
  --swt-border: #e2e8f0;
  --swt-row-line: 1px;
  --swt-outline: 1px;
  --swt-radius: 10px;
  --swt-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 4px 14px rgba(15, 23, 42, 0.06);
  --swt-hover: #eef2f7;
  --swt-padding: 9px 14px;
  --swt-head-padding: 11px 14px;
  --swt-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="slate"] {
  --swt-head-bg: #1e293b;
  --swt-head-color: #cbd5e1;
  --swt-stripe: rgba(148, 163, 184, 0.05);
  --swt-border: #334155;
  --swt-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 4px 14px rgba(0, 0, 0, 0.3);
  --swt-hover: rgba(148, 163, 184, 0.08);
}

/* grid: a spreadsheet, every cell outlined, compact */
.sb-table-widget[data-swt-theme="grid"] {
  --swt-head-bg: #f3f4f6;
  --swt-head-color: #111827;
  --swt-head-weight: 600;
  --swt-stripe: #f9fafb;
  --swt-border: #d1d5db;
  --swt-row-line: 1px;
  --swt-column-line: 1px;
  --swt-outline: 1px;
  --swt-radius: 2px;
  --swt-padding: 4px 8px;
  --swt-head-padding: 6px 8px;
  --swt-font-size: 0.92em;
  --swt-hover: rgba(37, 99, 235, 0.06);
  --swt-accent: #2563eb;
  --swt-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="grid"] {
  --swt-head-bg: #262a33;
  --swt-head-color: #e5e7eb;
  --swt-stripe: rgba(255, 255, 255, 0.03);
  --swt-border: #3a3f4b;
  --swt-hover: rgba(96, 165, 250, 0.08);
  --swt-accent: #60a5fa;
}

/* ocean: a deep teal header, light teal striping, rounded */
.sb-table-widget[data-swt-theme="ocean"] {
  --swt-head-bg: #0e7490;
  --swt-head-color: #ffffff;
  --swt-head-weight: 600;
  --swt-stripe: #ecfeff;
  --swt-radius: 8px;
  --swt-shadow: 0 2px 10px rgba(14, 116, 144, 0.15);
  --swt-hover: rgba(14, 116, 144, 0.07);
  --swt-accent: #0891b2;
  --swt-padding: 9px 12px;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="ocean"] {
  --swt-head-bg: #155e75;
  --swt-head-color: #ecfeff;
  --swt-stripe: rgba(34, 211, 238, 0.06);
  --swt-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  --swt-hover: rgba(34, 211, 238, 0.1);
  --swt-accent: #22d3ee;
}

/* paper: warm tones, a header over a double-weight line, lines between rows */
.sb-table-widget[data-swt-theme="paper"] {
  --swt-head-bg: #f5efe6;
  --swt-head-color: #5b4636;
  --swt-head-weight: 600;
  --swt-stripe: #fbf8f3;
  --swt-border: #e8dccb;
  --swt-row-line: 1px;
  --swt-head-line: 2px;
  --swt-outline: 1px;
  --swt-radius: 6px;
  --swt-hover: #f7f1e8;
  --swt-accent: #b45309;
  --swt-padding: 8px 12px;
  --swt-font: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="paper"] {
  --swt-head-bg: #3a3128;
  --swt-head-color: #f0e2cf;
  --swt-stripe: rgba(240, 226, 207, 0.04);
  --swt-border: #4a3f34;
  --swt-hover: rgba(240, 226, 207, 0.07);
  --swt-accent: #f59e0b;
}

/* contrast: high contrast for reading: a black header, strong lines, roomy cells */
.sb-table-widget[data-swt-theme="contrast"] {
  --swt-head-bg: #111827;
  --swt-head-color: #ffffff;
  --swt-head-weight: 700;
  --swt-stripe: #eef0f3;
  --swt-color: #000000;
  --swt-border: #374151;
  --swt-row-line: 1px;
  --swt-outline: 2px;
  --swt-radius: 4px;
  --swt-hover: #e2e5ea;
  --swt-accent: #1d4ed8;
  --swt-padding: 10px 12px;
  --swt-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="contrast"] {
  --swt-head-bg: #f9fafb;
  --swt-head-color: #000000;
  --swt-stripe: rgba(255, 255, 255, 0.09);
  --swt-color: #ffffff;
  --swt-border: #d1d5db;
  --swt-hover: rgba(255, 255, 255, 0.14);
  --swt-accent: #93c5fd;
}

/* compact: for tables of data: small type, tight cells, no lines, soft stripes */
.sb-table-widget[data-swt-theme="compact"] {
  --swt-head-bg: #f3f4f6;
  --swt-head-color: #374151;
  --swt-head-weight: 600;
  --swt-stripe: #f9fafb;
  --swt-hover: rgba(0, 0, 0, 0.04);
  --swt-radius: 3px;
  --swt-padding: 2px 6px;
  --swt-head-padding: 4px 6px;
  --swt-font-size: 0.85em;
  --swt-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="compact"] {
  --swt-head-bg: #23262d;
  --swt-head-color: #d1d5db;
  --swt-stripe: rgba(255, 255, 255, 0.03);
  --swt-hover: rgba(255, 255, 255, 0.05);
}

/* bold: thick black lines, square corners, a hard offset shadow, an upper-case header on yellow accents */
.sb-table-widget[data-swt-theme="bold"] {
  --swt-head-bg: #111111;
  --swt-head-color: #fde047;
  --swt-head-weight: 800;
  --swt-head-transform: uppercase;
  --swt-head-spacing: 0.04em;
  --swt-head-font: "Arial Black", "Helvetica Neue", Arial, ui-sans-serif, sans-serif;
  --swt-stripe: #fefce8;
  --swt-border: #111111;
  --swt-row-line: 2px;
  --swt-outline: 3px;
  --swt-radius: 0;
  --swt-shadow: 6px 6px 0 #111111;
  --swt-hover: #fef9c3;
  --swt-accent: #ca8a04;
  --swt-padding: 10px 14px;
  --swt-font: "Helvetica Neue", Arial, ui-sans-serif, sans-serif;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="bold"] {
  --swt-head-bg: #fde047;
  --swt-head-color: #111111;
  --swt-stripe: rgba(253, 224, 71, 0.06);
  --swt-border: #fde047;
  --swt-shadow: 6px 6px 0 rgba(253, 224, 71, 0.35);
  --swt-hover: rgba(253, 224, 71, 0.1);
  --swt-accent: #fde047;
}

/* soft: airy and rounded: a pastel violet header, large corners, a deep soft shadow, no lines */
.sb-table-widget[data-swt-theme="soft"] {
  --swt-head-bg: #ede9fe;
  --swt-head-color: #5b21b6;
  --swt-head-weight: 600;
  --swt-stripe: #faf7ff;
  --swt-hover: #f3ecff;
  --swt-radius: 16px;
  --swt-shadow: 0 8px 24px rgba(91, 33, 182, 0.12);
  --swt-accent: #7c3aed;
  --swt-padding: 12px 16px;
  --swt-font: ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="soft"] {
  --swt-head-bg: #2e1065;
  --swt-head-color: #e9d5ff;
  --swt-stripe: rgba(167, 139, 250, 0.06);
  --swt-hover: rgba(167, 139, 250, 0.1);
  --swt-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  --swt-accent: #a78bfa;
}

/* ledger: an account book: lines between columns, a heavy rule under a small-caps
   header, green-bar stripes, figures in a monospace font, so they line up */
.sb-table-widget[data-swt-theme="ledger"] {
  --swt-head-bg: #f0fdf4;
  --swt-head-color: #14532d;
  --swt-head-weight: 700;
  --swt-head-size: 0.8em;
  --swt-head-transform: uppercase;
  --swt-head-spacing: 0.05em;
  --swt-stripe: #f0fdf4;
  --swt-border: #86efac;
  --swt-column-line: 1px;
  --swt-head-line: 3px;
  --swt-outline: 1px;
  --swt-radius: 2px;
  --swt-hover: #dcfce7;
  --swt-accent: #15803d;
  --swt-padding: 6px 12px;
  --swt-font-size: 0.92em;
  --swt-font: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
html[data-theme="dark"] .sb-table-widget[data-swt-theme="ledger"] {
  --swt-head-bg: #052e16;
  --swt-head-color: #bbf7d0;
  --swt-stripe: rgba(74, 222, 128, 0.06);
  --swt-border: #166534;
  --swt-hover: rgba(74, 222, 128, 0.1);
  --swt-accent: #4ade80;
}
```
