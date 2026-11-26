// City View "Districts": the metro's real industry specialisation (districts.json, BLS QCEW) as strategy-game
// districts, plus the Encampment tier from military.json (installations + armed-forces residents).
//
//   cityDistricts(ddata, mil, id) → [district]   the metro's districts, strongest first, each with what the dock and
//                                                the map plaques need ({id, name, short, color, icon, lq, emp, …})
//   badgeOf(ddata, id) → {label, text, color, icon, district} | null | undefined   the city-type badge
//   districtsHtml(m, ddata, mil) → HTML          the section body
//   badgeHtml(m, ddata) → HTML                   the header badge
import { esc, int, pct } from "../../format.js";
import { compact, money } from "./fmt.js";
import { icon } from "../../ui/icon.js";
import { hasIcon } from "../../icons.js";
import { tr, DEC } from "../../i18n.js";

// Icons the district catalog names (d-*) are not drawn yet; until they are, a near icon from the set stands in,
// and canvas plaques without any icon get the letter in `mark`.
const FALLBACK = {
  campus: ["y-science", "🎓"], commercial_hub: ["i-finance", "💰"], industrial_zone: ["i-manufacturing", "🏭"],
  harbor: ["i-transportation", "⚓"], theater_square: ["i-arts", "🎭"], entertainment_complex: ["i-accommodation", "🎡"],
  aerodrome: ["i-transportation", "✈️"], government_plaza: ["i-public_admin", "🏛"], encampment: [null, "⛺"],
  aqueduct: ["i-utilities", "💧"],
};
const SHORT = {
  campus: "Campus", commercial_hub: tr("Finanças"), industrial_zone: tr("Indústria"), harbor: tr("Porto"), theater_square: tr("Artes"),
  entertainment_complex: tr("Lazer"), aerodrome: tr("Aeródromo"), government_plaza: tr("Governo"), encampment: tr("Quartel"), agro: tr("Agro"),
  aqueduct: tr("Usina"),
};
const TIER = { garrison: "Garrison", fortress: "Fortress" };

const catCache = new WeakMap();
function catalog(ddata) {
  let m = catCache.get(ddata);
  if (!m) catCache.set(ddata, (m = new Map((ddata?.catalog || []).map((c) => [c.id, c]))));
  return m;
}

export function iconFor(id, cat) {
  if (cat?.icon && hasIcon(cat.icon)) return cat.icon;
  const f = FALLBACK[id]?.[0];
  return f && hasIcon(f) ? f : null;
}

const instCache = new WeakMap();
function installationsById(mil) {
  let m = instCache.get(mil);
  if (!m) instCache.set(mil, (m = new Map((mil?.installations || []).map((i) => [i.id, i]))));
  return m;
}

/**
 * The metro's districts: districts.json entries (strongest first), with military.json's Encampment merged in (its
 * tier label; added at the end when only military.json has one).
 */
export function cityDistricts(ddata, mil, id) {
  const cat = catalog(ddata);
  const row = ddata?.cities?.[id] || null;
  const mc = mil?.cities?.[id] || null;
  const out = [];
  for (const d of row?.districts || []) {
    const c = cat.get(d.id) || {};
    const spec = d.via === "specialty" && d.sub;
    out.push({
      ...d, name: c.name || d.id, color: c.color || "#5a6a7a", icon: iconFor(d.id, c), emoji: FALLBACK[d.id]?.[1] || "◆",
      cat: c, subName: d.sub ? c.sub?.[d.sub] || ddata.industries?.[d.sub]?.title || d.sub : null,
      // The map plaque: a speciality-qualified district is labelled by that speciality (its own LQ is the reason).
      short: spec ? c.sub?.[d.sub] || SHORT[d.id] : SHORT[d.id] || c.name || d.id,
      mapLq: spec ? d.sub_lq : d.lq,
      military: d.id === "encampment" ? mc : null,
    });
  }
  if (mc && !out.some((d) => d.id === "encampment")) {
    const c = cat.get("encampment") || {};
    out.push({
      id: "encampment", name: c.name || "Encampment", color: c.color || "#8a4a3a", icon: iconFor("encampment", c), emoji: "⛺",
      cat: c, lq: null, emp: null, short: TIER[mc.tier] || "Encampment", mapLq: null, military: mc, militaryOnly: true,
    });
  }
  for (const d of out) {
    if (d.military) d.tierLabel = TIER[d.military.tier] || d.military.tier;
  }
  return out;
}

