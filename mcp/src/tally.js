// The anonymous index: what Brazil asks the map, counted without knowing who asked.
//
// Only the structured arguments of a tool call become observations (a place's IBGE code, a measure, the shape of a
// search), never the conversation, which never reaches this server. Each observation is counted by "stamps": a hash
// of the connection with a key that lives for one week and is deleted when the week closes. A box is published only
// when at least MIN_PEOPLE different stamps fell in it, with a little noise on the count, and the raw stamps are
// deleted. The rules are tested in test/tally.test.js, which turns red if the minimum is lowered.

export const MIN_PEOPLE = 10
export const NOISE = 1.5 // scale of the Laplace noise added to each published count
export const MAX_STAMPS = 5000 // per box: beyond it the box passes the minimum anyway

/** ISO week of a date, "2026-W48". */
export function weekOf(date = new Date()) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    const day = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - day)
    const year = d.getUTCFullYear()
    const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7)
    return `${year}-W${String(week).padStart(2, '0')}`
}

const BANDS = [0, 20000, 50000, 100000, 250000, 1000000, Infinity]
const BAND_LABEL = ['até 20 mil', '20 a 50 mil', '50 a 100 mil', '100 a 250 mil', '250 mil a 1 milhão', 'mais de 1 milhão']

/** A population range as the bands it touches, so near searches fall in the same box: "50 a 100 mil–100 a 250 mil". */
export function band(range) {
    if (!range || (range[0] == null && range[1] == null)) return null
    const lo = range[0] ?? 0
    const hi = range[1] ?? Infinity
    const i = BANDS.findIndex((b, k) => lo >= b && lo < BANDS[k + 1])
    let j = BANDS.findIndex((b, k) => hi > b && hi <= BANDS[k + 1])
    if (j < 0) j = BAND_LABEL.length - 1
    return i === j ? BAND_LABEL[i] : `${BAND_LABEL[i]} até ${BAND_LABEL[j]}`
}

const LEVEL_WORD = { municipality: 'municípios', city: 'cidades', state: 'estados' }

/** The question a find_places call asked, as one canonical sentence. */
export function questionOf(args, measureName = id => id) {
    const parts = [LEVEL_WORD[args.level || 'city'] || 'cidades']
    if (args.uf) parts.push(`de ${String(args.uf).toUpperCase()}`)
    const b = band(args.population)
    if (b) parts.push(`com ${b} habitantes`)
    for (const f of args.filters || []) parts.push(`com ${measureName(f.measure)} ${f.min != null && f.max != null ? 'numa faixa' : f.min != null ? 'acima de um mínimo' : 'abaixo de um máximo'}`)
    parts.push(`por ${measureName(args.sort || 'population')}`)
    return parts.join(' ')
}

/**
 * The observations of one call: only resolved codes and known measure ids, never free text.
 * `resolved` are the place handles the tool found ({level, key}); unknown names are not here.
 */
export function observations(tool, args, resolved = [], measureName) {
    const out = [`tool:${tool}`]
    for (const p of resolved) out.push(`place:${p.level}:${p.key}`)
    if (tool === 'find_places') {
        out.push(`question:${questionOf(args, measureName)}`)
        out.push(`measure:${args.sort || 'population'}`)
        for (const f of args.filters || []) out.push(`measure:${f.measure}`)
    }
    if (tool === 'place_trend' && args.theme) {
        out.push(`theme:${args.theme}`)
        for (const p of resolved) out.push(`pair:${p.level}:${p.key}|${args.theme}`)
    }
    if (tool === 'compare_places') for (const id of args.measures || []) out.push(`measure:${id}`)
    return [...new Set(out)]
}

/** A stamp: the connection hashed with this week's key. The key is deleted at the week's close. */
export async function stamp(weekKey, connection) {
    const data = new TextEncoder().encode(`${weekKey}|${connection}`)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
    return [...digest.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Laplace noise with scale b, from a uniform source (injectable for tests). */
export function laplace(b, random = Math.random) {
    const u = random() - 0.5
    return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u))
}

/**
 * Close a week: from {box: number of distinct stamps} to the published rankings. A box under MIN_PEOPLE never
 * appears, not even as "fewer than"; the published count carries noise and is never below the minimum.
 */
export function publish(counts, { random = Math.random, min = MIN_PEOPLE } = {}) {
    const kept = {}
    for (const [box, n] of Object.entries(counts)) {
        if (n < min) continue
        kept[box] = Math.max(min, Math.round(n + laplace(NOISE, random)))
    }
    return kept
}

/** Rank the published boxes of one week into lists, with "rising" against the weeks before. */
export function rankings(kept, previous = [], name = box => box) {
    const group = prefix =>
        Object.entries(kept)
            .filter(([box]) => box.startsWith(prefix))
            .sort((a, b) => b[1] - a[1])
            .map(([box, n]) => ({ box, name: name(box), n }))
    const before = box => {
        const seen = previous.map(w => w?.[box]).filter(v => v != null)
        return seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : null
    }
    const rising = Object.entries(kept)
        .filter(([box]) => box.startsWith('place:') || box.startsWith('question:'))
        .map(([box, n]) => ({ box, name: name(box), n, before: before(box) }))
        .filter(r => r.before != null && r.n > r.before)
        .map(r => ({ ...r, change: Math.round((r.n / r.before - 1) * 100) / 100 }))
        .sort((a, b) => b.change - a.change)
    return {
        places: group('place:'),
        questions: group('question:'),
        measures: group('measure:'),
        themes: group('theme:'),
        pairs: group('pair:'),
        tools: group('tool:'),
        rising,
    }
}
