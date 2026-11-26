// Energy & Resources advisor: the mapped power plants, oil and gas, mines and farm output.
import { esc, fin } from "../core/util.js";
import { fmtValue, mw, int, count3 } from "../core/fmt.js";
import { barList, shareBar, stackedBars, sizeLegend } from "../core/charts.js";
import { createTable } from "../core/table.js";
import { section, tiles, chips, sourcesHtml } from "../core/view.js";
import { frameBox, focusPoint } from "../core/frame.js";
import { glyph } from "../../../ui/icon.js";
import { tr } from "../../../i18n.js";

const GROUPS = [
  { id: "water", label: tr("Hidrelétricas"), types: ["hydro"] },
  { id: "thermal", label: tr("Térmicas e nuclear"), types: ["nuclear", "gas_plant", "coal_plant", "biomass"] },
  { id: "renew", label: tr("Vento e sol"), types: ["wind", "solar"] },
  { id: "oil", label: tr("Petróleo e gás"), types: ["platform", "oil", "gas"] },
  { id: "mines", label: tr("Minas"), types: ["iron", "gold", "copper", "bauxite", "manganese", "nickel", "tin", "niobium", "phosphate", "potash", "kaolin", "coal_mine", "diamond"] },
  { id: "agro", label: tr("Agro"), types: ["soy", "corn", "sugarcane", "coffee", "orange", "cotton", "rice", "beans", "cassava", "wheat", "cocoa", "banana", "grape", "tobacco", "cattle", "pigs", "chickens"] },
];

