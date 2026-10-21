import type { Series } from "../series.ts";

/** Lists AutoFill goes round: days and months, English and Czech, long and short */
export const LISTS: readonly (readonly string[])[] = [
  ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"],
  ["po", "út", "st", "čt", "pá", "so", "ne"],
  ["leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"],
  ["led", "úno", "bře", "dub", "kvě", "čvn", "čvc", "srp", "zář", "říj", "lis", "pro"],
];

/** A word as lists are matched: lower case, without diacritics (Út is út, ut and UT) */
function key(word: string): string {
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
 * the list (Fri, Sat → Sun, Mon). Written as the first is: its case, and
 * without diacritics when the words are typed without them (Po, Ut → St, Ct).
 */
export function listSeries(name: string, lists: readonly (readonly string[])[]): Series {
  return {
    name,
    match: (values) => {
      if (values.length === 0) return undefined;
      for (const list of lists) {
        const keys = list.map(key);
        const indexes = values.map((v) => keys.indexOf(key(v)));
        if (indexes.some((i) => i < 0)) continue;
        const n = list.length;
        const step = indexes.length === 1 ? 1 : (((indexes[1]! - indexes[0]!) % n) + n) % n;
        if (step === 0 || !indexes.every((index, i) => index === (((indexes[0]! + i * step) % n) + n) % n)) continue;
        // Typed without diacritics where the list has them: written without
        const bare = values.every((v) => plain(v) === v) && values.some((_, i) => plain(list[indexes[i]!]!) !== list[indexes[i]!]);
        const first = values[0]!.trim();
        return (i) => {
          const word = list[(((indexes[0]! + i * step) % n) + n) % n]!;
          return inCase(bare ? plain(word) : word, first);
        };
      }
      return undefined;
    },
  };
}

export default listSeries("lists", LISTS);
