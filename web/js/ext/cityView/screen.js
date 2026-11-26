// The city screen: a docked dashboard (a bottom sheet on phones) with the header (and its city-type badge),
// Citizens (figure rows from citizens.json), Districts (districts.json + military.json), Economy, Workforce,
// Resources and Compare. Plain HTML strings + inline SVG charts; render(el, model, handlers) fills `el`. The
// citizens and districts files load on demand (h.loadData) and fill their sections when they arrive.
import { dollars, esc, int, pct } from "../../format.js";
import { compact, money, popShort, yieldValue } from "./fmt.js";
import { icon, glyph } from "../../ui/icon.js";
import { css } from "../../color.js";
import { isCapital } from "../../world.js";
import { sparkline, meter, bar } from "./charts.js";
import { popSeries, rankCount, resourceValue, LAND } from "./model.js";
import { citizensHtml, mountCitizens } from "./citizens.js";
import { badgeHtml, cityDistricts, districtsHtml } from "./districts.js";
import { tr, DEC } from "../../i18n.js";

const TABS = [
  ["citizens", tr("Cidadãos"), "pop"],
  ["districts", tr("Distritos"), "l-developed"],
  ["economy", tr("Economia"), "y-gold"],
  ["workforce", tr("Empregos"), "y-production"],
  ["resources", tr("Recursos"), "resources"],
  ["compare", tr("Comparar"), "layers"],
];

const signed = (g, d = 1) => (g == null ? "–" : `${g >= 0 ? "+" : "−"}${Math.abs(g * 100).toFixed(d)}%`);
const rankCache = new WeakMap();
function countOf(cities, key) {
  let m = rankCache.get(cities);
  if (!m) rankCache.set(cities, (m = new Map()));
  if (!m.has(key)) m.set(key, rankCount(cities, key));
  return m.get(key);
}

function rankBadge(rank, of, label, tip) {
  if (rank == null) return "";
  const tier = rank <= 10 ? "gold" : rank <= 50 ? "silver" : "bronze";
  return `<div class="cv-rank ${tier}" title="${esc(tip || tr("{0}: {1}º de {2} cidades (1 = a maior)", label, rank, of))}">
    <span class="cv-medal">${rank}º</span><span class="cv-rank-l">${esc(label)}</span></div>`;
}

function lqBadge(lq) {
  if (lq == null) return "";
  const tip = tr("Quociente locacional: esta parcela é {0}× a parcela do Brasil", lq.toFixed(2).replace(".", DEC));
  const cls = lq >= 1.25 ? "hi" : lq <= 0.75 ? "lo" : "mid";
  return `<span class="cv-lq ${cls}" title="${esc(tip)}">×${lq.toFixed(1)}</span>`;
}

function medallion(id, fallback, bg, size = 18) {
  return `<span class="cv-med" style="--bg:${esc(bg)}">${icon(id, fallback, { size })}</span>`;
}

