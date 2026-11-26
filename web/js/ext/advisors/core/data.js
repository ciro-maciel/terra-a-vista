// The advisors' data model: two "levels" (states, cities) of rows with typed fields, plus the links between rows and
// the hex map (row → highlight, cell → row). Built once from app.data.
//
//   level = {id, label, noun, rows: [row], fields: [field], field(key), value(row, key),
//            highlight(rows, opts) → app.state.highlight, rowAtCell(cell) → row | null, focus(row), byKey: Map}
//   row   = {key, name, sub, level, ref, v: {fieldKey: value}}
//   field = {key, label, format, unit, higher_is, source, description, lens?, group, derived?}
// Labels and descriptions are what a person reads, so they are in Portuguese.
import { fin, ratio } from "./util.js";

// WorldCover has no pasture class (pastures count as grassland), so Brazil has no "pasture" key here.
const LAND_KEYS = ["forest", "crop", "grass", "shrub", "wetland", "developed"];
export const LAND_LABEL = {
  forest: "Floresta", crop: "Lavoura", pasture: "Pasto", grass: "Campo e pasto", shrub: "Arbustos e caatinga", wetland: "Área úmida", developed: "Área construída",
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
  const vintage = nation.vintage || "Censo 2022";
  const gdpVintage = nation.gdp_vintage || "IBGE, PIB dos Municípios";
  const sectorYear = nation.gdp_sectors_year || "";
  const yrs = (nat.growth_years || []).join(" a ");

  // --- fields ---------------------------------------------------------------------------------------------------
  const F = (key, label, format, o = {}) => ({ key, label, format, unit: o.unit || null, higher_is: o.higher_is || "neutral", source: o.source || "", description: o.description || "", lens: o.lens || null, group: o.group || "Economia", derived: !!o.derived });
  const mean = (city) => (city ? " Na cidade, média dos municípios ponderada pela população (aproximação: o IBGE publica só a taxa de cada município)." : "");
  const fields = (city) => [
    F("population", "População", "int", { unit: "pessoas", source: "ibge_census", group: "Pessoas", description: `Moradores contados pelo Censo 2022${city ? ", somados os municípios da cidade" : ""}.` }),
    F("growth", "Crescimento", "signed", { unit: "variação da população", source: "ibge_estimates", group: "Pessoas", description: `Variação da população de ${yrs} pelas estimativas do IBGE, mesmos limites nos dois anos.` }),
    F("density", "Densidade", "float", { unit: "habitantes por km²", source: "ibge_censo2022", group: "Pessoas", lens: "density", description: "População do Censo 2022 ÷ área territorial (IBGE).", derived: true }),
    F("area_km2", "Área", "km2", { unit: "km²", source: "ibge_censo2022", group: "Pessoas", description: "Área territorial oficial (IBGE, tabela 4714)." }),
    F("median_age", city ? "Idade mediana ≈" : "Idade mediana", "years", { unit: "anos", source: "ibge_censo2022", group: "Pessoas", lens: "age", description: `Idade mediana dos moradores (Censo 2022, tabela 9515).${mean(city)}` }),
    F("ageing", city ? "Envelhecimento ≈" : "Envelhecimento", "float", { unit: "idosos por 100 jovens", source: "ibge_censo2022", group: "Pessoas", lens: "ageing", description: `Pessoas de 65 anos ou mais para cada 100 de até 14 anos (Censo 2022).${mean(city)}` }),
    F("gdp", "PIB", "money", { unit: "R$ por ano", source: "ibge_gdp", description: `${gdpVintage}: PIB a preços correntes, contado onde a produção acontece.` }),
    F("gdp_pc", "PIB por habitante", "usd", { unit: "R$ por habitante", higher_is: "good", source: "ibge_gdp", lens: "gdp_pc", description: "PIB de 2023 ÷ população do Censo 2022.", derived: true }),
    ...SECTOR_KEYS.map((k) => F(`sec_${k}`, `${nation.gdp_sectors?.[k] || k} no PIB`, "pct", { unit: `do PIB de ${sectorYear}`, source: "ibge_gdp_sectors", description: `Parcela do PIB de ${sectorYear} que vem ${k === "taxes" ? "dos impostos líquidos sobre produtos" : `do valor adicionado de ${String(nation.gdp_sectors?.[k] || k).toLowerCase()}`} (o SIDRA publica os setores dois anos atrás do PIB).` })),
    F("employed", "Empregos formais", "int", { unit: "empregos assalariados", source: "ibge_cempre", description: "Pessoal assalariado das empresas e órgãos, contado onde fica o empregador (IBGE, CEMPRE 2024). O trabalho informal fica de fora." }),
    ...(nation.yields || []).filter((y) => y.key !== "gold").map((y) => F(`y_${y.key}`, `${y.label} (empregos)`, "int", { unit: "empregos formais", source: "ibge_cempre", group: "Rendimentos", description: y.description })),
    F("median_income", "Renda do trabalho", "usd", { unit: "R$ por mês, por ocupado", higher_is: "good", source: "ibge_censo2022", group: "Prosperidade", lens: "income", description: "Rendimento médio mensal de todos os trabalhos por pessoa ocupada, formal ou informal: a massa de rendimento ÷ os ocupados (Censo 2022)." }),
    F("unemployment", "Desocupação", "pct", { unit: "desocupados ÷ força de trabalho", higher_is: "bad", source: "ibge_censo2022", group: "Prosperidade", lens: "unemployment", description: "Pessoas de 14 anos ou mais desocupadas ÷ a força de trabalho, na semana de referência do Censo 2022." }),
    F("sewer", "Esgoto na rede", "pct", { unit: "dos domicílios", higher_is: "good", source: "ibge_censo2022", group: "Prosperidade", lens: "sewer", description: "Domicílios ligados à rede geral de esgoto ou pluvial (Censo 2022, tabela 6805)." }),
    F("water", "Água da rede", "pct", { unit: "dos domicílios", higher_is: "good", source: "ibge_censo2022", group: "Prosperidade", lens: "water", description: "Domicílios ligados à rede geral de água e que a usam como forma principal (Censo 2022, tabela 6803)." }),
    F("literacy", city ? "Alfabetização ≈" : "Alfabetização", "pct", { unit: "das pessoas de 15 anos ou mais", higher_is: "good", source: "ibge_censo2022", group: "Conhecimento", lens: "literacy", description: `Taxa de alfabetização das pessoas de 15 anos ou mais (Censo 2022, tabela 9543).${mean(city)}` }),
    F("degrees", "Ensino superior", "pct", { unit: "dos adultos de 25 anos ou mais", higher_is: "good", source: "ibge_censo2022", group: "Conhecimento", lens: "degrees", description: "Adultos de 25 anos ou mais com superior completo (Censo 2022, tabela 10061)." }),
    F("science_share", "Empregos de Ciência", "pct", { unit: "dos empregos formais", source: "ibge_cempre", group: "Conhecimento", description: "Empregos formais de Ciência (informação, pesquisa, atividades técnicas e educação superior) ÷ todos os empregos formais (CEMPRE 2024).", derived: true }),
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
  const landFields = LAND_KEYS.map((k) => F(`land_${k}`, LAND_LABEL[k], "pct", { unit: "da terra", source: "worldcover", group: "Terra", description: `Parcela da terra em ${LAND_LABEL[k].toLowerCase()} (ESA WorldCover 2021, média dos hexágonos do estado).`, lens: k === "forest" ? "forest" : k === "crop" ? "farmland" : k === "developed" ? "developed" : null }));
  const energyField = (city) => F("energy_mw", "Potência mapeada", "mw", { unit: "MW das usinas do mapa", source: "aneel_siga", group: "Energia", description: `Potência das usinas mapeadas como recursos (cada tipo acima do seu porte mínimo)${city ? " nos hexágonos da cidade" : ""}: não é toda a capacidade instalada.` });
  const states_ = makeLevel({
    id: "states", label: "Estados", noun: "estado",
    rows: stateRows,
    fields: [F("name", "Estado", "text", { group: "Nome" }), ...fields(false), ...landFields, energyField(false)],
    highlight: (rows) => ({ states: new Set(rows.map((r) => r.ref)) }),
    rowAtCell: (cell) => (owner[cell] >= 0 ? stateRows[owner[cell]] || null : null),
    focus: (row) => app.selectState(row.ref, { fly: true }),
    cellsOf: (row) => stateCells.get(row.ref) || [],
  });

  // --- cities ---------------------------------------------------------------------------------------------------
  const metroRows = cities.map((c) => ({
    key: c.id, name: c.name, sub: (c.states || []).join("–"), level: "metros", ref: c,
    v: {
      name: c.name, states: (c.states || []).join("–"), kind: (c.counties || []).length > 1 ? "Arranjo" : "Município",
      members: (c.counties || []).length, ...values(c), energy_mw: mwOf(c),
    },
  }));
  const metroByCity = new Map(metroRows.map((r) => [r.ref, r]));
  const metros = makeLevel({
    id: "metros", label: "Cidades", noun: "cidade",
    rows: metroRows,
    fields: [
      F("name", "Cidade", "text", { group: "Nome" }), F("states", "Estados", "text", { group: "Nome" }),
      F("kind", "Tipo", "text", { group: "Nome", description: "Arranjo populacional do IBGE (municípios integrados pelo deslocamento ou pela mancha urbana) ou município isolado de 50 mil habitantes ou mais." }),
      F("members", "Municípios", "int", { group: "Nome", source: "ibge_arranjos", description: "Quantos municípios formam a cidade." }),
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
const F4 = (key, label, format, o = {}) => ({ key, label, format, unit: o.unit || null, higher_is: o.higher_is || "neutral", source: o.source || "", description: o.description || "", lens: o.lens || null, group: o.group || "Outros", derived: !!o.derived });

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
  const lb = (x) => (x?.lower_bound ? " (no mínimo)" : "");
  metros.addFields([
    F4("city_type", "Tipo de cidade", "text", { source: "ibge_cempre", group: "Distritos", description: `O título da cidade: o nome do seu distrito mais forte, ou da especialidade dele quando ela passa a regra (${vint}). Em branco: nenhum distrito passa (economia diversificada).` }),
    F4("districts", "Distritos", "text", { source: "ibge_cempre", group: "Distritos", description: `Os distritos que a cidade tem, do mais forte ao mais fraco. ${d.rule?.text || ""}` }),
    F4("n_districts", "Número de distritos", "int", { source: "ibge_cempre", group: "Distritos", description: "Quantos distritos passam a regra (até 5)." }),
    F4("top_industry", "Atividade mais especializada", "text", { source: "ibge_cempre", group: "Distritos", description: "A atividade (CNAE) com o maior quociente locacional e pelo menos 1.000 empregos formais." }),
    F4("top_lq", "O quociente dela", "lq", { unit: "× a parcela nacional dos empregos", source: "ibge_cempre", group: "Distritos", description: "Quociente locacional da atividade mais especializada: a parcela dela nos empregos da cidade ÷ a parcela no Brasil. É um piso quando o IBGE suprime algum município." }),
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
  const vint = cz.vintage || "Censo 2022";
  const label = new Map(Object.entries(cz.groups || {}).flatMap(([row, list]) => list.map((g) => [`${row}.${g.key}`, g.label])));
  const rowDesc = cz.rows || {};
  const grp = { workforce: "Cidadãos: trabalho", age: "Cidadãos: idade", commute: "Cidadãos: deslocamento", education: "Cidadãos: instrução" };
  metros.addFields([
    ...CZ.map(([row, key]) => F4(`cz_${key}`, label.get(`${row}.${key}`) || key, "pct", {
      unit: "da linha", source: "ibge_citizens", group: grp[row],
      description: `${label.get(`${row}.${key}`) || key}: parcela de ${String(rowDesc[row] || row).toLowerCase()} (${vint}). Em branco quando algum município da cidade não tem o dado.`,
    })),
    F4("cz_specialist", "Cidadão mais acima do Brasil", "text", { source: "ibge_citizens", group: "Cidadãos", description: `A categoria com a maior parcela acima da do Brasil (pelo menos 1,5 vez). ${cz.rule?.text || ""}` }),
  ]);
  for (const r of metros.rows) {
    const c = cz.cities?.[r.key];
    for (const [row, key] of CZ) r.v[`cz_${key}`] = c?.[row]?.shares?.[key] ?? null;
    const sp = (c?.specialists || []).find((s) => s.ratio >= 1);
    r.v.cz_specialist = sp ? `${label.get(`${sp.row}.${sp.key}`) || sp.key} ×${sp.ratio.toFixed(1).replace(".", ",")}` : null;
  }
}

/** The highlight for a set of rows of one level, with defaults (gold outline, other land dimmed when asked). */
export function rowsHighlight(level, rows, opts = {}) {
  if (!level || !rows || !rows.length) return null;
  const one = rows.length === 1 ? rows[0] : null;
  const label = opts.label ?? (one ? (one.level === "states" ? one.name : `${one.full || one.name}${one.sub ? `, ${one.sub}` : ""}`) : "");
  return { ...level.highlight(rows, opts), dimOthers: !!opts.dim, color: opts.color, label };
}
