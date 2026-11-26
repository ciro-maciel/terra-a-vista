// Map-art extension: tile improvements (Interstates and major highways, railroads, ports, airports),
// military forts and restricted ground, wonders and protected land, and freight trade routes, each as a static layer
// drawn into the cached map (nothing animates; an idle map draws no frames), with a switch in the "Map" menu.
//
// Data: infrastructure.json, military.json, wonders.json and trade.json (loaded eagerly by main.js right after the
// first frame; app.loadData returns the same promise). A missing file (null) leaves its layers off and their switches
// harmless. Defaults: roads, rail, ports & airports, military and wonders on (roads, rail and hubs only from the region
// view in: see each layer's minRpx), trade routes off.
import { createModel } from "./model.js";
import { makeLayers } from "./layers.js";
import { tips } from "./tips.js";
import { prepareCellSet } from "../../render/art/sites.js";
import { esc } from "../../format.js";

// Terra à Vista: only the layers that have Brazilian data; the military layer is out of scope.
const TOGGLES = [
  { id: "roads", label: "Rodovias", icon: "t-road", def: true, title: "Rodovias principais (Natural Earth, como arte do mapa)", layers: ["roads"] },
  { id: "rail", label: "Ferrovias", icon: "t-rail", def: true, title: "Linhas férreas principais e secundárias (Natural Earth, como arte do mapa)", layers: ["rail"] },
  { id: "hubs", label: "Portos e aeroportos", icon: "d-harbor", def: true, title: "Portos e terminais do Anuário da ANTAQ e aeroportos pelo movimento da ANAC", layers: ["hubs"] },
  { id: "wonders", label: "Maravilhas", icon: "w-landmark", def: true, title: "Os sítios do Patrimônio Mundial da UNESCO no Brasil", layers: ["wonders", "plates"] },
  { id: "protected", label: "Áreas protegidas", icon: "l-forest", def: false, title: "Terras indígenas (Funai) e unidades de conservação (cadastro nacional)", layers: ["areas"] },
  { id: "trade", label: "Rotas aéreas", icon: "t-trade", def: false, title: "As 40 maiores ligações aéreas de passageiros entre cidades (ANAC)", layers: ["trade"] },
];

export function install(app) {
  const model = createModel(app.w);
  const on = Object.fromEntries(TOGGLES.map((t) => [t.id, t.def]));
  const layers = makeLayers(model, on, { tips, app });
  for (const l of layers) app.registerStaticLayer(l);
  app.registerStaticLayer(protectedLayer(app, on));

  for (const t of TOGGLES) {
    app.ui.addMapToggle({
      id: t.id, label: t.label, icon: t.icon, title: t.title, default: t.def,
      get: () => on[t.id],
      set: (v) => {
        on[t.id] = !!v;
        app.requestDraw();
      },
    });
  }

  const apply = (name, data) => {
    model.setData(name, data);
    app.requestDraw();
  };
  for (const name of ["infrastructure", "military", "wonders", "trade"]) {
    if (app.data[name] !== undefined) apply(name, app.data[name]);
    else app.loadData(name).then((d) => apply(name, d), (err) => console.warn(`map layers: ${name} failed to load`, err));
  }

  app.loadData("protected").then(() => app.requestDraw(), () => {});

  // For debugging and the gallery: the model and switches.
  app.mapArt = { model, on, layers };
}

// Protected areas (protected.json): indigenous lands and conservation units by the hexes they cover, one colour each,
// a soft wash and a dashed edge; hovering a hex lists the areas that touch it.
function protectedLayer(app, on) {
  let prepared = null, src = null;
  const prep = () => {
    const d = app.data.protected;
    if (!d || d === src) return prepared;
    src = d;
    const byCell = new Map();
    d.areas.forEach((a, k) => { for (const c of a.cells) { if (!byCell.has(c)) byCell.set(c, []); byCell.get(c).push(k); } });
    prepared = {
      d, byCell,
      sets: d.kinds.map((k) => ({ kind: k, ...prepareCellSet(app.w, d.cells[k.id] || []) })),
    };
    return prepared;
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  return {
    id: "areas", z: 57.5, minRpx: 2,
    visible: () => !!on.protected && !!app.data.protected,
    sig: () => (app.data.protected ? "p1" : "p0"),
    draw(ctx, vp, w, o) {
      const p = prep();
      if (!p) return;
      const s = vp.s;
      for (const st of p.sets) {
        ctx.fillStyle = rgba(st.kind.color, o.lens ? 0.0 : 0.22);
        if (!o.lens) ctx.fill(st.path);
        ctx.strokeStyle = rgba(st.kind.color, 0.95);
        ctx.lineWidth = Math.max(1.2, Math.min(2.6, o.Rpx * 0.07)) / s;
        ctx.setLineDash(st.kind.id === "us" ? [3 / s, 3 / s] : st.kind.id === "pi" ? [7 / s, 3 / s] : []);
        ctx.stroke(st.edges);
      }
      ctx.setLineDash([]);
    },
    hit(x, y) {
      const p = prep();
      if (!p) return null;
      const cell = app.w.grid.cellAt(x, y);
      const list = p.byCell.get(cell);
      return list && list.length ? { kind: "protected", data: { cell, list } } : null;
    },
    tooltip(it) {
      const p = prep();
      const kinds = Object.fromEntries(p.d.kinds.map((k) => [k.id, k]));
      const items = it.data.list.map((k) => p.d.areas[k]).sort((a, b) => (b.ha || 0) - (a.ha || 0));
      const ha = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(".", ",")} mi ha` : v >= 1e3 ? `${Math.round(v / 1e3)} mil ha` : `${Math.round(v)} ha`);
      return items.slice(0, 4).map((a) => `<b>${esc(a.n)}</b><br><span class="muted"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${kinds[a.k]?.color}"></i> ${esc(kinds[a.k]?.name || "")}${a.s ? ` · ${esc(a.s.replace(/,(?=\S)/g, ", "))}` : ""}${a.ha ? ` · ${ha(a.ha)}` : ""}</span>`).join("<br>")
        + (items.length > 4 ? `<br><span class="muted">e mais ${items.length - 4}</span>` : "");
    },
  };
}