// --- header --------------------------------------------------------------------------------------------------------
function header(m) {
  const c = m.city, n = m.nation.nation;
  const cities = m.cityList;
  const col = css(m.stateRGB);
  const chips = m.states.map((s) => (s.index >= 0
    ? `<button class="chip" data-state="${s.index}" title="${tr("Abrir {0}", esc(s.name))}">${esc(s.abbr)}</button>`
    : `<span class="chip">${esc(s.abbr)}</span>`)).join("");
  const g = Number.isFinite(c.growth) ? c.growth : null;
  const yrs = Array.isArray(c.growth_years) ? c.growth_years : null;
  const growth = g == null ? "" : `<span class="cv-growth ${g >= 0 ? "good" : "bad"}" title="${tr("Variação da população {0}, estimativas do IBGE. Brasil: {1}", yrs ? `${yrs[0]}–${yrs[1]}` : "", signed(n.growth))}">${g >= 0 ? "▲" : "▼"} ${Math.abs(g * 100).toFixed(1)}%${yrs ? ` <small>${tr("since {0}", yrs[0])}</small>` : ""}</span>`;
  const perCap = c.gdp != null && c.population ? c.gdp / c.population : null;
  const r = c.ranks || {};
  const N = (k) => countOf(cities, k);
  return tr("\n  <div class=\"sheet-grip cv-grip\" aria-hidden=\"true\"></div>\n  <header class=\"cv-head\" style=\"--sc:{0}\">\n    <div class=\"cv-ribbon\" aria-hidden=\"true\"></div>\n    <button class=\"icon-btn cv-close\" data-close aria-label=\"Fechar a tela da cidade (Esc)\" title=\"Voltar ao mapa (Esc)\">{1}</button>\n    <div class=\"cv-kind\">Tela da cidade · {2}</div>\n    <div class=\"cv-title\">\n      <div class=\"cv-crest\" aria-hidden=\"true\"><span>{3}</span></div>\n      <div class=\"cv-tt\">\n        <h2 class=\"cv-name\" tabindex=\"-1\">{4}{5}</h2>\n        <div class=\"cv-full\">{6}</div>\n        <div class=\"cv-typeslot\" data-ctype></div>\n        {7}\n      </div>\n    </div>\n    <div class=\"cv-headline\">\n      <div class=\"cv-big\"><span class=\"lbl\">{8} População</span><b>{9}</b>{10}</div>\n      <div class=\"cv-big\"><span class=\"lbl\">{11} PIB{12}</span><b>{13}</b>{14}</div>\n    </div>\n    <div class=\"cv-ranks\" aria-label=\"Posição entre {15} cidades\">\n      {16}\n      {17}\n      {18}\n      {19}\n    </div>\n  </header>\n  <nav class=\"cv-tabs\" aria-label=\"Seções da tela da cidade\">\n    {20}\n  </nav>", col, icon("close", "✕", { size: 13 }), c.counties && c.counties.length > 1 ? tr("Arranjo populacional") : tr("Município"), esc(popShort(c.population)), isCapital(c) ? `<span class="cv-cap" title="${tr("Capital federal")}">★</span> ` : "", esc(c.name), esc(c.full || ""), chips ? `<div class="chips">${chips}</div>` : "", icon("pop", "👥", { size: 13 }), int(c.population), growth, icon("y-gold", "💰", { size: 13 }), c.gdp_year ? ` ${c.gdp_year}` : "", money(c.gdp), 
        perCap != null ? tr("<span class=\"cv-sub\">{0} por habitante</span>", money(perCap)) : "", cities.length, rankBadge(r.population, N("population"), tr("População")), rankBadge(r.gdp, N("gdp"), "GDP"), rankBadge(r.gdp_per_capita, N("gdp_per_capita"), "GDP / person"), rankBadge(r.growth, N("growth"), tr("Crescimento"), r.growth != null ? tr("Crescimento: {0}º de {1} (1 = a que mais cresce)", r.growth, N("growth")) : ""), TABS.map(([id, label, ic]) => `<button type="button" data-tab="${id}">${icon(ic, "•", { size: 14 })}<span>${label}</span></button>`).join(""));
}

