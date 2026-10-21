import { formatClock, parseClock } from "../../formulas/values.ts";
import type { Series } from "../series.ts";

const DAY = 86_400;

/**
 * Times as formulas write them (14:30, 9:05:30, 40:00): one time goes on hour
 * by hour, several by the same step between them. Times of day (all under
 * 24:00) go round midnight; lengths of time go on past it.
 */
export default {
  name: "times",
  match: (values) => {
    const times = values.map((v) => parseClock(v)?.seconds);
    if (times.length === 0 || !times.every((t) => t !== undefined)) return undefined;
    const all = times as number[];
    const first = all[0]!;
    const step = all.length === 1 ? 3600 : all[1]! - first;
    if (step === 0 || !all.every((t, i) => t === first + i * step)) return undefined;
    const ofDay = all.every((t) => t >= 0 && t < DAY);
    return (i) => {
      const seconds = first + i * step;
      return formatClock(ofDay ? ((seconds % DAY) + DAY) % DAY : seconds);
    };
  },
} satisfies Series;
