# Silverware Table playground

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

## Long text

Long text wraps at the maximum column width and stops at the maximum cell height (*Settings* in the header, *Modules*: *Long text in cells*, with its *Maximum column width* and *Maximum cell height*). Hover a cut cell for its expand button, or press F2 while editing a long formula, to see and edit the whole text in a popup.

| Ticket | Status | Notes | Total |
|---|---|---|--:|
| 42 | open | Order 42 was delayed by the carrier: the parcel waited in the depot for three days, was then sent to the wrong city and came back. The customer asked for a refund of the shipping costs, which we granted, and for a discount on the next order, which is still being discussed with the sales team. Follow up next Monday and write down what was agreed. The carrier says the label was smudged and could not be read by the sorting machine, so the parcel was routed by hand, twice. We should print labels on the new printer from now on and check that the barcode scans before the parcel leaves. If the customer orders again within a month, add a small gift and a handwritten note to the parcel. | 120 |
| 43 | done | Short note. | 80 |
| 44 | waiting | Ask the supplier whether the new packaging can be recycled, and if it can, which bin it goes in; the leaflet in the box says nothing about it, and two customers have asked already. | 15 |
| Sum | | | 215 <meta f='=SUM(D1:D3)+IF(AND(D1&gt;100, D2&gt;50), 0, 0)+IF(OR(D3<10, D3&gt;1000), 0, 0)'> |

## Formulas

Click a result to edit its formula: each reference is outlined in its own color; drag an outline's edge to move it, a range's corner to resize it. Type `=` in any body cell to start a formula.

| Item | Qty | Unit price | Amount |
|---|--:|--:|--:|
| Pear | 3 | 12,50 | 37,5 <meta f='=[@qty]*[@unit_price]'> |
| Apple | 10 | 4,50 | 45 <meta f='=[@qty]*[@unit_price]'> |
| Fig | 2 | 25 | 50 <meta f='=[@qty]*[@unit_price]'> |
| Total | 15 <meta f='=SUM([qty])'> | | 132,5 <meta f='=SUM([amount])'> |
| Average | 5 <meta f='=AVERAGE(B1:B3)'> | 14 <meta f='=ROUND(AVERAGE(C1:C3), 2)'> | |

## Column types

A hashtag in a header gives its column a type: the markdown keeps the values, the cells show them as the type. `lots` and `maybe` are not values of their types.

| Item | Price #currency-usd | Rating #stars | Done #check | Due #date | Trend #trend | Progress #progress | Site #link |
|---|--:|---|:-:|---|:-:|---|---|
| Pear | 12.99 | 4 | yes | 2026-10-20 | + | 80 | https://silverbullet.md |
| Fig | 3.5 | 1 | no | 2026-11-02 | - | 25 | https://github.com |
| Plum | lots | 2 | maybe | 2026-12-15 | = | 50 | https://example.com |

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
| <meta sort.qty='desc' pin-bottom='1'> |

## Unnamed column

| Name | | Qty |
|---|---|---|
| Pear | ripe | 3 |
| Apple | green | 10 |

## More column types

`#trend` and `#check` also take numbers; a currency's sign goes where its country writes it.

| Item | Change #trend | In stock #check | Price #currency-eur | Price #currency-usd | Price #currency-czk | Start #time |
|---|:-:|:-:|--:|--:|--:|--:|
| Pear | 3,5 | 12 | 12.99 | 14.2 | 320 | 9:30 |
| Fig | -2 | 0 | 3.5 | 3.8 | 89 | 14:00 |
| Plum | 0 | -1 | 1200 | 1310 | 29900 | 0.75 |

## Dates and times

Dates are written as 2026-10-19, times as 14:30. Times add up past a day: `[h]:mm` in TEXT shows all the hours, INT the whole days.

| Task | Start #date | Days | End #date | Weekday | Weeks | From #time | To #time | Hours |
|---|---|--:|---|--:|--:|--:|--:|--:|
| Design | 2026-10-05 | 10 | 2026-10-15 <meta f='=DATEADD([@start], [@days], "d")'> | 4 <meta f='=WEEKDAY([@end], 2)'> | 1 <meta f='=DATEDIF([@start], [@end], "w")'> | 8:00 | 22:00 | 14:00 <meta f='=[@to]-[@from]'> |
| Build | 2026-10-15 | 31 | 2026-11-15 <meta f='=DATEADD([@start], [@days], "d")'> | 7 <meta f='=WEEKDAY([@end], 2)'> | 4 <meta f='=DATEDIF([@start], [@end], "w")'> | 6:00 | 20:00 | 14:00 <meta f='=[@to]-[@from]'> |
| Review | 2026-11-30 | 1 | 2026-12-30 <meta f='=DATEADD([@start], 1, "m")'> | 3 <meta f='=WEEKDAY([@end], 2)'> | 4 <meta f='=DATEDIF([@start], [@end], "w")'> | 9:15 | 15:45 | 06:30 <meta f='=[@to]-[@from]'> |
| Total | 2026-10-05 <meta f='=MIN(B1:B3)'> | 42 <meta f='=SUM([days])'> | 2026-12-30 <meta f='=MAX(D1:D3)'> | | | | | 34:30 <meta f='=SUM([hours])'> |
| As text | | | 2026-12-24 18:30 <meta f='=DATE(2026, 12, 24) + TIME(18, 30)'> | 05.10.2026 <meta f='=TEXT(B4, "dd.mm.yyyy")'> | 2026 <meta f='=YEAR(D4)'> | | | |

| Shift | Length |
|---|--:|
| Night | 14:00 |
| Day | 20:00 |
| Total | 34:00 <meta f='=SUM(B1:B2)'> |
| Whole days | 1 <meta f='=INT(B3)'> |
| All hours | 34:00 <meta f='=TEXT(B3, "[h]:mm")'> |

## Named tables

The next table is named `prices` (the pencil in the title of its toolbar's ⋯ menu, stored in its metadata row; the toolbar shows the name). The rows Pear and Fig are named (the pencil in the row menu's title, a mark in the top left corner), and the VAT rate cell is named `vat` (the pencil in the title of the cell's menu, a right click, a mark in the top right corner). The Price column is named `price` (the pencil in the column menu's title): rename its header and the formulas below still find it.

| Fruit | Price <meta n='price'> |
|---|--:|
| Pear <meta n='pear'> | 12 |
| Fig <meta n='fig'> | 25 |
| Kiwi | 6 |
| VAT rate | 0.21 <meta cn='vat'> |
| <meta name='prices'> |

The order refers to it: `prices!B1` by position, `prices![price]` by column, `prices!pear[price]` by row name, `XLOOKUP` by a value, and `vat` by the cell's name. Change a price above: these follow.

| Item | Qty | Unit price | With VAT |
|---|--:|--:|--:|
| Pear | 3 | 12 <meta f='=prices!pear[price]'> | 43.56 <meta f='=[@qty]*[@unit_price]*(1+vat)'> |
| Fig | 2 | 25 <meta f='=prices!fig[price]'> | 60.5 <meta f='=[@qty]*[@unit_price]*(1+vat)'> |
| Kiwi | 5 | 6 <meta f='=XLOOKUP("kiwi", prices![fruit], prices![price])'> | 36.3 <meta f='=[@qty]*[@unit_price]*(1+vat)'> |
| First price | | 12 <meta f='=prices!B1'> | |
| Total | 10 <meta f='=SUM([qty])'> | 43 <meta f='=SUM(prices!B1:B3)'> | 140.36 <meta f='=SUM([with_vat])'> |

References to tables on other pages (`[[Shop]]prices![price]`) need SilverBullet: the playground has only this page.
