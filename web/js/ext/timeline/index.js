// Timeline: the map through time, one theme at a time.
//   Gente  — each Census year since 1970 (history.json): the banners move to the population counted that year and
//            each city (or state) takes the colour of its yearly growth over the decade that ends there.
//   others — a series file (series_<id>.json, pipeline/build/series_util.py): each municipality (or state) takes the
//            colour of the chosen measure that year, on one fixed scale for every year.
//
//   top-bar button "Linha do tempo" · URL hash #year=1991&tema=land (the arrow keys stay with the map)
// Panels and data stay on today's numbers; only the banners and the lens change (app.setBannerCities, app.setLens).
// A theme whose file is missing simply does not show.
import { esc, UNIT } from "../../format.js";
import { icon } from "../../ui/icon.js";
import { tr, LOCALE } from "../../i18n.js";

const RAMP = ["#7a1f2b", "#c2463d", "#e8a07a", "#efe6d2", "#8fcbb8", "#2e9c8a", "#0f5e57"];
const DOMAIN = [-0.05, 0.05]; // yearly growth, the same for every decade
const BIG = 100000;
// id, button label, series file (none = the Census theme). Order = order on the bar.
const THEMES = [
  { id: "people", label: tr("Gente") },
  { id: "land", label: tr("Terra"), file: "series_land", icon: "l-forest" },
  { id: "farm", label: tr("Lavoura"), file: "series_farm", icon: "l-farmland" },
  { id: "health", label: tr("Saúde"), file: "series_health", icon: "l-age" },
  { id: "school", label: tr("Escola"), file: "series_school", icon: "l-degrees" },
  { id: "net", label: tr("Conexão"), file: "series_net", icon: "l-developed" },
  { id: "disasters", label: tr("Desastres"), file: "series_disasters", icon: "unemployment" },
  { id: "idhm", label: tr("IDH"), file: "series_idhm", icon: "l-income" },
];
const nf = (d) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits: d, minimumFractionDigits: d });
const rate = (a, b, years) => (a > 0 && b > 0 && years > 0 ? (b / a) ** (1 / years) - 1 : null);
const pctY = (g) => (Number.isFinite(g) ? tr("{0}{1}% ao ano", g >= 0 ? "+" : "−", nf(1).format(Math.abs(g * 100))) : "–");
const pts = (d, m) => m.digits != null && m.format !== "pct"
  ? `${d >= 0 ? "+" : "−"}${nf(m.digits).format(Math.abs(d))}`
  : m.format === "pct"
  ? `${d >= 0 ? "+" : "−"}${nf(1).format(Math.abs(d * 100))} ${Math.abs(d * 100) >= 0.95 && Math.abs(d * 100) < 1.05 ? tr("ponto") : tr("pontos")}`
  : `${d >= 0 ? "+" : "−"}${nf(m.format === "int" ? 0 : 1).format(Math.abs(d))}`;
const people = (v) => (v >= 1e6 ? `${nf(v >= 1e7 ? 1 : 2).format(v / 1e6)}${UNIT.m}` : v >= 1e4 ? `${nf(0).format(v / 1e3)}${UNIT.k}` : nf(0).format(v));
const PLAY = `<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5v9l7-4.5z" fill="currentColor"/></svg>`;
const PAUSE = `<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z" fill="currentColor"/></svg>`;

