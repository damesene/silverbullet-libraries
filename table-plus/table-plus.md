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
* **Move between cells**: Tab / Shift+Tab, or Ctrl+arrows while editing. See [[#Keyboard]].
* **See the markdown**: hover the table and click *Edit markdown*, or Alt+click a cell. See [[#Showing the markdown]].
* **Sort**: click ⇅ in a column header. See [[#Sorting]].
* **Filter**: hover the table and click *Filter*; `>10`, `/regex/`, `=text` and `!text` work too. See [[#Filtering]].
* **Add, move or delete rows and columns**: click the ⠿ grip next to a row or above a column. See [[#Rows and columns]].
* **Change how Enter or filters work**: *Configuration: Open*, category *Table Plus*. See [[#Settings]].

## Editing cells

* Click a cell to edit it in place. Enter or clicking elsewhere saves, Esc cancels.
* Links, tasks and buttons in cells work as before: clicking them does not start editing.
* A column always needs a name: emptying a header cell keeps the old name.

### Keyboard

| Key | While editing a cell |
|---|---|
| Enter | Save |
| Esc | Cancel |
| Tab | Save, edit the next cell |
| Shift+Tab | Save, edit the previous cell |
| Ctrl+arrows | Save, edit the cell beside |
| Ctrl+Home | Save, edit the row's first cell |
| Ctrl+End | Save, edit the row's last cell |

* Tab on the last cell adds a row.
* With the `moveDown` setting, Enter also moves to the cell below and Shift+Enter to the cell above. See [[#Settings]].
* While Ctrl is held, the pointer shows a move cursor. Without Ctrl, arrows, Home and End move within the cell's text as usual.

## Showing the markdown

A plain click edits a cell and no longer switches the table to its markdown. To see or edit the markdown:
* hover the table and click *Edit markdown* in the toolbar above it, or
* Alt+click a cell: the cursor lands in that cell (at the clicked character, for plain text).

## Sorting

* Click the ⇅ control that appears in a column header on hover: ascending, descending, then back to the order as written. The column menu (see [[#Rows and columns]]) has the same options.
* Sorting only changes what you see, never the markdown.
* While sorted, the toolbar shows *Sorted by …*; its × shows the rows as written again.
* Numbers sort as numbers (`1 000`, `2,5`, `-3`, `15 %` included); empty cells always come last.

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

## Rows and columns

Hover a cell to show two grips: ⠿ left of its row, and ⠿ above its column.

* **Click a grip** for a menu:
  * Row: insert above or below, duplicate, move up or down, delete.
  * Column: sort, filter, align (left, center, right), insert left or right, move, delete.
* **Drag a grip** to move the row or column; Esc cancels the drag.
* **Add at the end**: *+ Row* below the table adds a row, *+* right of the header adds a column (named *Column N*, ready to rename).
* Rows can be moved only in the original order (no sorting, no filter), so a row always lands where you see it.

## Large tables

* **Sticky header**: while you scroll past a long table, its header stays at the top of the view, with the toolbar above it.
* **Wide tables** scroll sideways; Table Plus keeps the scroll position after edits, and new rows open their editor in a column you can see.
* **Autoscroll**: the middle mouse button over a wide table scrolls the table sideways and the page up and down together. Hold and drag, or click and move; the next click ends it.

## Settings

Open *Configuration: Open* (Ctrl+, / Cmd+,) and find the *Table Plus* category, or set them in your [[CONFIG]]:

* **Enter in a cell editor** (`tablePlus.enterKey`), default `save`
  * `save`: Enter saves the cell.
  * `moveDown`: Enter saves and edits the cell below, Shift+Enter the cell above.
* **Smart filters** (`tablePlus.smartFilters`), default `true`
  * `true`: filter fields understand `>10`, `/pattern/`, `=text` and `!filter`.
  * `false`: everything typed in a filter field is text to find.

```lua
config.set("tablePlus.enterKey", "moveDown")
config.set("tablePlus.smartFilters", false)
```

## How your markdown is kept

* Every change is one ordinary edit: Ctrl+Z undoes it.
* Rows you did not change are kept byte for byte. Tables with aligned pipes stay aligned; compact tables stay compact.
* Sorting, filters and scroll positions are views only: they are remembered per table until the page is reloaded, and never written to the page.
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

config.define("tablePlus", {
  description = "Table Plus settings",
  type = "object",
  properties = {
    enterKey = {
      type = "string",
      enum = { "save", "moveDown" },
      default = "save",
      description = "What Enter does in a cell editor. save: save the value. moveDown: save it and edit the cell below (Shift+Enter: the cell above).",
      ui = { category = "Table Plus", label = "Enter in a cell editor", priority = 1 },
    },
    smartFilters = {
      type = "boolean",
      default = true,
      description = "Filter fields understand >10 <10 >=10 <=10 (numbers), /pattern/ (regular expressions), =text (whole cell) and !filter (not). Off: everything typed is text to find.",
      ui = { category = "Table Plus", label = "Smart filters", priority = 0 },
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
  })
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

/* Sort control: shown on header hover, always while it sorts */
.tp-sort {
  margin-left: 4px;
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
.sb-table-widget.tp-table thead tr .tp-sort:hover,
.sb-table-widget.tp-table thead tr .tp-sort.tp-active {
  opacity: 1;
}
.sb-table-widget .tp-hidden {
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

/* Ctrl held in a cell editor: arrows move between cells */
body.tp-navigating .sb-table-widget.tp-table,
body.tp-navigating .sb-table-widget.tp-table * {
  cursor: move !important;
}

/* Inline editing: same place and size as the text, with an accent underline */
.sb-table-widget td.tp-editing {
  background-color: color-mix(in srgb, var(--ui-accent-color) 7%, transparent);
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
  box-shadow: 0 2px 0 0 var(--ui-accent-color);
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
.tp-bar .tp-chip-clear {
  display: inline-flex;
  padding: 2px;
  border-radius: 3px;
}
.tp-bar .tp-chip-clear:hover {
  color: var(--ui-accent-color);
  background: color-mix(in srgb, var(--ui-accent-color) 18%, transparent);
}
.tp-chip-clear svg {
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
.tp-menu-title {
  padding: 4px 8px 6px;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
