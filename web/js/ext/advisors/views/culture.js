// Culture advisor ("Guardião das maravilhas"): the World Heritage sites (wonders.json) and the Culture yield (formal
// jobs in arts, culture, sport and recreation) by city.
import { esc, fin, ratio, el as mk } from "../core/util.js";
import { int, pct, count3 } from "../core/fmt.js";
import { barList } from "../core/charts.js";
import { section, tiles, segmented, sourcesHtml, topBy } from "../core/view.js";
import { rowsHighlight } from "../core/data.js";
import { frameBox, focusPoint } from "../core/frame.js";
import { tr, DEC } from "../../../i18n.js";

const CATEGORY = {
  cultural: { label: tr("Culturais"), color: "#e0b54c" },
  natural: { label: tr("Naturais"), color: "#6aa84f" },
  misto: { label: tr("Mistos"), color: "#c25b9a" },
};
const METRO_MIN = 100000;

export async function mount(ctx) {
  const { app, data, el, link } = ctx;
  const won = await app.loadData("wonders").catch(() => null);
  const { states, metros } = data.levels;
  const nation = app.data.nation;
  const n = data.nat;
  const cul = nation.yields?.find((y) => y.key === "culture");

  // --- headline -------------------------------------------------------------------------------------------------
  const wonders = (won?.wonders || []).map((w) => ({ ...w, key: w.id, cat: w.metrics?.category || (w.kind === "natural" ? "natural" : "cultural") }));
  const byCat = (c) => wonders.filter((w) => w.cat === c).length;
  const first = [...wonders].sort((a, b) => (a.metrics?.inscribed || 9999) - (b.metrics?.inscribed || 9999))[0];
  el.insertAdjacentHTML("beforeend", tiles([
    { label: tr("Patrimônio Mundial"), value: int(wonders.length), sub: tr("{0} culturais · {1} naturais{2}", byCat("cultural"), byCat("natural"), byCat("misto") ? tr(" · {0} misto", byCat("misto")) : "") },
    { label: tr("O primeiro"), value: first ? String(first.metrics?.inscribed || "–") : "–", sub: first ? first.short || first.name : "" },
    { label: tr("Empregos de Cultura"), value: count3(n.yields?.culture), sub: tr("{0} dos empregos formais", pct(ratio(n.yields?.culture, n.employed))), color: cul?.color },
  ]));

  // --- wonders --------------------------------------------------------------------------------------------------
  let wonderBars = null;
  const bubbles = ctx.bubbles("wonders", {
    rMax: 9, minR: 9, alpha: 0.28,
    tip: (b) => `<b>${esc(b.it.name)}</b><br>${tr("{0} · inscrito em {1}{2}", esc(CATEGORY[b.it.cat]?.label.replace(/s$/, "") || ""), b.it.metrics?.inscribed || "–", b.it.metrics?.danger ? tr("<br><span class=\"sub\">na lista do Patrimônio em perigo</span>") : "")}`,
    onHover: (b) => wonderBars?.setHot(b ? b.key : null),
    onClick: (b) => flyTo(b.it),
  });
  if (wonders.length) {
    const rule = (won.rules || [])[0];
    const wBody = section(el, { title: tr("As maravilhas"), kicker: tr("Patrimônio Mundial da UNESCO"), note: tr("{0} Passe o mouse numa maravilha para achá-la no mapa; clique para voar até lá.", esc(rule?.text || "")) });
    let cat = "all";
    segmented(wBody, {
      label: tr("Tipo"), value: cat,
      options: [{ value: "all", label: tr("Todas") }, ...Object.entries(CATEGORY).filter(([k]) => byCat(k)).map(([k, v]) => ({ value: k, label: v.label }))],
      onChange: (v) => { cat = v; drawWonders(); },
    });
    const wHost = mk("div");
    wBody.appendChild(wHost);
    function drawWonders() {
      wHost.innerHTML = "";
      const vis = wonders.filter((w) => cat === "all" || w.cat === cat).sort((a, b) => (a.metrics?.inscribed || 0) - (b.metrics?.inscribed || 0) || a.rank - b.rank);
      wonderBars = barList(wHost, {
        compact: true, ariaLabel: tr("Sítios do Patrimônio Mundial"),
        rows: vis.map((w) => ({ key: w.key, label: w.short || w.name, full: w.name, sub: w.state, value: null, text: String(w.metrics?.inscribed || ""), color: CATEGORY[w.cat]?.color })),
        onHover: (r) => {
          const w = r ? wonders.find((x) => x.key === r.key) : null;
          link.hover(w ? { cells: new Set(w.cells && w.cells.length ? w.cells : w.cell != null ? [w.cell] : []), label: w.short || w.name } : null);
          bubbles.setHot(w ? w.key : null);
        },
        onClick: (r) => flyTo(wonders.find((x) => x.key === r.key)),
      });
      bubbles.set(vis.filter((w) => fin(w.x) && fin(w.y)).map((w) => ({ key: w.key, x: w.x, y: w.y, value: 1, color: CATEGORY[w.cat]?.color || "#ccc", it: w })), { vMax: 1 });
    }
    drawWonders();
    wBody.insertAdjacentHTML("beforeend", tr("<p class=\"adv-note\">Marcas no mapa: {0}. O número ao lado é o ano da inscrição.</p>", Object.entries(CATEGORY).filter(([k]) => byCat(k)).map(([, v]) => `<i class="dot" style="background:${v.color}"></i>${v.label.toLowerCase()}`).join(" · ")));

    // Per state.
    const sBody = section(el, { title: tr("Por estado"), note: tr("Quantos sítios cada estado tem. Passe o mouse para contornar o estado; clique para abri-lo.") });
    const count = new Map();
    for (const w of wonders) if (w.state) count.set(w.state, (count.get(w.state) || 0) + 1);
    const list = [...count].sort((a, b) => b[1] - a[1]).map(([abbr, k]) => ({ row: states.byKey.get(abbr), k })).filter((x) => x.row);
    barList(sBody, {
      compact: true, ariaLabel: tr("Sítios por estado"),
      rows: list.map((x) => ({ key: x.row.key, label: x.row.name, value: x.k, text: int(x.k), color: "#e0b54c" })),
      onHover: (r) => link.hover(r ? rowsHighlight(states, [states.byKey.get(r.key)], { dim: true }) : null),
      onClick: (r) => states.focus(states.byKey.get(r.key)),
    });
    const none = states.rows.filter((r) => !count.has(r.key)).map((r) => r.key);
    if (none.length) sBody.insertAdjacentHTML("beforeend", tr("<p class=\"adv-note\">Sem sítio inscrito: {0}.</p>", esc(none.join(", "))));
  } else el.insertAdjacentHTML("beforeend", tr("<p class=\"adv-empty pad\">O wonders.json não foi gerado.</p>"));
  function flyTo(w) {
    if (!w) return;
    if (w.cells && w.cells.length > 2) {
      const b = app.highlightBounds({ cells: new Set(w.cells) });
      if (b) return frameBox(app, b, { pad: 60, maxScale: 3 });
    }
    focusPoint(app, w.x, w.y, Math.min(app.cam.maxScale, Math.max(app.cam.scale, (app.cam.fitScale || 1) * 3.2)));
  }

  // --- culture yield --------------------------------------------------------------------------------------------
  const cBody = section(el, { title: tr("O rendimento de Cultura"), note: tr("{0} Para a parcela, só cidades de {1} habitantes ou mais.", esc(cul?.description || tr("Empregos formais em artes, cultura, esporte e recreação.")), count3(METRO_MIN)) });
  const cHost = mk("div");
  let mode = "share";
  segmented(cBody, { label: tr("Ordenar por"), value: mode, options: [{ value: "share", label: tr("Parcela dos empregos") }, { value: "abs", label: tr("Mais empregos") }], onChange: (v) => { mode = v; drawCul(); } });
  cBody.appendChild(cHost);
  const share = (r) => ratio(r.v.y_culture, r.v.employed);
  const brShare = ratio(n.yields?.culture, n.employed);
  function drawCul() {
    cHost.innerHTML = "";
    const list = mode === "abs" ? topBy(metros.rows, (r) => r.v.y_culture, { n: 12 }) : topBy(metros.rows, share, { n: 12, min: METRO_MIN });
    barList(cHost, {
      rank: true, ariaLabel: tr("Cidades que lideram em Cultura"),
      rows: list.map((x) => ({ key: x.r.key, label: x.r.name, sub: mode === "abs" ? pct(share(x.r)) : tr("×{0} o Brasil", (share(x.r) / brShare).toFixed(2).replace(".", DEC)), value: x.v, text: mode === "abs" ? count3(x.v) : pct(x.v), color: cul?.color, row: x.r })),
      onHover: (r) => link.hover(r ? rowsHighlight(metros, [r.row]) : null),
      onClick: (r) => metros.focus(r.row),
    });
  }
  drawCul();

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, [...(won?.sources || []), "ibge_cempre"], [
    tr("Os sítios são exatamente a lista da UNESCO, sem curadoria: um sítio com vários pontos (as missões, os fortes) aparece no primeiro que cai em terra brasileira."),
    tr("Os empregos de Cultura são formais e contados onde fica o empregador; a maior parte do trabalho na cultura é informal ou por conta própria e não entra aqui."),
    tr("Religião, eleições e o militar ficam fora deste mapa."),
  ]));

  return {
    onMapHover(h) {
      if (h.item?.kind === "wonder") wonderBars?.setHot(h.item.data?.id ?? null);
    },
  };
}
