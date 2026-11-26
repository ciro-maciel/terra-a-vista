/** A number with d decimals and a Brazilian decimal comma (text for people; never for CSS or canvas values). */
export const dec = (x, d = 1) => x.toFixed(d).replace(".", ",");

export function compact(n) {
  if (n == null || Number.isNaN(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e12) return dec(n / 1e12, a >= 1e13 ? 1 : 2) + " tri";
  if (a >= 1e9) return dec(n / 1e9, a >= 1e11 ? 0 : 1) + " bi";
  if (a >= 1e6) return dec(n / 1e6, a >= 1e8 ? 0 : 1) + " mi";
  if (a >= 1e3) return dec(n / 1e3, a >= 1e5 ? 0 : 1).replace(/,0$/, "") + " mil";
  return String(Math.round(n));
}

export const money = (n) => (n == null ? "–" : "R$ " + compact(n));
export const dollars = (n) => (n == null ? "–" : "R$ " + Math.round(n).toLocaleString("pt-BR"));
export const int = (n) => (n == null ? "–" : Math.round(n).toLocaleString("pt-BR"));
export const pct = (x, d = 1) => (x == null ? "–" : dec(x * 100, d) + "%");

export function yieldValue(y, v) {
  return y.unit === "usd" ? money(v) : compact(v);
}

export function popShort(n) {
  if (n >= 1e7) return Math.round(n / 1e6) + " mi";
  if (n >= 1e6) return dec(n / 1e6, 1) + " mi";
  return Math.round(n / 1e3) + " mil";
}

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
