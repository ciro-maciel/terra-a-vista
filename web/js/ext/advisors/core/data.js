// The advisors' data model: two "levels" (states, cities) of rows with typed fields, plus the links between rows and
// the hex map (row → highlight, cell → row). Built once from app.data.
//
//   level = {id, label, noun, rows: [row], fields: [field], field(key), value(row, key),
//            highlight(rows, opts) → app.state.highlight, rowAtCell(cell) → row | null, focus(row), byKey: Map}
//   row   = {key, name, sub, level, ref, v: {fieldKey: value}}
//   field = {key, label, format, unit, higher_is, source, description, lens?, group, derived?}
// Labels and descriptions are what a person reads, so they are in Portuguese.
import { fin, ratio } from "./util.js";
import { tr, DEC } from "../../../i18n.js";

// WorldCover has no pasture class (pastures count as grassland), so Brazil has no "pasture" key here.
const LAND_KEYS = ["forest", "crop", "grass", "shrub", "wetland", "developed"];
export const LAND_LABEL = {
  forest: tr("Floresta"), crop: tr("Lavoura"), pasture: tr("Pasto"), grass: tr("Campo e pasto"), shrub: tr("Arbustos e caatinga"), wetland: tr("Área úmida"), developed: tr("Área construída"),
};
export const LAND_COLOR = {
  forest: "#3f7a3a", crop: "#d2c457", pasture: "#93b852", grass: "#b9b06a", shrub: "#c9a874", wetland: "#4f9a86", developed: "#9a8f9e",
};
export { LAND_KEYS };
export const SECTOR_KEYS = ["agriculture", "industry", "services", "public", "taxes"];

