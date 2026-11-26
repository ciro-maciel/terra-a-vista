// Knowledge advisor: literacy, higher education, the Science yield and the public school's Ideb since 2005
// (series_school.json, Inep).
import { esc, fin, ratio, colorScale, robustDomain, RAMPS } from "../core/util.js";
import { money, pct, int, count3, fmtShort } from "../core/fmt.js";
import { barList, histogram, rampLegend } from "../core/charts.js";
import { createTable } from "../core/table.js";
import { createScatter } from "../core/scatter.js";
import { section, tiles, segmented, mapPicker, frameBtn, sourcesHtml, topBy } from "../core/view.js";
import { rowsHighlight } from "../core/data.js";
import { scienceLens } from "../core/lenses.js";

const METRO_MIN = 100000;

export function mount(ctx) {
  const { app, data, el, link } = ctx;
  const n = data.nat;
  const nc = n.census || {};
  const nation = app.data.nation;
  const { metros } = data.levels;
  const sci = nation.yields?.find((y) => y.key === "science");
  const brSci = n.yields?.science;
  const brShare = ratio(brSci, n.employed);

  el.insertAdjacentHTML("beforeend", tiles([
    { label: "Alfabetização", value: pct(nc.literacy), sub: "das pessoas de 15 anos ou mais" },
    { label: "Ensino superior", value: pct(nc.degrees), sub: "dos adultos de 25 anos ou mais" },
    { label: "Empregos de Ciência", value: count3(brSci), sub: `${pct(brShare)} dos empregos formais`, color: sci?.color },
  ]));

  // --- the map --------------------------------------------------------------------------------------------------
  const mapRow = document.createElement("div");
  mapRow.className = "adv-sec adv-mapsec";
  el.appendChild(mapRow);
  const picker = mapPicker(ctx, mapRow, {
    value: "degrees",
    options: [
      { value: "degrees", label: "Superior", lens: () => "degrees" },
      { value: "literacy", label: "Alfabetização", lens: () => "literacy" },
      { value: "science", label: "Ciência", lens: () => scienceLens(data) },
      { value: "terrain", label: "Terreno", lens: () => null },
    ],
  });

  // --- science yield --------------------------------------------------------------------------------------------
  const sBody = section(el, { title: "O rendimento de Ciência", note: `${esc(sci?.description || "Empregos formais em informação, pesquisa e atividades técnicas.")} Para a parcela, só cidades de ${count3(METRO_MIN)} habitantes ou mais.` });
  const sHost = document.createElement("div");
  let mode = "share";
  segmented(sBody, { label: "Ordenar por", value: mode, options: [{ value: "share", label: "Parcela dos empregos" }, { value: "abs", label: "Mais empregos" }], onChange: (v) => { mode = v; drawSci(); } });
  const sMap = document.createElement("button");
  sMap.type = "button";
  sMap.className = "adv-mini";
  sMap.textContent = "Colorir o mapa pelos empregos de Ciência";
  sMap.addEventListener("click", () => picker.set("science"));
  sBody.querySelector(".adv-seg")?.after(sMap);
  sBody.appendChild(sHost);
  const share = (r) => r.v.science_share;
  function drawSci() {
    sHost.innerHTML = "";
    const list = mode === "abs" ? topBy(metros.rows, (r) => r.v.y_science, { n: 12 }) : topBy(metros.rows, share, { n: 12, min: METRO_MIN });
    barList(sHost, {
      rank: true, ariaLabel: "Cidades que lideram em Ciência",
      rows: list.map((x) => ({ key: x.r.key, label: x.r.name, sub: mode === "abs" ? pct(share(x.r)) : `×${(share(x.r) / brShare).toFixed(2).replace(".", ",")} o Brasil`, value: x.v, text: mode === "abs" ? count3(x.v) : pct(x.v), color: sci?.color, row: x.r })),
      onHover: (r) => link.hover(r ? rowsHighlight(metros, [r.row]) : null),
      onClick: (r) => metros.focus(r.row),
    });
  }
  drawSci();

  // --- degrees vs income ----------------------------------------------------------------------------------------
  const dBody = section(el, { title: "Estudo e renda", note: "Parcela dos adultos com superior completo na horizontal, renda média do trabalho na vertical; cor = alfabetização. Arraste para selecionar; passe o mouse no mapa para achar um lugar." });
  const dCtl = document.createElement("div");
  dCtl.className = "adv-row";
  dBody.appendChild(dCtl);
  let level = "metros";
  segmented(dCtl, { label: "Lugares", value: level, options: [{ value: "metros", label: "Cidades" }, { value: "states", label: "Estados" }], onChange: (v) => { level = v; drawDeg(); } });
  const lv = () => data.levels[level];
  const litDom = robustDomain(metros.rows.map((r) => r.v.literacy), 0.02) || [0.75, 0.98];
  const litColor = colorScale({ type: "seq", domain: litDom, ramp: RAMPS.teal });
  const scatter = createScatter(dBody, {
    height: 300, points: [],
    x: { label: "Adultos com superior completo", fmt: (v) => fmtShort("pct", v) },
    y: { label: "Renda média do trabalho (R$ por mês)", fmt: money, log: true },
    size: { label: "População", fmt: count3, max: 14, min: 1.6 },
    color: (c) => litColor(c), colorLabel: "Alfabetização", colorFmt: (v) => pct(v),
    onHover: (p) => link.hover(p ? rowsHighlight(lv(), [p.row]) : null),
    onClick: (p) => lv().focus(p.row),
    onBrush: (set) => {
      const sel = set ? lv().rows.filter((r) => set.has(r.key)) : [];
      link.base(sel.length ? rowsHighlight(lv(), sel, { dim: true }) : null, { frame: sel.length > 1 });
      selInfo.innerHTML = sel.length ? `<b>${int(sel.length)}</b> ${level === "states" ? "estados" : "cidades"} · ${count3(sel.reduce((a, r) => a + (r.v.population || 0), 0))} pessoas ${frameBtn()}<button type="button" class="adv-mini" data-clear>Limpar</button>` : "";
    },
  });
  dBody.insertAdjacentHTML("beforeend", rampLegend({ ramp: RAMPS.teal, domain: litDom, fmt: (v) => fmtShort("pct", v), label: "Alfabetização (15 anos ou mais)" }));
  const selInfo = document.createElement("div");
  selInfo.className = "adv-brushinfo";
  dBody.appendChild(selInfo);
  const clearSel = () => { scatter.setSelected(null); link.base(null); selInfo.innerHTML = ""; };
  selInfo.addEventListener("click", (e) => { if (e.target.closest("[data-clear]")) clearSel(); });
  function drawDeg() {
    clearSel();
    const rows = lv().rows.filter((r) => fin(r.v.degrees) && fin(r.v.median_income));
    scatter.update({
      points: rows.map((r) => ({ key: r.key, x: r.v.degrees, y: r.v.median_income, s: r.v.population, c: r.v.literacy, label: r.name, sub: r.sub, row: r })),
      labels: topBy(rows, (r) => r.v.population, { n: 7 }).map((x) => x.r.key),
    });
  }
  drawDeg();

  // --- literacy -------------------------------------------------------------------------------------------------
  const bBody = section(el, { title: "Quem ainda não lê", note: "As cidades pela taxa de alfabetização das pessoas de 15 anos ou mais. Passe o mouse numa barra para contornar essas cidades; a tabela começa pelas mais baixas." });
  const bHost = document.createElement("div");
  bBody.appendChild(bHost);
  const litHist = histogram(bHost, {
    values: metros.rows.map((r) => ({ key: r.key, v: r.v.literacy })), bins: 24, domain: [0.7, 1], height: 120,
    fmt: (v) => fmtShort("pct", v), unitLabel: "cidades", label: "Histograma da alfabetização nas cidades",
    colorOf: (_, t) => colorScale({ type: "seq", domain: [0, 1], ramp: RAMPS.teal })(t),
    markers: fin(nc.literacy) ? [{ v: nc.literacy, label: `Brasil ${pct(nc.literacy)}` }] : [],
    onHover: (bin) => link.hover(bin ? rowsHighlight(metros, bin.keys.map((k) => metros.byKey.get(k)), { dim: true }) : null),
  });
  const litTable = createTable(bBody, {
    caption: "Alfabetização nas cidades", rank: true, maxHeight: 240, search: "Buscar cidade",
    rows: metros.rows.filter((r) => fin(r.v.literacy)),
    columns: [
      { key: "name", label: "Cidade", align: "l", value: (r) => r.name, html: (r) => `${esc(r.name)} <span class="sub">${esc(r.sub)}</span>` },
      { key: "population", label: "Pessoas", value: (r) => r.v.population, text: (r) => count3(r.v.population) },
      { key: "literacy", label: "Alfab.", value: (r) => r.v.literacy, text: (r) => pct(r.v.literacy), bar: { max: 1, color: "rgba(42,156,138,.4)" } },
      { key: "degrees", label: "Superior", value: (r) => r.v.degrees, text: (r) => pct(r.v.degrees) },
    ],
    sort: { key: "literacy", dir: "asc" },
    onHover: (r) => link.hover(r ? rowsHighlight(metros, [r]) : null),
    onClick: (r) => metros.focus(r),
  });
  ctx.cleanup(() => litTable.destroy?.());

  // --- the public school (Ideb) --------------------------------------------------------------------------------------
  const iBody = section(el, { title: "A escola pública", kicker: "Ideb, Inep", note: "O Ideb junta a aprovação e a nota no Saeb numa escala de 0 a 10. Os estados pela nota mais recente dos anos iniciais (1º ao 5º ano), com a de 2005 ao lado. Clique para abrir o estado." });
  iBody.insertAdjacentHTML("beforeend", `<p class="adv-empty">Lendo o Ideb…</p>`);
  (app.timeline?.series ? app.timeline.series("school") : app.loadData("series_school")).then((sc) => {
    iBody.innerHTML = "";
    if (!sc) { iBody.innerHTML = `<p class="adv-empty">O series_school.json não foi gerado.</p>`; return; }
    const last = sc.years.length - 1, d1 = (v) => (fin(v) ? v.toFixed(1).replace(".", ",") : "–");
    let stage = "early";
    const ctl = document.createElement("div");
    ctl.className = "adv-row";
    iBody.appendChild(ctl);
    segmented(ctl, { label: "Etapa", value: stage, options: sc.metrics.map((m) => ({ value: m.id, label: m.name })), onChange: (v) => { stage = v; draw(); } });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "adv-mini";
    btn.textContent = "Ver na linha do tempo";
    btn.addEventListener("click", () => app.timeline?.open(sc.years[last], "school"));
    ctl.appendChild(btn);
    const host = document.createElement("div");
    iBody.appendChild(host);
    const states = data.levels.states;
    function draw() {
      host.innerHTML = "";
      const rows = states.rows.map((r) => ({ r, s: sc.states[r.key]?.[stage] || [] })).filter((x) => fin(x.s[last])).sort((a, b) => b.s[last] - a.s[last]);
      const nat = sc.nation[stage];
      host.insertAdjacentHTML("beforeend", tiles([
        { label: `Brasil ${sc.years[last]}`, value: d1(nat[last]), sub: `${d1(nat[0])} em ${sc.years[0]}` },
        { label: "Primeiro estado", value: rows[0]?.r.name || "–", sub: rows[0] ? d1(rows[0].s[last]) : "" },
        { label: "Quem mais subiu", value: (() => { const u = [...rows].sort((a, b) => (b.s[last] - b.s[0]) - (a.s[last] - a.s[0]))[0]; return u ? u.r.name : "–"; })(), sub: "desde 2005" },
      ]));
      barList(host, {
        compact: true, ariaLabel: "Ideb por estado",
        rows: rows.map((x) => ({ key: x.r.key, label: x.r.name, value: x.s[last], text: d1(x.s[last]), sub: `2005: ${d1(x.s[0])}`, color: "#4a86d6" })),
        onHover: (row) => link.hover(row ? rowsHighlight(states, [states.byKey.get(row.key)], { dim: true }) : null),
        onClick: (row) => states.focus(states.byKey.get(row.key)),
      });
      host.insertAdjacentHTML("beforeend", `<p class="adv-note">${esc(sc.rule)}</p>`);
    }
    draw();
  }).catch(() => { iBody.innerHTML = `<p class="adv-empty">O Ideb não carregou.</p>`; });

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, ["ibge_censo2022", "ibge_cempre", "ibge_arranjos", "inep_ideb"], [
    "Os empregos de Ciência são formais e contados onde fica o empregador (CEMPRE), e cobrem atividades inteiras: a recepcionista de uma empresa de software conta; o pesquisador de um hospital não.",
    "A alfabetização de uma cidade com vários municípios é a média das taxas ponderada pela população (aproximação); o ensino superior soma as contagens e é exato.",
    "O mapa de Ciência colore só as cidades (os hexágonos cinza ficam fora delas).",
  ]));

  return {
    onMapHover(h) {
      const r = h.cell >= 0 ? lv().rowAtCell(h.cell) : null;
      scatter.setHot(r ? r.key : null);
      const c = h.cell >= 0 ? metros.rowAtCell(h.cell) : null;
      litHist.setHot(c ? litHist.binOf(c.v.literacy)?.i ?? null : null);
    },
    onEscape() {
      if (scatter.selected) { clearSel(); return true; }
      return false;
    },
  };
}
