// What a name may be (of a table, a column, a row, a cell), and when two
// table names are the same: rules, not data a table keeps, so any part of
// Silverware Table may use them.

// A cell's A1 name in formulas: column letters, then the row from 1
export const CELL_RE = /^([A-Za-z]{1,3})([1-9]\d*)$/;

// A name formulas can write: letters, digits and _, not starting with a digit
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Why a text cannot be a name (of a table, a column, a cell); undefined when it can */
export function nameProblem(name: string, what: string): string | undefined {
  if (!NAME_RE.test(name)) return `"${name}" is not a ${what} name: letters, digits and _, not starting with a digit`;
  // Formulas would read it as a cell (A1, AB12) or a logical value
  if (CELL_RE.test(name) || /^(true|false)$/i.test(name)) return `"${name}" would read as a cell or a value`;
  return undefined;
}

/** Why a text cannot be a table's name (written before "!" in formulas); undefined when it can */
export function tableNameProblem(name: string): string | undefined {
  return nameProblem(name, "table");
}

/** Whether two table names are the same: names are compared ignoring case */
export function sameTableName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