export function buildData(app) {
  const { cities = [], states = [], nation = {}, resources, sources = [] } = app.data;
  const w = app.w;
  const owner = w.raw.owner;
  const n = w.grid.size;

  // --- cell indexes ---------------------------------------------------------------------------------------------
  const stateCells = new Map();
  for (let i = 0; i < n; i++) {
    const o = owner[i];
    if (!(o >= 0)) continue;
    if (!stateCells.has(o)) stateCells.set(o, []);
    stateCells.get(o).push(i);
  }
  // cell → city: footprints, smaller cities first so a bigger city's majority wins; then every city's own cell.
  const cellMetro = new Map();
  for (let k = cities.length - 1; k >= 0; k--) for (const cell of cities[k].footprint || []) cellMetro.set(cell, cities[k]);
  for (const c of cities) if (c.cell != null) cellMetro.set(c.cell, c);

  const srcTitle = new Map(sources.map((s) => [s.id, s]));
  const nat = nation.nation || {};
  const vintage = nation.vintage || tr("Censo 2022");
  const gdpVintage = nation.gdp_vintage || tr("IBGE, PIB dos Municípios");
  const sectorYear = nation.gdp_sectors_year || "";
  const yrs = (nat.growth_years || []).join(" a ");

  // --- fields ---------------------------------------------------------------------------------------------------
  const F = (key, label, format, o = {}) => ({ key, label, format, unit: o.unit || null, higher_is: o.higher_is || "neutral", source: o.source || "", description: o.description || "", lens: o.lens || null, group: o.group || tr("Economia"), derived: !!o.derived });
  const mean = (city) => (city ? tr(" Na cidade, média dos municípios ponderada pela população (aproximação: o IBGE publica só a taxa de cada município).") : "");
  const fields = (city) => [
    F("population", tr("População"), "int", { unit: tr("pessoas"), source: "ibge_census", group: tr("Pessoas"), description: tr("Moradores contados pelo Censo 2022{0}.", city ? tr(", somados os municípios da cidade") : "") }),
    F("growth", tr("Crescimento"), "signed", { unit: tr("variação da população"), source: "ibge_estimates", group: tr("Pessoas"), description: tr("Variação da população de {0} pelas estimativas do IBGE, mesmos limites nos dois anos.", yrs) }),
    F("density", tr("Densidade"), "float", { unit: tr("habitantes por km²"), source: "ibge_censo2022", group: tr("Pessoas"), lens: "density", description: tr("População do Censo 2022 ÷ área territorial (IBGE)."), derived: true }),
    F("area_km2", tr("Área"), "km2", { unit: "km²", source: "ibge_censo2022", group: tr("Pessoas"), description: tr("Área territorial oficial (IBGE, tabela 4714).") }),
    F("median_age", city ? tr("Idade mediana ≈") : tr("Idade mediana"), "years", { unit: tr("anos"), source: "ibge_censo2022", group: tr("Pessoas"), lens: "age", description: tr("Idade mediana dos moradores (Censo 2022, tabela 9515).{0}", mean(city)) }),
    F("ageing", city ? tr("Envelhecimento ≈") : tr("Envelhecimento"), "float", { unit: tr("idosos por 100 jovens"), source: "ibge_censo2022", group: tr("Pessoas"), lens: "ageing", description: tr("Pessoas de 65 anos ou mais para cada 100 de até 14 anos (Censo 2022).{0}", mean(city)) }),
    F("gdp", tr("PIB"), "money", { unit: tr("R$ por ano"), source: "ibge_gdp", description: tr("{0}: PIB a preços correntes, contado onde a produção acontece.", gdpVintage) }),
    F("gdp_pc", tr("PIB por habitante"), "usd", { unit: tr("R$ por habitante"), higher_is: "good", source: "ibge_gdp", lens: "gdp_pc", description: tr("PIB de 2023 ÷ população do Censo 2022."), derived: true }),
    ...SECTOR_KEYS.map((k) => F(`sec_${k}`, tr("{0} no PIB", nation.gdp_sectors?.[k] || k), "pct", { unit: tr("do PIB de {0}", sectorYear), source: "ibge_gdp_sectors", description: tr("Parcela do PIB de {0} que vem {1} (o SIDRA publica os setores dois anos atrás do PIB).", sectorYear, k === "taxes" ? tr("dos impostos líquidos sobre produtos") : tr("do valor adicionado de {0}", String(nation.gdp_sectors?.[k] || k).toLowerCase())) })),
    F("employed", tr("Empregos formais"), "int", { unit: tr("empregos assalariados"), source: "ibge_cempre", description: tr("Pessoal assalariado das empresas e órgãos, contado onde fica o empregador (IBGE, CEMPRE 2024). O trabalho informal fica de fora.") }),
    ...(nation.yields || []).filter((y) => y.key !== "gold").map((y) => F(`y_${y.key}`, tr("{0} (empregos)", y.label), "int", { unit: tr("empregos formais"), source: "ibge_cempre", group: tr("Rendimentos"), description: y.description })),
    F("median_income", tr("Renda do trabalho"), "usd", { unit: tr("R$ por mês, por ocupado"), higher_is: "good", source: "ibge_censo2022", group: tr("Prosperidade"), lens: "income", description: tr("Rendimento médio mensal de todos os trabalhos por pessoa ocupada, formal ou informal: a massa de rendimento ÷ os ocupados (Censo 2022).") }),
    F("unemployment", tr("Desocupação"), "pct", { unit: tr("desocupados ÷ força de trabalho"), higher_is: "bad", source: "ibge_censo2022", group: tr("Prosperidade"), lens: "unemployment", description: tr("Pessoas de 14 anos ou mais desocupadas ÷ a força de trabalho, na semana de referência do Censo 2022.") }),
    F("sewer", tr("Esgoto na rede"), "pct", { unit: tr("dos domicílios"), higher_is: "good", source: "ibge_censo2022", group: tr("Prosperidade"), lens: "sewer", description: tr("Domicílios ligados à rede geral de esgoto ou pluvial (Censo 2022, tabela 6805).") }),
    F("water", tr("Água da rede"), "pct", { unit: tr("dos domicílios"), higher_is: "good", source: "ibge_censo2022", group: tr("Prosperidade"), lens: "water", description: tr("Domicílios ligados à rede geral de água e que a usam como forma principal (Censo 2022, tabela 6803).") }),
    F("literacy", city ? tr("Alfabetização ≈") : tr("Alfabetização"), "pct", { unit: tr("das pessoas de 15 anos ou mais"), higher_is: "good", source: "ibge_censo2022", group: tr("Conhecimento"), lens: "literacy", description: tr("Taxa de alfabetização das pessoas de 15 anos ou mais (Censo 2022, tabela 9543).{0}", mean(city)) }),
    F("degrees", tr("Ensino superior"), "pct", { unit: tr("dos adultos de 25 anos ou mais"), higher_is: "good", source: "ibge_censo2022", group: tr("Conhecimento"), lens: "degrees", description: tr("Adultos de 25 anos ou mais com superior completo (Censo 2022, tabela 10061).") }),
    F("science_share", tr("Empregos de Ciência"), "pct", { unit: tr("dos empregos formais"), source: "ibge_cempre", group: tr("Conhecimento"), description: tr("Empregos formais de Ciência (informação, pesquisa, atividades técnicas e educação superior) ÷ todos os empregos formais (CEMPRE 2024)."), derived: true }),
  ];

  const values = (o) => {
    const c = o.census || {};
    const sec = o.gdp_sectors || null;
    const secTotal = sec ? SECTOR_KEYS.reduce((a, k) => a + (sec[k] || 0), 0) : 0;
    return {
      population: o.population ?? null,
      growth: o.growth ?? null,
      density: c.density ?? null,
      area_km2: c.area_km2 ?? null,
      median_age: c.median_age ?? null,
      ageing: c.ageing ?? null,
      gdp: o.gdp ?? null,
      gdp_pc: ratio(o.gdp, o.population),
      ...Object.fromEntries(SECTOR_KEYS.map((k) => [`sec_${k}`, sec && secTotal > 0 ? sec[k] / secTotal : null])),
      employed: o.employed ?? null,
      ...Object.fromEntries((nation.yields || []).filter((y) => y.key !== "gold").map((y) => [`y_${y.key}`, o.yields?.[y.key] ?? null])),
      median_income: o.median_income ?? null,
      unemployment: o.unemployment ?? null,
      sewer: c.sewer ?? null,
      water: c.water ?? null,
      literacy: c.literacy ?? null,
      degrees: c.degrees ?? null,
      science_share: ratio(o.yields?.science, o.employed),
    };
  };

  // --- resources by city ----------------------------------------------------------------------------------------
  const items = resources?.items || [];
  const typeById = new Map((resources?.types || []).map((t) => [t.id, t]));
  const mwByCell = new Map();
  for (const it of items) if (typeById.get(it.type)?.unit === "MW" && fin(it.value) && it.cell != null) mwByCell.set(it.cell, (mwByCell.get(it.cell) || 0) + it.value);
  const mwOf = (c) => (c.footprint || [c.cell]).reduce((a, cell) => a + (mwByCell.get(cell) || 0), 0);

  // --- states ---------------------------------------------------------------------------------------------------
  const stateRows = (Array.isArray(states) ? states : []).map((s, idx) => ({
    key: s.abbr, name: s.name, sub: s.abbr, level: "states", ref: idx,
    v: {
      name: s.name, abbr: s.abbr, ...values(s),
      ...Object.fromEntries(LAND_KEYS.map((k) => [`land_${k}`, s.land?.[k] ?? null])),
      energy_mw: s.energy ? s.energy.total : null,
    },
  }));
  const landFields = LAND_KEYS.map((k) => F(`land_${k}`, LAND_LABEL[k], "pct", { unit: tr("da terra"), source: "worldcover", group: tr("Terra"), description: tr("Parcela da terra em {0} (ESA WorldCover 2021, média dos hexágonos do estado).", LAND_LABEL[k].toLowerCase()), lens: k === "forest" ? "forest" : k === "crop" ? "farmland" : k === "developed" ? "developed" : null }));
  const energyField = (city) => F("energy_mw", tr("Potência mapeada"), "mw", { unit: tr("MW das usinas do mapa"), source: "aneel_siga", group: tr("Energia"), description: tr("Potência das usinas mapeadas como recursos (cada tipo acima do seu porte mínimo){0}: não é toda a capacidade instalada.", city ? tr(" nos hexágonos da cidade") : "") });
  const states_ = makeLevel({
    id: "states", label: tr("Estados"), noun: tr("estado"),
    rows: stateRows,
    fields: [F("name", tr("Estado"), "text", { group: tr("Nome") }), ...fields(false), ...landFields, energyField(false)],
    highlight: (rows) => ({ states: new Set(rows.map((r) => r.ref)) }),
    rowAtCell: (cell) => (owner[cell] >= 0 ? stateRows[owner[cell]] || null : null),
    focus: (row) => app.selectState(row.ref, { fly: true }),
    cellsOf: (row) => stateCells.get(row.ref) || [],
  });

  // --- cities ---------------------------------------------------------------------------------------------------
  const metroRows = cities.map((c) => ({
    key: c.id, name: c.name, sub: (c.states || []).join("–"), level: "metros", ref: c,
    v: {
      name: c.name, states: (c.states || []).join("–"), kind: (c.counties || []).length > 1 ? tr("Arranjo") : tr("Município"),
      members: (c.counties || []).length, ...values(c), energy_mw: mwOf(c),
    },
  }));
  const metroByCity = new Map(metroRows.map((r) => [r.ref, r]));
  const metros = makeLevel({
    id: "metros", label: tr("Cidades"), noun: tr("cidade"),
    rows: metroRows,
    fields: [
      F("name", tr("Cidade"), "text", { group: tr("Nome") }), F("states", tr("Estados"), "text", { group: tr("Nome") }),
      F("kind", tr("Tipo"), "text", { group: tr("Nome"), description: tr("Arranjo populacional do IBGE (municípios integrados pelo deslocamento ou pela mancha urbana) ou município isolado de 50 mil habitantes ou mais.") }),
      F("members", tr("Municípios"), "int", { group: tr("Nome"), source: "ibge_arranjos", description: tr("Quantos municípios formam a cidade.") }),
      ...fields(true), energyField(true),
    ],
    highlight: (rows, o = {}) => {
      const cells = new Set();
      for (const r of rows) for (const c of r.ref.footprint || [r.ref.cell]) cells.add(c);
      return { cells, cities: rows.length <= (o.ringMax ?? 30) ? new Set(rows.map((r) => r.key)) : undefined };
    },
    rowAtCell: (cell) => { const c = cellMetro.get(cell); return c ? metroByCity.get(c) : null; },
    focus: (row) => app.selectCity(row.ref, { fly: true }),
    cellsOf: (row) => row.ref.footprint || [row.ref.cell],
  });

  return {
    app, nation, nat, vintage, gdpVintage, sectorYear,
    levels: { states: states_, metros },
    stateCells, cellMetro, metroByCity,
    items, typeById,
    source: (id) => srcTitle.get(id) || null,
  };
}

