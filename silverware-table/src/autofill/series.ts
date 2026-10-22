/**
 * What a line of cells filled goes on with (AutoFill): the cells selected in
 * a column (or a row) are values 0..k-1, the cells dragged over after them
 * k, k+1…, before them (dragged up or left) -1, -2…
 */
export type Generator = (index: number) => string;

/**
 * A series AutoFill can go on with: 1, 2 → 3, 4; Mon, Tue → Wed, Thu. The
 * series are tried in order; the first whose `match` gives a generator for
 * the values selected fills them (none: the values repeat).
 */
export type Series = {
  // Its name, for messages and for a custom series that replaces a built-in one
  readonly name: string;
  /**
   * The generator for these values (the cells' texts, in their order; empty
   * cells are ""), when the series is theirs; undefined when it is not. Called
   * once when a drag starts: what the values have in common (a step, a list,
   * a case) is worked out here, so the generator is quick for every cell.
   */
  match(values: readonly string[]): Generator | undefined;
};
