// What a module's host gives it of what tables keep, for tests that call a
// module's domain directly (the sheet's): that module's own, and the names
import { ownMeta } from "../core/metaaccess.ts";
import { metaName } from "../meta.ts";
import type { SheetMeta } from "../sheet/page.ts";

/** The sheet modules' host, as far as the sheet's domain reads it */
export const SHEET_META: SheetMeta = { ...ownMeta("sheet", () => true), tableName: metaName };
