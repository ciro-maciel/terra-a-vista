import { DEC, LOCALE, lang } from "./i18n.js";

/** Short scale words of the chosen language: 1,2 mi in Portuguese, 1.2M in English. */
export const UNIT = lang === "en"
  ? { t: "T", b: "B", m: "M", k: "k" }
  : { t: " tri", b: " bi", m: " mi", k: " mil" };

/** A number with d decimals and the language's decimal separator (text for people; never for CSS or canvas values). */
export const dec = (x, d = 1) => x.toFixed(d).replace(".", DEC);

export function compact(n) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e12) return dec(n / 1e12, a >= 1e13 ? 1 : 2) + UNIT.t;
  if (a >= 1e9) return dec(n / 1e9, a >= 1e11 ? 0 : 1) + UNIT.b;
  if (a >= 1e6) return dec(n / 1e6, a >= 1e8 ? 0 : 1) + UNIT.m;
  if (a >= 1e3) return dec(n / 1e3, a >= 1e5 ? 0 : 1).replace(DEC + "0", "") + UNIT.k;
  return String(Math.round(n));
}

export const money = (n) => (n == null ? "–" : "R$ " + compact(n));
export const dollars = (n) => (n == null ? "–" : "R$ " + Math.round(n).toLocaleString(LOCALE));
export const int = (n) => (n == null ? "–" : Math.round(n).toLocaleString(LOCALE));
export const pct = (x, d = 1) => (x == null ? "–" : dec(x * 100, d) + "%");

export function yieldValue(y, v) {
  return y.unit === "usd" ? money(v) : compact(v);
}

export function popShort(n) {
  if (n >= 1e7) return Math.round(n / 1e6) + UNIT.m;
  if (n >= 1e6) return dec(n / 1e6, 1) + UNIT.m;
  return Math.round(n / 1e3) + UNIT.k;
}

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