function makeLevel(def) {
  const fieldByKey = new Map(def.fields.map((f) => [f.key, f]));
  const byKey = new Map(def.rows.map((r) => [r.key, r]));
  return {
    ...def,
    byKey,
    field: (k) => fieldByKey.get(k) || null,
    value: (row, k) => row.v[k] ?? null,
    numericFields: () => def.fields.filter((f) => f.format !== "text"),
    /** Add fields after the fact (optional files that load on demand); a key already present is skipped. */
    addFields(list) {
      for (const f of list) {
        if (fieldByKey.has(f.key)) continue;
        def.fields.push(f);
        fieldByKey.set(f.key, f);
      }
    },
  };
}

// --- fields from files that load on demand ------------------------------------------------------------------------
// extendData(data, names) loads the named files (districts, citizens) through app.loadData and adds their columns to
// the levels once per data model. Missing files (null) add nothing. Returns the loaded files by name.
const F4 = (key, label, format, o = {}) => ({ key, label, format, unit: o.unit || null, higher_is: o.higher_is || "neutral", source: o.source || "", description: o.description || "", lens: o.lens || null, group: o.group || tr("Outros"), derived: !!o.derived });

export async function extendData(data, names) {
  const app = data.app;
  const files = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await app.loadData(n).catch(() => null)])));
  data.extended ??= new Set();
  for (const n of names) {
    if (data.extended.has(n) || !files[n]) continue;
    data.extended.add(n);
    try {
      if (n === "districts") extendDistricts(data, files[n]);
      if (n === "citizens") extendCitizens(data, files[n]);
    } catch (err) {
      console.error(`advisors: could not add the ${n} columns`, err);
    }
  }
  return files;
}

