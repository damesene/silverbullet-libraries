// How formulas' functions are written in Excel. The formulas know nothing of
// Excel: what differs is here, by the functions' names. A function in
// SAME_IN_EXCEL is written as it is; one in EXCEL_FUNCTIONS as its entry
// writes it; any other (a custom function without a template) is no formula
// in Excel, its cell is written as its value. A test requires every built-in
// function in one of the two.
import { type Scalar, toUnit } from "../formulas/index.ts";

// An argument as Excel writes it, its value when it is written in the formula (a unit "d"), whether it is an operation (A1+1)
export type ExcelArgument = { readonly text: string; readonly literal?: Scalar; readonly operation?: boolean };

// The call written in Excel, or why it cannot be
export type ExcelCall = (args: readonly ExcelArgument[]) => string | { readonly reason: string };

/**
 * Functions Excel added after its 2007 file format: a file names them with
 * the prefix _xlfn., else Excel shows #NAME? (Microsoft: "Issue: An _xlfn.
 * prefix is displayed in front of a formula")
 */
const FUTURE_FUNCTIONS: ReadonlySet<string> = new Set([
  "CONCAT", "TEXTJOIN", "XLOOKUP", "XMATCH", "MAXIFS", "MINIFS", "IFS", "SWITCH", "IFNA", "DAYS", "ISOWEEKNUM",
  "CEILING.MATH", "FLOOR.MATH", "STDEV.S", "STDEV.P", "VAR.S", "VAR.P", "RANK.EQ", "RANK.AVG", "LET",
]);

/** A call as a file writes it: the function's name (with _xlfn. where Excel needs it) and its arguments */
export function call(name: string, args: readonly string[]): string {
  return `${FUTURE_FUNCTIONS.has(name) ? "_xlfn." : ""}${name}(${args.join(",")})`;
}

