// City View "Cidadãos" rows: the city's people as rows of small figures (citizens.json, Censo 2022).
//
//   citizensHtml(m, data) → HTML      the rows (placeholders for the figure canvases)
//   mountCitizens(host, m, data)       paints the figures and wires the hover / focus read-out
//
// Each row: N figures (work 20, age 10, commute 10 from the file; schooling 10, rounded here with the same
// largest-remainder method), a caption ("cada boneco ≈ 72 mil ocupados"), a read-out line that a hovered or focused
// figure fills ("1 em cada 7 ocupados em São Paulo trabalha na indústria (Brasil: 1 em cada 6)"), and a thin bar
// with the Brazilian mix for comparison. A row the Census left out is said so, never drawn as zeros.
import { esc, int, pct } from "../../format.js";
import { compact } from "./fmt.js";
import { CATEGORY_COLOR, figureCanvas, loadPainter } from "./figures.js";
import { tr, DEC } from "../../i18n.js";

const ROWS = [
  { id: "workforce", title: tr("Trabalho"), sub: tr("pela atividade do trabalho principal, formal ou informal"), noun: [tr("ocupado"), tr("ocupados")], n: null },
  { id: "age", title: tr("Gerações"), sub: tr("por idade"), noun: ["morador", tr("moradores")], n: null },
  { id: "commute", title: tr("Deslocamento"), sub: tr("como vai quem trabalha fora de casa"), noun: [tr("trabalhador"), tr("trabalhadores")], n: null },
  { id: "education", title: tr("Instrução"), sub: tr("adultos de 25 anos ou mais"), noun: ["adulto", tr("adultos de 25 anos ou mais")], n: 10 },
];

// [singular, plural] verb phrase per category, for "1 em cada 7 ocupados em X trabalha …" / "3 em cada 10 … trabalham …".
const PHRASE = {
  workforce: {
    executive: [tr("trabalha na administração pública"), tr("trabalham na administração pública")],
    engineer: [tr("trabalha com informação, ciência ou serviços técnicos"), tr("trabalham com informação, ciência ou serviços técnicos")],
    scholar: [tr("trabalha na educação"), tr("trabalham na educação")],
    healer: [tr("trabalha na saúde ou em serviços sociais"), tr("trabalham na saúde ou em serviços sociais")],
    service: [tr("trabalha no comércio, na alimentação ou no lazer"), tr("trabalham no comércio, na alimentação ou no lazer")],
    clerk: [tr("trabalha em finanças, escritório ou outros serviços"), tr("trabalham em finanças, escritório ou outros serviços")],
    farmer: [tr("trabalha na agropecuária"), tr("trabalham na agropecuária")],
    builder: [tr("trabalha na construção"), tr("trabalham na construção")],
    maker: [tr("trabalha na indústria, energia ou transporte"), tr("trabalham na indústria, energia ou transporte")],
  },
  age: {
    child: [tr("é criança (até 14 anos)"), tr("são crianças (até 14 anos)")],
    young: [tr("é jovem (15 a 29 anos)"), tr("são jovens (15 a 29 anos)")],
    midlife: [tr("é adulto (30 a 59 anos)"), tr("são adultos (30 a 59 anos)")],
    elder: [tr("tem 60 anos ou mais"), tr("têm 60 anos ou mais")],
  },
  commute: {
    drove_alone: [tr("vai de carro ou táxi"), tr("vão de carro ou táxi")],
    carpool: [tr("vai de van"), tr("vão de van")],
    transit: [tr("vai de ônibus, trem, metrô ou barco"), tr("vão de ônibus, trem, metrô ou barco")],
    walk: [tr("vai a pé ou de bicicleta"), tr("vão a pé ou de bicicleta")],
    other: [tr("vai de moto ou de outro jeito"), tr("vão de moto ou de outro jeito")],
  },
  education: {
    less_than_hs: [tr("não completou o fundamental"), tr("não completaram o fundamental")],
    high_school: [tr("completou o fundamental, mas não o médio"), tr("completaram o fundamental, mas não o médio")],
    some_college: [tr("completou o médio, mas não o superior"), tr("completaram o médio, mas não o superior")],
    bachelors: [tr("tem superior completo"), tr("têm superior completo")],
  },
};

