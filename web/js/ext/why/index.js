// "Por quê?": a section at the end of the city and state panels that takes each headline number apart into what
// makes it up, from the data the map already has (history.json, districts.json, the GDP sectors):
//
//   population → the member municipalities and every Census since 1970
//   GDP        → the sectors (value added) and the municipalities, and its real change since 2002
//   growth     → which municipalities added or lost people between the two estimates
//   city type  → the activities whose share of formal jobs is far above Brazil's
//   each timeline series theme (series_<id>.json) → its measures in the first and the last year, against Brazil
//   exports    → the buyers and the products (exports.json), against Brazil
//   protected  → how much is indigenous land or a conservation unit, and the biggest areas (protected.json)
// Each answer names its source; a number the data cannot take apart says so instead of guessing.
import { esc, int, money, pct, dec } from "../../format.js";

const CSS = `
.why details { border-top: 1px solid var(--line, rgba(201,164,92,.2)); padding: 6px 0; }
.why summary { cursor: pointer; font-size: 12.5px; color: var(--gold-bright, #f3dc9c); list-style: none; }
.why summary::-webkit-details-marker { display: none; }
.why summary::before { content: "+"; display: inline-block; width: 14px; color: var(--gold, #c9a45c); }
.why details[open] summary::before { content: "–"; }
.why p { margin: 6px 0 4px; font-size: 12px; line-height: 1.45; color: var(--ink-dim, #b9ab8a); }
.why p b { color: var(--ink, #efe3c4); font-weight: 600; }
.why table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0; }
.why td { padding: 2px 0; color: var(--ink, #efe3c4); font-variant-numeric: tabular-nums; }
.why td.n { text-align: right; white-space: nowrap; padding-left: 8px; }
.why td.m { color: var(--ink-dim, #b9ab8a); }
.why .bar { display: block; height: 4px; margin-top: 2px; border-radius: 2px; background: var(--gold, #c9a45c); opacity: .75; }
.why .neg { color: #e08a6a; } .why .pos { color: #8fcbb8; }
.why .src { font-size: 11px; color: var(--ink-dim, #b9ab8a); opacity: .85; }
`;

const signed = (g, d = 1) => (Number.isFinite(g) ? `${g >= 0 ? "+" : "−"}${dec(Math.abs(g * 100), d)}%` : "–");
const rate = (a, b, years) => (a > 0 && b > 0 ? (b / a) ** (1 / years) - 1 : null);
const people = (v) => (v == null ? "–" : v >= 1e6 ? `${dec(v / 1e6, v >= 1e7 ? 1 : 2)} mi` : v >= 1e4 ? `${int(v / 1e3)} mil` : int(v));

