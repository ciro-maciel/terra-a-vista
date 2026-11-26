// Health advisor ("Médico da corte"): infant mortality since 2000 and doctors and hospital beds per thousand people
// since 2010 (series_health.json, Datasus), by state and by city, and a door to the same numbers on the timeline.
import { esc, fin, el as mk } from "../core/util.js";
import { int, count3 } from "../core/fmt.js";
import { barList } from "../core/charts.js";
import { section, tiles, segmented, sourcesHtml } from "../core/view.js";
import { rowsHighlight } from "../core/data.js";
import { tr, DEC } from "../../../i18n.js";

const CITY_MIN = 100000;
const d1 = (v) => (fin(v) ? v.toFixed(1).replace(".", DEC) : "–");

export async function mount(ctx) {
  const { app, data, el, link } = ctx;
  const h = await (app.timeline?.series ? app.timeline.series("health") : app.loadData("series_health"));
  if (!h) {
    el.innerHTML = tr("<p class=\"adv-empty pad\">O series_health.json não foi gerado, então o médico da corte não tem o que contar.</p>");
    return {};
  }
  const { states, metros } = data.levels;
  const ys = h.years, last = ys.length - 1;
  const meta = Object.fromEntries(h.metrics.map((m) => [m.id, m]));
  const first = (arr) => arr.findIndex((v) => v != null);
  const nat = h.nation;
  // Compare from 2010: before it the death records missed many infants in the North and Northeast (the direct rate
  // understates the real one there), so a 2000 to 2024 change would flatter exactly the states that improved most.
  const i0 = Math.max(first(nat.infant), ys.indexOf(2010));

  el.insertAdjacentHTML("beforeend", tiles([
    { label: tr("Mortalidade infantil"), value: d1(nat.infant[last]), sub: tr("por mil nascidos vivos em {0}; {1} em {2}", ys[last], d1(nat.infant[i0]), ys[i0]), color: "#c2463d" },
    { label: tr("Médicos"), value: d1(nat.doctors[last]), sub: tr("por mil habitantes; {0} em {1}", d1(nat.doctors[first(nat.doctors)]), ys[first(nat.doctors)]) },
    { label: tr("Leitos"), value: d1(nat.beds[last]), sub: tr("de internação por mil habitantes, {0}", ys[last]) },
  ]));
  const tl = mk("p", "adv-row");
  tl.innerHTML = tr("<button type=\"button\" class=\"adv-mini\" data-tl>Ver na linha do tempo</button>");
  tl.querySelector("[data-tl]").addEventListener("click", () => app.timeline?.open(ys[last], "health"));
  el.appendChild(tl);

  // --- states ---------------------------------------------------------------------------------------------------
  const sBody = section(el, { title: tr("A queda da mortalidade infantil"), kicker: tr("por estado"), note: tr("Óbitos de menores de 1 ano por mil nascidos vivos em {0}, do maior para o menor; ao lado, quanto era em {1} (antes de 2010 faltavam registros de óbitos de bebês no Norte e no Nordeste, então a comparação começa ali). Passe o mouse para contornar o estado; clique para abri-lo.", ys[last], ys[i0]) });
  const sRows = states.rows.map((r) => ({ r, s: h.states[r.key]?.infant || [] })).filter((x) => fin(x.s[last])).sort((a, b) => b.s[last] - a.s[last]);
  barList(sBody, {
    compact: true, ariaLabel: tr("Mortalidade infantil por estado"),
    rows: sRows.map((x) => ({ key: x.r.key, label: x.r.name, value: x.s[last], text: d1(x.s[last]), sub: `${ys[i0]}: ${d1(x.s[i0])} · ${pctDrop(x.s[i0], x.s[last])}`, color: "#c2463d" })),
    onHover: (row) => link.hover(row ? rowsHighlight(states, [states.byKey.get(row.key)], { dim: true }) : null),
    onClick: (row) => states.focus(states.byKey.get(row.key)),
  });
  const best = sRows.at(-1), worst = sRows[0];
  if (best && worst) sBody.insertAdjacentHTML("beforeend", tr("<p class=\"adv-note\">Em {0}, um bebê de {1} tinha {2} vezes o risco de morrer antes de um ano de um bebê de {3}. Em {4} a distância era de {5} vezes entre os mesmos dois.</p>", ys[last], esc(worst.r.name), d1(worst.s[last] / best.s[last]), esc(best.r.name), ys[i0], d1(worst.s[i0] / best.s[i0])));

  // --- cities ---------------------------------------------------------------------------------------------------
  const cBody = section(el, { title: tr("As cidades"), note: tr("Só as cidades de {0} habitantes ou mais, em {1}. Clique numa cidade para abri-la.", count3(CITY_MIN), ys[last]) });
  let metric = "infant", order = "high";
  const ctl = mk("div", "adv-row");
  cBody.appendChild(ctl);
  segmented(ctl, { label: tr("Medida"), value: metric, options: h.metrics.map((m) => ({ value: m.id, label: m.name })), onChange: (v) => { metric = v; drawCities(); } });
  segmented(ctl, { label: tr("Ordem"), value: order, options: [{ value: "high", label: tr("Maiores") }, { value: "low", label: tr("Menores") }], onChange: (v) => { order = v; drawCities(); } });
  const cHost = mk("div");
  cBody.appendChild(cHost);
  function drawCities() {
    cHost.innerHTML = "";
    const m = meta[metric];
    const list = metros.rows.filter((r) => (r.v.population || 0) >= CITY_MIN).map((r) => ({ r, v: h.cities[r.key]?.[metric]?.[last] })).filter((x) => fin(x.v))
      .sort((a, b) => (order === "high" ? b.v - a.v : a.v - b.v)).slice(0, 12);
    barList(cHost, {
      rank: true, ariaLabel: tr("Cidades por {0}", m.name.toLowerCase()),
      rows: list.map((x) => ({ key: x.r.key, label: x.r.name, sub: x.r.sub, value: x.v, text: d1(x.v), color: metric === "infant" ? "#c2463d" : "#3f9c82", row: x.r })),
      onHover: (row) => link.hover(row ? rowsHighlight(metros, [row.row]) : null),
      onClick: (row) => metros.focus(row.row),
    });
    cHost.insertAdjacentHTML("beforeend", `<p class="adv-note">${esc(m.unit)}. ${esc(m.description)}</p>`);
  }
  drawCities();

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, h.sources, [
    esc(h.rule),
    tr("A mortalidade infantil de um município pequeno, mesmo somando três anos, ainda varia muito: poucos nascimentos e uma morte a mais mudam a taxa. Cidades e estados somam muitos municípios e são mais firmes."),
  ]));
  return {};
}

function pctDrop(a, b) {
  if (!fin(a) || !fin(b) || !a) return "";
  const d = (b - a) / a;
  return `${d <= 0 ? "−" : "+"}${int(Math.abs(d) * 100)}%`;
}
