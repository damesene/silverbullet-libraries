# Silverware

Silverware is a collection of plugins (libraries) for [SilverBullet](https://silverbullet.md) by `damesene`.

## Install

Add this repository in SilverBullet with the `Library: Add Repository` command and the URI:

```text
https://github.com/damesene/silverware-libraries/blob/main/REPO.md
```

Then install a plugin with `Library: Install`.

## Plugins

- **Silverware Table** ([`silverware-table/`](silverware-table/silverware-table.md)): sort, filter and edit markdown tables
  in place, formulas, column types, and moving, adding or deleting rows and columns. Tables stay plain markdown.

## Layout

- `REPO.md`: the repository page (`#meta/repository`) listing every plugin.
- One folder per plugin, named `silverware-<name>`: its library page `silverware-<name>.md` (installed as
  `Library/damesene/silverware-<name>`), the built `silverware-<name>.js`, the TypeScript sources in `src/`
  and its interaction tests in `ui-tests/`.
- Built `.js` files are committed, because SilverBullet installs them straight from the repo.
- Settings and the Space Lua API of a plugin live under `silverware.<name>` (e.g. `silverware.table`), CSS
  classes, data attributes and CSS variables under a prefix of its own (`swt-` for the table).
- `playground/`: a page that mocks SilverBullet, for trying Silverware Table without it.

### Adding a plugin

1. A folder `silverware-<name>/` with `silverware-<name>.md` (its library page, which loads
   `Library/damesene/silverware-<name>.js`) and `src/index.ts`.
2. Its name in the lists of `scripts/build.mjs` and `scripts/deploy.mjs`, and an entry in `REPO.md`.
3. Its Space Lua API as a field of the shared global: `silverware = silverware or {}`, then
   `silverware.<name> = …`; its settings with `config.define("silverware.<name>", …)`.
4. Unit tests (`src/**/*.test.ts`) and interaction tests (`ui-tests/*.spec.ts`) are found in every plugin folder.

## Development

```sh
npm install
npm run build          # bundle each plugin's src/index.ts into <plugin>/<plugin>.js
npm run watch          # rebuild on change
npm test               # vitest: unit tests and jsdom UI tests
npm run verify         # before a commit: TypeScript, vitest, and each bundle matches its sources
npm run test:ui        # interaction tests in Chrome against the playground (test:ui:open: in Playwright's window)
npm run deploy -- <space folder>   # copy the plugins into a local space's Library/damesene/
npm run playground     # try Silverware Table without SilverBullet, on mock data: http://localhost:8000/
```

After deploying, reload the SilverBullet page so the new `.js` module is loaded. How Silverware Table is built
(its core, features and the decisions behind them) is in [CLAUDE.md](CLAUDE.md).
