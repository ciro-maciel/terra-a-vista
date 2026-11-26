// Prosperity advisor: earnings against unemployment, sanitation (sewer and water) and unemployment leaders.
import { esc, fin, colorScale, RAMPS } from "../core/util.js";
import { money, dollars, pct, int, count3, fmtShort } from "../core/fmt.js";
import { barList, histogram, rampLegend } from "../core/charts.js";
import { createTable } from "../core/table.js";
import { createScatter } from "../core/scatter.js";
import { section, tiles, segmented, lensButton, sourcesHtml, topBy, frameBtn } from "../core/view.js";
import { rowsHighlight } from "../core/data.js";

const METRO_MIN = 100000;
const BIG_METRO = 500000;

export function mount(ctx) {
  const { app, data, el, link } = ctx;
  const n = data.nat;
  const nc = n.census || {};
  const { states, metros } = data.levels;

  el.insertAdjacentHTML("beforeend", tiles([
    { label: "Renda do trabalho", value: dollars(n.median_income), sub: "média por ocupado, por mês" },
    { label: "Desocupação", value: pct(n.unemployment), sub: data.vintage },
    { label: "Esgoto na rede", value: pct(nc.sewer), sub: "dos domicílios" },
  ]));

  // --- earnings vs unemployment ---------------------------------------------------------------------------------
  const aBody = section(el, { title: "Renda e desocupação", note: "Cada ponto é uma cidade: renda média do trabalho na horizontal, desocupação na vertical, tamanho = população, cor = domicílios com esgoto na rede. Embaixo à direita, renda alta e pouca gente sem trabalho. Arraste um retângulo para selecionar cidades; passe o mouse no mapa para achar uma aqui." });
  const aCtl = document.createElement("div");
  aCtl.className = "adv-row";
  aBody.appendChild(aCtl);
  let level = "metros";
  segmented(aCtl, { label: "Lugares", value: level, options: [{ value: "metros", label: "Cidades" }, { value: "states", label: "Estados" }], onChange: (v) => { level = v; drawScatter(); } });
  for (const [id, label] of [["income", "Lente da renda"], ["unemployment", "Lente da desocupação"]]) {
    const b = lensButton(app, id, label);
    if (b) aCtl.appendChild(b);
  }
  const sewerDomain = [0.05, 0.95];
  const sewerColor = colorScale({ type: "seq", domain: sewerDomain, ramp: RAMPS.teal });
  const lv = () => data.levels[level];
  const scatter = createScatter(aBody, {
    height: 310, points: [],
    x: { label: "Renda média do trabalho (R$ por mês)", fmt: money, log: true },
    y: { label: "Desocupação", fmt: (v) => fmtShort("pct", v) },
    size: { label: "População", fmt: count3, max: 14, min: 1.6 },
    refX: fin(n.median_income) ? [{ v: n.median_income, label: "Brasil" }] : [],
    refY: fin(n.unemployment) ? [{ v: n.unemployment, label: `Brasil ${pct(n.unemployment)}` }] : [],
    color: (c) => sewerColor(c), colorLabel: "Esgoto na rede", colorFmt: (v) => pct(v),
    onHover: (p) => { link.hover(p ? rowsHighlight(lv(), [p.row]) : null); table.setHot(p ? p.key : null, false); },
    onClick: (p) => lv().focus(p.row),
    onBrush: (set) => {
      const sel = set ? lv().rows.filter((r) => set.has(r.key)) : [];
      link.base(sel.length ? rowsHighlight(lv(), sel, { dim: true }) : null, { frame: sel.length > 1 });
      table.setSelected(set);
      selInfo.innerHTML = sel.length ? `<b>${int(sel.length)}</b> ${level === "states" ? "estados" : "cidades"} selecionados · ${count3(sel.reduce((a, r) => a + (r.v.population || 0), 0))} pessoas ${frameBtn()}<button type="button" class="adv-mini" data-clear>Limpar</button>` : "";
    },
  });
  aBody.insertAdjacentHTML("beforeend", rampLegend({ ramp: RAMPS.teal, domain: sewerDomain, fmt: (v) => fmtShort("pct", v), label: "Domicílios com esgoto na rede" }));
  const selInfo = document.createElement("div");
  selInfo.className = "adv-brushinfo";
  aBody.appendChild(selInfo);
  const clearSel = () => { scatter.setSelected(null); table.setSelected(null); link.base(null); selInfo.innerHTML = ""; };
  selInfo.addEventListener("click", (e) => { if (e.target.closest("[data-clear]")) clearSel(); });
  aBody.insertAdjacentHTML("beforeend", `<h4 class="adv-h4">A tabela</h4>`);
  const table = createTable(aBody, {
    caption: "Renda, desocupação e saneamento", rank: true, maxHeight: 260, rows: [], search: "Buscar lugar",
    columns: [
      { key: "name", label: "Lugar", align: "l", value: (r) => r.name, html: (r) => `${esc(r.name)} <span class="sub">${esc(r.sub)}</span>` },
      { key: "inc", label: "Renda", value: (r) => r.v.median_income, text: (r) => dollars(r.v.median_income) },
      { key: "unemp", label: "Desoc.", value: (r) => r.v.unemployment, text: (r) => pct(r.v.unemployment) },
      { key: "sewer", label: "Esgoto", value: (r) => r.v.sewer, html: (r) => (fin(r.v.sewer) ? `<span class="dot" style="background:${sewerColor(r.v.sewer)}"></span>${pct(r.v.sewer)}` : "–") },
      { key: "water", label: "Água", value: (r) => r.v.water, text: (r) => pct(r.v.water) },
    ],
    sort: { key: "inc", dir: "desc" },
    onHover: (r) => { link.hover(r ? rowsHighlight(lv(), [r]) : null); scatter.setHot(r ? r.key : null); },
    onClick: (r) => lv().focus(r),
  });
  function drawScatter() {
    clearSel();
    const rows = lv().rows.filter((r) => fin(r.v.median_income) && fin(r.v.unemployment));
    scatter.update({
      points: rows.map((r) => ({ key: r.key, x: r.v.median_income, y: r.v.unemployment, s: r.v.population, c: r.v.sewer, label: r.name, sub: r.sub, row: r })),
      labels: topBy(rows, (r) => r.v.population, { n: 7 }).map((x) => x.r.key),
    });
    table.setRows(rows);
  }
  drawScatter();

  // --- sanitation -----------------------------------------------------------------------------------------------
  const sBody = section(el, { title: "Saneamento", note: "As cidades pela parcela dos domicílios ligados à rede de esgoto. Troque para <i>pessoas</i> para pesar cada cidade pela população. Passe o mouse numa barra para contornar essas cidades no mapa." });
  const sCtl = document.createElement("div");
  sCtl.className = "adv-row";
  sBody.appendChild(sCtl);
  let weighted = false;
  segmented(sCtl, { label: "Contar", value: "cities", options: [{ value: "cities", label: "Cidades" }, { value: "people", label: "Pessoas" }], onChange: (v) => { weighted = v === "people"; drawHist(); } });
  for (const [id, label] of [["sewer", "Lente do esgoto"], ["water", "Lente da água"]]) {
    const b = lensButton(app, id, label);
    if (b) sCtl.appendChild(b);
  }
  const sHost = document.createElement("div");
  sBody.appendChild(sHost);
  let sewerHist = null;
  function drawHist() {
    sHost.innerHTML = "";
    sewerHist = histogram(sHost, {
      values: metros.rows.map((r) => ({ key: r.key, v: r.v.sewer, w: r.v.population })), bins: 20, domain: [0, 1], weighted, height: 120,
      fmt: (v) => fmtShort("pct", v), unitLabel: "cidades", weightFmt: (w) => `${count3(w)} pessoas`, label: "Histograma do esgoto na rede nas cidades",
      colorOf: (_, t) => colorScale({ type: "seq", domain: [0, 1], ramp: RAMPS.teal })(t),
      markers: fin(nc.sewer) ? [{ v: nc.sewer, label: `Brasil ${pct(nc.sewer)}` }] : [],
      onHover: (bin) => link.hover(bin ? rowsHighlight(metros, bin.keys.map((k) => metros.byKey.get(k)), { dim: true }) : null),
    });
  }
  drawHist();
  const worst = topBy(metros.rows, (r) => r.v.sewer, { n: 10, min: BIG_METRO / 2, asc: true });
  sBody.insertAdjacentHTML("beforeend", `<h4 class="adv-h4">Cidades de ${count3(BIG_METRO / 2)} habitantes ou mais com menos esgoto na rede</h4>`);
  barList(sBody, {
    rows: worst.map((x) => ({ key: x.r.key, label: x.r.name, sub: `${x.r.sub} · água ${pct(x.r.v.water)}`, value: x.v, text: pct(x.v), tone: "bad", row: x.r })),
    max: 1, ariaLabel: "Menos esgoto na rede",
    onHover: (r) => link.hover(r ? rowsHighlight(metros, [r.row]) : null), onClick: (r) => metros.focus(r.row),
  });

  // --- unemployment ---------------------------------------------------------------------------------------------
  const uBody = section(el, { title: "Desocupação", note: `Desocupados ÷ força de trabalho (${esc(data.vintage)}). Cidades de ${count3(BIG_METRO)} habitantes ou mais.` });
  const uHost = document.createElement("div");
  let uLevel = "states";
  segmented(uBody, { label: "Áreas", value: uLevel, options: [{ value: "states", label: "Estados" }, { value: "metros", label: "Cidades grandes" }], onChange: (v) => { uLevel = v; drawU(); } });
  uBody.appendChild(uHost);
  function drawU() {
    uHost.innerHTML = "";
    const lvU = uLevel === "states" ? states : metros;
    const min = uLevel === "states" ? 0 : BIG_METRO;
    const high = topBy(lvU.rows, (r) => r.v.unemployment, { n: 8, min });
    const low = topBy(lvU.rows, (r) => r.v.unemployment, { n: 8, min, asc: true });
    const max = Math.max(...high.map((x) => x.v));
    const mk = (list) => list.map((x) => ({ key: x.r.key, label: x.r.name, sub: uLevel === "metros" ? x.r.sub : "", value: x.v, text: pct(x.v), tone: x.v > n.unemployment * 1.03 ? "bad" : x.v < n.unemployment * 0.97 ? "good" : null, row: x.r }));
    const o = { max, onHover: (r) => link.hover(r ? rowsHighlight(lvU, [r.row]) : null), onClick: (r) => lvU.focus(r.row) };
    uHost.insertAdjacentHTML("beforeend", `<h4 class="adv-h4">Mais alta</h4>`);
    barList(uHost, { ...o, rows: mk(high) });
    uHost.insertAdjacentHTML("beforeend", `<h4 class="adv-h4">Mais baixa</h4>`);
    barList(uHost, { ...o, rows: mk(low) });
  }
  drawU();

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, ["ibge_censo2022", "ibge_census", "ibge_arranjos"], [
    "A renda é o rendimento médio de todos os trabalhos por pessoa ocupada, formal ou informal; não inclui aposentadorias, aluguéis nem programas sociais, e não é a renda da família.",
    "A desocupação é a da semana de referência do Censo 2022 (julho de 2022); a PNAD mede todo trimestre e dá números um pouco diferentes.",
    "Esgoto na rede conta a rede geral de esgoto ou pluvial; a fossa séptica fica de fora, então zonas rurais bem servidas por fossa aparecem baixas.",
    "Preço de casa e aluguel não entram: o mapa ainda não tem uma fonte municipal aberta desses números.",
  ]));

  return {
    onMapHover(h) {
      const r = h.cell >= 0 ? lv().rowAtCell(h.cell) : null;
      scatter.setHot(r ? r.key : null);
      table.setHot(r ? r.key : null);
      const c = h.cell >= 0 ? metros.rowAtCell(h.cell) : null;
      sewerHist?.setHot(c ? sewerHist.binOf(c.v.sewer)?.i ?? null : null);
    },
    onEscape() {
      if (scatter.selected) { clearSel(); return true; }
      return false;
    },
  };
}
