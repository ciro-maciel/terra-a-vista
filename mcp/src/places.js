// Places: find a municipality, a city (an IBGE population arrangement or a big town) or a state, and read its
// numbers from the map's data. Pure functions over the loaded files (data.js), so the tests feed them fixtures.

import { SERIES } from './data.js'

export const LEVELS = ['municipality', 'city', 'state']

/** Lowercase, no accents, no punctuation: "Pau D'Arco" = "pau darco". */
export const plain = value =>
    String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

/** Indexes built once per set of files. */
export function indexOf(d) {
    if (d.__index) return d.__index
    const munis = d.history.munis // code → [name, uf, pop2022, gdp R$ mil, estimate first, estimate last]
    const counties = d.world.counties.map(c => String(c.geoid))
    const position = new Map(counties.map((code, k) => [code, k]))
    const cityOf = new Map() // municipality code → the city that holds it
    for (const c of d.cities) for (const code of c.counties || []) if (!cityOf.has(code)) cityOf.set(code, c)
    const byName = new Map() // plain name → [{level, key}]
    const add = (name, level, key) => {
        const k = plain(name)
        if (!byName.has(k)) byName.set(k, [])
        byName.get(k).push({ level, key })
    }
    for (const [code, m] of Object.entries(munis)) add(m[0], 'municipality', code)
    for (const c of d.cities) add(c.name, 'city', c.id)
    for (const s of d.states) {
        add(s.name, 'state', s.abbr)
        add(s.abbr, 'state', s.abbr)
    }
    const stateByAbbr = new Map(d.states.map(s => [s.abbr, s]))
    const cityById = new Map(d.cities.map(c => [c.id, c]))
    d.__index = { munis, counties, position, cityOf, byName, stateByAbbr, cityById }
    return d.__index
}

/** A place handle: {level, key, name, uf}. */
function handle(d, level, key) {
    const ix = indexOf(d)
    if (level === 'state') {
        const s = ix.stateByAbbr.get(key)
        return s && { level, key, name: s.name, uf: s.abbr }
    }
    if (level === 'city') {
        const c = ix.cityById.get(key)
        return c && { level, key, name: c.name, uf: (c.states || [])[0] || null, municipalities: (c.counties || []).length }
    }
    const m = ix.munis[key]
    return m && { level, key, name: m[0], uf: m[1] }
}

/**
 * Resolve what a person typed: an IBGE code (7 digits a municipality, 2 letters a state), or a name, optionally with
 * its state ("Sinop (MT)", "Sinop - MT", or the `uf` argument). Returns {place} or {candidates} or {error}.
 */
export function resolve(d, query, { level = null, uf = null } = {}) {
    const ix = indexOf(d)
    let q = String(query ?? '').trim()
    if (!q) return { error: 'Diga o lugar: o nome, o código IBGE do município (7 dígitos) ou a sigla do estado.' }
    if (/^\d{7}$/.test(q)) {
        if (level === 'city') {
            const c = ix.cityOf.get(q)
            return c ? { place: handle(d, 'city', c.id) } : { error: `O município ${q} não pertence a nenhuma cidade do mapa.` }
        }
        const p = handle(d, 'municipality', q)
        return p ? { place: p } : { error: `Não há município com o código IBGE ${q}.` }
    }
    if (/^\d{8}$/.test(q.replace(/\D/g, '')) && /\d{5}-?\d{3}/.test(q)) return { error: 'Isso parece um CEP. Use o conector CNPJ e CEP para achar o código IBGE do município e pergunte com ele.' }
    const m = q.match(/^(.*?)\s*(?:\(|-|,|\/)\s*([A-Za-z]{2})\)?\s*$/)
    if (m) {
        q = m[1]
        uf = uf || m[2].toUpperCase()
    }
    if (/^[A-Za-z]{2}$/.test(q) && ix.stateByAbbr.has(q.toUpperCase())) return { place: handle(d, 'state', q.toUpperCase()) }
    let hits = (ix.byName.get(plain(q)) || []).map(h => handle(d, h.level, h.key)).filter(Boolean)
    if (uf) hits = hits.filter(h => h.uf === String(uf).toUpperCase())
    if (level) hits = hits.filter(h => h.level === level)
    // A city and its principal municipality share the name: the city (the whole urban area) comes first.
    hits.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level))
    const states = new Set(hits.filter(h => h.level !== 'state').map(h => h.uf))
    if (!hits.length) return { error: `Não achei "${query}". Confira a grafia, ou use o código IBGE do município.` }
    if (states.size > 1 && !uf) return { candidates: dedupe(hits) }
    return { place: hits[0], others: dedupe(hits.slice(1)) }
}

