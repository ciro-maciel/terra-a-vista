// Land advisor: national land cover, where each cover dominates, the states' make-up and who works the land.
import { esc, fin, ratio } from "../core/util.js";
import { pct, int, count3 } from "../core/fmt.js";
import { shareBar, barList, donut, smallMultiples } from "../core/charts.js";
import { createTable } from "../core/table.js";
import { section, tiles, segmented, lensButton, sourcesHtml, topBy, frameBtn } from "../core/view.js";
import { LAND_KEYS, LAND_LABEL, LAND_COLOR, rowsHighlight } from "../core/data.js";
import { tr } from "../../../i18n.js";

const LENS_OF = { forest: "forest", crop: "farmland", developed: "developed" };

export function mount(ctx) {
  const { app, data, el, link } = ctx;
  const w = app.w;
  const P = w.raw.pct;
  const owner = w.raw.owner;
  const { states } = data.levels;
  if (!P) {
    el.innerHTML = tr("<p class=\"adv-empty pad\">O world.json não tem as parcelas de cobertura do solo.</p>");
    return {};
  }

  // --- national shares and dominant cover per hex ---------------------------------------------------------------
  const sums = Object.fromEntries(LAND_KEYS.map((k) => [k, 0]));
  const dominant = new Map(LAND_KEYS.map((k) => [k, []]));
  let cells = 0;
  for (let i = 0; i < w.grid.size; i++) {
    if (!(owner[i] >= 0)) continue;
    let tot = 0, best = null, bv = 0;
    for (const k of LAND_KEYS) {
      const v = P[k]?.[i] || 0;
      tot += v;
      if (v > bv) { bv = v; best = k; }
    }
    if (tot <= 0) continue; // no land-cover samples
    cells++;
    for (const k of LAND_KEYS) sums[k] += P[k]?.[i] || 0;
    dominant.get(best).push(i);
  }
  const share = Object.fromEntries(LAND_KEYS.map((k) => [k, cells ? sums[k] / (cells * 100) : 0]));
  const other = Math.max(0, 1 - LAND_KEYS.reduce((a, k) => a + share[k], 0));

  el.insertAdjacentHTML("beforeend", tiles([
    { label: tr("Floresta"), value: pct(share.forest, 0), sub: tr("da terra"), color: LAND_COLOR.forest },
    { label: tr("Lavoura"), value: pct(share.crop, 0), sub: tr("da terra"), color: LAND_COLOR.crop },
    { label: tr("Campo e pasto"), value: pct(share.grass, 0), sub: tr("da terra"), color: LAND_COLOR.grass },
  ]));

  // --- composition ----------------------------------------------------------------------------------------------
  const cBody = section(el, { title: tr("O que cobre o país"), kicker: tr("Brasil"), note: tr("Parcela da terra em cada tipo de cobertura (ESA WorldCover 2021, média de todos os hexágonos). Passe o mouse num tipo para acender os hexágonos onde ele é a maior cobertura; clique para mantê-los acesos.") });
  let pinned = null;
  const parts = [...LAND_KEYS.map((k) => ({ key: k, label: LAND_LABEL[k], value: share[k], color: LAND_COLOR[k], text: pct(share[k]) })), { key: "other", label: tr("Outros (rocha, areia, dunas)"), value: other, color: "#6c6358", text: pct(other) }].sort((a, b) => (a.key === "other") - (b.key === "other") || b.value - a.value);
  const domHighlight = (k, dim = true) => (dominant.has(k) ? { cells: new Set(dominant.get(k)), dimOthers: dim, color: LAND_COLOR[k] } : null);
  const sb = shareBar(cBody, {
    parts,
    onHover: (p) => link.hover(p && p.key !== "other" ? { ...domHighlight(p.key), color: "#fff3c4" } : null),
    onClick: (p) => pin(p.key === "other" || pinned === p.key ? null : p.key),
  });
  const pinInfo = document.createElement("div");
  pinInfo.className = "adv-brushinfo";
  cBody.appendChild(pinInfo);
  const lensRow = document.createElement("div");
  lensRow.className = "adv-row";
  for (const [id, label] of [["forest", tr("Lente da floresta")], ["farmland", tr("Lente da lavoura")], ["developed", tr("Lente da área construída")]]) {
    const b = lensButton(app, id, label);
    if (b) lensRow.appendChild(b);
  }
  cBody.appendChild(lensRow);
  function pin(k) {
    pinned = k;
    sb.setSelected(k);
    link.base(k ? domHighlight(k) : null, { frame: true });
    if (!k) { pinInfo.innerHTML = ""; return; }
    const n = dominant.get(k).length;
    const lens = LENS_OF[k] && app.lensById.get(LENS_OF[k]);
    pinInfo.innerHTML = tr("<b>{0}</b> é a maior cobertura em <b>{1}</b> hexágonos ({2} dos hexágonos de terra) e cobre {3} de toda a terra.\n      {4}{5}<button type=\"button\" class=\"adv-mini\" data-clear>Limpar</button>", esc(LAND_LABEL[k]), int(n), pct(n / cells, 0), pct(share[k]), lens ? tr("<button type=\"button\" class=\"adv-mini\" data-lens=\"{0}\">Mostrar a lente {1}</button>", lens.id, esc(lens.name)) : "", frameBtn());
  }
  pinInfo.addEventListener("click", (e) => {
    if (e.target.closest("[data-clear]")) pin(null);
    const l = e.target.closest("[data-lens]")?.dataset.lens;
    if (l) app.setLens(l);
  });

  // --- per state ------------------------------------------------------------------------------------------------
  const sBody = section(el, { title: tr("Do que cada estado é feito"), note: tr("A terra de cada estado por tipo de cobertura. Ordene por qualquer cobertura; passe o mouse num estado para contorná-lo, clique para abri-lo.") });
  const stRows = states.rows.filter((r) => LAND_KEYS.some((k) => fin(r.v[`land_${k}`])));
  const comp = (r) => `<span class="adv-minibar">${LAND_KEYS.map((k) => {
    const v = r.v[`land_${k}`];
    return fin(v) && v > 0 ? `<i style="width:${(v * 100).toFixed(2)}%;background:${LAND_COLOR[k]}" title="${esc(`${LAND_LABEL[k]} ${pct(v)}`)}"></i>` : "";
  }).join("")}</span>`;
  const domOf = (r) => LAND_KEYS.reduce((b, k) => ((r.v[`land_${k}`] ?? -1) > (r.v[`land_${b}`] ?? -1) ? k : b), LAND_KEYS[0]);
  let sortKey = "forest";
  const colsFor = (k) => [
    { key: "name", label: tr("Estado"), align: "l", width: "minmax(0,1.1fr)", value: (r) => r.name, text: (r) => r.name },
    { key: "comp", label: tr("Terra"), align: "l", width: "minmax(0,1.6fr)", value: (r) => r.v[`land_${k}`], html: comp, title: tr("Ordenar por {0}", LAND_LABEL[k].toLowerCase()) },
    { key: "share", label: LAND_LABEL[k], value: (r) => r.v[`land_${k}`], html: (r) => `<span class="dot" style="background:${LAND_COLOR[k]}"></span>${pct(r.v[`land_${k}`], 0)}` },
    { key: "dom", label: tr("A maior"), align: "l", width: "minmax(0,.9fr)", value: (r) => LAND_LABEL[domOf(r)], text: (r) => LAND_LABEL[domOf(r)] },
  ];
  const sortSeg = document.createElement("div");
  sortSeg.className = "adv-row";
  sBody.appendChild(sortSeg);
  segmented(sortSeg, {
    label: tr("Ordenar por"), value: sortKey,
    options: LAND_KEYS.map((k) => ({ value: k, label: { forest: tr("Floresta"), crop: tr("Lavoura"), grass: tr("Campo"), shrub: tr("Arbustos"), wetland: tr("Úmida"), developed: tr("Construída") }[k] || LAND_LABEL[k] })),
    onChange: (k) => { sortKey = k; table.setColumns(colsFor(k), { key: "share", dir: "desc" }); drawShape(); },
  });
  let shape = "table";
  segmented(sortSeg, { label: tr("Mostrar como"), value: shape, options: [{ value: "table", label: tr("Tabela") }, { value: "grid", label: tr("Grade") }], onChange: (v) => { shape = v; drawShape(); } });
  const tableHost = document.createElement("div");
  const gridHost = document.createElement("div");
  sBody.append(tableHost, gridHost);
  const table = createTable(tableHost, {
    caption: tr("Cobertura do solo por estado"), rank: true, maxHeight: 320, rows: stRows, columns: colsFor(sortKey), sort: { key: "share", dir: "desc" },
    onHover: (r) => link.hover(r ? rowsHighlight(states, [r]) : null),
    onClick: (r) => states.focus(r),
  });
  // Small multiples: one donut per state, sorted by the chosen cover.
  let grid = null;
  function drawShape() {
    tableHost.hidden = shape !== "table";
    gridHost.hidden = shape !== "grid";
    if (shape !== "grid") return;
    gridHost.innerHTML = "";
    const sorted = [...stRows].sort((a, b) => (b.v[`land_${sortKey}`] ?? -1) - (a.v[`land_${sortKey}`] ?? -1));
    grid = smallMultiples(gridHost, {
      min: 92,
      items: sorted.map((r) => ({ key: r.key, label: r.v.abbr || r.key, sub: pct(r.v[`land_${sortKey}`], 0), row: r })),
      render: (cell, it) => donut(cell, {
        interactive: false, size: 62, thickness: 12,
        parts: LAND_KEYS.map((k) => ({ key: k, label: LAND_LABEL[k], value: it.row.v[`land_${k}`], color: LAND_COLOR[k] })),
        center: { big: pct(it.row.v[`land_${sortKey}`], 0), small: "" },
        ariaLabel: `${it.row.name}: ${LAND_KEYS.map((k) => `${LAND_LABEL[k]} ${pct(it.row.v[`land_${k}`], 0)}`).join(", ")}`,
      }),
      onHover: (it) => link.hover(it ? rowsHighlight(states, [it.row]) : null),
      onClick: (it) => states.focus(it.row),
    });
  }
  drawShape();

  // --- who works the land ---------------------------------------------------------------------------------------
  const food = app.data.nation.yields?.find((y) => y.key === "food");
  const fBody = section(el, { title: tr("Quem trabalha a terra"), note: tr("{0} Ordenado pela parcela dos empregos formais.", esc(food?.description || tr("Empregos formais na agropecuária."))) });
  const fHost = document.createElement("div");
  let fLevel = "states";
  segmented(fBody, { label: tr("Áreas"), value: fLevel, options: [{ value: "states", label: tr("Estados") }, { value: "metros", label: tr("Cidades") }], onChange: (v) => { fLevel = v; drawFood(); } });
  fBody.appendChild(fHost);
  function drawFood() {
    fHost.innerHTML = "";
    const lv = data.levels[fLevel];
    const list = topBy(lv.rows, (r) => ratio(r.v.y_food, r.v.employed), { n: 10, min: fLevel === "metros" ? 100000 : 0 });
    barList(fHost, {
      rank: true, ariaLabel: tr("Empregos na agropecuária"),
      rows: list.map((x) => ({ key: x.r.key, label: x.r.name, sub: tr("{0} empregos", count3(x.r.v.y_food)), value: x.v, text: pct(x.v), color: food?.color, row: x.r })),
      onHover: (r) => link.hover(r ? rowsHighlight(lv, [r.row]) : null),
      onClick: (r) => lv.focus(r.row),
    });
    if (fLevel === "metros") fHost.insertAdjacentHTML("beforeend", tr("<p class=\"adv-note\">Cidades de 100 mil habitantes ou mais.</p>"));
  }
  drawFood();

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, ["worldcover", "ibge_cempre"], [
    tr("A cobertura do solo vem das visões reduzidas do ESA WorldCover 2021 (cerca de 2,4 km por amostra), então coisas pequenas (as lavouras de um vale, uma cidade pequena) se misturam com o entorno."),
    tr("O WorldCover não separa pasto de campo: os pastos, que são a maior parte da terra usada pelo agro, contam em Campo e pasto, e a Lavoura é só a área plantada."),
    tr("Os empregos do agro são formais e contados onde fica o empregador; a maior parte do trabalho no campo é informal ou familiar e não entra aqui."),
  ]));

  return {
    onMapHover(h) {
      const r = h.cell >= 0 ? states.rowAtCell(h.cell) : null;
      table.setHot(r ? r.key : null);
      if (shape === "grid") grid?.setHot(r ? r.key : null);
      if (h.cell >= 0 && owner[h.cell] >= 0) {
        let best = null, bv = 0;
        for (const k of LAND_KEYS) { const v = P[k]?.[h.cell] || 0; if (v > bv) { bv = v; best = k; } }
        sb.setHot(best);
      } else sb.setHot(null);
    },
    onEscape() {
      if (pinned) { pin(null); return true; }
      return false;
    },
  };
}
