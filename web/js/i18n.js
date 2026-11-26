// Language of the text people read. Portuguese (pt-BR) is the source: every string in the code is written in
// Portuguese and is its own key. English comes from web/i18n/en.json, a map from the Portuguese text to the English
// one; a key missing there shows in Portuguese (tools/i18n.py lists what is missing).
//
// The language is chosen once per page load: ?lang=pt|en in the address, then the visitor's last choice, then the
// browser language (pt-* reads Portuguese, anything else English). setLang() stores the choice and reloads.

const LANGS = ["pt", "en"];
const STORE_KEY = "terra-a-vista.lang";

function chosen() {
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (LANGS.includes(q)) return q;
  } catch {}
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (LANGS.includes(s)) return s;
  } catch {}
  const prefs = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  for (const p of prefs) {
    if (!p) continue;
    return p.toLowerCase().startsWith("pt") ? "pt" : "en";
  }
  return "pt";
}

export const lang = chosen();
/** BCP 47 tag for Intl and toLocaleString. */
export const LOCALE = lang === "en" ? "en-US" : "pt-BR";
/** Decimal separator of the chosen language. */
export const DEC = lang === "en" ? "." : ",";

// Where this module lives decides where the dictionary is, so pages in subfolders (pergunte/, como-contamos/) work.
const DICT_URL = new URL("../i18n/en.json", import.meta.url);
const SKIP_URL = new URL("../i18n/skip.json", import.meta.url);

let dict = null;
let skip = {}; // per data file, the paths whose strings are proper names and stay as they are (web/i18n/skip.json)
if (lang === "en") {
  try {
    const [d, k] = await Promise.all([fetch(DICT_URL), fetch(SKIP_URL)]);
    if (d.ok) dict = new Map(Object.entries(await d.json()));
    if (k.ok) skip = await k.json();
  } catch {
    dict = null; // no dictionary: the page stays readable in Portuguese
  }
}

/**
 * tr(): the text in the chosen language. `pt` is the Portuguese text and the key; {0}, {1}… are filled with args in
 * order (the translation may move them).
 */
export function tr(pt, ...args) {
  let s = dict?.get(pt) ?? pt;
  if (args.length) s = s.replace(/\{(\d+)\}/g, (m, i) => (+i < args.length ? String(args[+i] ?? "") : m));
  return s;
}

/** The translation of a data string (a name, a unit, a rule from web/data), or the string itself. */
export const td = (s) => (typeof s === "string" && dict ? dict.get(s) ?? s : s);

/**
 * Translates the text of a data file in place: every string value (never an object key, so lookups by name keep
 * working) that the dictionary knows, except the paths web/i18n/skip.json lists for that file (place names). A path
 * is the chain of object keys, array positions left out ("areas.n").
 */
const TOKEN = /^[a-zà-ú0-9_\-:.]+$/; // tools/i18n.py is_token: the same rule

export function translateData(name, data) {
  if (!dict || data == null) return data;
  const skipped = new Set(skip[name] || []);
  if (skipped.has("*")) return data;
  const walk = (o, path) => {
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        if (typeof o[i] === "string") { if (!skipped.has(path) && !TOKEN.test(o[i])) o[i] = dict.get(o[i]) ?? o[i]; }
        else if (o[i] && typeof o[i] === "object") walk(o[i], path);
      }
      return;
    }
    for (const k of Object.keys(o)) {
      const v = o[k], p = path ? `${path}.${k}` : k;
      // One lowercase word is an id ("misto", "cattle") the code compares, so it stays, unless it is a unit ("anos").
      if (typeof v === "string") { if (!skipped.has(p) && !skipped.has(path) && (k === "unit" || !TOKEN.test(v))) o[k] = dict.get(v) ?? v; }
      else if (v && typeof v === "object" && !skipped.has(p)) walk(v, p);
    }
  };
  walk(data, "");
  return data;
}

/** Stores the language and reloads the page in it, keeping the view (the hash). */
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  try { localStorage.setItem(STORE_KEY, next); } catch {}
  const url = new URL(location.href);
  url.searchParams.set("lang", next);
  location.replace(url.toString());
}

/** Translates the static markup of a page: whole blocks marked data-i18n-html, then text nodes and the attributes people read. */
export function translateDocument(root = document) {
  document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  if (!dict) return;
  // Prose with links or emphasis inside is translated as one block, so the sentence is not cut into pieces.
  for (const el of root.querySelectorAll("[data-i18n-html]")) {
    const hit = dict.get(normHtml(el.innerHTML));
    if (hit != null) el.innerHTML = hit;
  }
  const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("script, style, [data-i18n-html]")) continue;
    const raw = n.nodeValue, key = raw.trim().replace(/\s+/g, " ");
    if (!key) continue;
    const hit = dict.get(key);
    if (hit != null) n.nodeValue = raw.replace(raw.trim(), hit);
  }
  const attrs = ["title", "aria-label", "placeholder", "alt", "content"];
  for (const el of root.querySelectorAll("*")) {
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v == null) continue;
      if (a === "content" && !el.matches('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]')) continue;
      const hit = dict.get(v.trim());
      if (hit != null) el.setAttribute(a, hit);
    }
  }
  const title = dict.get(document.title.trim());
  if (title) document.title = title;
}

/** The key of a block of markup: its HTML with runs of whitespace made one space. tools/i18n.py does the same. */
export const normHtml = (html) => html.trim().replace(/\s+/g, " ");

/** The language switch: a segmented control (PT | EN), the current one lit. */
export function langSwitchHtml(cls = "") {
  const b = (code, label, name) =>
    `<button type="button" class="seg-btn${code === lang ? " on" : ""}" data-lang="${code}" lang="${code === "en" ? "en" : "pt-BR"}"
      aria-pressed="${code === lang}" title="${name}">${label}</button>`;
  return `<div class="lang-switch ${cls}" role="group" aria-label="${tr("Idioma")}">${b("pt", "PT", "Português (Brasil)")}${b("en", "EN", "English")}</div>`;
}

/** Wires every language switch inside root. */
export function wireLangSwitch(root = document) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".lang-switch [data-lang]");
    if (btn) setLang(btn.dataset.lang);
  });
}