// Short legend labels (the file's labels are long).
const SHORT = {
  workforce: { executive: tr("Governo"), engineer: tr("Ciência e TI"), scholar: tr("Educação"), healer: tr("Saúde"), service: tr("Comércio"),
    clerk: tr("Escritório"), farmer: tr("Agro"), builder: tr("Construção"), maker: tr("Indústria") },
  age: { child: "0–14", young: "15–29", midlife: "30–59", elder: "60+" },
  commute: { drove_alone: tr("Carro"), carpool: "Van", transit: tr("Coletivo"), walk: tr("A pé"), other: tr("Moto e outros") },
  education: { less_than_hs: tr("Fundamental incompleto"), high_school: tr("Fundamental"), some_college: tr("Médio"), bachelors: tr("Superior") },
};

/** Largest-remainder rounding of counts into n figures (the pipeline's method, for rows without figures). */
export function largestRemainder(counts, keys, n) {
  const tot = keys.reduce((a, k) => a + (counts[k] || 0), 0);
  if (!(tot > 0)) return null;
  const raw = keys.map((k) => ((counts[k] || 0) / tot) * n);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, v) => a + v, 0);
  const order = raw.map((v, j) => [v - Math.floor(v), j]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < left; k++) out[order[k][1]]++;
  return Object.fromEntries(keys.map((k, j) => [k, out[j]]));
}

/** "1 em cada 7", "3 em cada 10", "menos de 1 em cada 1.000". */
export function oneIn(share) {
  if (share == null || !Number.isFinite(share)) return null;
  if (share <= 0) return { text: tr("nenhum"), plural: false };
  if (share < 0.001) return { text: tr("menos de 1 em cada 1.000"), plural: false };
  if (share >= 0.3) {
    const k = Math.round(share * 10);
    return k >= 10 ? { text: tr("quase todos"), plural: true } : { text: tr("{0} em cada 10", k), plural: k !== 1 };
  }
  const n = Math.round(1 / share);
  return { text: tr("1 em cada {0}", int(n)), plural: false };
}

function sentence(rowId, key, share, natShare, cityName, noun) {
  const a = oneIn(share);
  if (!a) return "";
  const ph = PHRASE[rowId]?.[key] || [tr("está neste grupo"), tr("estão neste grupo")];
  const br = oneIn(natShare);
  const lead = a.text.charAt(0).toUpperCase() + a.text.slice(1);
  return tr("{0} {1} em {2} {3}{4}", lead, noun[1], cityName, a.plural ? ph[1] : ph[0], br ? tr(" (Brasil: {0})", br.text) : "");
}

function rowModel(rowDef, row, nat, groups, figuresN) {
  const keys = (groups[rowDef.id] || []).map((g) => g.key);
  const n = figuresN[rowDef.id] ?? rowDef.n ?? 10;
  const figs = row.figures || largestRemainder(row.counts || {}, keys, n);
  const natFigs = nat?.figures || (nat ? largestRemainder(nat.counts || {}, keys, n) : null);
  return { keys, n, figs, natFigs };
}

// Specialists by row/key from the file (ratios from unrounded shares).
function specMap(city) {
  const m = new Map();
  for (const s of city?.specialists || []) m.set(`${s.row}|${s.key}`, s);
  return m;
}

const dec1 = (v) => v.toFixed(1).replace(".", DEC);