const dedupe = list => {
    const seen = new Set()
    return list.filter(p => !seen.has(`${p.level}:${p.key}`) && seen.add(`${p.level}:${p.key}`))
}

// --- measures -----------------------------------------------------------------------------------------------------

const ratio = (a, b) => (a == null || !b ? null : a / b)
const last = arr => (Array.isArray(arr) ? arr[arr.length - 1] : null)

/** A series' value list for a place (municipality by world.json position, else city or state). */
function seriesValues(d, theme, metric, p) {
    const s = d[`series_${theme}`]
    if (!s) return null
    if (p.level === 'municipality') {
        const k = indexOf(d).position.get(p.key)
        const m = s.metrics.find(x => x.id === metric)
        const row = k == null ? null : s.munis[metric]?.[k]
        return row ? row.map(v => (v == null ? null : v / (m?.muni_div || 1))) : null
    }
    const blob = p.level === 'city' ? s.cities[p.key] : s.states[p.key]
    return blob?.[metric] || null
}

/** The comparable first year of a series for this place: borders settled and the data complete. */
function baseIndex(s, values, level) {
    const first = values.findIndex(v => v != null)
    let from = s.compare_from || 0
    if (level === 'municipality' && s.fixed_borders === false && s.stable_from) from = Math.max(from, s.stable_from)
    const k = from ? s.years.findIndex(y => y >= from) : 0
    return Math.max(first, k)
}

/**
 * Every measure the tools know: id → {name, unit, levels, value(d, p), year}. Series measures are
 * "<theme>.<metric>" (the latest year) and "<theme>.<metric>.change" (since the first comparable year).
 */
export function measures(d) {
    if (d.__measures) return d.__measures
    const ix = indexOf(d)
    const city = p => ix.cityById.get(p.key)
    const state = p => ix.stateByAbbr.get(p.key)
    const muni = p => ix.munis[p.key]
    const exp = p => (p.level === 'municipality' ? (d.exports.munis[p.key] || [null])[0] : (p.level === 'city' ? d.exports.cities[p.key] : d.exports.states[p.key])?.fob ?? null)
    const fin = p => {
        if (p.level === 'municipality') {
            const r = d.finances.munis[p.key]
            return r ? Object.fromEntries(d.finances.keys.map((k, i) => [k, r[i]])) : null
        }
        return (p.level === 'city' ? d.finances.cities[p.key] : d.finances.states[p.key]) || null
    }
    const pop = p => (p.level === 'municipality' ? muni(p)?.[2] : (p.level === 'city' ? city(p) : state(p))?.population) ?? null
    const out = {
        population: { name: 'População', unit: 'pessoas, Censo 2022', levels: LEVELS, value: (d2, p) => pop(p) },
        growth: {
            name: 'Crescimento', unit: 'de 2024 a 2026, estimativas do IBGE', levels: LEVELS, format: 'pct',
            value: (d2, p) => (p.level === 'municipality' ? (muni(p)?.[4] && muni(p)?.[5] ? muni(p)[5] / muni(p)[4] - 1 : null) : (p.level === 'city' ? city(p) : state(p))?.growth ?? null),
        },
        gdp: { name: 'PIB', unit: 'R$ por ano, 2023', levels: LEVELS, value: (d2, p) => (p.level === 'municipality' ? (muni(p)?.[3] == null ? null : muni(p)[3] * 1000) : (p.level === 'city' ? city(p) : state(p))?.gdp ?? null) },
        gdp_per_capita: { name: 'PIB por habitante', unit: 'R$ por ano', levels: LEVELS, value: (d2, p) => ratio(out.gdp.value(d2, p), pop(p)) },
        income: { name: 'Renda do trabalho', unit: 'R$ por mês, por ocupado (Censo 2022)', levels: ['city', 'state'], value: (d2, p) => (p.level === 'city' ? city(p) : state(p))?.median_income ?? null },
        unemployment: { name: 'Desocupação', unit: 'da força de trabalho (Censo 2022)', levels: ['city', 'state'], format: 'pct', value: (d2, p) => (p.level === 'city' ? city(p) : state(p))?.unemployment ?? null },
        exports: { name: 'Exportação', unit: `US$ FOB, ${d.exports.year}, pelo município da empresa exportadora`, levels: LEVELS, value: (d2, p) => exp(p) },
        exports_per_capita: { name: 'Exportação por habitante', unit: `US$ por habitante, ${d.exports.year}`, levels: LEVELS, value: (d2, p) => ratio(exp(p), pop(p)) },
        revenue_per_capita: { name: 'Receita da prefeitura por habitante', unit: `R$ por habitante, ${d.finances.year}`, levels: LEVELS, value: (d2, p) => ratio(fin(p)?.total, pop(p)) },
        own_revenue_share: { name: 'Dinheiro próprio da prefeitura', unit: 'da receita: impostos e taxas locais', levels: LEVELS, format: 'pct', value: (d2, p) => ratio(fin(p)?.own, fin(p)?.total) },
        fpm_share: { name: 'Peso do FPM', unit: 'da receita da prefeitura', levels: LEVELS, format: 'pct', value: (d2, p) => ratio(fin(p)?.fpm, fin(p)?.total) },
        royalties_share: { name: 'Peso dos royalties', unit: 'da receita da prefeitura', levels: LEVELS, format: 'pct', value: (d2, p) => ratio(fin(p)?.royalties, fin(p)?.total) },
    }
    for (const theme of SERIES) {
        const s = d[`series_${theme}`]
        if (!s) continue
        for (const m of s.metrics) {
            const id = `${theme}.${m.id}`
            const year = last(s.years)
            out[id] = { name: `${m.name} (${s.name})`, unit: `${m.unit}, ${year}`, levels: LEVELS, format: m.format, theme, value: (d2, p) => last(seriesValues(d2, theme, m.id, p)) }
            out[`${id}.change`] = {
                name: `Mudança: ${m.name} (${s.name})`, unit: m.format === 'pct' ? 'pontos percentuais' : m.unit, levels: LEVELS, format: m.format === 'pct' ? 'pp' : m.format, theme,
                value: (d2, p) => {
                    const v = seriesValues(d2, theme, m.id, p)
                    if (!v) return null
                    const k = baseIndex(s, v, p.level)
                    return k < 0 || v[k] == null || last(v) == null || k === v.length - 1 ? null : last(v) - v[k]
                },
            }
        }
    }
    d.__measures = out
    return out
}