// --- citizens ------------------------------------------------------------------------------------------------------
function citizens(m) {
  const c = m.city, n = m.nation.nation;
  const series = popSeries(c);
  const ch = series.length >= 2 ? series.at(-1).value / series[0].value - 1 : null;
  // sub: the small line beside the value; by default the U.S. value, left out when there is none.
  const row = (ic, fb, label, v, us, fmt, better, max, sub = us != null ? `US ${fmt(us)}` : "", tick = us) => `
    <div class="cv-stat">
      <div class="cv-stat-top"><span class="sl">${icon(ic, fb, { size: 14 })}${esc(label)}</span>
        <span class="sv"><b>${v == null ? "–" : fmt(v)}</b>${sub ? `<small>${sub}</small>` : ""}</span></div>
      ${meter(v, tick, max ?? Math.max(v || 0, us || 0) * 1.35, better)}
    </div>`;
  // Employed residents: no U.S. figure to set beside a count, so the share of residents (and the U.S. share).
  const empShare = c.employed != null && c.population > 0 ? c.employed / c.population : null;
  const usEmpShare = n.employed != null && n.population > 0 ? n.employed / n.population : null;
  const empSub = empShare == null ? ""
    : tr("{0} da população{1}", pct(empShare), usEmpShare != null ? tr(" · Brasil {0}", pct(usEmpShare)) : "");
  const multi = m.tiles.length > 1;
  const tilesNote = multi
    ? tr("No mapa, cada hexágono da cidade mostra <b>≈ habitantes</b> (densidade dos municípios × área do hexágono, uma estimativa) e o seu\n       <b>uso principal do solo</b> (parcela da terra do hexágono){0}.", m.residentsSum > 0
        ? tr(". Juntos, os {0} hexágonos têm cerca de {1} habitantes por essa estimativa", m.tiles.length, compact(m.residentsSum)) : "")
    : tr("Esta cidade cabe num hexágono do mapa (cerca de {0} km²), mostrado com a cidade.", compact(m.hexArea));
  return tr("\n  <section class=\"cv-sec\" id=\"cv-citizens\" data-sec=\"citizens\" aria-labelledby=\"cv-h-citizens\">\n    <h3 id=\"cv-h-citizens\">{0}Cidadãos</h3>\n    <div class=\"cv-citizens\" data-citizens>{1}</div>\n    <h4 class=\"cv-h4\">População</h4>\n    <div class=\"cv-card\">\n      <div class=\"cv-card-h\"><span>População {2}</span>{3}</div>\n      {4}\n      <p class=\"cv-note\">Estimativas de população do IBGE, com a composição atual da cidade. Diferem um pouco da contagem do Censo acima.</p>\n    </div>\n    <div class=\"cv-stats\">\n      {5}\n      {6}\n      {7}\n    </div>\n    <div class=\"cv-legend-tiles\">{8}<p>{9}</p></div>\n    <h4 class=\"cv-h4\">Municípios <span class=\"muted\">({10})</span></h4>\n    <div class=\"cv-counties\" data-counties><p class=\"muted cv-note\">Carregando os municípios…</p></div>\n  </section>", icon("pop", "👥", { size: 15 }), citizensHtml(m, undefined), series.length ? `${series[0].year}–${series.at(-1).year}` : "", 
        ch != null ? `<span class="${ch >= 0 ? "good" : "bad"}">${signed(ch)}</span>` : "", sparkline(series, { fmt: (v) => popShort(v), title: tr("População de {0} por ano", c.name) }), row("pop", "👥", tr("Empregos formais"), c.employed, null, int, null, c.population, empSub, usEmpShare != null ? usEmpShare * c.population : null), row("unemployment", "😐", tr("Desocupação"), c.unemployment, n.unemployment, (x) => pct(x), "low"), row("l-income", "💵", tr("Renda média do trabalho"), c.median_income, n.median_income, dollars, "high"), tileLegend(m), tilesNote, (c.counties || []).length);
}

function tileLegend(m) {
  const counts = new Map();
  for (const t of m.tiles) if (t.land) counts.set(t.land.key, (counts.get(t.land.key) || 0) + 1);
  return `<div class="cv-tl">${LAND.filter((g) => counts.has(g.key)).map((g) =>
    `<span class="cv-tl-i"><i style="background:${esc(m.landColor(g.key))}"></i>${esc(g.label)} <small>${counts.get(g.key)}</small></span>`).join("")}</div>`;
}

