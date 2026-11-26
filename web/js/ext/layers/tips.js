// Hover tooltips for the map-art layers (HTML strings; every data value is escaped). Each says where the number comes
// from and the caveat that matters for it (FAF values are model estimates; bases have no published headcount; the
// trade arc is a drawing aid; curated landmarks are an editorial pick).
import { esc, compact, int, pct } from "../../format.js";
import { FORT_KINDS, fortKind, WONDER_KINDS } from "../../render/art/sites.js";
import { MODE_STYLE } from "../../render/art/improvements.js";

const muted = (s) => `<span class="muted">${s}</span>`;
const num = (n, d = 1) => (n == null || !Number.isFinite(n) ? "–" : compact(n));
const sign = (x) => (x > 0 ? "+" : x < 0 ? "−" : "±");

function usd(n) {
  if (n == null || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e12) return `R$ ${(n / 1e12).toFixed(2)} trillion`;
  if (a >= 1e9) return `R$ ${(n / 1e9).toFixed(a >= 1e10 ? 1 : 2)} billion`;
  if (a >= 1e6) return `R$ ${(n / 1e6).toFixed(1)} million`;
  return `R$ ${int(n)}`;
}

const HUB_NAME = { L: "Aeroporto grande", M: "Aeroporto médio", S: "Aeroporto pequeno", N: "Aeroporto regional" };
const br = (x, d = 1) => x.toFixed(d).replace(".", ",");

export const tips = {
  port(p) {
    const lines = [`<b>${esc(p.name)}</b> ${muted(`${esc(p.kind || "Porto")}, ${esc(p.municipality || "")} (${esc(p.state || "")})`)}`];
    if (p.tons != null) lines.push(`<b>${br(p.tons / 1e6)} milhões de t</b> movimentadas em ${esc(p.year)}`);
    if (p.teu != null) lines.push(`${int(p.teu)} TEU em contêineres`);
    if (p.grain_export_t != null) lines.push(`${br(p.grain_export_t / 1e6)} milhões de t de milho e soja exportadas`);
    lines.push(muted(`ANTAQ, Anuário ${esc(p.year)}; na sede do município (o anuário não traz coordenadas).`));
    return lines.join("<br>");
  },
  airport(a) {
    const lines = [`<b>${esc(a.id)} · ${esc(a.name)}</b> ${muted(esc([a.city, a.state].filter(Boolean).join(", ")))}`];
    lines.push(a.hub ? esc(HUB_NAME[a.hub] || a.hub) : "Aeroporto de carga");
    if (a.pax != null) lines.push(`<b>${num(a.pax)}</b> passageiros em ${esc(a.year)}${a.intl_pax ? ` (${num(a.intl_pax)} internacionais)` : ""}`);
    if (a.cargo_kg != null && a.cargo_kg >= 1e6) lines.push(`${num(a.cargo_kg / 1000)} t de carga e correio`);
    lines.push(muted("ANAC, Dados Estatísticos do Transporte Aéreo: embarques e desembarques."));
    return lines.join("<br>");
  },
  fort(f, m) {
    const comp = m.data.military?.components?.find((c) => c.id === f.component);
    const name = comp?.name || FORT_KINDS[fortKind(f.component)]?.name || "Defense site";
    const tier = { major: "Major installation", base: "Base", site: "Site" }[f.tier] || "";
    const status = { act: "", semi: " · semi-active", care: " · caretaker status" }[f.status] ?? "";
    const lines = [
      `<b>${esc(f.name)}</b> ${muted(esc(f.state || ""))}`,
      `${esc(name)}${f.joint ? " · joint base" : ""} · ${esc(tier)}${esc(status)}`,
    ];
    if (f.area_km2 != null) lines.push(`Boundary ${int(f.area_km2)} km²`);
    lines.push(muted("DoD MIRTA. Sized by boundary area: no per-base headcount is published."));
    return lines.join("<br>");
  },
  range(r, m) {
    const comp = m.data.military?.components?.find((c) => c.id === r.component);
    return [
      `<b>${esc(r.name)}</b> ${muted(esc(r.state || ""))}`,
      `Restricted ground · ${esc(comp?.name || "")} · ${int(r.area_km2)} km²`,
      muted("One of the 30 largest DoD boundaries (MIRTA), drawn on the hexes it covers."),
    ].join("<br>");
  },
  wonder(x, m) {
    const k = WONDER_KINDS[x.kind]?.name || "Wonder";
    const rule = m.data.wonders?.rules?.find((r) => r.id === x.rule);
    const mt = x.metrics || {};
    const lines = [`<b>${esc(x.name)}</b> ${muted(esc([x.state].filter(Boolean).join("")))}`];
    if (x.kind === "university") {
      lines.push(`${esc(k)} · #${esc(x.rank)} by research spending`);
      if (mt.rd_usd != null) lines.push(`R&amp;D ${usd(mt.rd_usd)} (FY${esc(mt.year)})${mt.federal_usd != null ? `, ${pct(mt.federal_usd / mt.rd_usd, 0)} federal` : ""}`);
      if (mt.enrollment != null) lines.push(`${int(mt.enrollment)} students (12-month headcount, ${esc(mt.enrollment_year)})`);
    } else if (x.curated) {
      lines.push(`${esc(k)} · hand-picked (curated, not ranked by data)`);
      if (mt.visits != null) lines.push(`${num(mt.visits)} recreation visits (${esc(mt.year)})`);
      if (mt.designated) lines.push(`National Historic Landmark since ${esc(mt.designated)}`);
    } else {
      lines.push(`${esc(k)} · #${esc(x.rank)} by visits${mt.unit_type ? ` among ${esc(mt.unit_type === "National Park" ? "National Parks" : "other park units")}` : ""}`);
      if (mt.visits != null) lines.push(`<b>${num(mt.visits)}</b> recreation visits (${esc(mt.year)})${mt.visits_of ? ` ${muted(`(${esc(mt.visits_of)})`)}` : ""}`);
      if (mt.area_km2 != null) lines.push(`${int(mt.area_km2)} km²`);
    }
    if (rule?.text) lines.push(muted(esc(rule.text)));
    return lines.join("<br>");
  },
  route(rt, m) {
    const r = rt.route;
    const t = m.data.trade || {};
    const a = rt.a?.short || rt.a?.name || r.a, b = rt.b?.short || rt.b?.name || r.b;
    return [
      `<b>${esc(a)} ⇄ ${esc(b)}</b> ${muted(`rota aérea ${esc(r.rank)}ª`)}`,
      `<b>${num(r.pax)}</b> passageiros em ${esc(t.year ?? "")}, nos dois sentidos · ${int(r.dist_km)} km`,
      muted(esc(t.path_note || "")),
    ].join("<br>");
  },
};