/** The city-type badge; undefined while districts.json is loading, null when there is none. */
export function badgeOf(ddata, id) {
  if (!ddata) return ddata; // undefined (loading) or null (missing)
  const row = ddata.cities?.[id];
  if (!row) return null;
  if (!row.badge) return { label: tr("Diversificada"), text: tr("Nenhum distrito passa pela regra: nenhuma atividade se destaca."), color: "#6a7484", icon: null, district: null };
  const c = catalog(ddata).get(row.badge.district) || {};
  return { ...row.badge, color: c.color || "#6a7484", icon: iconFor(row.badge.district, c), emoji: FALLBACK[row.badge.district]?.[1] };
}

export function badgeHtml(m, ddata) {
  const b = badgeOf(ddata, m.city.id);
  if (!b) return "";
  return `<span class="cv-type${b.district ? "" : " plain"}" style="--tc:${esc(b.color)}" title="${tr("Tipo de cidade: {0} (IBGE CEMPRE {1})", esc(b.text || b.label), esc(String(ddata.year || "")))}">
    <span class="cv-type-ic">${icon(b.icon, b.emoji || "◆", { size: 13 })}</span>${esc(b.label)}</span>`;
}

const ge = (lb) => (lb ? "≥" : "");
const signed = (x) => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`);

function lqTag(lq, lb, tip) {
  if (lq == null) return "";
  const cls = lq >= 1.25 ? "hi" : lq <= 0.75 ? "lo" : "mid";
  return `<span class="cv-lq ${cls}" title="${esc(tip || tr("Quociente locacional: {0}× a parcela nacional dos empregos", lq.toFixed(2).replace(".", DEC)))}">×${ge(lb)}${lq.toFixed(1).replace(".", DEC)}</span>`;
}

function districtCard(d, row, ddata, mil) {
  const nat = ddata?.national || {};
  const c = d.cat || {};
  const lb = !!d.lower_bound;
  const supTip = lb ? tr(" O IBGE suprimiu parte disto em {0} {1}, então é um piso.", d.suppressed, d.suppressed === 1 ? tr("município") : tr("municípios")) : "";
  const facts = [];
  if (d.emp != null) {
    facts.push(`<div><span>${tr("Empregos")}</span><b>${ge(lb)}${compact(d.emp)}</b><small>${d.share != null ? tr("{0} da cidade", pct(d.share, 1)) : ""}</small></div>`);
  }
  if (d.avg_pay != null) {
    facts.push(tr("<div><span>Salário médio</span><b>{0}</b><small>{1}</small></div>", money(d.avg_pay), row?.avg_pay != null ? tr("cidade {0}", money(row.avg_pay)) : ""));
  }
  if (d.strength != null) {
    facts.push(tr("<div title=\"Empregos acima da norma nacional: empregos − empregos ÷ QL (é como os distritos se ordenam)\"><span>Acima da norma</span><b>{0}{1}</b><small>empregos</small></div>", ge(lb), compact(Math.max(0, d.strength))));
  }
  let spec = "";
  if (d.sub && d.subName) {
    // the speciality's own withheld flag (districts.json sub_lower_bound; older files: the top-industries row)
    const slb = d.sub_lower_bound ?? !!(row?.top || []).find((t) => t.naics === d.sub)?.lower_bound;
    spec = `<p class="cv-dc-sub">${d.via === "specialty" ? tr("Entra pela especialidade") : tr("Especialidade mais forte")}: <b>${esc(d.subName)}</b> ${lqTag(d.sub_lq, slb, slb ? tr("Quociente locacional: pelo menos {0}× a parcela nacional (o IBGE suprimiu parte, então é um piso)", d.sub_lq.toFixed(2).replace(".", DEC)) : undefined)}${
      d.sub_emp != null ? ` <small>${tr("{0}{1} empregos", ge(slb), compact(d.sub_emp))}</small>` : ""}${
      d.via === "specialty" && d.lq != null ? tr("<br><small>As atividades do distrito, somadas, são {0}× a parcela nacional; só esta especialidade passa pela regra.</small>", d.lq.toFixed(2).replace(".", DEC)) : ""}</p>`;
  }
  let milHtml = "";
  if (d.military) {
    const mc = d.military;
    const inst = installationsById(mil);
    const names = (mc.installations || []).map((i) => inst.get(i)?.name).filter(Boolean);
    milHtml = `<div class="cv-dc-mil">
      <p><b>${esc(d.tierLabel)}</b>${tr("{0}: {1} residents in the armed forces, {2} of people 16 and over.", mc.naval ? " (naval)" : "", int(mc.armed_forces), pct(mc.share, mc.share < 0.01 ? 2 : 1))}</p>
      ${names.length ? `<p class="cv-dc-inst">${names.slice(0, 5).map((n) => `<span>${esc(n)}</span>`).join("")}${
        mc.installation_count > Math.min(5, names.length) ? `<small>${tr("+{0} more", mc.installation_count - Math.min(5, names.length))}</small>` : ""}</p>` : ""}
    </div>`;
  }
  const caveat = c.caveat ? `<p class="cv-dc-cav">${esc(c.caveat)}</p>` : "";
  const title = d.militaryOnly ? `${esc(d.name)} · ${esc(d.tierLabel)}` : d.military ? `${esc(d.name)} · ${esc(d.tierLabel)}` : esc(d.name);
  return `<div class="cv-dc" style="--dc:${esc(d.color)}" title="${esc(c.description || "")}${esc(supTip)}">
    <div class="cv-dc-h"><span class="cv-dc-hex">${icon(d.icon, d.emoji, { size: 18 })}</span>
      <div class="cv-dc-t"><b>${title}</b><small>${esc(c.description || "")}</small></div>
      ${d.lq != null ? lqTag(d.lq, lb, tr("Quociente locacional: a parcela dos empregos da cidade nestas atividades é {0}× a parcela nacional.{1}", d.lq.toFixed(2).replace(".", DEC), supTip)) : ""}</div>
    ${facts.length ? `<div class="cv-dc-f">${facts.join("")}</div>` : ""}
    ${spec}${milHtml}${caveat}
  </div>`;
}

function topTable(row, ddata) {
  const top = row?.top || [];
  if (!top.length) return "";
  const max = Math.max(...top.map((t) => t.lq || 0), 1);
  return tr("<h4 class=\"cv-h4\">Atividades mais especializadas <span class=\"muted\">pelo quociente locacional</span></h4>\n  <div class=\"cv-top\" role=\"table\" aria-label=\"Atividades mais especializadas\">\n    <div class=\"cv-top-r cv-top-hd\" role=\"row\"><span role=\"columnheader\">Atividade</span><span role=\"columnheader\">Empregos</span><span role=\"columnheader\">×BR</span><span role=\"columnheader\">Salário</span><span role=\"columnheader\">1 ano</span></div>\n    {0}\n  </div>", top.map((t) => {
      const title = ddata.industries?.[t.naics]?.title || `NAICS ${t.naics}`;
      const lb = !!t.lower_bound;
      return `<div class="cv-top-r" role="row" title="${tr("{0} (CNAE {1}){2}", esc(title), esc(t.naics), lb ? tr(". Piso: o IBGE suprimiu o valor em {0} {1}.", t.suppressed, t.suppressed === 1 ? tr("município") : tr("municípios")) : "")}">
        <span role="cell" class="cv-top-n">${esc(title)}<i style="width:${((Math.log(1 + (t.lq || 0)) / Math.log(1 + max)) * 100).toFixed(1)}%"></i></span>
        <span role="cell">${ge(lb)}${compact(t.emp)}</span>
        <span role="cell"><b>${t.lq != null ? `${ge(lb)}${t.lq.toFixed(1)}` : "–"}</b></span>
        <span role="cell">${money(t.avg_pay)}</span>
        <span role="cell" class="${t.oty_pct == null ? "" : t.oty_pct >= 0 ? "good" : "bad"}">${signed(t.oty_pct)}</span></div>`;
    }).join(""));
}

/** The Districts section body. ddata: districts.json (undefined while loading, null when missing). */
export function districtsHtml(m, ddata, mil) {
  if (ddata === undefined) return tr("<p class=\"muted cv-note\">Carregando os distritos…</p>");
  if (!ddata) return tr("<p class=\"muted cv-note\">Os distritos não estão disponíveis.</p>");
  const id = m.city.id;
  const row = ddata.cities?.[id] || null;
  const list = cityDistricts(ddata, mil, id);
  const b = badgeOf(ddata, id);
  let lead;
  if (!row) {
    lead = tr("<p class=\"cv-lead\">O IBGE não publica empregos para os municípios de {0}, então ela não tem distritos.</p>", esc(m.city.name));
  } else {
    const cnt = row.counties ? tr(" em {0} de {1} {2}", row.counties[0], row.counties[1], row.counties[1] === 1 ? tr("município") : tr("municípios")) : "";
    lead = `<p class="cv-lead">${tr("{0}{1} empregos formais contados{2}.", b?.district ? `<b class="cv-type-l" style="--tc:${esc(b.color)}">${esc(b.label)}</b> · ${esc(b.text || "")}. ` : "", 
      int(row.emp), esc(cnt))}</p>`;
  }
  const cards = list.length
    ? `<div class="cv-dcs">${list.map((d) => districtCard(d, row, ddata, mil)).join("")}</div>`
    : row ? tr("<p class=\"muted cv-note\">Nenhum distrito passa pela regra aqui: os empregos da cidade se distribuem como os do país.</p>") : "";
  const milRule = mil?.rule && list.some((d) => d.military) ? `<p><b>${tr("Encampment tier")}</b> ${tr("(military.json): {0}", esc(mil.rule))}</p>` : "";
  return tr("{0}\n    {1}\n    {2}\n    <div class=\"cv-schematic\">\n      <p><b>◆ No mapa</b>, cada distrito é uma placa num hexágono da cidade, perto dela. As posições são esquemáticas: mostram no que a cidade se especializa, não onde ficam os empregos.</p>\n    </div>\n    <details class=\"cv-more cv-rule\"><summary>Como os distritos são escolhidos</summary>\n      <p>{3}</p>{4}\n      <p>O Cadastro Central de Empresas conta os empregos onde fica a empresa, não onde o trabalhador mora; deixa de fora os autônomos, o trabalho informal e os militares.</p>\n    </details>\n    <p class=\"cv-note\">{5}, empregos formais assalariados. ×N = quociente locacional; ≥ = um piso (o IBGE suprimiu o valor de um município).{6}</p>", lead, cards, topTable(row, ddata), esc(ddata.rule?.text || ""), milRule, esc(ddata.vintage || tr("IBGE CEMPRE")), 
      mil && list.some((d) => d.military) ? ` Encampment tier: ${esc(typeof mil.vintage === "object" ? [mil.vintage.installations, mil.vintage.acs].filter(Boolean).join("; ") : mil.vintage || "")}.` : "");
}