export function countiesTable(m, data) {
  const c = m.city;
  if (!data || !Array.isArray(data.rows)) return tr("<p class=\"muted cv-note\">A tabela dos municípios ainda não está disponível.</p>");
  const col = Object.fromEntries(data.columns.map((k, j) => [k, j]));
  const want = new Set(c.counties || []);
  const rows = data.rows.filter((r) => want.has(r[col.geoid])).sort((a, b) => (b[col.population] || 0) - (a[col.population] || 0));
  if (!rows.length) return tr("<p class=\"muted cv-note\">Nenhum município desta cidade na tabela.</p>");
  const maxPop = rows[0][col.population] || 1;
  const show = rows.slice(0, 8);
  const vint = data.vintage ? ` (${esc(data.vintage)})` : "";
  return tr("<div class=\"cv-ctable\" role=\"table\" aria-label=\"Municípios\">\n    <div class=\"cv-cr cv-cr-h\" role=\"row\"><span role=\"columnheader\">Município</span><span role=\"columnheader\">Habitantes</span><span role=\"columnheader\">/km²</span><span role=\"columnheader\">Renda</span></div>\n    {0}\n    {1}\n    <p class=\"cv-note\">Dados por município{2}.</p>\n  </div>", show.map((r) => `<div class="cv-cr" role="row">
      <span role="cell" class="cv-cn">${esc(r[col.name])} <small>${esc(r[col.state])}</small>${bar(r[col.population] / maxPop, "var(--sc, #c9a45c)")}</span>
      <span role="cell">${compact(r[col.population])}</span><span role="cell">${r[col.density] != null ? int(r[col.density]) : "–"}</span>
      <span role="cell">${money(r[col.income])}</span></div>`).join(""), rows.length > show.length ? tr("<p class=\"muted cv-note\">e mais {0}.</p>", rows.length - show.length) : "", vint);
}

// --- districts -----------------------------------------------------------------------------------------------------
function districts(m) {
  return `
  <section class="cv-sec" id="cv-districts" data-sec="districts" aria-labelledby="cv-h-districts">
    <h3 id="cv-h-districts">${tr("{0}Distritos", icon("l-developed", "🏙", { size: 15 }))}</h3>
    <div data-districts>${districtsHtml(m, undefined, null)}</div>
  </section>`;
}

