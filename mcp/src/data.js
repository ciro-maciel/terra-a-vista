// The map's published data files (web/data/*.json on GitHub Pages), read once per isolate and kept in memory.
// The connector serves exactly what the map shows: one pipeline, two ways in.

export const SERIES = ['land', 'farm', 'health', 'school', 'net', 'disasters', 'idhm']
const FILES = ['cities', 'states', 'nation', 'history', 'world', 'exports', 'finances', 'protected', 'districts', ...SERIES.map(s => `series_${s}`)]

const cache = new Map()

/** One data file, parsed; the same promise for every caller in this isolate. */
export function load(env, name) {
    if (!FILES.includes(name)) throw new Error(`unknown data file ${name}`)
    if (!cache.has(name)) {
        const url = `${env.DATA_BASE}/${name}.json`
        cache.set(
            name,
            fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } }).then(async response => {
                if (!response.ok) {
                    cache.delete(name)
                    throw new Error(`${name}.json answered ${response.status}`)
                }
                return response.json()
            })
        )
    }
    return cache.get(name)
}

/** Everything the tools read, loaded together (about 10 MB, parsed once per isolate). */
export async function loadAll(env) {
    const entries = await Promise.all(FILES.map(async name => [name, await load(env, name)]))
    return Object.fromEntries(entries)
}

/** For tests: hand in the files directly. */
export function seed(files) {
    cache.clear()
    for (const [name, value] of Object.entries(files)) cache.set(name, Promise.resolve(value))
}