export function install(app) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  let files = null;
  const load = () => (files ??= Promise.all([app.loadData("history"), app.loadData("districts")]).then(([history, districts]) => ({ history, districts })));
  const nation = app.data.nation;
  const n = nation.nation || {};

  const prevCity = app.panels.city, prevState = app.panels.state;
  app.panels.city = (city, ctx) => {
    prevCity(city, ctx);
    attach({ kind: "city", city });
  };
  app.panels.state = (idx, ctx) => {
    prevState(idx, ctx);
    const st = app.data.states?.[idx];
    if (st) attach({ kind: "state", st });
  };

  function attach(target) {
    const panel = document.getElementById("city-panel");
    if (!panel || panel.hidden || panel.querySelector(".why")) return;
    const sec = document.createElement("section");
    sec.className = "cp-section why";
    sec.innerHTML = `<h3>Por quê?</h3><p class="src">Abra uma pergunta para ver de onde vem cada número.</p>`;
    const foot = panel.querySelector(".cp-foot");
    panel.insertBefore(sec, foot);
    const add = (q) => {
      const d = document.createElement("details");
      d.innerHTML = `<summary>${q.title}</summary><div class="why-a"><p class="src">Lendo os dados…</p></div>`;
      d.addEventListener("toggle", async () => {
        if (!d.open || d.dataset.done) return;
        d.dataset.done = "1";
        let html;
        try {
          html = q.answer(q.series ? await app.timeline.series(q.series) : q.series === null ? null : await load());
        } catch (err) {
          console.error("why:", err);
          html = `<p>Não consegui montar esta resposta (${esc(err.message || err)}).</p>`;
        }
        d.querySelector(".why-a").innerHTML = html;
      });
      sec.appendChild(d);
    };
    questions(target).forEach(add);
    app.loadData("exports").then((x) => {
      const b = x && (target.kind === "city" ? x.cities[target.city.id] : x.states[target.st.abbr]);
      if (b && sec.isConnected) add({ title: `Para onde vai o que ${target.kind === "city" ? "a cidade" : "o estado"} exporta?`, series: null, answer: () => whyExports(target, x, b) });
    }).catch(() => {});
    app.loadData("protected").then((x) => {
      if (x && sec.isConnected) add({ title: `Quanto ${target.kind === "city" ? "da cidade" : "do estado"} é área protegida?`, series: null, answer: () => whyProtected(target, x) });
    }).catch(() => {});
    // One question per timeline series theme, once its file is in (it loads in the background, a few hundred kB).
    for (const th of app.timeline?.themes || []) {
      if (!th.file) continue;
      app.timeline.series(th.id).then((d) => {
        if (d?.question && sec.isConnected) add({ title: d.question.replace("{first}", d.compare_from || d.years[0]), series: th.id, answer: (f) => whySeries(target, f) });
      }).catch(() => {});
    }
  }

  function questions(t) {
    const o = t.kind === "city" ? t.city : t.st;
    const out = [];
    out.push({ title: `Por que ${people(o.population)} habitantes?`, answer: (f) => whyPopulation(t, f) });
    if (o.gdp != null) out.push({ title: `Por que um PIB de ${money(o.gdp)}?`, answer: (f) => whyGdp(t, f) });
    if (Number.isFinite(o.growth)) out.push({ title: `Por que ${signed(o.growth)} de ${o.growth_years?.[0]} a ${o.growth_years?.[1]}?`, answer: (f) => whyGrowth(t, f) });
    if (t.kind === "city") out.push({ title: "Por que este tipo de cidade?", answer: (f) => whyType(t, f) });
    return out;
  }

  // The municipalities behind a city or a state: [{code, name, uf, pop, gdp, e0, e1}].
  function members(t, h) {
    const codes = t.kind === "city" ? t.city.counties || [] : Object.keys(h.munis).filter((c) => c.slice(0, 2) === t.st.fips);
    return codes.map((code) => {
      const m = h.munis[code] || [];
      return { code, name: m[0] || code, uf: m[1], pop: m[2], gdp: m[3] == null ? null : m[3] * 1000, e0: m[4], e1: m[5] };
    });
  }
  const seriesOf = (t, h) => (t.kind === "city" ? h.cities[t.city.id] : h.states[t.st.abbr]);
  const nameOf = (t) => (t.kind === "city" ? t.city.name : t.st.name);

  function table(rows, total, { value, label, fmt }) {
    const max = Math.max(...rows.map(value), 1);
    return `<table>${rows.map((r) => `<tr><td>${esc(label(r))}<span class="bar" style="width:${(100 * value(r) / max).toFixed(1)}%"></span></td>
      <td class="n">${fmt(value(r))}</td><td class="n m">${total ? pct(value(r) / total, 0) : ""}</td></tr>`).join("")}</table>`;
  }

  function whyPopulation(t, { history: h }) {
    if (!h) return `<p>Os dados históricos não carregaram.</p>`;
    const o = t.kind === "city" ? t.city : t.st;
    const ms = members(t, h).filter((m) => m.pop != null).sort((a, b) => b.pop - a.pop);
    const sum = ms.reduce((a, m) => a + m.pop, 0);
    let html = "";
    if (t.kind === "city" && ms.length === 1) html += `<p><b>${esc(nameOf(t))}</b> é um município só: o número é a contagem do Censo 2022.</p>`;
    else {
      const top = ms.slice(0, 6), rest = ms.slice(6);
      html += `<p>É a soma de <b>${int(ms.length)} municípios</b> contados pelo Censo 2022${t.kind === "city" ? " (o arranjo populacional do IBGE)" : ""}:</p>`;
      html += table(top, sum, { value: (m) => m.pop, label: (m) => m.name, fmt: people });
      if (rest.length) html += `<p class="src">e mais ${int(rest.length)} municípios com ${people(rest.reduce((a, m) => a + m.pop, 0))} pessoas.</p>`;
      if (Math.abs(sum - o.population) > 1) html += `<p class="src">A soma dos municípios dá ${int(sum)}.</p>`;
    }
    const s = seriesOf(t, h)?.p || [];
    const ys = h.census_years;
    const pts = ys.map((y, i) => ({ y, v: s[i], g: i > 0 ? rate(s[i - 1], s[i], ys[i] - ys[i - 1]) : null })).filter((x) => x.v != null);
    if (pts.length > 1) {
      html += `<p>Como chegou aqui, Censo a Censo:</p><table>${pts.map((x, k) => `<tr><td>${x.y}</td><td class="n">${people(x.v)}</td><td class="n m">${k && Number.isFinite(x.g) ? `${signed(x.g)} ao ano` : ""}</td></tr>`).join("")}</table>`;
      const first = pts[0];
      html += `<p>De ${first.y} a 2022 a população ${o.population >= first.v ? `multiplicou-se por <b>${dec(o.population / first.v, 1)}</b>` : `caiu <b>${pct(1 - o.population / first.v, 0)}</b>`}; a do Brasil multiplicou-se por ${dec(h.nation.p.at(-1) / h.nation.p[ys.indexOf(first.y)], 1)}.</p>`;
    }
    return html + `<p class="src">${esc(h.rule)}</p>`;
  }

  function whyGdp(t, { history: h }) {
    const o = t.kind === "city" ? t.city : t.st;
    const sec = o.gdp_sectors;
    const label = nation.gdp_sectors || {};
    let html = "";
    if (sec) {
      const tot = Object.values(sec).reduce((a, v) => a + (v || 0), 0);
      const nsec = n.gdp_sectors || {}, ntot = Object.values(nsec).reduce((a, v) => a + (v || 0), 0);
      const rows = Object.keys(sec).sort((a, b) => sec[b] - sec[a]);
      html += `<p>De onde vem o PIB, por setor (valor adicionado de ${esc(nation.gdp_sectors_year || "")}, o ano mais recente com setores no IBGE):</p>
        <table>${rows.map((k) => {
          const s = sec[k] / tot, ns = ntot ? nsec[k] / ntot : null;
          const cls = ns && s > ns * 1.25 ? "pos" : "";
          return `<tr><td>${esc(label[k] || k)}<span class="bar" style="width:${(100 * s).toFixed(1)}%"></span></td><td class="n ${cls}">${pct(s, 0)}</td><td class="n m">Brasil ${pct(ns, 0)}</td></tr>`;
        }).join("")}</table>`;
      const lead = rows.filter((k) => k !== "taxes").map((k) => ({ k, r: (sec[k] / tot) / ((nsec[k] || 0) / ntot) })).sort((a, b) => b.r - a.r)[0];
      if (lead && lead.r > 1.25) html += `<p>O que mais pesa aqui acima do Brasil é <b>${esc(String(label[lead.k] || lead.k).toLowerCase())}</b>: ${dec(lead.r, 1)} vez a parcela do país.</p>`;
    }
    if (h) {
      const ms = members(t, h).filter((m) => m.gdp != null).sort((a, b) => b.gdp - a.gdp);
      const sum = ms.reduce((a, m) => a + m.gdp, 0);
      if (ms.length > 1) {
        html += `<p>Por município (PIB de 2023):</p>` + table(ms.slice(0, 5), sum, { value: (m) => m.gdp, label: (m) => m.name, fmt: money });
        if (ms.length > 5) html += `<p class="src">e mais ${int(ms.length - 5)} municípios com ${money(ms.slice(5).reduce((a, m) => a + m.gdp, 0))}.</p>`;
      }
      const g = seriesOf(t, h)?.g || [];
      const i0 = g.findIndex((v) => v != null);
      if (i0 >= 0 && g.at(-1) != null) {
        const y0 = h.gdp_years[i0], y1 = h.gdp_years.at(-1);
        const ch = g.at(-1) / g[i0] - 1, nch = h.nation.g.at(-1) / h.nation.g[i0] - 1;
        html += `<p>Descontada a inflação, o PIB ${ch >= 0 ? "cresceu" : "caiu"} <b>${pct(Math.abs(ch), 0)}</b> de ${y0} a ${y1} (Brasil ${signed(nch, 0)} no mesmo período).</p>`;
      }
    }
    if (o.population) html += `<p>Dividido pelos ${people(o.population)} habitantes dá <b>${money(o.gdp / o.population)}</b> por pessoa; no Brasil, ${money(n.gdp / n.population)}.</p>`;
    return html + `<p class="src">IBGE, PIB dos Municípios; a correção da inflação usa o deflator do PIB do Brasil (Contas Nacionais), o mesmo para todo município. O PIB conta onde a produção acontece: uma refinaria ou uma mina ergue o PIB de um município pequeno sem mudar a renda de quem mora lá.</p>`;
  }

  function whyGrowth(t, { history: h }) {
    if (!h) return `<p>Os dados históricos não carregaram.</p>`;
    const o = t.kind === "city" ? t.city : t.st;
    const [y0, y1] = h.estimate_years;
    const ms = members(t, h).filter((m) => m.e0 != null && m.e1 != null).map((m) => ({ ...m, d: m.e1 - m.e0 }));
    const base = ms.reduce((a, m) => a + m.e0, 0), delta = ms.reduce((a, m) => a + m.d, 0);
    let html = `<p>As estimativas do IBGE dão ${people(base)} pessoas em ${y0} e ${people(base + delta)} em ${y1}: <b>${delta >= 0 ? "+" : "−"}${int(Math.abs(delta))}</b> pessoas, ${signed(delta / base)}. No Brasil, ${signed(n.growth)}.</p>`;
    if (ms.length > 1) {
      const up = [...ms].sort((a, b) => b.d - a.d).filter((m) => m.d > 0).slice(0, 4);
      const down = [...ms].sort((a, b) => a.d - b.d).filter((m) => m.d < 0).slice(0, 3);
      const row = (m) => `<tr><td>${esc(m.name)}</td><td class="n ${m.d >= 0 ? "pos" : "neg"}">${m.d >= 0 ? "+" : "−"}${int(Math.abs(m.d))}</td><td class="n m">${signed(m.d / m.e0)}</td></tr>`;
      if (up.length) html += `<p>Os municípios que mais somaram gente:</p><table>${up.map(row).join("")}</table>`;
      if (down.length) html += `<p>Os que perderam:</p><table>${down.map(row).join("")}</table>`;
    }
    return html + `<p class="src">IBGE, Estimativas da População (1º de julho). As estimativas levam um ajuste de cobertura do Censo 2022, então ficam acima da contagem do Censo: o crescimento compara só estimativas entre si. Elas não separam nascimentos de migração.</p>`;
  }

  // A series theme: each measure in the first and the last year here and in Brazil, and, for a group of municipalities,
  // the ones that changed the most in the first measure.
  function whySeries(t, d) {
    if (!d) return `<p>A série não carregou.</p>`;
    const s = t.kind === "city" ? d.cities[t.city.id] : d.states[t.st.abbr];
    if (!s) return `<p>Sem dados para ${esc(nameOf(t))}.</p>`;
    const ys = d.years, y1 = ys.at(-1);
    const c0 = d.compare_from ? Math.max(0, ys.findIndex((y) => y >= d.compare_from)) : 0;
    const y0 = ys[c0];
    const fmt = (m, v) => (v == null ? "–" : m.format === "pct" ? pct(v, v < 0.1 ? 1 : 0) : dec(v, m.format === "int" ? 0 : 1));
    const diff = (m, a, b) => {
      if (a == null || b == null) return "";
      const x = m.format === "pct" ? (b - a) * 100 : b - a;
      return `<span class="${x >= 0 ? "pos" : "neg"}">${x >= 0 ? "+" : "−"}${dec(Math.abs(x), 1)}${m.format === "pct" ? " pt" : ""}</span>`;
    };
    const first = (arr) => arr.findIndex((v) => v != null);
    let html = `<p>${esc(nameOf(t))} em ${y0} e em ${y1}, ao lado do Brasil:</p><table><tr><td class="m"></td><td class="n m">${y0}</td><td class="n m">${y1}</td><td class="n m">mudança</td><td class="n m">Brasil ${y1}</td></tr>`;
    for (const m of d.metrics) {
      const v = s[m.id] || [], i0 = Math.max(first(v), c0);
      html += `<tr><td>${esc(m.name)}</td><td class="n">${fmt(m, v[i0])}</td><td class="n">${fmt(m, v.at(-1))}</td><td class="n">${diff(m, v[i0], v.at(-1))}</td><td class="n m">${fmt(m, d.nation[m.id]?.at(-1))}</td></tr>`;
    }
    html += `</table>`;
    // The municipalities behind it (a city of several, or a state), by the change in the first measure.
    const m = d.metrics[0];
    const codes = t.kind === "city" ? t.city.counties || [] : null;
    const all = app.w.raw.counties || [];
    const rows = [];
    // When each year has its own borders, compare municipalities only from the year their borders settled.
    const from = Math.max(d.fixed_borders === false ? d.stable_from || 0 : 0, d.compare_from || 0);
    const j0 = from ? Math.max(0, ys.findIndex((y) => y >= from)) : 0;
    const yFrom = ys[j0];
    const allowed = d.movers ? new Set(d.movers) : null; // small towns' rates jump by chance
    for (let k = 0; k < all.length; k++) {
      if (allowed && !allowed.has(k)) continue;
      const code = String(all[k].geoid);
      if (codes ? !codes.includes(code) : code.slice(0, 2) !== t.st.fips) continue;
      const r = d.munis[m.id]?.[k];
      if (!r) continue;
      const a = r[Math.max(first(r), j0)], b = r.at(-1);
      if (a == null || b == null) continue;
      rows.push({ name: all[k].name, d: (b - a) / (m.muni_div || 1) });
    }
    if (rows.length > 2) {
      rows.sort((a, b) => a.d - b.d);
      const tiny = m.format === "pct" ? 0.005 : 0.05;
      const down = rows.slice(0, 3).filter((x) => x.d < -tiny), up = rows.slice(-3).reverse().filter((x) => x.d > tiny);
      const list = (xs) => `<table>${xs.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${diff(m, 0, x.d)}</td></tr>`).join("")}</table>`;
      if (down.length) html += `<p>${esc(m.name)}: os municípios${d.movers ? ` de ${int(d.movers_min_pop)} habitantes ou mais` : ""} com a maior queda de ${yFrom} a ${y1}:</p>${list(down)}`;
      if (up.length) html += `<p>E os com a maior alta:</p>${list(up)}`;
    }
    return html + `<p class="src">${esc(d.rule)} Fonte: ${esc(d.vintage)}.</p>`;
  }

  function whyExports(t, x, b) {
    const usd = (v) => (v >= 1e9 ? `US$ ${dec(v / 1e9, 1)} bi` : v >= 1e6 ? `US$ ${dec(v / 1e6, 1)} mi` : `US$ ${int(v / 1e3)} mil`);
    const br = x.nation, brC = new Map(br.countries.map(([c, v]) => [c, v / br.fob])), brP = new Map(br.products.map(([k, v]) => [k, v / br.fob]));
    const rows = (list, label, brShare) => `<table>${list.map(([k, v]) => {
      const sh = v / b.fob, ns = brShare.get(k);
      return `<tr><td>${esc(label(k))}<span class="bar" style="width:${(100 * sh).toFixed(1)}%"></span></td><td class="n">${usd(v)}</td><td class="n m">${pct(sh, 0)}${ns != null ? ` · Brasil ${pct(ns, 0)}` : ""}</td></tr>`;
    }).join("")}</table>`;
    const o = t.kind === "city" ? t.city : t.st;
    let html = `<p>${esc(nameOf(t))} exportou <b>${usd(b.fob)}</b> em ${x.year}, ${pct(b.fob / br.fob, 1)} do Brasil${o.population ? `, US$ ${int(b.fob / o.population)} por habitante (Brasil: US$ ${int(br.fob / n.population)})` : ""}.</p>`;
    const big = (list) => list.slice(0, 6).filter(([, v], i) => i < 2 || v / b.fob >= 0.01); // under 1% is noise here
    html += `<p>Para onde:</p>` + rows(big(b.countries), (k) => k, brC);
    html += `<p>O quê:</p>` + rows(big(b.products), (k) => x.products[k] || k, brP);
    const lead = b.countries[0];
    if (lead && brC.get(lead[0]) && lead[1] / b.fob > 1.5 * brC.get(lead[0])) html += `<p>${esc(lead[0])} pesa aqui ${dec((lead[1] / b.fob) / brC.get(lead[0]), 1)} ${(lead[1] / b.fob) / brC.get(lead[0]) >= 2 ? "vezes" : "vez"} o que pesa nas vendas do Brasil.</p>`;
    return html + `<p class="src">${esc(x.rule)}</p>`;
  }

  function whyProtected(t, x) {
    const owner = app.w.raw.owner;
    const cells = t.kind === "city" ? new Set(t.city.footprint?.length ? t.city.footprint : [t.city.cell]) : null;
    const st = t.kind === "state" ? app.data.states.indexOf(t.st) : -1;
    const inside = (c) => (cells ? cells.has(c) : owner[c] === st);
    let land = 0;
    if (cells) land = cells.size; else for (let c = 0; c < owner.length; c++) if (owner[c] === st) land++;
    if (!land) return `<p>Sem hexágonos para contar.</p>`;
    const any = new Set();
    const rows = x.kinds.map((k) => {
      const n = (x.cells[k.id] || []).filter(inside);
      n.forEach((c) => any.add(c));
      return { k, n: n.length };
    });
    let html = `<p>Cerca de <b>${pct(any.size / land, 0)}</b> ${t.kind === "city" ? "da cidade" : "do estado"} é área protegida, contando os hexágonos que ela cobre em mais da metade (Brasil: ${pct(x.nation.any / x.nation.land, 0)}).</p>`;
    html += `<table>${rows.map((r) => `<tr><td><i class="bar" style="display:inline-block;width:9px;height:9px;margin-right:5px;background:${r.k.color}"></i>${esc(r.k.name)}</td><td class="n">${pct(r.n / land, 0)}</td><td class="n m">Brasil ${pct((x.nation[r.k.id] || 0) / x.nation.land, 0)}</td></tr>`).join("")}</table>`;
    const touching = x.areas.filter((a) => a.cells.some(inside)).sort((a, b) => (b.ha || 0) - (a.ha || 0)).slice(0, 6);
    const ha = (v) => (v >= 1e6 ? `${dec(v / 1e6, 1)} mi ha` : v >= 1e3 ? `${int(v / 1e3)} mil ha` : `${int(v)} ha`);
    if (touching.length) html += `<p>As maiores:</p><table>${touching.map((a) => `<tr><td>${esc(a.n)}<br><span class="src">${esc((a.s || "").replace(/,(?=\S)/g, ", "))}</span></td><td class="n">${a.ha ? ha(a.ha) : "–"}</td></tr>`).join("")}</table>`;
    return html + `<p class="src">${esc(x.rule)} ${esc(x.kinds.map((k) => k.rule).join(" "))} Ligue a camada no menu Mapa, em Áreas protegidas.</p>`;
  }

  function whyType(t, { districts: d }) {
    const c = d?.cities?.[t.city.id];
    if (!c) return `<p>Os distritos não carregaram.</p>`;
    const name = (code) => d.industries?.[code]?.title || code;
    const top = (c.top || []).slice(0, 4);
    let html = c.badge?.label
      ? `<p><b>${esc(c.badge.label)}</b> porque estas atividades têm, aqui, uma parcela dos empregos formais muito acima da do Brasil:</p>`
      : `<p>Nenhuma atividade passa a regra dos distritos com folga: é uma economia diversificada. As mais acima do Brasil são:</p>`;
    if (top.length) {
      html += `<table>${top.map((x) => `<tr><td>${esc(name(x.naics))}</td><td class="n">${dec(x.lq, 1)}×${x.lower_bound ? "+" : ""}</td><td class="n m">${int(x.emp)} empregos</td></tr>`).join("")}</table>`;
      html += `<p class="src">O número é o quociente locacional: a parcela da atividade nos empregos formais da cidade dividida pela parcela no Brasil. ${top.some((x) => x.lower_bound) ? "O sinal + marca um piso: o IBGE suprimiu algum município. " : ""}Total de empregos formais na cidade: ${int(c.emp)}.</p>`;
    }
    return html + `<p class="src">IBGE, Cadastro Central de Empresas 2024 (emprego assalariado formal; o informal fica de fora).</p>`;
  }
}