// --- economy -------------------------------------------------------------------------------------------------------
function economy(m) {
  const c = m.city, nat = m.nation, n = nat.nation;
  const r = c.ranks || {};
  const cities = m.cityList;
  const perCap = c.gdp != null && c.population ? c.gdp / c.population : null;
  const usPerCap = n.gdp && n.population ? n.gdp / n.population : null;
  const yields = nat.yields.map((y) => {
    const v = c.yields?.[y.key];
    const rk = r[y.key];
    return `<div class="cv-yield" style="--yc:${esc(y.color)}" title="${esc(y.label)}: ${esc(y.description || "")}">
      <div class="ico">${glyph(y, 20)}</div><div class="val">${yieldValue(y, v)}</div>
      <div class="lbl">${esc(y.key === "gold" ? tr("PIB") : y.label)}</div>
      ${rk != null ? tr("<div class=\"rk\">{0}º <small>de {1}</small></div>", rk, countOf(cities, y.key)) : ""}</div>`;
  }).join("");
  const gi = m.gdpInds;
  const maxShare = gi.length ? Math.max(...gi.map((d) => Math.max(d.share, d.natShare))) : 1;
  const gdpRow = (d) => d.undisclosed
    ? `<div class="cv-ind und" title="${tr("Parte dos valores é suprimida para proteger empresas: {0}. É o PIB da cidade menos cada atividade divulgada.", esc(d.missing.map((k) => nat.industries?.[k] || k).join(", ") || tr("várias atividades")))}">
      <span class="cv-ind-ic" style="--bg:${esc(d.color)}">${icon(d.icon, "?", { size: 13 })}</span>
      <span class="cv-ind-n">${esc(d.short)}</span>
      <span class="cv-ind-v">${money(d.value)} <small>${pct(d.share, 0)}</small></span>
      ${bar(d.share / maxShare, "#7c8494", 0)}
    </div>`
    : `<div class="cv-ind" title="${tr("{0}: {1} ({2} do PIB da cidade; Brasil {3}){4}", esc(d.label), money(d.value), pct(d.share), pct(d.natShare), d.estimated ? tr(". Inclui uma estimativa onde o valor é suprimido.") : "")}">
      <span class="cv-ind-ic" style="--bg:${esc(d.color)}">${icon(d.icon, "•", { size: 13 })}</span>
      <span class="cv-ind-n">${esc(d.short)}${lqBadge(d.lq)}</span>
      <span class="cv-ind-v">${d.estimated ? "≈" : ""}${money(d.value)} <small>${pct(d.share, 0)}</small></span>
      ${bar(d.share / maxShare, d.lq != null && d.lq >= 1.25 ? "#9fd76a" : "#c9a45c", d.natShare / maxShare)}
    </div>`;
  return tr("\n  <section class=\"cv-sec\" id=\"cv-economy\" data-sec=\"economy\" aria-labelledby=\"cv-h-economy\">\n    <h3 id=\"cv-h-economy\">{0}Economia</h3>\n    <div class=\"cv-gdp\">\n      <div><span class=\"lbl\">PIB{1}</span><b>{2}</b>{3}</div>\n      <div><span class=\"lbl\">PIB por habitante</span><b>{4}</b>{5}</div>\n      <div><span class=\"lbl\">Parcela do PIB do Brasil</span><b>{6}</b><small>{7} da população</small></div>\n    </div>\n    <h4 class=\"cv-h4\">Rendimentos <span class=\"muted\">posição entre as cidades</span></h4>\n    <div class=\"cv-yields\">{8}</div>\n    <h4 class=\"cv-h4\">PIB por atividade <span class=\"muted\">marca = parcela do Brasil</span></h4>\n    {9}\n    <p class=\"cv-note\">{10}, a preços correntes, contado onde o trabalho é feito; as parcelas são do PIB total da cidade. ×N = a parcela da atividade no PIB comparada com a parcela no PIB do Brasil.{11}{12}</p>\n  </section>", icon("y-gold", "💰", { size: 15 }), c.gdp_year ? ` (${c.gdp_year})` : "", money(c.gdp), r.gdp != null ? tr("<small>{0}º de {1}</small>", r.gdp, countOf(cities, "gdp")) : "", money(perCap), 
        usPerCap ? `<small class="${perCap >= usPerCap ? "good" : "bad"}">${tr("Brasil {0}", money(usPerCap))}</small>` : "", c.gdp != null && n.gdp ? pct(c.gdp / n.gdp, 2) : "–", pct(c.population / n.population, 2), yields, gi.length ? `<div class="cv-inds">${gi.slice(0, 8).map(gdpRow).join("")}</div>
      ${gi.length > 8 ? tr("<details class=\"cv-more\"><summary>Todas as {0} atividades</summary><div class=\"cv-inds\">{1}</div></details>", gi.length, gi.slice(8).map(gdpRow).join("")) : ""}`
      : tr("<p class=\"muted cv-note\">O IBGE ainda não divide o PIB desta cidade por atividade neste mapa.</p>"), esc(nat.gdp_vintage || tr("IBGE, PIB dos Municípios")), 
      gi.some((d) => d.estimated) ? tr(" ≈ inclui uma estimativa onde o valor de um município pequeno é suprimido.") : "", 
      gi.some((d) => d.undisclosed) ? tr(" Não divulgado = PIB suprimido por sigilo.") : "");
}

