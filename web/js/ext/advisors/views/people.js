// People advisor: population, growth, density and age.
import { esc, fin, colorScale, robustDomain, RAMPS } from "../core/util.js";
import { pct, int, signedPct, count3, fmtShort, fmtValue } from "../core/fmt.js";
import { barList, histogram, rampLegend } from "../core/charts.js";
import { createScatter } from "../core/scatter.js";
import { section, tiles, segmented, mapPicker, frameBtn, sourcesHtml, topBy } from "../core/view.js";
import { rowsHighlight } from "../core/data.js";
import { growthLens } from "../core/lenses.js";

const METRO_MIN = 100000;

export function mount(ctx) {
  const { app, data, el, link } = ctx;
  const n = data.nat;
  const { states, metros } = data.levels;
  const yrs = n.growth_years || [];

  el.insertAdjacentHTML("beforeend", tiles([
    { label: "Moradores", value: count3(n.population), sub: data.vintage },
    { label: `Crescimento ${yrs.join(" a ")}`, value: signedPct(n.growth, 2), sub: "estimativas do IBGE" },
    { label: "Cidades", value: int(metros.rows.length), sub: `${int(metros.rows.reduce((a, r) => a + (r.v.members || 0), 0))} municípios dentro delas` },
  ]));

  // --- the map: growth by default, so the map tells the same story as the first chart ---------------------------
  let gLevel = "metros";
  const mapRow = document.createElement("div");
  mapRow.className = "adv-sec adv-mapsec";
  el.appendChild(mapRow);
  const lensOpt = (value, label, id) => ({ value, label, lens: () => id });
  const picker = mapPicker(ctx, mapRow, {
    value: "growth",
    options: [
      { value: "growth", label: "Crescimento", lens: () => growthLens(data, gLevel) },
      lensOpt("density", "Densidade", "density"), lensOpt("age", "Idade", "age"), lensOpt("ageing", "Envelhecimento", "ageing"),
      { value: "terrain", label: "Terreno", lens: () => null },
    ],
  });

  // --- growth ---------------------------------------------------------------------------------------------------
  const gBody = section(el, { title: "Quem cresce, quem encolhe", note: `Variação da população de ${yrs.join(" a ")} pelas estimativas do IBGE, nos limites de hoje. Cidades de ${count3(METRO_MIN)} habitantes ou mais.` });
  const gHost = document.createElement("div");
  segmented(gBody, { label: "Áreas", value: gLevel, options: [{ value: "metros", label: "Cidades" }, { value: "states", label: "Estados" }], onChange: (v) => { gLevel = v; drawGrowth(); if (picker.value === "growth") picker.refresh(); } });
  gBody.appendChild(gHost);
  function drawGrowth() {
    gHost.innerHTML = "";
    const lv = gLevel === "metros" ? metros : states;
    const min = gLevel === "metros" ? METRO_MIN : 0;
    const fast = topBy(lv.rows, (r) => r.v.growth, { n: 8, min });
    const slow = topBy(lv.rows, (r) => r.v.growth, { n: 8, min, asc: true });
    const max = Math.max(...[...fast, ...slow].map((x) => Math.abs(x.v)));
    const mk = (list) => list.map((x) => ({ key: x.r.key, label: x.r.name, sub: gLevel === "metros" ? x.r.sub : "", value: x.v, text: signedPct(x.v), tone: x.v >= 0 ? "good" : "bad", row: x.r }));
    const opts = {
      diverging: true, max,
      onHover: (r) => link.hover(r ? rowsHighlight(lv, [r.row]) : null),
      onClick: (r) => lv.focus(r.row),
    };
    gHost.insertAdjacentHTML("beforeend", `<h4 class="adv-h4">Crescem mais</h4>`);
    barList(gHost, { ...opts, rows: mk(fast), ariaLabel: "Crescem mais" });
    gHost.insertAdjacentHTML("beforeend", `<h4 class="adv-h4">${slow.every((x) => x.v < 0) ? "Encolhem" : "Crescem menos"}</h4>`);
    barList(gHost, { ...opts, rows: mk(slow), ariaLabel: "Crescem menos" });
  }
  drawGrowth();

  // --- density --------------------------------------------------------------------------------------------------
  const dBody = section(el, { title: "Onde o povo se aperta", note: "As cidades pelo número de moradores por km² (escala logarítmica). Troque para <i>pessoas</i> para pesar cada cidade pela população: a maior parte dos brasileiros mora na ponta densa. Passe o mouse numa barra para ver essas cidades; clique para mantê-las contornadas." });
  const dCtl = document.createElement("div");
  dCtl.className = "adv-row";
  dBody.appendChild(dCtl);
  let weighted = false, pinnedBin = null;
  segmented(dCtl, { label: "Contar", value: "cities", options: [{ value: "cities", label: "Cidades" }, { value: "people", label: "Pessoas" }], onChange: (v) => { weighted = v === "people"; drawHist(); } });
  const dLens = document.createElement("button");
  dLens.type = "button";
  dLens.className = "adv-mini";
  dLens.textContent = "Colorir o mapa pela densidade";
  dLens.addEventListener("click", () => picker.set("density"));
  dCtl.appendChild(dLens);
  const histHost = document.createElement("div");
  dBody.appendChild(histHost);
  const binInfo = document.createElement("div");
  binInfo.className = "adv-brushinfo";
  dBody.appendChild(binInfo);
  let hist = null;
  const mByKey = metros.byKey;
  function drawHist() {
    histHost.innerHTML = "";
    const vals = metros.rows.map((r) => ({ key: r.key, v: r.v.density, w: r.v.population }));
    hist = histogram(histHost, {
      values: vals, log: true, bins: 28, domain: [2, 6000], weighted, height: 130,
      fmt: (v) => fmtShort("float", v), unitLabel: "cidades", weightFmt: (w) => `${count3(w)} pessoas`,
      label: "Histograma da densidade das cidades",
      colorOf: (_, t) => colorScale({ type: "seq", domain: [0, 1], ramp: RAMPS.heat })(t),
      markers: fin(n.census?.density) ? [{ v: n.census.density, label: "média do Brasil" }] : [],
      onHover: (bin) => link.hover(bin ? rowsHighlight(metros, bin.keys.map((k) => mByKey.get(k)), { dim: true }) : null),
      onClick: (bin) => {
        pinnedBin = pinnedBin === bin.i ? null : bin.i;
        const rows = pinnedBin != null ? bin.keys.map((k) => mByKey.get(k)) : [];
        link.base(rows.length ? rowsHighlight(metros, rows, { dim: true }) : null, { frame: rows.length > 1 });
        binInfo.innerHTML = rows.length ? `<b>${int(rows.length)}</b> cidades de ${fmtShort("float", bin.x0)} a ${fmtShort("float", bin.x1)} hab./km² · ${count3(rows.reduce((a, r) => a + (r.v.population || 0), 0))} pessoas ${frameBtn()}<button type="button" class="adv-mini" data-clear>Limpar</button>` : "";
      },
    });
  }
  binInfo.addEventListener("click", (e) => { if (e.target.closest("[data-clear]")) { pinnedBin = null; link.base(null); binInfo.innerHTML = ""; } });
  drawHist();

  // --- age and growth -------------------------------------------------------------------------------------------
  const aBody = section(el, { title: "Idade e crescimento", note: "Cada ponto é uma cidade: idade mediana na horizontal, crescimento da população na vertical, tamanho = população, cor = densidade. As cidades jovens do Norte e do Centro-Oeste crescem; as velhas do Sul e do interior do Sudeste ficam paradas. Arraste um retângulo para selecionar cidades; elas acendem no mapa." });
  const aCtl = document.createElement("div");
  aCtl.className = "adv-row";
  aBody.appendChild(aCtl);
  aCtl.innerHTML = `<span class="adv-note">Colorir o mapa pela</span><button type="button" class="adv-mini" data-map="age">idade mediana</button><button type="button" class="adv-mini" data-map="ageing">envelhecimento</button>`;
  aCtl.addEventListener("click", (e) => { const v = e.target.closest("[data-map]")?.dataset.map; if (v) picker.set(v); });
  const dDom = robustDomain(metros.rows.map((r) => r.v.density), 0.02, true) || [5, 2000];
  const dColor = colorScale({ type: "seq", domain: dDom, log: true, ramp: RAMPS.heat });
  const big = topBy(metros.rows, (r) => r.v.population, { n: 8 }).map((x) => x.r.key);
  const scatter = createScatter(aBody, {
    height: 310,
    points: metros.rows.filter((r) => fin(r.v.median_age) && fin(r.v.growth)).map((r) => ({ key: r.key, x: r.v.median_age, y: r.v.growth, s: r.v.population, c: r.v.density, label: r.name, sub: r.sub, row: r })),
    x: { label: "Idade mediana (≈)", fmt: (v) => String(+v.toFixed(0)) },
    y: { label: `Crescimento ${yrs.join(" a ")}`, fmt: (v) => fmtShort("signed", v) },
    size: { label: "População", fmt: count3, max: 14, min: 1.6 },
    color: (c) => dColor(c), colorLabel: "Densidade", colorFmt: (v) => `${fmtValue("float", v)} /km²`,
    labels: big,
    refX: fin(n.census?.median_age) ? [{ v: n.census.median_age, label: "Brasil" }] : [],
    refY: [{ v: n.growth ?? 0, label: `Brasil ${signedPct(n.growth)}` }],
    onHover: (p) => link.hover(p ? rowsHighlight(metros, [p.row]) : null),
    onClick: (p) => metros.focus(p.row),
    onBrush: (set) => {
      const sel = set ? metros.rows.filter((r) => set.has(r.key)) : [];
      link.base(sel.length ? rowsHighlight(metros, sel, { dim: true }) : null, { frame: sel.length > 1 });
      selInfo.innerHTML = sel.length ? selSummary(sel) : "";
    },
  });
  aBody.insertAdjacentHTML("beforeend", rampLegend({ ramp: RAMPS.heat, domain: dDom, log: true, fmt: (v) => fmtShort("float", v), label: "Habitantes por km²" }));
  const selInfo = document.createElement("div");
  selInfo.className = "adv-brushinfo";
  aBody.appendChild(selInfo);
  function selSummary(sel) {
    const pop = sel.reduce((a, r) => a + (r.v.population || 0), 0);
    const top = [...sel].sort((a, b) => (b.v.population || 0) - (a.v.population || 0)).slice(0, 5);
    return `<b>${int(sel.length)}</b> cidades · ${count3(pop)} pessoas (${pct(pop / n.population)} do Brasil)<br><span class="sub">As maiores: ${top.map((r) => `${esc(r.name)}, ${esc(r.sub)}`).join(" · ")}</span> ${frameBtn()}<button type="button" class="adv-mini" data-clear>Limpar</button>`;
  }
  selInfo.addEventListener("click", (e) => { if (e.target.closest("[data-clear]")) { scatter.setSelected(null); link.base(null); selInfo.innerHTML = ""; } });

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, ["ibge_census", "ibge_estimates", "ibge_censo2022", "ibge_arranjos"], [
    "O mapa do crescimento colore cada cidade pela variação dela; os hexágonos cinza ficam fora das cidades. Troque o gráfico para Estados para colorir todo hexágono pelo seu estado.",
    `O crescimento compara duas estimativas do IBGE (${esc(yrs.join(" e "))}); a população é a contada pelo Censo 2022. São números diferentes e não se dividem exatamente.`,
    "A idade mediana de uma cidade com vários municípios é a média das medianas ponderada pela população: uma aproximação, não a mediana da cidade.",
  ]));

  return {
    onMapHover(h) {
      const r = h.cell >= 0 ? metros.rowAtCell(h.cell) : null;
      scatter.setHot(r ? r.key : null);
      hist?.setHot(r ? hist.binOf(r.v.density)?.i ?? null : null);
    },
    onEscape() {
      if (scatter.selected || pinnedBin != null) {
        scatter.setSelected(null); pinnedBin = null; link.base(null); selInfo.innerHTML = ""; binInfo.innerHTML = "";
        return true;
      }
      return false;
    },
  };
}

function medianOf(rows, k) {
  const s = rows.map((r) => r.v[k]).filter(fin).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}