/** Excel's names in a formula written by hand (a template): with _xlfn. where Excel needs it */
export function withFutureNames(text: string): string {
  return text.replace(/(?<![\w.])([A-Z][A-Z0-9]*(?:\.[A-Z0-9]+)*)(?=\()/gi, (name) =>
    FUTURE_FUNCTIONS.has(name.toUpperCase()) ? `_xlfn.${name.toUpperCase()}` : name,
  );
}

// Functions Excel has with the same meaning and arguments (cells written as Excel's values: numbers, dates)
export const SAME_IN_EXCEL: ReadonlySet<string> = new Set([
  "SUM", "AVERAGE", "MIN", "MAX", "PRODUCT", "COUNT", "COUNTA", "SUMIFS", "COUNTIFS", "AVERAGEIFS", "MAXIFS", "MINIFS",
  "SUMPRODUCT", "MEDIAN", "LARGE", "SMALL", "RANK", "STDEV", "INT", "MROUND", "MOD", "ABS", "IF", "IFERROR", "AND", "OR",
  "NOT", "ISNUMBER", "CONCAT", "TEXTJOIN", "LEN", "MID", "SEARCH", "SUBSTITUTE", "UPPER", "LOWER", "PROPER", "TRIM",
  "XLOOKUP", "TODAY", "NOW", "DATE", "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND", "WEEKDAY", "ISOWEEKNUM",
  "EOMONTH", "NETWORKDAYS", "WORKDAY",
]);

const texts = (args: readonly ExcelArgument[]) => args.map((a) => a.text);

/** The arguments, those left out at the end given as Excel needs them (ROUND's digits) */
const padded = (args: readonly ExcelArgument[], defaults: readonly string[]) =>
  defaults.map((d, i) => (args[i] === undefined || args[i]!.text === "" ? d : args[i]!.text));

// A unit written in the formula, as formulas name them ("days" is "d"); undefined: from a cell, or none
function unitOf(arg: ExcelArgument | undefined): string | undefined {
  if (typeof arg?.literal !== "string") return undefined;
  const unit = toUnit(arg.literal);
  if (typeof unit === "string") return unit;
  const partial = arg.literal.trim().toLowerCase();
  return partial === "md" || partial === "ym" || partial === "yd" ? partial : undefined;
}

const UNIT_REASON = { reason: "its unit is not written in the formula (it comes from a cell)" };

// Functions written otherwise in Excel
export const EXCEL_FUNCTIONS: Readonly<Record<string, ExcelCall>> = {
  // Ours count from the first row under the header, Excel's from the sheet's first row (the header)
  ROW: () => "(ROW()-1)",
  // Ours: digits optional; Excel's: required
  ROUND: (args) => call("ROUND", padded(args, ["", "0"])),
  ROUNDUP: (args) => call("ROUNDUP", padded(args, ["", "0"])),
  ROUNDDOWN: (args) => call("ROUNDDOWN", padded(args, ["", "0"])),
  TIME: (args) => call("TIME", padded(args, ["", "0", "0"])),
  // Ours are Excel's CEILING.MATH and FLOOR.MATH (the significance optional, its sign left out)
  CEILING: (args) => call("CEILING.MATH", texts(args)),
  FLOOR: (args) => call("FLOOR.MATH", texts(args)),
  // Excel reads TEXT's format codes in its own language (a Czech Excel's year is "rrrr")
  TEXT: () => ({ reason: "Excel reads TEXT's format codes in its own language" }),
  DATEADD: ([date, amount, unit]) => {
    const d = `(${date!.text})`;
    const n = `(${amount!.text})`;
    switch (unitOf(unit)) {
      case "s":
        return `${d}+${n}/86400`;
      case "min":
        return `${d}+${n}/1440`;
      case "h":
        return `${d}+${n}/24`;
      case "d":
        return `${d}+${n}`;
      case "w":
        return `${d}+${n}*7`;
      // EDATE drops the time of day: added again
      case "m":
        return `${call("EDATE", [d, n])}+MOD(${d},1)`;
      case "y":
        return `${call("EDATE", [d, `${n}*12`])}+MOD(${d},1)`;
      default:
        return UNIT_REASON;
    }
  },
  DATEDIF: ([start, end, unit]) => {
    const days = `((${end!.text})-(${start!.text}))`;
    const u = unitOf(unit);
    switch (u) {
      case "s":
        return call("TRUNC", [`${days}*86400`]);
      case "min":
        return call("TRUNC", [`${days}*1440`]);
      case "h":
        return call("TRUNC", [`${days}*24`]);
      case "d":
        return call("TRUNC", [days]);
      case "w":
        return call("TRUNC", [`${days}/7`]);
      // Excel's own units (it gives #NUM! where the end is earlier; ours count back)
      case "m":
      case "y":
      case "md":
      case "ym":
      case "yd":
        return call("DATEDIF", [start!.text, end!.text, `"${u.toUpperCase()}"`]);
      default:
        return UNIT_REASON;
    }
  },
};

/**
 * Templates of the user's functions (tablePlus.modules.excel.functions):
 * {1}, {2}… the arguments as Excel writes them; false: never a formula
 */
export type ExcelTemplates = Readonly<Record<string, string | false>>;

const templateOf = (name: string, templates: ExcelTemplates) => Object.entries(templates).find(([n]) => n.toUpperCase() === name)?.[1];

/** Whether a template is set for the function */
export function hasTemplate(name: string, templates: ExcelTemplates): boolean {
  return templateOf(name, templates) !== undefined;
}

/**
 * How a call is written in Excel, or why it cannot be: a template first, then
 * the built-in forms (not for a custom function, even of a built-in's name)
 */
export function excelCall(name: string, args: readonly ExcelArgument[], templates: ExcelTemplates, custom = false): string | { readonly reason: string } {
  const template = templateOf(name, templates);
  if (template === false) return { reason: `${name} is set to be written as its value` };
  if (typeof template === "string") {
    if (template.trim() === "") return { reason: `the template of ${name} is empty` };
    // Arguments that are operations, and the whole, in parentheses: ({1}-{2})/{1} of A1+1 is ((A2+1)-B2)/(A2+1)
    const filled = template.replace(/\{(\d+)\}/g, (_, i: string) => {
      const arg = args[Number(i) - 1];
      return arg ? (arg.operation ? `(${arg.text})` : arg.text) : "";
    });
    return `(${withFutureNames(filled)})`;
  }
  if (custom) return { reason: `${name} is a custom function with no Excel form (see tablePlus.modules.excel.functions)` };
  const own = EXCEL_FUNCTIONS[name];
  if (own) return own(args);
  if (SAME_IN_EXCEL.has(name)) return call(name, texts(args));
  return { reason: `${name} has no Excel form` };
}