const CSS = `
.tl-bar { position: fixed; left: 50%; bottom: 62px; transform: translateX(-50%); z-index: 30; width: max-content; max-width: min(860px, calc(100vw - 32px));
  background: linear-gradient(180deg, var(--panel-2, #231b10), var(--panel, #17120a)); border: 1px solid rgba(201,164,92,.55);
  border-radius: 6px; padding: 10px 12px 9px; color: var(--ink, #efe3c4); box-shadow: 0 6px 24px rgba(0,0,0,.45); font-size: 12px; }
.tl-bar[hidden] { display: none; }
.tl-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tl-title { font-size: 11px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: var(--gold, #c9a45c); margin-right: 4px; }
.tl-year { font: 600 13px var(--serif, serif); min-width: 50px; padding: 4px 8px; border-radius: 3px; cursor: pointer;
  color: var(--ink-dim, #b9ab8a); background: rgba(255,255,255,.04); border: 1px solid rgba(201,164,92,.25); }
.tl-year[aria-pressed="true"] { color: #1a1208; background: var(--gold-bright, #f3dc9c); border-color: var(--gold-bright, #f3dc9c); }
.tl-play, .tl-x, .tl-seg button { cursor: pointer; color: var(--gold-bright, #f3dc9c); background: rgba(201,164,92,.12);
  border: 1px solid rgba(201,164,92,.55); border-radius: 3px; padding: 4px 8px; font-size: 12px; display: inline-flex; align-items: center; gap: 5px; }
.tl-x { margin-left: auto; padding: 4px 7px; }
.tl-seg { display: inline-flex; margin-left: 6px; }
.tl-seg button { border-radius: 0; color: var(--ink-dim, #b9ab8a); }
.tl-seg button:first-child { border-radius: 3px 0 0 3px; } .tl-seg button:last-child { border-radius: 0 3px 3px 0; border-left: 0; }
.tl-seg button[aria-pressed="true"] { color: var(--gold-bright, #f3dc9c); background: rgba(201,164,92,.28); }
.tl-themes { display: flex; gap: 4px; margin-bottom: 7px; flex-wrap: wrap; }
.tl-theme { cursor: pointer; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; padding: 3px 9px; border-radius: 3px;
  color: var(--ink-dim, #b9ab8a); background: transparent; border: 1px solid rgba(201,164,92,.25); }
.tl-theme[aria-pressed="true"] { color: var(--gold-bright, #f3dc9c); border-color: rgba(201,164,92,.75); background: rgba(201,164,92,.18); }
.tl-metrics { display: flex; gap: 4px; margin-top: 7px; flex-wrap: wrap; }
.tl-metric { cursor: pointer; font-size: 12px; padding: 3px 8px; border-radius: 3px; color: var(--ink-dim, #b9ab8a);
  background: rgba(255,255,255,.04); border: 1px solid rgba(201,164,92,.25); }
.tl-metric[aria-pressed="true"] { color: #1a1208; background: var(--gold-bright, #f3dc9c); border-color: var(--gold-bright, #f3dc9c); }
.tl-info { margin-top: 7px; line-height: 1.45; color: var(--ink-dim, #b9ab8a); }
.tl-info b { color: var(--ink, #efe3c4); font-weight: 600; }
.tl-legend { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 11px; color: var(--ink-dim, #b9ab8a); flex-wrap: wrap; }
.tl-legend i { display: block; width: 150px; height: 8px; border-radius: 2px; background: linear-gradient(90deg, ${RAMP.join(",")}); }
@media (max-width: 640px) { .tl-bar { bottom: 56px; padding: 8px; } .tl-year { min-width: 0; padding: 4px 6px; } .tl-legend i { width: 90px; } }
`;

