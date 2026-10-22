import type { Series } from "../series.ts";

/**
 * A list AutoFill goes round; `alone`: one word of it starts the series (else
 * two are needed: the short Czech days and months are also everyday words,
 * ne, po, so, pro, a column of which is copied)
 */
export type FillList = { readonly words: readonly string[]; readonly alone: boolean };

/** Lists AutoFill goes round: days and months, English and Czech, long and short */
export const LISTS: readonly FillList[] = [
  { words: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], alone: true },
  { words: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], alone: true },
  { words: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"], alone: true },
  { words: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], alone: true },
  { words: ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"], alone: true },
  { words: ["po", "út", "st", "čt", "pá", "so", "ne"], alone: false },
  { words: ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"], alone: true },
  { words: ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"], alone: false },
];

/** A word as lists are matched: lower case, without diacritics (Út is út, ut and UT) */
export function key(word: string): string {
  return plain(word.trim().toLowerCase());
}

function plain(word: string): string {
  return word.normalize("NFD").replace(/\p{M}/gu, "");
}

/** `word` in the case of `as`: UPPER, Capitalized or lower */
function inCase(word: string, as: string): string {
  if (as.length > 1 && as === as.toUpperCase() && as !== as.toLowerCase()) return word.toUpperCase();
  if (as[0] === as[0]!.toUpperCase() && as[0] !== as[0]!.toLowerCase()) return word[0]!.toUpperCase() + word.slice(1).toLowerCase();
  return word.toLowerCase();
}

/**
 * Words of a list, one or more of the same list a step apart: they go on round
 * the list (Fri, Sat → Sun, Mon). Typed as the list writes them, they are
 * written so (iPhone → iPad, L → XL); else as the first is: its case (mon →
 * tue), and without diacritics when typed without them (Po, Ut → St, Ct).
 */
export function listSeries(name: string, lists: readonly FillList[]): Series {
  return {
    name,
    match: (values) => {
      if (values.length === 0) return undefined;
      for (const { words: list, alone } of lists) {
        if (!alone && values.length < 2) continue;
        const keys = list.map(key);
        const indexes = values.map((v) => keys.indexOf(key(v)));
        if (indexes.some((i) => i < 0)) continue;
        const n = list.length;
        const step = indexes.length === 1 ? 1 : (((indexes[1]! - indexes[0]!) % n) + n) % n;
        if (step === 0 || !indexes.every((index, i) => index === (((indexes[0]! + i * step) % n) + n) % n)) continue;
        // Typed without diacritics where the list has them: written without
        const bare = values.every((v) => plain(v) === v) && values.some((_, i) => plain(list[indexes[i]!]!) !== list[indexes[i]!]);
        const first = values[0]!.trim();
        const asListed = values.every((v, i) => v.trim() === list[indexes[i]!]);
        return (i) => {
          const word = list[(((indexes[0]! + i * step) % n) + n) % n]!;
          return asListed ? word : inCase(bare ? plain(word) : word, first);
        };
      }
      return undefined;
    },
  };
}

export default listSeries("lists", LISTS);
