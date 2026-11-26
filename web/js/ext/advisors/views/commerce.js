// Commerce advisor ("Mestre do comércio"): the busiest air routes between cities (trade.json), the ports and airports
// and the road and rail network (infrastructure.json).
import { esc, fin, el as mk } from "../core/util.js";
import { int, count3 } from "../core/fmt.js";
import { barList, sizeLegend } from "../core/charts.js";
import { section, tiles, segmented, sourcesHtml } from "../core/view.js";
import { frameBox, focusPoint } from "../core/frame.js";

const ROUTE_COLOR = "#c9a0e0", PORT_COLOR = "#4f9ad6", AIR_COLOR = "#e6cf86";

export async function mount(ctx) {
  const { app, el, link, data } = ctx;
  const [trade, infra] = await Promise.all([app.loadData("trade"), app.loadData("infrastructure")]);
  if (!trade && !infra) {
    el.innerHTML = `<p class="adv-empty pad">O trade.json e o infrastructure.json não foram gerados, então o mestre do comércio não tem o que contar.</p>`;
    return {};
  }
  const grid = app.w.grid;
  const metros = data.levels.metros;
  const api = { hotRoute: null };
  const ports = (infra?.ports || []).map((p) => ({ ...p, key: `p${p.id}` }));
  const airports = (infra?.airports || []).map((a) => ({ ...a, key: `a${a.id}` }));

  // --- headline -------------------------------------------------------------------------------------------------
  const topPort = [...ports].sort((a, b) => (b.tons || 0) - (a.tons || 0))[0];
  const topAir = [...airports].sort((a, b) => (b.pax || 0) - (a.pax || 0))[0];
  const paxAll = airports.reduce((a, x) => a + (x.pax || 0), 0);
  el.insertAdjacentHTML("beforeend", tiles([
    { label: "Passageiros aéreos", value: count3(paxAll), sub: `embarques e desembarques, ${topAir?.year || ""}` },
    { label: "Maior porto", value: topPort ? `${count3(topPort.tons)} t` : "–", sub: topPort ? `${topPort.name} (${topPort.state})` : "" },
    { label: "Maior aeroporto", value: topAir ? count3(topAir.pax) : "–", sub: topAir ? `${topAir.city || topAir.name}, passageiros` : "" },
  ]));

  // --- air routes -----------------------------------------------------------------------------------------------
  let routes = [], routeCells = new Map(), routeBars = null;
  const st = { route: null, city: null };
  const rDetail = mk("div", "adv-detail");
  if (trade) {
    const zoneById = new Map((trade.zones || []).map((z) => [z.id, z]));
    const zName = (id) => zoneById.get(id)?.short || metros.byKey.get(id)?.name || id;
    routes = (trade.routes || []).map((r) => {
      const pts = (r.path || []).filter((c) => c >= 0 && c < grid.size).map((c) => [grid.cx(c), grid.cy(c)]);
      return { ...r, key: `${r.a}-${r.b}`, label: `${zName(r.a)} ⇄ ${zName(r.b)}`, pts, path2d: arcPath(pts) };
    });
    routes.forEach((r) => { for (const c of [r.path?.[0], r.path?.[r.path.length - 1]]) { if (c == null) continue; if (!routeCells.has(c)) routeCells.set(c, []); routeCells.get(c).push(r); } });
    for (const list of routeCells.values()) list.sort((a, b) => b.pax - a.pax);
    const vMax = Math.max(1, ...routes.map((r) => r.pax || 0));

    const rBody = section(el, { title: "As rotas aéreas", kicker: esc(trade.vintage || ""), note: esc(trade.rule || "") });
    const fRow = mk("div", "adv-row adv-filterbar");
    rBody.appendChild(fRow);
    fRow.addEventListener("click", (e) => { if (e.target.closest("[data-clear-city]")) setCity(null); });
    const rHost = mk("div");
    rBody.appendChild(rHost);
    rBody.appendChild(rDetail);
    rBody.insertAdjacentHTML("beforeend", `<p class="adv-note">${esc(trade.path_note || "")} A espessura da linha segue os passageiros. Clique numa cidade do mapa para ver só as rotas dela.</p>`);

    const routeHighlight = (r) => {
      const cells = new Set(), cities = new Set();
      for (const id of [r.a, r.b]) {
        const m = metros.byKey.get(id);
        if (!m) continue;
        cities.add(id);
        for (const c of m.ref.footprint || [m.ref.cell]) cells.add(c);
      }
      return { cells, cities, label: r.label };
    };
    const visibleRoutes = () => routes.filter((r) => !st.city || r.a === st.city || r.b === st.city);
    const drawRoutes = () => {
      const vis = visibleRoutes();
      rHost.innerHTML = "";
      routeBars = barList(rHost, {
        rank: !st.city, ariaLabel: "As maiores rotas aéreas", max: vMax,
        rows: vis.map((r) => ({ key: r.key, label: r.label, value: r.pax, text: count3(r.pax), color: ROUTE_COLOR, sub: `${int(r.dist_km)} km`, full: `#${r.rank} ${zoneById.get(r.a)?.name || r.a} ⇄ ${zoneById.get(r.b)?.name || r.b}` })),
        selected: st.route?.key,
        onHover: (row) => {
          const r = row ? routes.find((x) => x.key === row.key) : null;
          setHotRoute(r);
          link.hover(r ? routeHighlight(r) : null);
        },
        onClick: (row) => selectRoute(routes.find((x) => x.key === row.key)),
      });
      fRow.innerHTML = st.city ? `<span class="adv-fchip">Cidade: <b>${esc(zName(st.city))}</b> · ${vis.length} rotas<button type="button" data-clear-city aria-label="Limpar o filtro de cidade">✕</button></span>` : "";
      if (!vis.length) rHost.innerHTML = `<p class="adv-empty">Nenhuma das ${routes.length} maiores rotas toca esta cidade.</p>`;
      redraw();
    };
    function setCity(id) {
      st.city = id;
      drawRoutes();
      const m = id ? metros.byKey.get(id) : null;
      link.base(m ? { cells: new Set(m.ref.footprint || [m.ref.cell]), cities: new Set([id]), dimOthers: true } : null);
    }
    function selectRoute(r) {
      st.route = st.route === r ? null : r;
      routeBars?.setSelected(st.route?.key ?? null);
      drawRouteDetail();
      redraw();
      if (st.route) frameRoute(st.route);
    }
    function frameRoute(r) {
      if (!r.pts.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of r.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const R = grid.R * 3;
      frameBox(app, { x0: x0 - R, y0: y0 - R, x1: x1 + R, y1: y1 + R }, { pad: 40, maxScale: 2.6 });
    }
    function drawRouteDetail() {
      const r = st.route;
      if (!r) { rDetail.innerHTML = ""; return; }
      rDetail.innerHTML = `<div class="adv-card-detail">
        <h4 class="adv-h4">#${r.rank} ${esc(zoneById.get(r.a)?.name || r.a)} ⇄ ${esc(zoneById.get(r.b)?.name || r.b)}</h4>
        ${tiles([
          { label: "Passageiros", value: count3(r.pax), sub: "por ano, nos dois sentidos" },
          { label: "Por dia", value: count3(r.pax / 365), sub: "em média" },
          { label: "Distância", value: `${int(r.dist_km)} km`, sub: "em linha reta" },
        ])}
        <button type="button" class="adv-mini" data-unpin>Fechar</button></div>`;
      rDetail.querySelector("[data-unpin]").addEventListener("click", () => selectRoute(st.route));
    }

    // The routes overlay: every visible route (unless the map layer already draws them), the hovered one on top.
    const tradeLayerOn = () => {
      try { return (app.staticLayers?.() || []).some((l) => /trade/i.test(l.id) && (typeof l.visible !== "function" || l.visible())); } catch { return false; }
    };
    const overlay = {
      id: "adv-commerce-routes", z: 18, space: "world",
      draw(ctx2, cam) {
        const s = cam.scale;
        ctx2.save();
        ctx2.lineCap = "round";
        const hot = api.hotRoute || st.route;
        if (!tradeLayerOn()) {
          for (const r of visibleRoutes()) {
            if (r === hot) continue;
            const wpx = 1 + 4 * Math.sqrt(r.pax / vMax);
            ctx2.strokeStyle = "rgba(10,8,4,.5)";
            ctx2.lineWidth = (wpx + 2) / s;
            ctx2.stroke(r.path2d);
            ctx2.strokeStyle = "rgba(201,160,224,.8)";
            ctx2.lineWidth = wpx / s;
            ctx2.stroke(r.path2d);
          }
        }
        if (hot) {
          const wpx = 2.5 + 5 * Math.sqrt(hot.pax / vMax);
          ctx2.strokeStyle = "rgba(10,8,4,.9)";
          ctx2.lineWidth = (wpx + 4) / s;
          ctx2.stroke(hot.path2d);
          ctx2.strokeStyle = "#ffd36a";
          ctx2.lineWidth = wpx / s;
          ctx2.stroke(hot.path2d);
          for (const p of [hot.pts[0], hot.pts[hot.pts.length - 1]]) {
            if (!p) continue;
            ctx2.beginPath();
            ctx2.arc(p[0], p[1], 5 / s, 0, Math.PI * 2);
            ctx2.fillStyle = "#fff3c4";
            ctx2.fill();
            ctx2.strokeStyle = "rgba(10,8,4,.9)";
            ctx2.lineWidth = 1.5 / s;
            ctx2.stroke();
          }
        }
        ctx2.restore();
      },
    };
    const off = app.registerOverlay(overlay);
    ctx.cleanup(() => off?.());
    api.setHotRoute = setHotRoute;
    api.selectRoute = selectRoute;
    api.setCity = setCity;
    drawRoutes();
  }
  function setHotRoute(r) {
    if (api.hotRoute === r) return;
    api.hotRoute = r || null;
    redraw();
  }
  function redraw() { app.requestDraw(); }

  // --- ports and airports -----------------------------------------------------------------------------------------
  let portBars = null, airBars = null, portBubbles = null, airBubbles = null;
  if (infra) {
    const v = infra.vintage || {};
    const pBody = section(el, { title: "Os portos", kicker: esc(typeof v === "string" ? v : v.ports || ""), note: esc(infra.rules?.ports || "") });
    let pMode = "tons";
    const pHost = mk("div");
    segmented(pBody, { label: "Ordenar por", value: pMode, options: [{ value: "tons", label: "Carga" }, { value: "teu", label: "Contêineres" }, { value: "grain", label: "Grãos exportados" }], onChange: (x) => { pMode = x; drawPorts(); } });
    pBody.appendChild(pHost);
    const portHover = (p) => {
      link.hover(p ? { cells: new Set(p.cell != null ? [p.cell] : []), label: p.name } : null);
      portBubbles?.setHot(p ? p.key : null);
    };
    function drawPorts() {
      pHost.innerHTML = "";
      const k = { tons: "tons", teu: "teu", grain: "grain_export_t" }[pMode];
      const list = ports.filter((p) => fin(p[k]) && p[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 15);
      portBars = barList(pHost, {
        rank: true, ariaLabel: "Os maiores portos",
        rows: list.map((p) => ({ key: p.key, label: p.name, sub: `${p.municipality || ""} (${p.state}) · ${p.kind || ""}`, value: p[k], text: pMode === "teu" ? `${count3(p[k])} TEU` : `${count3(p[k])} t`, color: PORT_COLOR })),
        onHover: (r) => portHover(r ? ports.find((p) => p.key === r.key) : null),
        onClick: (r) => flyTo(ports.find((p) => p.key === r.key)),
      });
      pHost.insertAdjacentHTML("beforeend", `<p class="adv-note">${pMode === "tons" ? "Toneladas movimentadas no ano, carga e descarga." : pMode === "teu" ? "Contêineres em TEU (a medida de um contêiner de 20 pés)." : "Toneladas de soja e milho embarcadas para exportação."}</p>`);
    }
    drawPorts();

    const aBody = section(el, { title: "Os aeroportos", kicker: esc(typeof v === "string" ? "" : v.airports || ""), note: esc(infra.rules?.airports || "") });
    let aMode = "pax";
    const aHost = mk("div");
    segmented(aBody, { label: "Ordenar por", value: aMode, options: [{ value: "pax", label: "Passageiros" }, { value: "intl", label: "Internacionais" }, { value: "cargo", label: "Carga" }], onChange: (x) => { aMode = x; drawAir(); } });
    aBody.appendChild(aHost);
    const airHover = (a) => {
      link.hover(a ? { cells: new Set(a.cell != null ? [a.cell] : []), label: `${a.id} · ${a.name}` } : null);
      airBubbles?.setHot(a ? a.key : null);
    };
    function drawAir() {
      aHost.innerHTML = "";
      const k = { pax: "pax", intl: "intl_pax", cargo: "cargo_kg" }[aMode];
      const list = airports.filter((a) => fin(a[k]) && a[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 15);
      airBars = barList(aHost, {
        rank: true, ariaLabel: "Os aeroportos mais movimentados",
        rows: list.map((a) => ({
          key: a.key, label: `${a.id} ${a.city || a.name}`, full: a.name, value: a[k],
          text: aMode === "cargo" ? `${count3(a[k] / 1000)} t` : count3(a[k]), sub: `${a.state} · ${infra.hubs?.[a.hub] || "carga"}`, color: AIR_COLOR,
        })),
        onHover: (r) => airHover(r ? airports.find((a) => a.key === r.key) : null),
        onClick: (r) => flyTo(airports.find((a) => a.key === r.key)),
      });
      aHost.insertAdjacentHTML("beforeend", `<p class="adv-note">${aMode === "cargo" ? "Carga e correio pagos, embarcados e desembarcados, em toneladas." : aMode === "intl" ? "Passageiros de voos internacionais, embarques e desembarques." : "Passageiros pagos e grátis, embarques e desembarques."}</p>`);
    }
    drawAir();

    // On the map: circles for ports (tons) and airports (passengers).
    const mBody = section(el, { title: "No mapa" });
    let show = "both";
    segmented(mBody, {
      label: "Mostrar", value: show,
      options: [{ value: "both", label: "Portos e aeroportos" }, { value: "ports", label: "Portos" }, { value: "air", label: "Aeroportos" }, { value: "none", label: "Só as rotas" }],
      onChange: (x) => { show = x; drawSites(); },
    });
    const sizeBox = mk("div");
    mBody.appendChild(sizeBox);
    portBubbles = ctx.bubbles("ports", {
      rMax: 20, alpha: 0.5,
      tip: (b) => `<b>${esc(b.it.name)}</b><br>${esc(b.it.kind || "Porto")} · <b>${count3(b.it.tons)} t</b> (${b.it.year})<br><span class="sub">${esc(b.it.municipality || "")} (${esc(b.it.state)})${fin(b.it.teu) ? ` · ${count3(b.it.teu)} TEU` : ""}</span>`,
      onHover: (b) => portBars?.setHot(b ? b.key : null),
      onClick: (b) => { portBars?.setHot(b.key); flyTo(b.it); },
    });
    airBubbles = ctx.bubbles("airports", {
      rMax: 16, alpha: 0.5,
      tip: (b) => `<b>${esc(b.it.id)} · ${esc(b.it.name)}</b><br>${esc(infra.hubs?.[b.it.hub] || "Aeroporto")} · <b>${count3(b.it.pax)}</b> passageiros${fin(b.it.cargo_kg) ? `<br><span class="sub">carga ${count3(b.it.cargo_kg / 1000)} t</span>` : ""}`,
      onHover: (b) => airBars?.setHot(b ? b.key : null),
      onClick: (b) => { airBars?.setHot(b.key); flyTo(b.it); },
    });
    function drawSites() {
      const pMax = Math.max(1, ...ports.map((p) => p.tons || 0)), aMax = Math.max(1, ...airports.map((a) => a.pax || 0));
      portBubbles.set(show === "both" || show === "ports" ? ports.filter((p) => fin(p.tons)).map((p) => ({ key: p.key, x: p.x, y: p.y, value: p.tons, color: PORT_COLOR, it: p })) : [], { vMax: pMax });
      airBubbles.set(show === "both" || show === "air" ? airports.filter((a) => fin(a.pax) && a.pax > 0).map((a) => ({ key: a.key, x: a.x, y: a.y, value: a.pax, color: AIR_COLOR, it: a })) : [], { vMax: aMax });
      sizeBox.innerHTML = (show === "both" || show === "ports" ? sizeLegend([10e6, 100e6], (x) => 20 * Math.sqrt(x / pMax), (x) => `${count3(x)} t`, "Portos (azul): toneladas") : "")
        + (show === "both" || show === "air" ? sizeLegend([1e6, 20e6], (x) => 16 * Math.sqrt(x / aMax), (x) => count3(x), "Aeroportos (dourado): passageiros") : "");
    }
    drawSites();

    // Roads and rail: the counts and rules (the map layers draw them; their switches live in the Map menu).
    const nBody = section(el, { title: "Rodovias e ferrovias", open: false });
    const nRoad = [0, 0], nRail = [0, 0];
    for (const r of infra.roads || []) nRoad[r[2]] = (nRoad[r[2]] || 0) + 1;
    for (const r of infra.rail || []) nRail[r[2]] = (nRail[r[2]] || 0) + 1;
    nBody.innerHTML = `<p class="adv-note">${(infra.road_classes || []).map((c, i) => `<b>${esc(c.name)}</b>: ${int(nRoad[i] || 0)} ligações entre hexágonos`).join(" · ")}<br>${(infra.rail_tiers || []).map((c, i) => `<b>${esc(c.name)}</b>: ${int(nRail[i] || 0)} ligações entre hexágonos`).join(" · ")}</p>
      <p class="adv-note">${esc(infra.rules?.roads || "")}</p><p class="adv-note">${esc(infra.rules?.rail || "")}</p>
      <p class="adv-note">Ligue ou desligue as rodovias, as ferrovias, os portos e as rotas pelo menu <b>Mapa</b>.</p>`;
  }
  function flyTo(p) {
    if (!p) return;
    focusPoint(app, p.x, p.y, Math.min(app.cam.maxScale, Math.max(app.cam.scale, (app.cam.fitScale || 1) * 3)));
  }

  el.insertAdjacentHTML("beforeend", sourcesHtml(data, [...(trade?.sources || []), ...(infra?.sources || [])], [
    "As rotas somam os passageiros dos dois sentidos e de todos os aeroportos de cada cidade, e só contam ligações de 250 km ou mais: a ponte Rio–São Paulo entra, Campinas–São Paulo não.",
    "O arco é um desenho entre os estandartes, não a rota do voo.",
    "Os números dos portos foram transcritos do Anuário 2025 da ANTAQ (a base bruta estava fora do ar), e cada porto fica na sede do seu município: um terminal longe da cidade aparece no lugar errado por alguns quilômetros.",
    "As rodovias e ferrovias do Natural Earth são desenho de mapa, não estatística: um traçado simplificado sem toda a malha, sem tráfego nem dono.",
  ]));

  return {
    onMapHover(h) {
      if (h.item?.kind === "port") portBars?.setHot(`p${h.item.data?.id}`);
      if (h.item?.kind === "airport") airBars?.setHot(`a${h.item.data?.id}`);
      if (!routes.length) return;
      const fromLayer = h.item?.kind === "route" ? routes.find((x) => x.a === h.item.data?.route?.a && x.b === h.item.data?.route?.b) : null;
      const r = fromLayer || null;
      routeBars?.setHot(r ? r.key : null);
      api.setHotRoute?.(r);
    },
    onMapClick(ev) {
      if (ev.item?.kind === "port" || ev.item?.kind === "airport") { flyTo(ev.item.data); return true; }
      if (ev.item?.kind === "route") {
        const r = routes.find((x) => x.a === ev.item.data?.route?.a && x.b === ev.item.data?.route?.b);
        if (r) { api.selectRoute(r); return true; }
      }
      const m = ev.cell >= 0 ? metros.rowAtCell(ev.cell) : null;
      if (m && !ev.city && routes.some((r) => r.a === m.key || r.b === m.key)) { api.setCity?.(st.city === m.key ? null : m.key); return true; }
      return false;
    },
    onEscape() {
      if (st.route) { api.selectRoute(st.route); return true; }
      if (st.city) { api.setCity(null); return true; }
      return false;
    },
  };
}

/** A gentle arc between the two ends of a route (the bulge is 12% of its length), in km. */
function arcPath(pts) {
  const p = new Path2D();
  if (pts.length < 2) return p;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  p.moveTo(a[0], a[1]);
  p.quadraticCurveTo(mx - dy * 0.12, my + dx * 0.12, b[0], b[1]);
  return p;
}
