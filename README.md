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