// --- the tools' answers ---------------------------------------------------------------------------------------------

const round = (v, digits = 4) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits)

/** Every place of a level, as handles. */
export function allOf(d, level) {
    const ix = indexOf(d)
    if (level === 'state') return d.states.map(s => handle(d, 'state', s.abbr))
    if (level === 'city') return d.cities.map(c => handle(d, 'city', c.id))
    return Object.keys(ix.munis).map(code => handle(d, 'municipality', code))
}

/** The portrait of one place: the headline numbers and one value per measure, with the year and the rule. */
export function profile(d, p) {
    const ms = measures(d)
    const ix = indexOf(d)
    const values = {}
    for (const [id, m] of Object.entries(ms)) {
        if (!m.levels.includes(p.level) || id.endsWith('.change')) continue
        const v = m.value(d, p)
        if (v != null) values[id] = { name: m.name, value: round(v), unit: m.unit }
    }
    const out = { place: p, values }
    if (p.level === 'municipality') {
        const c = ix.cityOf.get(p.key)
        if (c) out.city = { key: c.id, name: c.name, municipalities: (c.counties || []).length }
    }
    if (p.level === 'city') {
        const c = ix.cityById.get(p.key)
        const badge = d.districts?.cities?.[p.key]?.badge
        if (badge?.label) out.type = { label: badge.label, rule: badge.text }
        out.municipalities = (c.counties || []).map(code => ix.munis[code]?.[0]).filter(Boolean)
        if (c.gdp_sectors) out.gdpSectors = { year: d.nation.gdp_sectors_year, reais: c.gdp_sectors }
    }
    const ex = p.level === 'municipality' ? null : p.level === 'city' ? d.exports.cities[p.key] : d.exports.states[p.key]
    if (ex) out.exports = { year: d.exports.year, fob: ex.fob, buyers: ex.countries.slice(0, 5).map(([name, v]) => ({ name, fob: v })), products: ex.products.slice(0, 5).map(([k, v]) => ({ name: d.exports.products[k] || k, fob: v })) }
    if (p.level === 'state' && d.protected?.states?.[p.key]) {
        const s = d.protected.states[p.key]
        out.protectedAreas = { share: round(s.any / s.land), indigenous: round((s.ti || 0) / s.land), rule: d.protected.rule }
    }
    out.notes = notes(d)
    return out
}

