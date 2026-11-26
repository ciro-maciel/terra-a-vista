// Timeline: the map in each Census year since 1970 (history.json). A year bar at the bottom of the map moves the
// banners to the population counted that year and colours each city (or state) by its yearly growth over the decade
// that ends there, on one fixed scale for every year so the decades compare.
//
//   top-bar button "Linha do tempo" · URL hash #year=1991 (the arrow keys stay with the map)
// Panels and data stay on today's numbers; only the banners and the lens change (app.setBannerCities, app.setLens).
import { esc } from "../../format.js";
import { icon } from "../../ui/icon.js";

const RAMP = ["#7a1f2b", "#c2463d", "#e8a07a", "#efe6d2", "#8fcbb8", "#2e9c8a", "#0f5e57"];
const DOMAIN = [-0.05, 0.05]; // yearly growth, the same for every decade
const BIG = 100000;
const nf = (d) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const rate = (a, b, years) => (a > 0 && b > 0 && years > 0 ? (b / a) ** (1 / years) - 1 : null);
const pctY = (g) => (Number.isFinite(g) ? `${g >= 0 ? "+" : "−"}${nf(1).format(Math.abs(g * 100))}% ao ano` : "–");
const people = (v) => (v >= 1e6 ? `${nf(v >= 1e7 ? 1 : 2).format(v / 1e6)} mi` : v >= 1e4 ? `${nf(0).format(v / 1e3)} mil` : nf(0).format(v));
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

  let hist = null, histP = null;
  let open = false, year = null, by = "cities", timer = null, savedLens = null, ourLens = null;
  const cities = app.data.cities || [];
  const stateRows = app.data.states || [];
  const owner = app.w.raw.owner;
  const n = app.w.grid.size;
  // cell → city: footprints, smaller cities first so a bigger city's majority wins; then every city's own cell.
  const cellCity = new Map();
  for (let k = cities.length - 1; k >= 0; k--) for (const cell of cities[k].footprint || []) cellCity.set(cell, cities[k]);
  for (const c of cities) if (c.cell != null) cellCity.set(c.cell, c);

  const bar = document.createElement("div");
  bar.className = "tl-bar";
  bar.hidden = true;
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Linha do tempo");
  document.body.appendChild(bar);

  const btn = app.ui.addTopButton({
    id: "btn-timeline", label: "Linha do tempo", title: "Linha do tempo: o Brasil em cada Censo desde 1970",
    onClick: () => (open ? close() : show()),
  });
  if (btn) {
    btn.innerHTML = `<svg class="icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5.2l3.4 2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="lbl">Linha do tempo</span>`;
    btn.setAttribute("aria-pressed", "false");
  }

  const load = () => (histP ??= app.loadData("history").then((h) => (hist = h)));

  async function show(y) {
    await load();
    if (!hist) { app.ui.toast?.("A linha do tempo não carregou (falta o history.json)."); return; }
    if (!open) savedLens = app.state.lens;
    open = true;
    btn?.setAttribute("aria-pressed", "true");
    bar.hidden = false;
    setYear(hist.census_years.includes(+y) ? +y : hist.census_years[0]);
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
    const i = hist.census_years.indexOf(y);
    // Banners: the cities with a count that year, biggest first.
    const list = [];
    for (const c of cities) {
      const p = hist.cities[c.id]?.p?.[i];
      if (p != null) list.push({ ...c, __orig: c, population: p, growth: null });
    }
    list.sort((a, b) => b.population - a.population);
    app.setBannerCities(list);
    paintLens(i);
    render(i, list);
    app.hash.update?.();
  }

  function growthOf(series, i) {
    const ys = hist.census_years;
    return i > 0 ? rate(series?.[i - 1], series?.[i], ys[i] - ys[i - 1]) : null;
  }

  function paintLens(i) {
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
      id: `tl-growth-${by}-${ys[i]}`, group: "people", name: `Crescimento de ${ys[i - 1]} a ${ys[i]}`, icon: "l-people",
      unit: "ao ano", format: "pct", scale: "linear", domain: DOMAIN, ramp: RAMP, higher_is: "neutral", source: "ibge_history",
      description: `Crescimento médio por ano da população entre os Censos de ${ys[i - 1]} e ${ys[i]}, ${by === "states" ? "por estado" : "por cidade (os hexágonos cinza ficam fora das cidades)"}. A mesma escala vale para todas as décadas.`,
      note: hist.rule, values,
    };
    app.setLens(ourLens);
  }

  function render(i, list) {
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
    bar.innerHTML = `
      <div class="tl-row">
        <span class="tl-title">Linha do tempo</span>
        <button type="button" class="tl-play" data-play>${timer ? `${PAUSE}Pausar` : `${PLAY}Tocar`}</button>
        ${ys.map((y) => `<button type="button" class="tl-year" data-year="${y}" aria-pressed="${y === year}">${y}</button>`).join("")}
        <span class="tl-seg" role="group" aria-label="Colorir por">
          <button type="button" data-by="cities" aria-pressed="${by === "cities"}">Cidades</button><button type="button" data-by="states" aria-pressed="${by === "states"}">Estados</button>
        </span>
        <button type="button" class="tl-x" data-close aria-label="Fechar a linha do tempo" title="Fechar">${icon("close", "x", { size: 12 })}</button>
      </div>
      <div class="tl-info">
        <b>Brasil em ${year}: ${people(br[i])} de pessoas</b>${i > 0 ? ` · ${pctY(gBr)} desde ${ys[i - 1]}` : " · o primeiro Censo da série"}.
        ${top ? `Maior cidade: <b>${esc(top.name)}</b>, ${people(top.population)}.` : ""}
        ${fastest ? `<br>Na década, entre as cidades de 100 mil ou mais, quem mais cresceu foi <b>${esc(fastest.c.name)}</b> (${pctY(fastest.g)}) e quem menos cresceu, <b>${esc(slowest.c.name)}</b> (${pctY(slowest.g)}).` : ""}
        ${i > 0 ? "" : `<br>${list.length} das ${cities.length} cidades já existiam como município. Escolha 1980 ou depois para ver o crescimento.`}
      </div>
      ${i > 0 ? `<div class="tl-legend"><span>−5% ao ano</span><i></i><span>+5% ao ano</span><span>· crescimento por ano na década, ${by === "states" ? "por estado" : "por cidade"}, na mesma escala para todas</span></div>` : ""}`;
  }

  bar.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.year) { stop(); setYear(+t.dataset.year); }
    else if (t.dataset.by) { by = t.dataset.by; setYear(year); }
    else if (t.hasAttribute("data-play")) { if (timer) stop(); else play(); }
    else if (t.hasAttribute("data-close")) close();
  });

  function play() {
    const ys = hist.census_years;
    if (year === ys[ys.length - 1]) year = ys[0];
    timer = setInterval(() => {
      const k = ys.indexOf(year);
      if (k >= ys.length - 1) return stop();
      setYear(ys[k + 1]);
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
      else if (v && open && hist?.census_years.includes(+v) && +v !== year) setYear(+v);
      else if (!v && open) close();
    },
  });

  app.timeline = { open: (y) => show(y), close, get year() { return year; } };
}
