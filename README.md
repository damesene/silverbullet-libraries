# silverbullet-libraries

Libraries for [SilverBullet](https://silverbullet.md) by `damesene`.

## Install

Add this repository in SilverBullet with the `Library: Add Repository` command and the URI:

```
https://github.com/damesene/silverbullet-libraries/blob/main/REPO.md
```

Then install a library with `Library: Install`.

## Layout

- `REPO.md`: repository page (`#meta/repository`) listing all libraries.
- One folder per library, e.g. `Table/Table.md` (the library page, installed as
  `Library/damesene/<Name>`) plus its `.plug.js` file and sources.
- Built `.plug.js` files are committed, because SilverBullet installs them straight from the repo.
