// Economy advisor: GDP by sector, city GDP on the map, leaders, specialisation and growth vs output.
import { esc, fin, ratio, colorScale, robustDomain, RAMPS } from "../core/util.js";
import { money, dollars, pct, int, signedPct, count3, fmtShort } from "../core/fmt.js";
import { barList, rampLegend, sizeLegend } from "../core/charts.js";
import { createTable } from "../core/table.js";
import { createScatter } from "../core/scatter.js";
import { section, tiles, segmented, selectBox, sourcesHtml, frameBtn } from "../core/view.js";
import { rowsHighlight, SECTOR_KEYS } from "../core/data.js";

export const METRO_MIN = 250000;
const short = (s) => String(s || "").replace(/\s*\(.*\)\s*$/, "");

export function mount(ctx) {
  const { app, data, el, link, params } = ctx;
  const nation = app.data.nation;
  const n = nation.nation || {};
  const metros = data.levels.metros;
  const rows = metros.rows;
  const jobInd = Object.keys(nation.industries || {});

  // --- headline -------------------------------------------------------------------------------------------------
  const sectors = n.gdp_sectors || {};
  const secTotal = SECTOR_KEYS.reduce((a, k) => a + (sectors[k] || 0), 0);
  const secName = (k) => nation.gdp_sectors?.[k] || k;
  const topSec = SECTOR_KEYS.filter((k) => k !== "taxes" && fin(sectors[k])).sort((a, b) => sectors[b] - sectors[a])[0];
  el.insertAdjacentHTML("beforeend", tiles([
    { label: `PIB ${n.gdp_year || ""}`, value: money(n.gdp), sub: "a preços correntes" },
    { label: "Por habitante", value: money(ratio(n.gdp, n.population)), sub: "PIB ÷ moradores" },
    { label: "Maior setor", value: topSec ? secName(topSec) : "–", sub: topSec ? `${pct(sectors[topSec] / secTotal)} do PIB de ${data.sectorYear}` : "" },
  ]));

  // --- GDP by sector --------------------------------------------------------------------------------------------
  const stRows = data.levels.states.rows;
  const indBody = section(el, { title: "PIB por setor", kicker: `Brasil, ${data.sectorYear}`, note: `Valor adicionado de cada setor, onde a produção acontece, mais os impostos sobre produtos: somados, dão o PIB. O SIDRA publica os setores dois anos atrás do PIB, então esta divisão é de ${data.sectorYear}. Passe o mouse num setor para acender os estados onde ele pesa mais; clique para ordenar as cidades por ele.` });
  const indRows = SECTOR_KEYS.filter((k) => fin(sectors[k])).sort((a, b) => sectors[b] - sectors[a]).map((k) => ({
    key: k, label: secName(k), value: sectors[k], text: money(sectors[k]), sub: pct(sectors[k] / secTotal), icon: "",
  }));
  const indBars = barList(indBody, {
    rows: indRows, ariaLabel: "PIB por setor",
    onHover: (r) => {
      if (!r) return link.hover(null);
      const top = stRows.map((s) => ({ i: s.ref, v: s.v[`sec_${r.key}`] })).filter((x) => fin(x.v)).sort((a, b) => b.v - a.v).slice(0, 6);
      link.hover({ states: new Set(top.map((x) => x.i)), dimOthers: true });
    },
    onClick: (r) => { table.setRows(big); table.setColumns([...cols.slice(0, 3), secCol(r.key)], { key: `sec_${r.key}`, dir: "desc" }); lBody.scrollIntoView({ behavior: "smooth", block: "start" }); },
  });

  // --- map: metro GDP circles -----------------------------------------------------------------------------------
  const mapBody = section(el, { title: "As economias das cidades no mapa", note: "Cada círculo é uma cidade: a área é o PIB dela, a cor é o PIB por habitante. Passe o mouse num círculo para ver os números; clique para abrir a cidade." });
  const ppDomain = robustDomain(rows.filter((r) => r.v.population >= 100000).map((r) => r.v.gdp_pc), 0.03, true) || [15000, 120000];
  const ppColor = colorScale({ type: "seq", domain: ppDomain, ramp: RAMPS.gold });
  const gMax = Math.max(...rows.map((r) => r.v.gdp || 0));
  const bubbles = ctx.bubbles("gdp", {
    rMax: 30, minR: 1.5, alpha: 0.6,
    tip: (b) => `<b>${esc(b.row.name)}</b> <span class="sub">${esc(b.row.sub)}</span><br>PIB <b>${money(b.row.v.gdp)}</b> · por habitante <b>${money(b.row.v.gdp_pc)}</b><br>${count3(b.row.v.population)} pessoas`,
    onHover: (b) => { table.setHot(b ? b.key : null); scatter.setHot(b ? b.key : null); link.hover(b ? rowsHighlight(metros, [b.row]) : null); },
    onClick: (b) => app.selectCity(b.row.ref),
  });
  const bubbleItems = rows.filter((r) => fin(r.v.gdp)).map((r) => ({ key: r.key, x: app.w.grid.cx(r.ref.cell), y: app.w.grid.cy(r.ref.cell), value: r.v.gdp, color: ppColor(r.v.gdp_pc), row: r }));
  bubbles.set(bubbleItems, { vMax: gMax });
  const showBubbles = document.createElement("label");
  showBubbles.className = "adv-check";
  showBubbles.innerHTML = `<input type="checkbox" checked> Mostrar os círculos do PIB`;
  showBubbles.querySelector("input").addEventListener("change", (e) => bubbles.set(e.target.checked ? bubbleItems : [], { vMax: gMax }));
  mapBody.appendChild(showBubbles);
  mapBody.insertAdjacentHTML("beforeend", rampLegend({ ramp: RAMPS.gold, domain: ppDomain, fmt: money, label: "PIB por habitante" })
    + sizeLegend([1e11, 1e12].filter((v) => v <= gMax), (v) => 30 * Math.sqrt(v / gMax) , money, "Área do círculo = PIB (no zoom inicial)"));

  // --- leaders --------------------------------------------------------------------------------------------------
  const lBody = section(el, { title: "As cidades que lideram", note: `PIB por habitante e os setores ordenam só cidades de ${count3(METRO_MIN)} habitantes ou mais (cidades pequenas com uma grande usina ou mina oscilam demais).` });
  const big = rows.filter((r) => (r.v.population || 0) >= METRO_MIN);
  segmented(lBody, {
    label: "Ordenar por", value: "gdp",
    options: [{ value: "gdp", label: "Maior PIB" }, { value: "gdp_pc", label: "PIB por habitante" }, { value: "growth", label: "Cresce mais" }],
    onChange: (v) => { table.setRows(v === "gdp" ? rows : big); table.setColumns(cols, { key: v, dir: "desc" }); },
  });
  const cols = [
    { key: "name", label: "Cidade", align: "l", value: (r) => r.name, html: (r) => `${esc(r.name)} <span class="sub">${esc(r.sub)}</span>` },
    { key: "gdp", label: "PIB", value: (r) => r.v.gdp, text: (r) => money(r.v.gdp), bar: { max: gMax, color: "rgba(224,181,76,.35)" } },
    { key: "gdp_pc", label: "Por hab.", value: (r) => r.v.gdp_pc, text: (r) => money(r.v.gdp_pc) },
    { key: "growth", label: "Cresc.", value: (r) => r.v.growth, text: (r) => signedPct(r.v.growth) },
  ];
  const secCol = (k) => ({ key: `sec_${k}`, label: { agriculture: "Agro", industry: "Indústria", services: "Serviços", public: "Adm. púb.", taxes: "Impostos" }[k], value: (r) => r.v[`sec_${k}`], text: (r) => pct(r.v[`sec_${k}`]) });
  const table = createTable(lBody, {
    caption: "Cidades pelo PIB", columns: cols, rows, sort: { key: "gdp", dir: "desc" }, rank: true, maxHeight: 280,
    search: "Buscar cidade",
    onHover: (r) => { link.hover(r ? rowsHighlight(metros, [r]) : null); bubbles.setHot(r ? r.key : null); scatter.setHot(r ? r.key : null); },
    onClick: (r) => app.selectCity(r.ref),
  });

  // --- specialisation -------------------------------------------------------------------------------------------
  const specBody = section(el, { title: "Quem se especializa em quê", note: `Quociente locacional: a parcela dos empregos formais da cidade na atividade ÷ a parcela no Brasil. ×2 quer dizer duas vezes mais concentrada que o país. Cidades de ${count3(METRO_MIN)} habitantes ou mais; as 15 mais especializadas ficam contornadas no mapa.` });
  let industry = params.industry && jobInd.includes(params.industry) ? params.industry : "manufacturing";
  const indSel = selectBox(specBody, {
    label: "Atividade", value: industry,
    options: jobInd.map((k) => ({ value: k, label: short(nation.industries[k]) })),
    onChange: (v) => setIndustry(v),
  });
  const specInfo = document.createElement("p");
  specInfo.className = "adv-note";
  specBody.appendChild(specInfo);
  const lq = (r, k = industry) => {
    const o = r.ref;
    const us = ratio(n.jobs?.[k], n.employed);
    return us ? ratio(ratio(o.jobs?.[k], o.employed), us) : null;
  };
  const specTable = createTable(specBody, {
    caption: "Cidades mais especializadas", rank: true, maxHeight: 260, rows: [],
    columns: [
      { key: "name", label: "Cidade", align: "l", value: (r) => r.name, html: (r) => `${esc(r.name)} <span class="sub">${esc(r.sub)}</span>` },
      { key: "share", label: "Parcela dos empregos", value: (r) => ratio(r.ref.jobs?.[industry], r.ref.employed), text: (r) => pct(ratio(r.ref.jobs?.[industry], r.ref.employed)) },
      { key: "lq", label: "QL", value: (r) => lq(r), text: (r) => (fin(lq(r)) ? `×${lq(r).toFixed(2).replace(".", ",")}` : "–"), bar: { max: 1, color: "rgba(74,134,214,.4)" } },
      { key: "workers", label: "Empregos", value: (r) => r.ref.jobs?.[industry], text: (r) => count3(r.ref.jobs?.[industry]) },
    ],
    sort: { key: "lq", dir: "desc" },
    onHover: (r) => { link.hover(r ? rowsHighlight(metros, [r]) : null); scatter.setHot(r ? r.key : null); bubbles.setHot(r ? r.key : null); },
    onClick: (r) => app.selectCity(r.ref),
  });

  // --- scatter --------------------------------------------------------------------------------------------------
  const scBody = section(el, { title: "Crescimento e produção", note: "Cada ponto é uma cidade: PIB por habitante na horizontal, crescimento da população na vertical, tamanho = população. Arraste um retângulo para selecionar cidades e contorná-las no mapa." });
  const scCtl = document.createElement("div");
  scCtl.className = "adv-row";
  scBody.appendChild(scCtl);
  let colorBy = "lq", allMetros = false;
  selectBox(scCtl, {
    label: "Cor", value: colorBy,
    options: [{ value: "lq", label: "Especialização (atividade escolhida)" }, { value: "unemployment", label: "Desocupação" }, { value: "median_income", label: "Renda do trabalho" }, { value: "none", label: "Nenhuma" }],
    onChange: (v) => { colorBy = v; drawScatter(); },
  });
  segmented(scCtl, { label: "Cidades", value: "big", options: [{ value: "big", label: `${count3(METRO_MIN)}+` }, { value: "all", label: "Todas" }], onChange: (v) => { allMetros = v === "all"; drawScatter(); } });
  const legendEl = document.createElement("div");
  const scatter = createScatter(scBody, {
    points: [], height: 300,
    x: { label: "PIB por habitante", fmt: (v) => money(v), log: true },
    y: { label: "Crescimento da população", fmt: (v) => fmtShort("signed", v) },
    size: { label: "População", fmt: count3, max: 15, min: 2 },
    refY: [{ v: n.growth ?? 0, label: `Brasil ${signedPct(n.growth)}` }],
    onHover: (p) => { link.hover(p ? rowsHighlight(metros, [p.row]) : null); bubbles.setHot(p ? p.key : null); table.setHot(p ? p.key : null, false); },
    onClick: (p) => app.selectCity(p.row.ref),
    onBrush: (set) => {
      const sel = set ? rows.filter((r) => set.has(r.key)) : [];
      link.base(sel.length ? rowsHighlight(metros, sel, { dim: true }) : specHighlight(), { frame: sel.length > 1 });
      bubbles.setSelected(set);
      brushInfo.innerHTML = sel.length ? brushSummary(sel) : "";
    },
  });
  scBody.appendChild(legendEl);
  const brushInfo = document.createElement("div");
  brushInfo.className = "adv-brushinfo";
  scBody.appendChild(brushInfo);
  function brushSummary(sel) {
    const pop = sel.reduce((a, r) => a + (r.v.population || 0), 0);
    const gdp = sel.reduce((a, r) => a + (r.v.gdp || 0), 0);
    return `<b>${sel.length}</b> cidades selecionadas · ${count3(pop)} pessoas · PIB de ${money(gdp)} (${pct(gdp / n.gdp)} do Brasil) ${frameBtn()}<button type="button" class="adv-mini" data-clear>Limpar</button>`;
  }
  brushInfo.addEventListener("click", (e) => { if (e.target.closest("[data-clear]")) { scatter.setSelected(null); link.base(specHighlight()); bubbles.setSelected(null); brushInfo.innerHTML = ""; } });

  function drawScatter() {
    const list = rows.filter((r) => allMetros || (r.v.population || 0) >= METRO_MIN);
    const cv = (r) => (colorBy === "lq" ? lq(r) : colorBy === "none" ? null : r.v[colorBy]);
    let color = null, legend = "";
    if (colorBy !== "none") {
      const dom = robustDomain(list.map(cv), 0.03, colorBy === "lq") || [0, 1];
      const spec = colorBy === "lq" ? { type: "seq", domain: [Math.max(0.2, dom[0]), Math.max(1.5, dom[1])], log: true, ramp: RAMPS.seq } : { type: "seq", domain: dom, ramp: colorBy === "unemployment" ? RAMPS.heat : RAMPS.gold };
      const cs = colorScale(spec);
      color = (c) => cs(c);
      const f = colorBy === "lq" ? (v) => `×${v.toFixed(1)}` : colorBy === "unemployment" ? (v) => pct(v) : money;
      legend = rampLegend({ ramp: spec.ramp, domain: spec.domain, fmt: f, log: spec.log, label: colorBy === "lq" ? `Especialização em ${short(nation.industries[industry]).toLowerCase()}` : colorBy === "unemployment" ? "Desocupação" : "Renda do trabalho" });
    }
    const labels = [...list].sort((a, b) => (b.v.population || 0) - (a.v.population || 0)).slice(0, 8).map((r) => r.key);
    scatter.update({
      points: list.filter((r) => fin(r.v.gdp_pc) && fin(r.v.growth)).map((r) => ({ key: r.key, x: r.v.gdp_pc, y: r.v.growth, s: r.v.population, c: cv(r), label: r.name, sub: r.sub, row: r })),
      color, labels, colorLabel: colorBy === "none" ? null : colorBy === "lq" ? "QL" : colorBy === "unemployment" ? "Desocupação" : "Renda",
      colorFmt: colorBy === "lq" ? (v) => `×${(+v).toFixed(2).replace(".", ",")}` : colorBy === "unemployment" ? pct : dollars,
    });
    legendEl.innerHTML = legend;
  }

  let specTop = [];
  const specHighlight = () => (specTop.length ? rowsHighlight(metros, specTop, { ringMax: 15 }) : null);
  function setIndustry(k) {
    industry = k;
    indSel.set(k);
    const list = big.filter((r) => fin(lq(r))).sort((a, b) => lq(b) - lq(a));
    specTop = list.slice(0, 15);
    const maxLq = Math.max(1, ...list.slice(0, 40).map((r) => lq(r)));
    specTable.setColumns([
      { key: "name", label: "Cidade", align: "l", value: (r) => r.name, html: (r) => `${esc(r.name)} <span class="sub">${esc(r.sub)}</span>` },
      { key: "share", label: "Parcela dos empregos", value: (r) => ratio(r.ref.jobs?.[industry], r.ref.employed), text: (r) => pct(ratio(r.ref.jobs?.[industry], r.ref.employed)) },
      { key: "lq", label: "QL", value: (r) => lq(r), text: (r) => (fin(lq(r)) ? `×${lq(r).toFixed(2).replace(".", ",")}` : "–"), bar: { max: maxLq, color: "rgba(74,134,214,.45)" } },
      { key: "workers", label: "Empregos", value: (r) => r.ref.jobs?.[industry], text: (r) => count3(r.ref.jobs?.[industry]) },
    ], { key: "lq", dir: "desc" });
    specTable.setRows(list);
    const us = ratio(n.jobs?.[k], n.employed);
    specInfo.innerHTML = `Brasil: <b>${pct(us)}</b> dos empregos formais (${count3(n.jobs?.[k])}) estão em ${esc(short(nation.industries[k]).toLowerCase())}.`;
    if (!scatter.selected) link.base(specHighlight());
    drawScatter();
  }
  setIndustry(industry);

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, ["ibge_gdp", "ibge_gdp_sectors", "ibge_cempre", "ibge_census", "ibge_estimates", "ibge_arranjos"], [
    "O PIB é contado onde a produção acontece; os empregos são formais e contados onde fica o empregador (CEMPRE). Perto de 4 em 10 trabalhadores brasileiros são informais e não entram na especialização.",
    `O PIB é de 2023, a divisão por setor de ${esc(data.sectorYear)} e a população do Censo 2022: o PIB por habitante divide números de anos diferentes.`,
    "O PIB de uma cidade soma o dos seus municípios (arranjos populacionais do IBGE). Uma refinaria ou uma mina num município pequeno faz o PIB por habitante dele disparar.",
  ]));

  return {
    onMapHover(h) {
      const r = h.cell >= 0 ? metros.rowAtCell(h.cell) : null;
      scatter.setHot(r ? r.key : null);
      specTable.setHot(r ? r.key : null);
    },
    onEscape() {
      if (scatter.selected) { scatter.setSelected(null); link.base(specHighlight()); bubbles.setSelected(null); brushInfo.innerHTML = ""; return true; }
      return false;
    },
  };
}