// --- workforce -----------------------------------------------------------------------------------------------------
function workforce(m) {
  const cards = m.inds.map((d) => {
    const spec = d.lq != null && d.lq >= 1.25;
    return `<div class="cv-bld${spec ? " spec" : ""}" title="${tr("{0}: {1} empregos formais aqui ({2}; Brasil {3})", esc(d.label), int(d.jobs), pct(d.share), pct(d.natShare))}">
      ${medallion(d.icon, "•", d.color, 17)}
      <div class="cv-bld-t"><span class="cv-bld-n">${esc(d.short)}</span>
        <span class="cv-bld-v">${compact(d.jobs)} <small>${pct(d.share, 1)}</small></span></div>
      ${lqBadge(d.lq)}
    </div>`;
  }).join("");
  return tr("\n  <section class=\"cv-sec\" id=\"cv-workforce\" data-sec=\"workforce\" aria-labelledby=\"cv-h-workforce\">\n    <h3 id=\"cv-h-workforce\">{0}Empregos</h3>\n    <p class=\"cv-lead\">Onde estão os {1} empregos formais da cidade, por atividade. <span class=\"cv-lq hi\">×N</span> compara a parcela dos empregos da atividade com a parcela no Brasil.</p>\n    <div class=\"cv-blds\">{2}</div>\n    <p class=\"cv-note\">IBGE, Cadastro Central de Empresas 2024: empregos formais assalariados, contados onde fica a empresa. O trabalho informal fica de fora. Os distritos do mapa saem desses mesmos empregos: veja Distritos.</p>\n  </section>", icon("y-production", "⚙️", { size: 15 }), int(m.city.employed), cards || tr("<p class=\"muted cv-note\">Sem dados de atividade.</p>"));
}

