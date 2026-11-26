// Terrain tables. world.json v2 ships its own `tables` (water / relief / cover); these are the fallbacks used
// when a field is missing, and the v1 `terrain` codes, which are translated into the v2 arrays.
import { parseHex } from "./color.js";

// v1 terrain codes (pipeline/build/world.py before v2). Only used to derive water/relief from old files.
export const V1_TERRAIN = [
  { id: 0, name: "Oceano", water: 1 }, { id: 1, name: "Costa", water: 2 }, { id: 2, name: "Lago", water: 3 },
  { id: 3, name: "Baixada" }, { id: 4, name: "Planície" }, { id: 5, name: "Planície alta" }, { id: 6, name: "Planalto" },
  { id: 7, name: "Morros", relief: 1 }, { id: 8, name: "Serras", relief: 2 }, { id: 9, name: "Picos", relief: 3 },
];

export const DEFAULT_TABLES = {
  water: [
    { id: 0, name: "Terra" },
    { id: 1, name: "Oceano", color: "#1b4266", rule: "Água com mais de ~200 m de profundidade, longe da terra." },
    { id: 2, name: "Costa", color: "#2d6d97", rule: "Água ao lado da terra ou com menos de 200 m." },
    { id: 3, name: "Lago", color: "#3a80b0", rule: "O centro do hexágono fica num lago do Natural Earth." },
  ],
  relief: [
    { id: 0, name: "Plano", rule: "Terreno suave." },
    { id: 1, name: "Morros", rule: "Terreno acidentado dentro do hexágono." },
    { id: 2, name: "Serras", rule: "Terreno muito acidentado ou alto." },
    { id: 3, name: "Picos", rule: "Grandes altitudes." },
  ],
  cover: [
    { id: 0, key: "none", name: "Desconhecido" },
    { id: 1, key: "forest_deciduous", name: "Floresta", color: "#4f7a35" },
    { id: 2, key: "forest_evergreen", name: "Floresta de coníferas", color: "#2f5f3a" },
    { id: 3, key: "forest_mixed", name: "Floresta mista", color: "#436d36" },
    { id: 4, key: "scrub", name: "Caatinga e arbustos", color: "#b8a26a" },
    { id: 5, key: "grassland", name: "Campo", color: "#9fb35a" },
    { id: 6, key: "pasture", name: "Pasto", color: "#a8b862" },
    { id: 7, key: "cropland", name: "Lavoura", color: "#c2b65c" },
    { id: 8, key: "wetland", name: "Área úmida", color: "#4f7f68" },
    { id: 9, key: "urban", name: "Urbano", color: "#8c8780" },
    { id: 10, key: "barren", name: "Solo exposto", color: "#b9ab94" },
    { id: 11, key: "ice", name: "Gelo e neve", color: "#e8eef2" },
  ],
};

// Cover ids (fixed by the data contract).
export const COVER = {
  NONE: 0, DECIDUOUS: 1, EVERGREEN: 2, MIXED: 3, SCRUB: 4, GRASS: 5, PASTURE: 6, CROP: 7, WETLAND: 8, URBAN: 9,
  BARREN: 10, ICE: 11,
};

// Merge the file's tables over the defaults (by id), so a missing colour or name never breaks rendering.
export function resolveTables(tables) {
  const out = {};
  for (const key of ["water", "relief", "cover"]) {
    const byId = new Map(DEFAULT_TABLES[key].map((t) => [t.id, { ...t }]));
    for (const t of tables?.[key] || []) byId.set(t.id, { ...(byId.get(t.id) || {}), ...t });
    out[key] = [...byId.values()].sort((a, b) => a.id - b.id);
  }
  return out;
}

// Elevation colour ramp for land without land-cover data (Canada, Mexico, v1 files).
const ELEV_STOPS = [
  [-100, "#5d8a39"], [250, "#7c9744"], [700, "#a39c58"], [1400, "#b09366"], [2200, "#9a8068"], [3000, "#8c8078"],
  [3800, "#d8dde0"],
].map(([e, c]) => [e, parseHex(c)]);

export function elevColor(elev) {
  if (elev <= ELEV_STOPS[0][0]) return ELEV_STOPS[0][1];
  for (let k = 1; k < ELEV_STOPS.length; k++) {
    const [e1, c1] = ELEV_STOPS[k];
    if (elev <= e1) {
      const [e0, c0] = ELEV_STOPS[k - 1];
      const t = (elev - e0) / (e1 - e0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return ELEV_STOPS[ELEV_STOPS.length - 1][1];
}

export const OCEAN_DEEP = parseHex("#0d2a47");
export const OCEAN_DEEP_CSS = "#0d2a47";