/** The Cidadãos rows. data = citizens.json (or null / undefined while loading). */
export function citizensHtml(m, data) {
  const c = m.city;
  if (data === undefined) return tr("<p class=\"muted cv-note\">Carregando os cidadãos…</p>");
  if (!data || !data.cities) return tr("<p class=\"muted cv-note\">Os cidadãos não estão disponíveis nesta versão dos dados.</p>");
  const row0 = data.cities[c.id];
  if (!row0) {
    return tr("<p class=\"muted cv-note\">O Censo 2022 não traz as tabelas dos cidadãos para {0}, então não há bonecos aqui.</p>", esc(c.name));
  }
  const nat = data.national || {};
  const groups = data.groups || {};
  const specs = specMap(row0);
  const label = Object.fromEntries(Object.entries(groups).map(([r, gs]) => [r, Object.fromEntries(gs.map((g) => [g.key, g.label]))]));

  // Headline: degrees, elders, and the "great person" call-out (the strongest specialist).
  const ba = row0.education?.bachelors_plus, brBa = nat.education?.bachelors_plus;
  const el = row0.age?.shares?.elder, brEl = nat.age?.shares?.elder;
  const chip = (v, br, fmt, lbl, tip) => (v == null ? "" : `<div class="cv-cz-chip" title="${esc(tip)}"><b>${fmt(v)}</b><span>${esc(lbl)}</span>${br != null ? `<small>${tr("Brasil {0}", fmt(br))}</small>` : ""}</div>`);
  const top = (row0.specialists || []).find((s) => s.ratio >= (data.rule?.specialist_high ?? 1.5));
  const topRow = ROWS.find((r) => r.id === top?.row);
  const great = top && topRow ? tr("<div class=\"cv-great\" style=\"--fc:{0}\">\n      <span class=\"cv-great-fig\" data-great=\"{1}|{2}\" aria-hidden=\"true\"></span>\n      <div><small>Cidadãos em destaque</small><b>{3}</b>\n      <span>{4} dos {5} daqui, {6} no Brasil: {7}× a parcela nacional.</span></div></div>", esc(CATEGORY_COLOR[top.row]?.[top.key] || "#c9a45c"), esc(top.row), esc(top.key), esc(label[top.row]?.[top.key] || top.key), pct(top.share, 1), esc(topRow.noun[1]), pct(top.national, 1), dec1(top.ratio)) : "";

  const rows = ROWS.map((rd) => {
    const row = row0[rd.id];
    const head = `<div class="cv-cz-h"><b>${esc(rd.title)}</b><span>${esc(rd.sub)}</span></div>`;
    if (!row) {
      return tr("<div class=\"cv-cz-row missing\" data-row=\"{0}\">{1}\n        <p class=\"muted cv-note\">O Censo 2022 não traz esta tabela para {2}, então a linha fica de fora.</p></div>", rd.id, head, esc(c.name));
    }
    const { keys, n, figs } = rowModel(rd, row, nat[rd.id], groups, data.figures || {});
    if (!figs) return tr("<div class=\"cv-cz-row missing\" data-row=\"{0}\">{1}<p class=\"muted cv-note\">Sem contagens nesta linha.</p></div>", rd.id, head);
    const per = row.total / n;
    const cells = [];
    for (const k of keys) {
      for (let j = 0; j < (figs[k] || 0); j++) {
        const sp = specs.get(`${rd.id}|${k}`);
        const mark = sp ? (sp.ratio >= 1 ? "up" : "down") : "";
        // One tab stop per category (its first figure), not one per figure.
        cells.push(`<span class="cv-fig${mark ? ` ${mark}` : ""}" tabindex="${j ? -1 : 0}" role="img" data-k="${esc(k)}" aria-label="${esc(label[rd.id]?.[k] || k)}"></span>`);
      }
    }
    // Legend: every category, with its share, the Brazilian share and a chevron for specialists. Categories that
    // round to no figure are still listed (greyed), so nothing silently disappears.
    const legend = keys.map((k) => {
      const sh = row.shares?.[k], br = nat[rd.id]?.shares?.[k];
      const sp = specs.get(`${rd.id}|${k}`);
      const chev = sp ? `<em class="${sp.ratio >= 1 ? "up" : "down"}" title="${tr("{0}× a parcela do Brasil", dec1(sp.ratio))}">${sp.ratio >= 1 ? "▲" : "▼"}</em>` : "";
      return `<span class="cv-cz-k${figs[k] ? "" : " zero"}" data-k="${esc(k)}" title="${esc(label[rd.id]?.[k] || k)}: ${sh != null ? pct(sh, 1) : "–"}${br != null ? tr(" (Brasil {0})", pct(br, 1)) : ""}${figs[k] ? "" : tr(". Não chega a um boneco.")}"><i style="background:${esc(CATEGORY_COLOR[rd.id]?.[k] || "#888")}"></i>${esc(SHORT[rd.id]?.[k] || k)} <small>${sh != null ? pct(sh, 0) : "–"}</small>${chev}</span>`;
    }).join("");
    // Brazilian comparison bar (shares), aligned with the figures' order.
    const brBar = nat[rd.id]?.shares ? `<div class="cv-cz-us" title="${tr("A mistura do Brasil, na mesma ordem")}"><span>BR</span><div>${keys.map((k) => {
      const s = nat[rd.id].shares[k] || 0;
      return s > 0 ? `<i style="flex:${s};background:${esc(CATEGORY_COLOR[rd.id]?.[k] || "#888")}" title="${tr("{0}: {1} no Brasil", esc(SHORT[rd.id]?.[k] || k), pct(s, 1))}"></i>` : "";
    }).join("")}</div></div>` : "";
    const cap = tr("Cada boneco ≈ {0} {1} · {2} ao todo{3}", compact(per), rd.noun[1], compact(row.total), rd.n && !row.figures ? tr(" · arredondado aqui") : "");
    return `<div class="cv-cz-row" data-row="${rd.id}" style="--n:${n}">${head}
      <div class="cv-figs" role="group" aria-label="${esc(rd.title)}: ${keys.filter((k) => figs[k]).map((k) => tr("{0} de {1} {2}", figs[k], n, SHORT[rd.id]?.[k] || k)).join(", ")}">${cells.join("")}</div>
      ${brBar}
      <div class="cv-cz-out" aria-live="polite" data-default="${esc(cap)}">${esc(cap)}</div>
      <div class="cv-cz-legend">${legend}</div>
    </div>`;
  }).join("");

  return tr("\n    <div class=\"cv-cz-top\">\n      {0}\n      {1}\n    </div>\n    {2}\n    <div class=\"cv-cz\">{3}</div>\n    <p class=\"cv-note\">{4}, tabelas 10262, 9514, 10332 e 10061. Os bonecos são arredondados (maior resto) para cada linha fechar; passe o mouse ou toque num boneco para ver a parcela. ▲▼ = pelo menos 1,5 vez ou no máximo 0,67 vez a parcela do Brasil. O trabalho conta formais e informais, onde moram; o deslocamento conta só quem trabalha fora de casa.</p>", chip(ba, brBa, (v) => pct(v, 0), tr("com superior completo"), tr("Adultos de 25 anos ou mais com superior completo (Censo 2022, tabela 10061)")), chip(el, brEl, (v) => pct(v, 0), tr("com 60 anos ou mais"), tr("Moradores de 60 anos ou mais (Censo 2022, tabela 9514)")), great, rows, esc(data.vintage || tr("Censo 2022")));
}

/** Paint the figure canvases and wire the read-outs. */
export function mountCitizens(host, m, data) {
  if (!host || !data?.cities?.[m.city.id]) return;
  const row0 = data.cities[m.city.id];
  const nat = data.national || {};
  const dpr = Math.min(3, Math.max(1, Math.round((devicePixelRatio || 1) * 2) / 2));
  const paintAll = () => {
    host.querySelectorAll(".cv-cz-row[data-row]").forEach((rowEl) => {
      const rid = rowEl.dataset.row;
      rowEl.querySelectorAll(".cv-fig").forEach((el) => {
        const src = figureCanvas(rid, el.dataset.k, 36, dpr);
        const cv = document.createElement("canvas");
        cv.width = src.width;
        cv.height = src.height;
        cv.getContext("2d").drawImage(src, 0, 0);
        el.replaceChildren(cv);
      });
    });
    const g = host.querySelector("[data-great]");
    if (g) {
      const [rid, k] = g.dataset.great.split("|");
      const src = figureCanvas(rid, k, 36, dpr);
      const cv = document.createElement("canvas");
      cv.width = src.width;
      cv.height = src.height;
      cv.getContext("2d").drawImage(src, 0, 0);
      g.replaceChildren(cv);
    }
  };
  paintAll();
  // Once the citizen painter (render/art/people.js) loads, repaint the figures.
  loadPainter().then(() => { if (host.isConnected) paintAll(); });

  host.querySelectorAll(".cv-cz-row[data-row]").forEach((rowEl) => {
    const rid = rowEl.dataset.row;
    const rd = ROWS.find((r) => r.id === rid);
    const row = row0[rid];
    const out = rowEl.querySelector(".cv-cz-out");
    if (!row || !out) return;
    const show = (k) => {
      rowEl.querySelectorAll("[data-k]").forEach((el) => el.classList.toggle("lit", el.dataset.k === k));
      rowEl.classList.toggle("focus", !!k);
      if (!k) {
        out.textContent = out.dataset.default;
        out.classList.remove("on");
        return;
      }
      const sh = row.shares?.[k], us = nat[rid]?.shares?.[k];
      out.innerHTML = `${esc(sentence(rid, k, sh, us, m.city.name, rd.noun))}<small>${tr("{0} aqui{1}{2}", sh != null ? pct(sh, 1) : "–", us != null ? tr(" · {0} no Brasil", pct(us, 1)) : "", row.counts?.[k] != null ? tr(" · ≈{0} pessoas", compact(row.counts[k])) : "")}</small>`;
      out.classList.add("on");
    };
    let pinned = null;
    rowEl.addEventListener("pointerover", (e) => {
      const el = e.target.closest("[data-k]");
      if (el && rowEl.contains(el)) show(el.dataset.k);
    });
    rowEl.addEventListener("pointerleave", () => show(pinned));
    rowEl.addEventListener("focusin", (e) => {
      const el = e.target.closest("[data-k]");
      if (el) show(el.dataset.k);
    });
    rowEl.addEventListener("focusout", () => show(pinned));
    // A tap pins the category (phones have no hover); another tap on it lets go.
    rowEl.addEventListener("click", (e) => {
      const el = e.target.closest("[data-k]");
      if (!el) return;
      pinned = pinned === el.dataset.k ? null : el.dataset.k;
      show(pinned);
    });
  });
}