/** The rules a careful answer repeats: what each family of numbers cannot show. */
export function notes(d) {
    return [
        'População do Censo 2022; crescimento de 2024 a 2026 pelas estimativas do IBGE (não compare estimativa com Censo).',
        `Exportação: ${d.exports.rule}`,
        `Prefeituras: ${d.finances.rule}`,
        'Cada série (terra, lavoura, saúde, escola, conexão, desastres, IDH) traz a sua regra na ferramenta place_trend.',
    ]
}

/** Filter and sort places of one level by any measures. */
export function find(d, { level = 'city', uf = null, population = null, filters = [], sort = 'population', order = 'desc', limit = 20 }) {
    const ms = measures(d)
    const sortM = ms[sort]
    if (!sortM) return { error: `Não conheço a medida "${sort}". A ferramenta guide lista todas.` }
    for (const f of filters) if (!ms[f.measure]) return { error: `Não conheço a medida "${f.measure}". A ferramenta guide lista todas.` }
    if (!sortM.levels.includes(level)) return { error: `A medida "${sort}" não existe no nível ${level}: só em ${sortM.levels.join(', ')}.` }
    const [pmin, pmax] = population || [null, null]
    const rows = []
    for (const p of allOf(d, level)) {
        if (uf && p.uf !== uf.toUpperCase()) continue
        const pop = ms.population.value(d, p)
        if (pmin != null && (pop == null || pop < pmin)) continue
        if (pmax != null && (pop == null || pop > pmax)) continue
        let ok = true
        const shown = {}
        for (const f of filters) {
            const v = ms[f.measure].value(d, p)
            if (v == null || (f.min != null && v < f.min) || (f.max != null && v > f.max)) {
                ok = false
                break
            }
            shown[f.measure] = round(v)
        }
        if (!ok) continue
        const v = sortM.value(d, p)
        if (v == null) continue
        rows.push({ place: p, population: pop, [sort]: round(v), ...shown })
    }
    rows.sort((a, b) => (order === 'asc' ? a[sort] - b[sort] : b[sort] - a[sort]))
    return { level, sort: { measure: sort, name: sortM.name, unit: sortM.unit, order }, total: rows.length, places: rows.slice(0, Math.min(50, limit)) }
}

/** Two to ten places side by side, with Brazil, over the given measures (or a default set). */
export const DEFAULT_COMPARE = ['population', 'growth', 'gdp_per_capita', 'income', 'exports_per_capita', 'own_revenue_share', 'school.early', 'health.infant', 'net.broadband', 'idhm.idhm']

export function compare(d, places, ids = DEFAULT_COMPARE) {
    const ms = measures(d)
    const rows = ids.filter(id => ms[id]).map(id => ({
        measure: id, name: ms[id].name, unit: ms[id].unit,
        values: places.map(p => (ms[id].levels.includes(p.level) ? round(ms[id].value(d, p)) : null)),
    }))
    return { places, rows }
}

export const THEMES = ['people', 'gdp', ...SERIES]

/** A theme through time for one place, with Brazil beside it. */
export function trend(d, p, theme) {
    if (theme === 'people' || theme === 'gdp') {
        const h = d.history
        const key = theme === 'people' ? 'p' : 'g'
        const years = theme === 'people' ? h.census_years : h.gdp_years
        let values = null
        if (p.level === 'city') values = h.cities[p.key]?.[key]
        else if (p.level === 'state') values = h.states[p.key]?.[key]
        else if (theme === 'people') return { error: 'A série de Censos por município sozinho não está nos dados publicados; peça a cidade (o arranjo) ou o estado.' }
        else return { error: 'O PIB no tempo está por cidade e por estado; peça a cidade ou o estado.' }
        return { place: p, theme, years, unit: theme === 'people' ? 'pessoas, Censos' : h.gdp_unit, values: values || null, brazil: h.nation[key], rule: h.rule }
    }
    const s = d[`series_${theme}`]
    if (!s) return { error: `Não conheço o tema "${theme}". Temas: ${THEMES.join(', ')}.` }
    const metrics = s.metrics.map(m => ({ id: m.id, name: m.name, unit: m.unit, values: seriesValues(d, theme, m.id, p)?.map(v => round(v)) ?? null, brazil: s.nation[m.id] }))
    return { place: p, theme, name: s.name, years: s.years, metrics, rule: s.rule, source: s.vintage }
}

/** The catalogue the guide tool shows. */
export function catalogue(d) {
    const ms = measures(d)
    return Object.entries(ms).map(([id, m]) => ({ id, name: m.name, unit: m.unit, levels: m.levels }))
}
