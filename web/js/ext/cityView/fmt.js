// Number formatting for the City View: format.js's compact helpers with a roll-over fix, so a value that rounds up
// to the next unit reads "1,0 mi" rather than "1000 mil" (e.g. Westchester's 999,600 people). format.js is shared
// with the rest of the app; this wrapper keeps the same output for every other value.
import { compact as baseCompact, popShort as basePopShort, UNIT } from "../../format.js";

const UNITS = [[1e12, UNIT.t.trim()], [1e9, UNIT.b.trim()], [1e6, UNIT.m.trim()], [1e3, UNIT.k.trim()]];

/** Rounds n up to the next unit when its compact form would print 1000 of the current one. */
function rollover(n, fmt) {
  if (n == null || Number.isNaN(n)) return fmt(n);
  const s = fmt(n);
  const m = /^-?1000(?:[.,]0+)? ?(\S+)$/.exec(s);
  const i = m ? UNITS.findIndex(([, u]) => u === m[1]) : -1;
  if (i < 1) return s;
  return fmt(Math.sign(n) * UNITS[i - 1][0]);
}

export const compact = (n) => rollover(n, baseCompact);
export const money = (n) => (n == null ? "–" : "R$ " + compact(n));
export const yieldValue = (y, v) => (y.unit === "usd" ? money(v) : compact(v));
export const popShort = (n) => rollover(n, basePopShort);
