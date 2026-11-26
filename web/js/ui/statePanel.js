import { css } from "../color.js";
import { esc, popShort } from "../format.js";
import { isCapital } from "../world.js";
import { yieldGrid, amenities, industries, gdpRow, popLine, growthSpan, showPanel } from "./infoPanel.js";
import { tr } from "../i18n.js";

/**
 * Opens the panel for state `idx` (index into world.json states / states.json).
 * ctx: {w, nation, states (states.json or null), cities, onClose, onPedia, onCity(city)}
 */
export function openStatePanel(idx, ctx) {
  const { w, nation } = ctx;
  const n = nation.nation;
  const geo = w.raw.states[idx] || {};
  // states.json is in the same order as world.json states; fall back to matching by fips.
  let st = ctx.states?.[idx];
  if (st && geo.fips && st.fips && st.fips !== geo.fips) st = ctx.states.find((s) => s.fips === geo.fips);
  st = st || { ...geo };
  const name = st.name || geo.name || tr("Estado");
  const abbr = st.abbr || geo.abbr || "";
  const count = ctx.states?.length || w.raw.states.length;

  const cities = (ctx.cities || []).filter((c) => (c.states || []).includes(abbr)).slice(0, 8);
  const cityRows = cities.length
    ? `<div class="city-list">${cities
        .map((c) => {
          const multi = (c.states || []).length > 1 ? `<span class="muted"> · ${esc(c.states.join("–"))}</span>` : "";
          return `<button class="city-row" data-city="${esc(c.id)}" title="${esc(c.full || c.name)}">
            <span class="cr-name">${isCapital(c) ? "★ " : ""}${esc(c.name)}${multi}</span>
            <span class="cr-pop">${popShort(c.population)}</span><span class="cr-go" aria-hidden="true">›</span></button>`;
        })
        .join("")}</div>`
    : tr("<p class=\"muted\">Nenhuma cidade do mapa neste estado.</p>");

  const hasEcon = st.population != null || st.yields;
  showPanel({
    kind: "state",
    stripe: css(w.stateColor[idx] || [190, 190, 190]),
    title: name,
    sub: `${esc(abbr)}${geo.fips ? tr(" · código IBGE {0}", esc(geo.fips)) : ""}`,
    headExtra: hasEcon ? popLine(st, growthSpan(st, n)) : "",
    sections: [
      st.yields && { title: tr("Rendimentos · posição entre os estados"), html: `<div class="yield-grid">${yieldGrid(nation, st.yields, st.ranks, count)}</div>` },
      hasEcon && { title: tr("Qualidade de vida e moradia"), html: amenities(st, n) + gdpRow(st) },
      st.jobs && { title: tr("Principais atividades · onde as pessoas trabalham"), html: industries(st, nation, 8) },
      { title: tr("Maiores cidades"), html: cityRows },
      !hasEcon && { title: tr("Dados"), html: tr("<p class=\"muted\">Os números dos estados não estão nesta versão dos dados (falta o states.json).</p>") },
    ],
    foot: tr("Fonte: IBGE, {0}{1}. As posições são entre as {2} unidades da federação (1 = a maior).", esc(nation.vintage), nation.gdp_vintage ? tr("; PIB: {0}", esc(nation.gdp_vintage)) : "", count),
    onClose: ctx.onClose,
    onPedia: ctx.onPedia,
    wire(panel) {
      panel.querySelectorAll("[data-city]").forEach((b) => {
        b.onclick = () => {
          const c = ctx.cities.find((x) => x.id === b.dataset.city);
          if (c) ctx.onCity(c);
        };
      });
    },
  });
}
