// The week's tally, one Durable Object for the whole connector: it holds this week's key and, per box, the set of
// stamps that fell in it. Nothing else: no address, no time of day, no order of calls. At the close it hands the
// counts to publish() and deletes the stamps and the key.

import { MAX_STAMPS, MIN_PEOPLE, publish, rankings, stamp, weekOf } from './tally.js'

const PER_MINUTE = 60 // calls per stamp per minute, against a runaway agent

export class Tally {
    constructor(state, env) {
        this.state = state
        this.env = env
        this.minute = new Map() // stamp → [minute, calls], in memory only
    }

    async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/count') return Response.json(await this.count(await request.json()))
        if (url.pathname === '/close') return Response.json(await this.close(await request.json().catch(() => ({}))))
        return new Response('not found', { status: 404 })
    }

    /** This week's key, created on the first call of the week. */
    async key(week) {
        let current = await this.state.storage.get('week')
        if (current && current !== week) {
            // the cron did not run: close the old week before starting a new one
            await this.close({ week: current })
            current = null
        }
        if (!current) {
            const bytes = crypto.getRandomValues(new Uint8Array(32))
            await this.state.storage.put({ week, key: [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') })
        }
        return this.state.storage.get('key')
    }

    /** One call: rate-limit it and add its stamp to each of its boxes. */
    async count({ connection, observations, isCounted = true }) {
        const week = weekOf()
        const s = await stamp(await this.key(week), connection)
        const now = Math.floor(Date.now() / 60000)
        const [m, calls] = this.minute.get(s) || [now, 0]
        const n = m === now ? calls + 1 : 1
        this.minute.set(s, [now, n])
        if (this.minute.size > 50000) this.minute.clear()
        if (n > PER_MINUTE) return { isAllowed: false }
        if (!isCounted) return { isAllowed: true }
        for (const box of observations) {
            const k = `box:${box}`
            const set = (await this.state.storage.get(k)) || []
            if (set.length < MAX_STAMPS && !set.includes(s)) {
                set.push(s)
                await this.state.storage.put(k, set)
            }
        }
        return { isAllowed: true }
    }

    /** Close a week: publish what passed the minimum, then forget the stamps and the key. */
    async close({ week } = {}) {
        const current = await this.state.storage.get('week')
        if (!current || (week && week !== current)) return { closed: null }
        if (!week && current === weekOf()) return { closed: null, note: 'this week is still open' }
        const boxes = await this.state.storage.list({ prefix: 'box:' })
        const counts = {}
        for (const [k, set] of boxes) counts[k.slice(4)] = set.length
        const kept = publish(counts)
        const previous = []
        const history = JSON.parse((await this.env.TRENDS.get('weeks')) || '[]')
        for (const w of history.slice(-4)) previous.push(JSON.parse((await this.env.TRENDS.get(`kept:${w}`)) || 'null'))
        await this.env.TRENDS.put(`kept:${current}`, JSON.stringify(kept))
        // boxes keep their codes here; the Worker writes the names when it serves the document (index.js)
        const doc = {
            week: current,
            published: new Date().toISOString(),
            minimum: MIN_PEOPLE,
            rule: 'Contagem de pessoas diferentes por semana, sem saber quem: só aparece o que 10 pessoas ou mais consultaram, com um pequeno ruído no número.',
            rankings: rankings(kept, previous),
        }
        await this.env.TRENDS.put(`week:${current}`, JSON.stringify(doc))
        await this.env.TRENDS.put('latest', JSON.stringify(doc))
        if (!history.includes(current)) history.push(current)
        await this.env.TRENDS.put('weeks', JSON.stringify(history))
        await this.state.storage.deleteAll() // every stamp and the week's key
        return { closed: current, boxes: Object.keys(kept).length }
    }
}
