# Table Plus playground

Edit the markdown on the left, or the tables below. Alt+click a cell or *Edit markdown* puts the cursor into the markdown.

## Fruit

| Name | Qty | Price | Origin |
|---|--:|--:|---|
| Pear | 3 | 12,99 € | Czechia |
| apple | 10 | 4,50 € | Poland |
| Fig | 2 | 25 € | Turkey |
| Banana | 24 | 3,20 € | Ecuador |
| Kiwi | 7 | 6 € | New Zealand |
| Šípek | 1 | 99 € | Česko |

## Tasks

| Task | Owner | Due | Status | Notes |
|---|---|---|:-:|---|
| Write the docs | [[Alice]] | 2026-10-20 | done | **important** |
| Fix the sort bug | [[Bob]] | 2026-10-22 | open | see `markdown.ts` |
| Review filters | [[Carol]] | 2026-10-25 | open | *nice to have* |
| Release 0.2 | [[Alice]] | 2026-11-01 | blocked | waits for review |
| Plan Q1 | [[Dave]] | 2026-12-15 | open | |

## Measurements

| Sample | Weight | Temperature | Ratio |
|---|---|---|---|
| A | 3 kg | 21,5 | 15 % |
| B | 12 kg | -3 | 2,5 % |
| C | 1 000 kg | 0 | 100 % |
| D | 0,5 kg | 37 | 7 % |
| E | | 18 | |

## With metadata

Sorted by Qty, descending, with the last row pinned (stored in the `<meta>` row).

| Name | Qty |
| ----- | --: |
| Pear | 3 |
| Apple | 10 |
| Plum | 6 |
| Total | 19 |
| <meta sort="Qty:desc" pin-bottom="1"> |

## Unnamed column

| Name | | Qty |
|---|---|---|
| Pear | ripe | 3 |
| Apple | green | 10 |
