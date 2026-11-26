// Terra à Vista MCP: the map's data as a remote MCP server, open (no sign-in: the data is public), at
// terra-a-vista.mcp.myagents.click/mcp. Also serves the weekly anonymous index (/trends) the map reads, and closes the
// week on a cron.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { loadAll } from './data.js'
import { indexOf, measures } from './places.js'
import { MAP, registerTools } from './tools.js'
import { weekOf } from './tally.js'

export { Tally } from './tally-object.js'

const VERSION = '1.0.0'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, mcp-protocol-version, mcp-session-id, accept', 'Access-Control-Expose-Headers': 'mcp-session-id' }

const tallyOf = env => env.TALLY.get(env.TALLY.idFromName('index'))

/** Names for the boxes of a published week, written when it is served (the tally keeps only codes). */
export function nameBoxes(d, doc) {
    if (!doc?.rankings) return doc
    const ix = indexOf(d)
    const ms = measures(d)
    const place = (level, key) => {
        if (level === 'state') return ix.stateByAbbr.get(key)?.name
        if (level === 'city') return ix.cityById.get(key)?.full || ix.cityById.get(key)?.name
        const m = ix.munis[key]
        return m ? `${m[0]} (${m[1]})` : key
    }
    const name = box => {
        const [kind, rest] = [box.slice(0, box.indexOf(':')), box.slice(box.indexOf(':') + 1)]
        if (kind === 'place') {
            const [level, key] = rest.split(':')
            return place(level, key)
        }
        if (kind === 'pair') {
            const [p, theme] = rest.split('|')
            const [level, key] = p.split(':')
            return `${place(level, key)}, ${theme}`
        }
        if (kind === 'measure') return ms[rest]?.name || rest
        return rest
    }
    const out = {}
    for (const [list, rows] of Object.entries(doc.rankings)) out[list] = rows.map(r => ({ ...r, name: name(r.box) }))
    return { ...doc, rankings: out }
}

async function readTrends(env, week) {
    const raw = await env.TRENDS.get(week ? `week:${week}` : 'latest')
    if (!raw) return null
    return nameBoxes(await loadAll(env), JSON.parse(raw))
}

async function mcp(request, env) {
    const connection = `${request.headers.get('cf-connecting-ip') || ''}|${request.headers.get('user-agent') || ''}`
    const tally = async obs => {
        try {
            const r = await tallyOf(env).fetch('https://tally/count', { method: 'POST', body: JSON.stringify({ connection, observations: obs, isCounted: env.COUNT !== 'off' }) })
            return (await r.json()).isAllowed !== false
        } catch (error) {
            console.error('tally', error)
            return true // counting must never cost the answer
        }
    }
    const server = new McpServer({ name: 'terra-a-vista', title: 'Terra à Vista', version: VERSION })
    registerTools(server, { env: { ...env, READ_TRENDS: week => readTrends(env, week) }, tally })
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    const headers = new Headers(response.headers)
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
    return new Response(response.body, { status: response.status, headers })
}

const page = () => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Terra à Vista: pergunte ao mapa</title><meta http-equiv="refresh" content="0; url=${MAP}pergunte/"><link rel="canonical" href="${MAP}pergunte/"></head><body style="background:#0d2a47;color:#efe4c6;font-family:system-ui,sans-serif;padding:24px"><p>O endereço do servidor MCP é <code>https://terra-a-vista.mcp.myagents.click/mcp</code>. Como usar: <a style="color:#ecd08e" href="${MAP}pergunte/">${MAP}pergunte/</a></p></body></html>`

export default {
    async fetch(request, env) {
        const url = new URL(request.url)
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
        try {
            if (url.pathname === '/mcp') return await mcp(request, env)
            if (url.pathname === '/trends/latest.json' || /^\/trends\/\d{4}-W\d{2}\.json$/.test(url.pathname)) {
                const week = url.pathname.match(/(\d{4}-W\d{2})/)?.[1]
                const doc = (await readTrends(env, week)) || { week: null, note: 'Ainda não há semana fechada com caixas acima do mínimo de 10 pessoas.' }
                return Response.json(doc, { headers: { ...CORS, 'Cache-Control': 'public, max-age=600' } })
            }
            if (url.pathname === '/trends/weeks.json') return Response.json(JSON.parse((await env.TRENDS.get('weeks')) || '[]'), { headers: { ...CORS, 'Cache-Control': 'public, max-age=600' } })
            if (url.pathname === '/health') return Response.json({ isOk: true, version: VERSION, week: weekOf() })
            if (url.pathname === '/') return new Response(page(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
            if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /mcp\n', { headers: { 'Content-Type': 'text/plain' } })
        } catch (error) {
            console.error(error)
            return Response.json({ error: 'Erro interno. Tente de novo em instantes.' }, { status: 500, headers: CORS })
        }
        return new Response('não encontrado', { status: 404 })
    },

    // Mondays at 03:00 UTC (Workers cron: write the day's name, day 1 is Sunday): close last week.
    async scheduled(event, env, ctx) {
        ctx.waitUntil(tallyOf(env).fetch('https://tally/close', { method: 'POST', body: '{}' }))
    },
}