export function install(app) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  let hist = null;
  const files = new Map(); // theme id → series data (or null when the file is missing)
  let open = false, theme = "people", year = null, by = "cities", timer = null, savedLens = null, ourLens = null;
  const metricOf = {}; // theme id → chosen metric id
  const cities = app.data.cities || [];
  const stateRows = app.data.states || [];
  const abbrOf = new Map(stateRows.map((s) => [s.fips, s.abbr]));
  const owner = app.w.raw.owner;
  const county = app.w.raw.county || [];
  const counties = app.w.raw.counties || [];
  const n = app.w.grid.size;
  // cell → city: footprints, smaller cities first so a bigger city's majority wins; then every city's own cell.
  const cellCity = new Map();
  for (let k = cities.length - 1; k >= 0; k--) for (const cell of cities[k].footprint || []) cellCity.set(cell, cities[k]);
  for (const c of cities) if (c.cell != null) cellCity.set(c.cell, c);

  const bar = document.createElement("div");
  bar.className = "tl-bar";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", tr("Linha do tempo"));
  document.body.appendChild(bar);

  const btn = app.ui.addTopButton({
    id: "btn-timeline", label: tr("Linha do tempo"), title: tr("Linha do tempo: a gente desde 1970, a terra desde 1985, a lavoura e o gado desde 1975"),
    onClick: () => (open ? close() : show()),
  });
  if (btn) {
    btn.innerHTML = tr("<svg class=\"icon\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><circle cx=\"12\" cy=\"12\" r=\"8.5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/><path d=\"M12 7v5.2l3.4 2.1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg><span class=\"lbl\">Linha do tempo</span>");
    btn.setAttribute("aria-pressed", "false");
  }

  const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
  async function load(id) {
    const t = themeOf(id);
    if (!t.file) return (hist ??= await app.loadData("history"));
    if (!files.has(t.id)) files.set(t.id, await app.loadData(t.file));
    return files.get(t.id);
  }
  // Themes whose file exists (Gente always, when history.json does).
  const available = () => THEMES.filter((t) => (t.file ? files.get(t.id) : hist));
  const yearsOf = () => (theme === "people" ? hist.census_years : files.get(theme).years);

  async function show(y, t) {
    await Promise.all(THEMES.map((x) => load(x.id)));
    t = t || theme; // the hash may set the theme while the files load
    if (!hist && !available().length) { app.ui.toast?.(tr("A linha do tempo não carregou (faltam os arquivos de dados).")); return; }
    if (!available().some((x) => x.id === t)) t = available()[0].id;
    if (!open) savedLens = app.state.lens;
    open = true;
    btn?.setAttribute("aria-pressed", "true");
    bar.hidden = false;
    setTheme(t, y);
  }

  function setTheme(t, y) {
    theme = t;
    if (theme !== "people") {
      app.setBannerCities(null);
      const d = files.get(theme);
      if (!metricOf[theme] || !d.metrics.some((m) => m.id === metricOf[theme])) metricOf[theme] = d.metrics[0].id;
      if (by === "cities") by = "munis";
    } else if (by === "munis") by = "cities";
    const ys = yearsOf();
    setYear(ys.includes(+y) ? +y : theme === "people" ? ys[0] : ys[ys.length - 1]);
  }

  function close() {
    stop();
    open = false;
    year = null;
    bar.hidden = true;
    btn?.setAttribute("aria-pressed", "false");
    app.setBannerCities(null);
    if (ourLens == null || app.state.lens === ourLens) app.setLens(savedLens || null);
    ourLens = null;
    app.hash.update?.();
  }

  function setYear(y) {
    year = y;
    const i = yearsOf().indexOf(y);
    if (theme === "people") {
      // Banners: the cities with a count that year, biggest first.
      const list = [];
      for (const c of cities) {
        const p = hist.cities[c.id]?.p?.[i];
        if (p != null) list.push({ ...c, __orig: c, population: p, growth: null });
      }
      list.sort((a, b) => b.population - a.population);
      app.setBannerCities(list);
      paintGrowth(i);
      renderPeople(i, list);
    } else {
      paintSeries(i);
      renderSeries(i);
    }
    app.hash.update?.();
  }

  function growthOf(series, i) {
    const ys = hist.census_years;
    return i > 0 ? rate(series?.[i - 1], series?.[i], ys[i] - ys[i - 1]) : null;
  }

  function paintGrowth(i) {
    const ys = hist.census_years;
    if (i === 0) { ourLens = null; app.setLens(null); return; }
    const values = new Array(n).fill(null);
    if (by === "states") {
      const g = stateRows.map((s) => growthOf(hist.states[s.abbr]?.p, i));
      for (let c = 0; c < n; c++) if (owner[c] >= 0 && Number.isFinite(g[owner[c]])) values[c] = g[owner[c]];
    } else {
      const g = new Map(cities.map((c) => [c.id, growthOf(hist.cities[c.id]?.p, i)]));
      for (const [cell, c] of cellCity) if (owner[cell] >= 0 && Number.isFinite(g.get(c.id))) values[cell] = g.get(c.id);
    }
    ourLens = {
      id: `tl-growth-${by}-${ys[i]}`, group: "people", name: tr("Crescimento de {0} a {1}", ys[i - 1], ys[i]), icon: "l-people",
      unit: tr("ao ano"), format: "pct", scale: "linear", domain: DOMAIN, ramp: RAMP, higher_is: "neutral", source: "ibge_history",
      description: tr("Crescimento médio por ano da população entre os Censos de {0} e {1}, {2}. A mesma escala vale para todas as décadas.", ys[i - 1], ys[i], by === "states" ? tr("por estado") : tr("por cidade (os hexágonos cinza ficam fora das cidades)")),
      note: hist.rule, values,
    };
    app.setLens(ourLens);
  }

  // --- series themes ----------------------------------------------------------------------------------------------
  const metric = () => files.get(theme).metrics.find((m) => m.id === metricOf[theme]);
  const muniValue = (m, k, i) => {
    const v = files.get(theme).munis[m.id]?.[k]?.[i];
    return v == null ? null : v / (m.muni_div || 1);
  };

  function paintSeries(i) {
    const d = files.get(theme), m = metric();
    const values = new Array(n).fill(null);
    if (by === "states") {
      const v = stateRows.map((s) => d.states[s.abbr]?.[m.id]?.[i]);
      for (let c = 0; c < n; c++) if (owner[c] >= 0 && Number.isFinite(v[owner[c]])) values[c] = v[owner[c]];
    } else {
      for (let c = 0; c < n; c++) {
        const k = county[c];
        if (owner[c] < 0 || k == null || k < 0) continue;
        const v = muniValue(m, k, i);
        if (Number.isFinite(v)) values[c] = v;
      }
    }
    ourLens = {
      id: `tl-${theme}-${m.id}-${by}-${d.years[i]}`, group: theme, name: tr("{0} em {1}", m.name, d.years[i]), icon: themeOf(theme).icon || "l-people",
      unit: m.unit, format: m.format, scale: m.scale, domain: m.domain, ramp: m.ramp, higher_is: m.higher_is,
      source: d.sources[0],
      description: tr("{0} {1} A mesma escala vale para todos os anos.", m.description, by === "states" ? tr("Por estado.") : tr("Cada hexágono tem a cor do município que mais o ocupa.")),
      note: d.rule, values,
    };
    app.setLens(ourLens);
  }

  // The municipalities that changed the most: since the first year when every year has today's borders, else since
  // the year before (a municipality that later split would otherwise look like it shrank).
  // the first year this measure has a national value (5G coverage starts in 2022, not in 2019)
  const firstOf = (d, m) => Math.max(0, (d.nation[m.id] || []).findIndex((v) => v != null));
  const baseOf = (d, i, m) => (d.fixed_borders === false ? i - 1 : firstOf(d, m));
  function movers(m, i) {
    const d = files.get(theme);
    let up = null, down = null;
    const rows = d.munis[m.id] || [];
    const j = baseOf(d, i, m);
    if (j >= i) return {};
    for (const k of d.movers || rows.keys()) {
      const a = muniValue(m, k, j), b = muniValue(m, k, i);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const dv = b - a;
      if (!up || dv > up.dv) up = { k, dv };
      if (!down || dv < down.dv) down = { k, dv };
    }
    return { up, down };
  }
  const muniName = (k) => {
    const c = counties[k];
    return c ? `${c.name} (${abbrOf.get(String(c.geoid).slice(0, 2)) || ""})` : "";
  };

  function renderSeries(i) {
    const d = files.get(theme), m = metric(), ys = d.years;
    const br = d.nation[m.id] || [];
    const f0 = firstOf(d, m);
    const { up, down } = i > 0 ? movers(m, i) : {};
    const lo = m.domain?.[0], hi = m.domain?.[1];
    bar.innerHTML = tr("\n      {0}\n      <div class=\"tl-row\">\n        <span class=\"tl-title\">{1}</span>\n        <button type=\"button\" class=\"tl-play\" data-play>{2}</button>\n        {3}\n        <span class=\"tl-seg\" role=\"group\" aria-label=\"Colorir por\">\n          <button type=\"button\" data-by=\"munis\" aria-pressed=\"{4}\">Municípios</button><button type=\"button\" data-by=\"states\" aria-pressed=\"{5}\">Estados</button>\n        </span>\n        <button type=\"button\" class=\"tl-x\" data-close aria-label=\"Fechar a linha do tempo\" title=\"Fechar\">{6}</button>\n      </div>\n      <div class=\"tl-metrics\" role=\"group\" aria-label=\"Medida\">\n        {7}\n      </div>\n      <div class=\"tl-info\">\n        <b>Brasil em {8}: {9} {10}</b>{11}.\n        {12}\n        {13}\n      </div>\n      <div class=\"tl-legend\"><span>{14}</span><i style=\"background:linear-gradient(90deg, {15})\"></i><span>{16}</span><span>· {17}, {18}, na mesma escala para todos os anos · {19}</span></div>", themeBar(), esc(themeOf(theme).label), timer ? tr("{0}Pausar", PAUSE) : tr("{0}Tocar", PLAY), ys.map((y) => `<button type="button" class="tl-year" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join(""), by !== "states", by === "states", icon("close", "x", { size: 12 }), d.metrics.map((x) => `<button type="button" class="tl-metric" data-metric="${esc(x.id)}" aria-pressed="${x.id === m.id}" title="${esc(x.description)}">${esc(x.name)}</button>`).join(""), year, esc(fmtValue(m, br[i])), esc(m.unit || ""), i > f0 && Number.isFinite(br[f0]) && Number.isFinite(br[i]) ? tr(" · {0} desde {1}", pts(br[i] - br[f0], m), ys[f0]) : "", up && down ? tr("<br>{0}, {1}{2} foi em <b>{3}</b> ({4}) e {5}, em <b>{6}</b> ({7}).", d.fixed_borders === false ? tr("De {0} a {1}", ys[i - 1], year) : tr("Desde {0}", ys[f0]), d.movers ? tr("entre os municípios de {0} habitantes ou mais, ", people(d.movers_min_pop)) : "", up.dv >= 0 ? tr("a maior alta") : tr("a menor queda"), esc(muniName(up.k)), pts(up.dv, m), down.dv <= 0 ? tr("a maior queda") : tr("a menor alta"), esc(muniName(down.k)), pts(down.dv, m)) : "", i <= f0 ? `<br>${br[i] == null ? tr("Esta medida começa em {0}.", ys[f0]) : tr("Escolha um ano depois de {0} para ver quem mais mudou.", ys[f0])}` : "", esc(fmtValue(m, lo)), m.ramp.join(","), esc(fmtValue(m, hi)), esc(m.name), by === "states" ? tr("por estado") : tr("por município"), esc(d.vintage));
  }

  function fmtValue(m, v) {
    if (v == null || !Number.isFinite(v)) return "–";
    if (m.format === "pct") return `${nf(v * 100 < 10 ? 1 : 0).format(v * 100)}%`;
    return nf(m.digits ?? (m.format === "int" ? 0 : 1)).format(v);
  }

  function themeBar() {
    const list = available();
    if (list.length < 2) return "";
    return `<div class="tl-themes" role="group" aria-label="${tr("Tema")}">${list.map((t) => `<button type="button" class="tl-theme" data-theme="${t.id}" aria-pressed="${t.id === theme}">${esc(t.label)}</button>`).join("")}</div>`;
  }

  function renderPeople(i, list) {
    const ys = hist.census_years;
    const br = hist.nation.p;
    const gBr = growthOf(br, i);
    let fastest = null, slowest = null;
    if (i > 0) {
      for (const c of list) {
        if (c.population < BIG) continue;
        const g = growthOf(hist.cities[c.id]?.p, i);
        if (!Number.isFinite(g)) continue;
        if (!fastest || g > fastest.g) fastest = { c, g };
        if (!slowest || g < slowest.g) slowest = { c, g };
      }
    }
    const top = list[0];
    bar.innerHTML = tr("\n      {0}\n      <div class=\"tl-row\">\n        <span class=\"tl-title\">Gente</span>\n        <button type=\"button\" class=\"tl-play\" data-play>{1}</button>\n        {2}\n        <span class=\"tl-seg\" role=\"group\" aria-label=\"Colorir por\">\n          <button type=\"button\" data-by=\"cities\" aria-pressed=\"{3}\">Cidades</button><button type=\"button\" data-by=\"states\" aria-pressed=\"{4}\">Estados</button>\n        </span>\n        <button type=\"button\" class=\"tl-x\" data-close aria-label=\"Fechar a linha do tempo\" title=\"Fechar\">{5}</button>\n      </div>\n      <div class=\"tl-info\">\n        <b>Brasil em {6}: {7} de pessoas</b>{8}.\n        {9}\n        {10}\n        {11}\n      </div>\n      {12}", themeBar(), timer ? tr("{0}Pausar", PAUSE) : tr("{0}Tocar", PLAY), ys.map((y) => `<button type="button" class="tl-year" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join(""), by !== "states", by === "states", icon("close", "x", { size: 12 }), year, people(br[i]), i > 0 ? tr(" · {0} desde {1}", pctY(gBr), ys[i - 1]) : tr(" · o primeiro Censo da série"), top ? tr("Maior cidade: <b>{0}</b>, {1}.", esc(top.name), people(top.population)) : "", fastest ? tr("<br>Na década, entre as cidades de 100 mil ou mais, quem mais cresceu foi <b>{0}</b> ({1}) e quem menos cresceu, <b>{2}</b> ({3}).", esc(fastest.c.name), pctY(fastest.g), esc(slowest.c.name), pctY(slowest.g)) : "", i > 0 ? "" : tr("<br>{0} das {1} cidades já existiam como município. Escolha 1980 ou depois para ver o crescimento.", list.length, cities.length), i > 0 ? tr("<div class=\"tl-legend\"><span>−5% ao ano</span><i></i><span>+5% ao ano</span><span>· crescimento por ano na década, {0}, na mesma escala para todas</span></div>", by === "states" ? tr("por estado") : tr("por cidade")) : "");
  }

  bar.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.year) { stop(); setYear(+t.dataset.year); }
    else if (t.dataset.theme) { stop(); setTheme(t.dataset.theme, year); }
    else if (t.dataset.metric) { metricOf[theme] = t.dataset.metric; setYear(year); }
    else if (t.dataset.by) { by = t.dataset.by; setYear(year); }
    else if (t.hasAttribute("data-play")) { if (timer) stop(); else play(); }
    else if (t.hasAttribute("data-close")) close();
  });

  function play() {
    const ys = yearsOf();
    if (year === ys[ys.length - 1]) year = ys[0];
    timer = setInterval(() => {
      const k = yearsOf().indexOf(year);
      if (k >= yearsOf().length - 1) return stop();
      setYear(yearsOf()[k + 1]);
    }, 1600);
    setYear(year);
  }
  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    if (open) setYear(year);
  }

  app.hash.register("year", {
    get: () => (open ? String(year) : null),
    set(v) {
      if (v && !open) show(v);
      else if (v && open && yearsOf().includes(+v) && +v !== year) setYear(+v);
      else if (!v && open) close();
    },
  });
  app.hash.register("tema", {
    get: () => (open && theme !== "people" ? theme : null),
    set(v) {
      if (v && open && v !== theme && available().some((t) => t.id === v)) setTheme(v, year);
      else if (v && !open) theme = v;
    },
  });

  app.timeline = {
    open: (y, t) => show(y, t), close, get year() { return year; }, get theme() { return theme; },
    series: (id) => load(id), themes: THEMES,
  };
}