// --- resources -----------------------------------------------------------------------------------------------------
function resources(m) {
  const list = m.sites.map((s, k) => {
    const t = s.type;
    const val = resourceValue(s.item, t, compact);
    return `<button type="button" class="cv-site" data-site="${k}" title="${tr("Ir até {0}", esc(s.item.name))}">
      <span class="cv-med" style="--bg:${esc(t?.color || "#3a4a5e")}">${glyph(t, 16)}</span>
      <span class="cv-site-t"><b>${esc(s.item.name)}</b><small>${esc(t?.name || s.item.type)}${s.item.state ? ` · ${esc(s.item.state)}` : ""}</small>
        ${s.item.detail ? `<small class="cv-site-d">${esc(s.item.detail)}</small>` : ""}</span>
      <span class="cv-site-v">${esc(val)}<i aria-hidden="true">›</i></span>
    </button>`;
  }).join("");
  const cats = {};
  for (const s of m.sites) cats[s.type?.category || "other"] = (cats[s.type?.category || "other"] || 0) + 1;
  const mw = m.sites.filter((s) => s.type?.unit === "MW").reduce((a, s) => a + (s.item.value || 0), 0);
  const summary = m.sites.length
    ? tr("<p class=\"cv-lead\">{0} {1}{2}. Clique num deles para ir até lá.</p>", m.sites.length, m.sites.length === 1 ? tr("local mapeado") : tr("locais mapeados"), 
      mw ? tr(" · {0} de capacidade de geração mapeada", mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${Math.round(mw)} MW`) : "")
    : tr("<p class=\"muted cv-note\">Nenhum recurso mapeado nesta cidade. Só os locais grandes entram no mapa (cada tipo tem um limite de tamanho).</p>");
  return `
  <section class="cv-sec" id="cv-resources" data-sec="resources" aria-labelledby="cv-h-resources">
    <h3 id="cv-h-resources">${tr("{0}Recursos", icon("resources", "⛏️", { size: 15 }))}</h3>
    ${summary}
    <div class="cv-sites">${list}</div>
    ${m.sites.length ? tr("<p class=\"cv-note\">Locais cujo hexágono tem o centro num dos municípios da cidade. Só os locais mapeados, não a capacidade total da cidade.</p>") : ""}
  </section>`;
}

// --- compare -------------------------------------------------------------------------------------------------------
const COMPARE = {
  size: [
    [tr("População"), (c) => c.population, (v) => popShort(v)],
    [tr("PIB / habitante"), (c) => (c.gdp != null && c.population ? c.gdp / c.population : null), money],
    [tr("Renda do trabalho"), (c) => c.median_income, money],
    [tr("Crescimento"), (c) => (Number.isFinite(c.growth) ? c.growth : null), (v) => signed(v)],
  ],
  housing: [
    [tr("Renda do trabalho"), (c) => c.median_income, money],
    [tr("Desocupação"), (c) => c.unemployment, (v) => pct(v)],
  ],
};

export function compareTable(m, set = "size") {
  const rows = [m.city, ...m.peers];
  const cols = COMPARE[set] || COMPARE.size;
  const max = cols.map(([, f]) => Math.max(...rows.map((c) => Math.abs(f(c) ?? 0))) || 1);
  return `<div class="cv-cmp" role="table" aria-label="${tr("{0} e as cidades parecidas", esc(m.city.name))}">
    <div class="cv-cmp-r cv-cmp-h" role="row"><span role="columnheader">${tr("Cidade")}</span>${cols.map(([l]) => `<span role="columnheader">${esc(l)}</span>`).join("")}</div>
    ${rows.map((c, k) => `<div class="cv-cmp-r${k === 0 ? " me" : ""}" role="row">
      <span role="cell">${k === 0 ? `<b class="cv-cmp-n">${esc(c.name)}</b>` : `<button type="button" class="cv-cmp-n" data-peer="${esc(c.id)}" title="${tr("Abrir {0} na tela da cidade", esc(c.full || c.name))}">${esc(c.name)}</button>`}<small>${esc((c.states || []).join("–"))}</small></span>
      ${cols.map(([, f, fmt], j) => {
        const v = f(c);
        const col = v != null && v < 0 ? "#f08a6a" : k === 0 ? "#ecd08e" : "#8fa6bd";
        return `<span role="cell"><em>${v == null ? "–" : esc(fmt(v))}</em>${bar(v == null ? 0 : Math.abs(v) / max[j], col)}</span>`;
      }).join("")}
    </div>`).join("")}
  </div>`;
}

function compare(m) {
  return tr("\n  <section class=\"cv-sec\" id=\"cv-compare\" data-sec=\"compare\" aria-labelledby=\"cv-h-compare\">\n    <h3 id=\"cv-h-compare\">{0}Comparar</h3>\n    <p class=\"cv-lead\">As {1} cidades com população mais parecida. Clique numa para abrir.</p>\n    <div class=\"cv-seg\" role=\"group\" aria-label=\"Medidas\">\n      <button type=\"button\" data-set=\"size\" aria-pressed=\"true\">Tamanho e riqueza</button>\n      <button type=\"button\" data-set=\"housing\" aria-pressed=\"false\">Trabalho</button>\n    </div>\n    <div data-compare>{2}</div>\n  </section>", icon("layers", "⚖️", { size: 15 }), m.peers.length, compareTable(m, "size"));
}

function footer(m) {
  const nat = m.nation;
  return `<div class="cv-foot">${tr("Fontes: IBGE, {0}{1}; IBGE, Cadastro Central de Empresas. As posições são entre as {2} cidades do mapa.", esc(nat.vintage), nat.gdp_vintage ? `; PIB: ${esc(nat.gdp_vintage)}` : "", m.cityList.length)}
    <a href="#" data-pedia>${tr("Almanaque ›")}</a></div>`;
}

/**
 * Fill the dock. handlers: {onClose, onState(idx), onPeer(id), onSite(site), onSiteHover(site|null), onPedia,
 * loadCounties() → Promise<counties.json|null>, loadData(name) → Promise<data|null>, onDistricts(list)} (the
 * metro's districts once districts.json is in, for the map plaques).
 */
/**
 * Scrolls the dock to a section (its tab id, e.g. "districts"). Citizens and districts arrive later and change the
 * heights above, so the section is re-aligned as they do, for up to 4 s or until the user scrolls themselves.
 */
export function goToSection(el, id) {
  const sec = el?.querySelector(`[data-sec="${id}"]`);
  if (!sec) return false;
  const align = () => {
    const nav = el.querySelector(".cv-tabs");
    el.scrollTop = Math.max(0, sec.offsetTop - (nav?.offsetHeight || 0) - 4);
    el.onscroll?.(); // the tab spy (a scroll event is not always sent for a programmatic jump)
  };
  align();
  let ro = null;
  const stop = () => {
    ro?.disconnect();
    ro = null;
    for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) el.removeEventListener(t, stop);
  };
  for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) el.addEventListener(t, stop, { passive: true });
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => { if (sec.isConnected) align(); else stop(); });
    for (const c of el.children) ro.observe(c);
  }
  setTimeout(stop, 4000);
  return true;
}

export function render(el, m, h) {
  el.classList.add("cv-dock");
  el.style.setProperty("--sc", css(m.stateRGB));
  el.innerHTML = header(m) + citizens(m) + districts(m) + economy(m) + workforce(m) + resources(m) + compare(m) + footer(m);
  el.scrollTop = 0;

  el.querySelector("[data-close]").onclick = () => h.onClose();
  el.querySelectorAll("[data-state]").forEach((b) => (b.onclick = () => h.onState(+b.dataset.state)));
  el.querySelector("[data-pedia]").onclick = (e) => { e.preventDefault(); h.onPedia(); };

  // Sites: hover lights the hex on the map, click flies there.
  el.querySelectorAll("[data-site]").forEach((b) => {
    const s = m.sites[+b.dataset.site];
    b.onclick = () => h.onSite(s);
    b.onmouseenter = b.onfocus = () => h.onSiteHover(s);
    b.onmouseleave = b.onblur = () => h.onSiteHover(null);
  });

  // Compare: metric sets and peer links (delegated, the table is re-rendered).
  const cmp = el.querySelector("[data-compare]");
  el.querySelectorAll("[data-set]").forEach((b) => (b.onclick = () => {
    el.querySelectorAll("[data-set]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    cmp.innerHTML = compareTable(m, b.dataset.set);
  }));
  cmp.addEventListener("click", (e) => {
    const b = e.target.closest("[data-peer]");
    if (b) h.onPeer(b.dataset.peer);
  });

  // Tabs scroll to their section; the active tab follows the scroll position.
  const nav = el.querySelector(".cv-tabs");
  const tabs = [...el.querySelectorAll("[data-tab]")];
  const secs = tabs.map((t) => el.querySelector(`[data-sec="${t.dataset.tab}"]`));
  tabs.forEach((t, k) => (t.onclick = () => {
    const top = secs[k].offsetTop - nav.offsetHeight - 4;
    el.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }));
  const spy = () => {
    const y = el.scrollTop + nav.offsetHeight + 24;
    let k = 0;
    secs.forEach((s, j) => { if (s.offsetTop <= y) k = j; });
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) k = secs.length - 1;
    tabs.forEach((t, j) => t.classList.toggle("on", j === k));
  };
  el.onscroll = spy;
  spy();

  // Citizens and districts arrive with their files (each loaded once, on demand).
  const czHost = el.querySelector("[data-citizens]");
  Promise.resolve(h.loadData?.("citizens")).then((data) => {
    if (!czHost.isConnected) return;
    czHost.innerHTML = citizensHtml(m, data ?? null);
    mountCitizens(czHost, m, data);
  }, () => { if (czHost.isConnected) czHost.innerHTML = citizensHtml(m, null); });
  const dHost = el.querySelector("[data-districts]");
  const typeSlot = el.querySelector("[data-ctype]");
  Promise.all([h.loadData?.("districts"), Promise.resolve(h.loadData?.("military")).catch(() => null)]).then(([dd, mil]) => {
    if (!dHost.isConnected) return;
    dHost.innerHTML = districtsHtml(m, dd ?? null, mil ?? null);
    typeSlot.innerHTML = badgeHtml(m, dd ?? null);
    h.onDistricts?.(dd ? cityDistricts(dd, mil, m.city.id) : []);
  }, () => { if (dHost.isConnected) dHost.innerHTML = districtsHtml(m, null, null); });

  // Member counties arrive with counties.json (loaded once, on demand).
  const host = el.querySelector("[data-counties]");
  Promise.resolve(h.loadCounties()).then((data) => {
    if (host.isConnected) host.innerHTML = countiesTable(m, data);
  }, () => { if (host.isConnected) host.innerHTML = tr("<p class=\"muted cv-note\">A tabela dos municípios ainda não está disponível.</p>"); });
}