export function mount(ctx) {
  const { app, data, el, link } = ctx;
  const res = app.data.resources;
  if (!res) {
    el.innerHTML = tr("<p class=\"adv-empty pad\">O resources.json não foi gerado, então não há nada para mostrar aqui.</p>");
    return {};
  }
  const types = res.types;
  const typeById = new Map(types.map((t) => [t.id, t]));
  const items = res.items.map((it, i) => ({ ...it, idx: i, key: String(i) }));
  const nat = res.summary?.national || {};
  const isMW = (t) => typeById.get(t)?.unit === "MW";
  const mwTypes = types.filter((t) => t.unit === "MW");
  const states = app.data.states || [];
  const stateIdx = new Map(states.map((s, i) => [s.abbr, i]));
  // Draw groups in GROUPS order, plus any type the groups do not list.
  const listed = new Set(GROUPS.flatMap((g) => g.types));
  const groups = GROUPS.map((g) => ({ ...g, types: g.types.filter((t) => typeById.has(t)) })).filter((g) => g.types.length);
  const extra = types.filter((t) => !listed.has(t.id)).map((t) => t.id);
  if (extra.length) groups.push({ id: "other", label: tr("Outros"), types: extra });

  const st = { on: new Set(types.map((t) => t.id)), min: 0, state: null };
  ctx.setShowResources(true);

  // --- headline -------------------------------------------------------------------------------------------------
  const totalMW = mwTypes.reduce((a, t) => a + (nat[t.id]?.value || 0), 0);
  const sites = mwTypes.reduce((a, t) => a + (nat[t.id]?.count || 0), 0);
  const top = el.appendChild(document.createElement("div"));
  top.innerHTML = tiles([
    { label: tr("Potência mapeada"), value: mw(totalMW), sub: tr("{0} usinas", int(sites)) },
    { label: tr("Plataformas"), value: int(nat.platform?.count || 0), sub: tr("de petróleo no mar") },
    { label: tr("Minas"), value: int(groups.find((g) => g.id === "mines")?.types.reduce((a, t) => a + (nat[t]?.count || 0), 0) || 0), sub: tr("concessões de lavra") },
  ]) + `<p class="adv-callout">${esc(res.summary?.note || tr("Totais só dos locais mapeados."))}</p>`;

  // --- national mix ---------------------------------------------------------------------------------------------
  const mixBody = section(el, { title: tr("A matriz elétrica"), kicker: tr("Usinas do mapa, acima do porte mínimo"), note: tr("Potência das usinas do mapa, por tipo. As pequenas não estão no mapa, então isto <b>não</b> é a capacidade instalada do país: mostra onde ficam as grandes usinas e com o que elas geram.") });
  const mixParts = mwTypes.map((t) => ({ key: t.id, label: t.name, value: nat[t.id]?.value || 0, color: t.color, text: mw(nat[t.id]?.value), icon: glyph(t, 14) })).sort((a, b) => b.value - a.value);
  const mixHover = (p) => {
    if (!p) { link.hover(null); bubbles.setSelected(null); return; }
    const set = new Set(visible().filter((it) => it.type === p.key).map((it) => it.idx));
    link.hover({ resources: set, dimOthers: true });
    bubbles.setSelected(new Set(visible().filter((it) => it.type === p.key).map((it) => it.key)));
  };
  const solo = (typeId) => {
    const only = st.on.size === 1 && st.on.has(typeId);
    st.on = only ? new Set(types.map((t) => t.id)) : new Set([typeId]);
    typeChips.set(st.on);
    apply();
  };
  shareBar(mixBody, { parts: mixParts, legend: false, onHover: mixHover, onClick: (p) => solo(p.key) });
  const mixBars = barList(mixBody, {
    rows: mixParts.map((p) => ({ ...p, sub: tr("{0} usinas", int(nat[p.key]?.count || 0)) })),
    onHover: mixHover, onClick: (p) => solo(p.key), ariaLabel: tr("Potência mapeada por tipo"),
  });

  // --- filters --------------------------------------------------------------------------------------------------
  const fBody = section(el, { title: tr("Filtrar o mapa"), note: tr("Ligue e desligue os tipos (Alt e clique mostra só um). O mapa escurece o terreno e desenha cada usina como um círculo do tamanho da sua potência.") });
  const typeChips = chips(fBody, {
    label: tr("Tipos de recurso"),
    items: groups.flatMap((g) => g.types.map((t) => {
      const ty = typeById.get(t);
      return { key: t, label: ty.name, color: ty.color, icon: glyph(ty, 13), count: nat[t]?.count ?? null };
    })),
    onChange: (on) => { st.on = on; apply(); },
  });
  const quick = document.createElement("div");
  quick.className = "adv-row";
  quick.innerHTML = groups.map((g) => `<button type="button" class="adv-mini" data-g="${g.id}">${esc(g.label)}</button>`).join("") +
    `<button type="button" class="adv-mini" data-g="all">${tr("Todos")}</button><button type="button" class="adv-mini" data-g="none">${tr("Nenhum")}</button>`;
  fBody.appendChild(quick);
  quick.addEventListener("click", (e) => {
    const g = e.target.closest("[data-g]")?.dataset.g;
    if (!g) return;
    st.on = g === "all" ? new Set(types.map((t) => t.id)) : g === "none" ? new Set() : new Set(groups.find((x) => x.id === g).types);
    typeChips.set(st.on);
    apply();
  });
  const slider = document.createElement("div");
  slider.className = "adv-slider";
  slider.innerHTML = tr("<label><span>Porte mínimo</span><input type=\"range\" min=\"0\" max=\"3000\" step=\"100\" value=\"0\" aria-label=\"Potência mínima da usina em MW\"><b>Qualquer porte</b></label>\n    <p class=\"adv-note adv-min-note\" hidden>Petróleo, minas e agro ficam escondidos enquanto houver um mínimo: não se medem em MW.</p>");
  fBody.appendChild(slider);
  const range = slider.querySelector("input");
  range.addEventListener("input", () => {
    st.min = +range.value;
    slider.querySelector("b").textContent = st.min ? `≥ ${int(st.min)} MW` : tr("Qualquer porte");
    slider.querySelector(".adv-min-note").hidden = !st.min;
    apply();
  });
  const stateChip = document.createElement("div");
  stateChip.className = "adv-row adv-filterbar";
  fBody.appendChild(stateChip);
  stateChip.addEventListener("click", (e) => { if (e.target.closest("[data-clear-state]")) setState(null); });
  const legendBox = document.createElement("div");
  fBody.appendChild(legendBox);

  // --- top sites ------------------------------------------------------------------------------------------------
  const tBody = section(el, { title: tr("Os locais"), note: tr("Todo local do mapa que passa os filtros. Passe o mouse para achá-lo no mapa; clique para voar até lá.") });
  const sizeSort = (r) => (isMW(r.type) && fin(r.value) ? r.value : null);
  const table = createTable(tBody, {
    caption: tr("Recursos do mapa"),
    search: tr("Buscar local, estado ou município"),
    searchText: (r) => `${r.name} ${r.state || ""} ${r.detail || ""} ${typeById.get(r.type)?.name || ""}`,
    rank: true,
    columns: [
      { key: "name", label: tr("Local"), align: "l", width: "minmax(0,1.7fr)", value: (r) => r.name, html: (r) => `<span class="ic">${glyph(typeById.get(r.type), 13)}</span>${esc(r.name)}` },
      { key: "type", label: tr("Tipo"), align: "l", width: "minmax(0,1fr)", value: (r) => typeById.get(r.type)?.name, text: (r) => typeById.get(r.type)?.name || r.type },
      { key: "state", label: "UF", align: "l", width: "46px", value: (r) => r.state, text: (r) => r.state || "–" },
      { key: "value", label: tr("Porte"), width: "minmax(0,.95fr)", value: sizeSort, text: (r) => sizeText(r), title: tr("Ordenar pela potência (MW; as outras unidades vão para o fim)") },
    ],
    rows: [],
    sort: { key: "value", dir: "desc" },
    maxHeight: 300,
    onHover: (r) => {
      link.hover(r ? { resources: new Set([r.idx]), dimOthers: true, label: r.name } : null);
      bubbles.setHot(r ? r.key : null);
    },
    onClick: (r) => flyTo(r),
  });
  function sizeText(r) {
    const t = typeById.get(r.type);
    if (!fin(r.value)) return "–";
    if (t?.unit === "MW") return mw(r.value);
    if (t?.unit === "t") return `${count3(r.value)} t`;
    if (t?.unit === "ha") return `${count3(r.value)} ha`;
    if (/km/.test(t?.unit || "")) return `${count3(r.value)} km²`;
    if (t?.unit) return `${count3(r.value)} ${t.unit}`;
    return fmtValue("float", r.value);
  }
  function flyTo(r) {
    focusPoint(app, r.x, r.y, Math.min(app.cam.maxScale, Math.max(app.cam.scale, (app.cam.fitScale || 1) * 3.2)));
  }

  // --- per state ------------------------------------------------------------------------------------------------
  const sBody = section(el, { title: tr("Potência por estado"), note: tr("Potência mapeada em cada estado, por tipo. Clique num estado para filtrar tudo por ele; clique de novo para limpar.") });
  const stateRows = states
    .map((s, i) => ({ key: s.abbr, label: s.name, idx: i, parts: s.energy?.by_type || {}, total: s.energy?.total || 0, text: mw(s.energy?.total) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const stacks = stackedBars(sBody, {
    rows: stateRows, keys: mwTypes.map((t) => ({ key: t.id, label: t.name, color: t.color })), fmt: (v) => mw(v),
    ariaLabel: tr("Potência mapeada por estado"),
    onHover: (x) => {
      if (!x) return link.hover(null);
      const sIdx = x.row.idx;
      const set = x.part ? new Set(items.filter((it) => it.state === x.row.key && it.type === x.part).map((it) => it.idx)) : undefined;
      link.hover({ states: new Set([sIdx]), resources: set, dimOthers: true, label: x.part ? `${x.row.label}: ${typeById.get(x.part)?.name || x.part}` : x.row.label });
    },
    onClick: (x) => setState(st.state === x.row.key ? null : x.row.key, true),
  });
  const noPower = states.filter((s) => !(s.energy?.total > 0)).map((s) => s.abbr);
  if (noPower.length) sBody.insertAdjacentHTML("beforeend", tr("<p class=\"adv-note\">Sem usina no mapa: {0}.</p>", esc(noPower.join(", "))));

  // --- explainer ------------------------------------------------------------------------------------------------
  const eBody = section(el, { title: tr("O que os símbolos querem dizer"), note: tr("Cada tipo de recurso, o porte que um local precisa ter para entrar no mapa e de onde vem o dado.") });
  eBody.innerHTML = groups.map((g) => `<h4 class="adv-h4">${esc(g.label)}</h4>${g.types.map((t) => {
    const ty = typeById.get(t);
    const s = nat[t] || {};
    const src = data.source(ty.source);
    const total = fin(s.value) ? (ty.unit === "MW" ? mw(s.value) : `${count3(s.value)} ${ty.unit}`) : /km²/.test(ty.unit || "") ? tr("áreas que não se somam") : "";
    return tr("<div class=\"adv-explain\" style=\"--cc:{0}\"><span class=\"ic\">{1}</span><div>\n      <b>{2}</b> <span class=\"sub\">{3} no mapa{4} · medido em {5}</span>\n      <p>{6}</p><span class=\"src\">Fonte: {7}</span></div></div>", esc(ty.color), glyph(ty, 22), esc(ty.name), int(s.count || 0), total ? ` · ${esc(total)}` : "", esc(ty.unit), esc(ty.description), esc(src ? `${src.title} (${src.vintage || src.publisher})` : ty.source));
  }).join("")}`).join("");

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, ["aneel_siga", "anp_geo", "anm_sigmine", "ibge_agro"], [
    tr("Só entram os locais acima do porte mínimo de cada tipo (veja a descrição de cada um), então os totais <b>não</b> são a capacidade do estado nem do país."),
    tr("A potência é a outorgada (MW), não quanto a usina gera: um parque solar de 1.000 MW gera bem menos num ano que uma nuclear de 1.000 MW."),
    tr("Minas se medem pela área da concessão (ANM), plataformas pela capacidade (ANP), lavouras em toneladas e rebanhos em cabeças (IBGE). Essas unidades não se somam aos MW."),
    tr("Um local conta no estado em que o órgão o registra; alguns, perto da divisa, ficam num hexágono de outro estado."),
  ]));

  // --- map ------------------------------------------------------------------------------------------------------
  const bubbles = ctx.bubbles("sites", {
    rMax: 24,
    tip: (b) => {
      const it = b.it, t = typeById.get(it.type);
      return `<b>${esc(it.name)}</b><br>${esc(t.name)} · <b>${esc(mw(it.value))}</b>${it.state ? ` · ${esc(it.state)}` : ""}${it.detail ? `<br><span class="sub">${esc(it.detail)}</span>` : ""}`;
    },
    onHover: (b) => table.setHot(b ? b.key : null),
    onClick: (b) => { table.setHot(b.key); flyTo(b.it); },
  });

  function visible() {
    return items.filter((it) => st.on.has(it.type) && (!st.min || (isMW(it.type) && fin(it.value) && it.value >= st.min)) && (!st.state || it.state === st.state));
  }

  function setState(abbr, fly = false) {
    st.state = abbr;
    stacks.setSelected(abbr);
    apply();
    if (abbr && fly) {
      const b = app.highlightBounds({ states: new Set([stateIdx.get(abbr)]) });
      if (b) frameBox(app, b, { pad: 30, maxScale: 2.6 });
    }
  }

  function apply() {
    const typesOn = st.min ? new Set([...st.on].filter(isMW)) : st.on;
    const all = typesOn.size === types.length && !st.min;
    ctx.setResourceFilter(all ? null : { types: new Set(typesOn), minValue: st.min || undefined });
    const vis = visible();
    table.setRows(vis);
    const mwVis = vis.filter((it) => isMW(it.type) && fin(it.value));
    const vMax = Math.max(1, ...items.filter((it) => isMW(it.type) && fin(it.value)).map((it) => it.value));
    bubbles.set(mwVis.map((it) => ({ key: it.key, x: it.x, y: it.y, value: it.value, color: typeById.get(it.type).color, it })), { vMax });
    const sIdx = st.state ? stateIdx.get(st.state) : null;
    link.base({ dimOthers: true, states: sIdx != null ? new Set([sIdx]) : undefined });
    stateChip.innerHTML = st.state
      ? tr("<span class=\"adv-fchip\">Estado: <b>{0}</b> · {1} locais<button type=\"button\" data-clear-state aria-label=\"Limpar o filtro de estado\">✕</button></span>", esc(states[sIdx]?.name || st.state), int(vis.length))
      : "";
    const r = (v) => 24 * Math.sqrt(v / vMax);
    legendBox.innerHTML = sizeLegend([250, 1000, 4000].filter((v) => v <= vMax * 1.2), r, (v) => `${int(v)} MW`, tr("Área do círculo = potência"));
    mixBars.setSelected(st.on.size === 1 ? [...st.on][0] : null);
  }
  apply();

  return {
    onMapHover(h) {
      if (h.resource) {
        const it = items[res.items.indexOf(h.resource)];
        if (it) table.setHot(it.key);
      }
    },
    onEscape() {
      if (st.state) { setState(null); return true; }
      return false;
    },
    destroy() {},
  };
}
