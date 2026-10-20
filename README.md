# silverbullet-libraries

Libraries for [SilverBullet](https://silverbullet.md) by `damesene`.

## Install

Add this repository in SilverBullet with the `Library: Add Repository` command and the URI:

```
https://github.com/damesene/silverbullet-libraries/blob/main/REPO.md
```

Then install a library with `Library: Install`.

## Libraries

- **Table Plus** ([`table-plus/`](table-plus/table-plus.md)): sort, filter and edit markdown tables
  in place, and move, add or delete rows and columns. Tables stay plain markdown.

## Layout

- `REPO.md`: repository page (`#meta/repository`) listing all libraries.
- One folder per library, named in lowercase with dashes, e.g. `table-plus/`: the library page
  `table-plus.md` (installed as `Library/damesene/table-plus`), the built `table-plus.js` and the
  TypeScript sources in `src/`.
- Built `.js` files are committed, because SilverBullet installs them straight from the repo.

## Development

```
npm install
npm run build          # bundle each library's src/index.ts into <name>/<name>.js
npm run watch          # rebuild on change
npm test               # vitest
npm run check          # TypeScript
npm run deploy -- <space folder>   # copy the libraries into a local space's Library/damesene/
npm run playground     # try Table Plus without SilverBullet, on mock data: http://localhost:8000/
```

After deploying, reload the SilverBullet page so the new `.js` module is loaded.

### Table Plus code

- `table-plus/src/controller.ts`: finds and enhances rendered tables, routes events, shows the toolbar and writes tables. Features work through the `TableHost` interface and hooks of `core/feature.ts`.
- `core/`: what features build on: the cell editor (`editor.ts`), structural edits (`structure.ts`), the host interface and hooks (`feature.ts`).
- `features/`: one feature per file (formulas, selection, paste, grips and menus, metadata, sticky header, autoscroll, undo scrolling, `${…}` cells), each with its UI test next to it. A new feature is a class implementing `Feature`, added to the list in the controller's constructor.
- Pure modules without the DOM, with unit tests: `markdown.ts` (table model), `ops.ts`, `pins.ts`, `meta.ts`, `view.ts`, `columns.ts`, `paste.ts`, `formulas/` (formulas; the built-in functions one per file in `formulas/builtin/`), `types/` (column types, one per file).
- `testing/page.ts`: a jsdom page that renders tables as SilverBullet does, for the UI tests.