function extendDistricts(data, d) {
  const { metros } = data.levels;
  const cat = new Map((d.catalog || []).map((c) => [c.id, c]));
  const vint = d.vintage || "CEMPRE";
  const lb = (x) => (x?.lower_bound ? tr(" (no mínimo)") : "");
  metros.addFields([
    F4("city_type", tr("Tipo de cidade"), "text", { source: "ibge_cempre", group: tr("Distritos"), description: tr("O título da cidade: o nome do seu distrito mais forte, ou da especialidade dele quando ela passa a regra ({0}). Em branco: nenhum distrito passa (economia diversificada).", vint) }),
    F4("districts", tr("Distritos"), "text", { source: "ibge_cempre", group: tr("Distritos"), description: tr("Os distritos que a cidade tem, do mais forte ao mais fraco. {0}", d.rule?.text || "") }),
    F4("n_districts", tr("Número de distritos"), "int", { source: "ibge_cempre", group: tr("Distritos"), description: tr("Quantos distritos passam a regra (até 5).") }),
    F4("top_industry", tr("Atividade mais especializada"), "text", { source: "ibge_cempre", group: tr("Distritos"), description: tr("A atividade (CNAE) com o maior quociente locacional e pelo menos 1.000 empregos formais.") }),
    F4("top_lq", tr("O quociente dela"), "lq", { unit: tr("× a parcela nacional dos empregos"), source: "ibge_cempre", group: tr("Distritos"), description: tr("Quociente locacional da atividade mais especializada: a parcela dela nos empregos da cidade ÷ a parcela no Brasil. É um piso quando o IBGE suprime algum município.") }),
  ]);
  for (const r of metros.rows) {
    const c = d.cities?.[r.key];
    const top = c?.top?.[0];
    Object.assign(r.v, {
      city_type: c?.badge?.label ?? null,
      districts: c ? (c.districts || []).map((x) => cat.get(x.id)?.name || x.id).join(", ") || null : null,
      n_districts: c ? (c.districts || []).length : null,
      top_industry: top ? `${d.industries?.[top.naics]?.title || top.naics}${lb(top)}` : null,
      top_lq: top?.lq ?? null,
    });
  }
}

// Citizens: a few telling shares of each Census row (the City View draws the whole mix as person icons).
const CZ = [
  ["workforce", "executive"], ["workforce", "engineer"], ["workforce", "healer"], ["workforce", "service"],
  ["workforce", "farmer"], ["workforce", "builder"], ["workforce", "maker"],
  ["age", "child"], ["age", "young"], ["age", "elder"],
  ["commute", "drove_alone"], ["commute", "transit"], ["commute", "walk"], ["commute", "other"],
];
function extendCitizens(data, cz) {
  const { metros } = data.levels;
  const vint = cz.vintage || tr("Censo 2022");
  const label = new Map(Object.entries(cz.groups || {}).flatMap(([row, list]) => list.map((g) => [`${row}.${g.key}`, g.label])));
  const rowDesc = cz.rows || {};
  const grp = { workforce: tr("Cidadãos: trabalho"), age: tr("Cidadãos: idade"), commute: tr("Cidadãos: deslocamento"), education: tr("Cidadãos: instrução") };
  metros.addFields([
    ...CZ.map(([row, key]) => F4(`cz_${key}`, label.get(`${row}.${key}`) || key, "pct", {
      unit: tr("da linha"), source: "ibge_citizens", group: grp[row],
      description: tr("{0}: parcela de {1} ({2}). Em branco quando algum município da cidade não tem o dado.", label.get(`${row}.${key}`) || key, String(rowDesc[row] || row).toLowerCase(), vint),
    })),
    F4("cz_specialist", tr("Cidadão mais acima do Brasil"), "text", { source: "ibge_citizens", group: tr("Cidadãos"), description: tr("A categoria com a maior parcela acima da do Brasil (pelo menos 1,5 vez). {0}", cz.rule?.text || "") }),
  ]);
  for (const r of metros.rows) {
    const c = cz.cities?.[r.key];
    for (const [row, key] of CZ) r.v[`cz_${key}`] = c?.[row]?.shares?.[key] ?? null;
    const sp = (c?.specialists || []).find((s) => s.ratio >= 1);
    r.v.cz_specialist = sp ? `${label.get(`${sp.row}.${sp.key}`) || sp.key} ×${sp.ratio.toFixed(1).replace(".", DEC)}` : null;
  }
}

/** The highlight for a set of rows of one level, with defaults (gold outline, other land dimmed when asked). */
export function rowsHighlight(level, rows, opts = {}) {
  if (!level || !rows || !rows.length) return null;
  const one = rows.length === 1 ? rows[0] : null;
  const label = opts.label ?? (one ? (one.level === "states" ? one.name : `${one.full || one.name}${one.sub ? `, ${one.sub}` : ""}`) : "");
  return { ...level.highlight(rows, opts), dimOthers: !!opts.dim, color: opts.color, label };
}
