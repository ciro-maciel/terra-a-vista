// The tools. All of them read the map's public data; none changes anything, so every one is marked read-only and an
// assistant runs them without asking each time. Each call passes through the week's tally (tally-object.js) first:
// it is rate-limited, and its structured arguments become anonymous observations for the index.

import { z } from 'zod'
import { loadAll } from './data.js'
import { THEMES, catalogue, compare, find, profile, resolve, trend, DEFAULT_COMPARE, measures } from './places.js'
import { observations } from './tally.js'

export const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
export const MAP = 'https://ciro-maciel.github.io/terra-a-vista/'

const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const failure = message => ({ content: [{ type: 'text', text: message }], isError: true })

/** A link that opens the place on the map. */
export function mapLink(p) {
    if (!p) return MAP
    if (p.level === 'state') return `${MAP}#state=${p.key}`
    if (p.level === 'city') return `${MAP}#city=${p.key}`
    return MAP
}

const placeArg = z.string().describe('O lugar: o nome ("Sinop", "Sinop (MT)"), o código IBGE do município (7 dígitos) ou a sigla do estado ("MT").')
const levelArg = z.enum(['municipality', 'city', 'state']).optional().describe('Município, cidade (o arranjo populacional do IBGE: o município e os vizinhos que formam a mesma área urbana) ou estado. Sem isso, o nome de uma cidade dá a cidade.')

export function registerTools(server, { env, tally }) {
    // Resolve, count, answer. A refused call (too fast) answers so, and nothing is counted.
    const run = (tool, handler) => async args => {
        const d = await loadAll(env)
        const result = await handler(d, args)
        if (result.error) return failure(result.error)
        const ms = measures(d)
        const allowed = await tally(observations(tool, args, result.resolved || [], id => ms[id]?.name?.toLowerCase() || id))
        if (!allowed) return failure('Muitas consultas em um minuto. Espere um minuto e tente de novo.')
        return text(result.answer)
    }
    const one = (d, args) => {
        const r = resolve(d, args.place, { level: args.level, uf: args.uf })
        if (r.error) return { error: r.error }
        if (r.candidates) return { error: `Há mais de um lugar com esse nome: ${r.candidates.slice(0, 8).map(c => `${c.name} (${c.uf}, ${c.level === 'city' ? 'cidade' : c.level === 'state' ? 'estado' : 'município'})`).join('; ')}. Diga o estado, por exemplo "${r.candidates[0].name} (${r.candidates[0].uf})".` }
        return { place: r.place, others: r.others }
    }

    server.registerTool(
        'guide',
        {
            title: 'Guia do mapa',
            description: 'Leia antes de usar as outras ferramentas: o que o Terra à Vista sabe de cada município, cidade e estado do Brasil (as medidas, os temas no tempo, de que ano é cada dado e as regras do que cada número não mostra) e como o índice anônimo conta as consultas.',
            inputSchema: {},
            annotations: { title: 'Guia do mapa', ...READ },
        },
        run('guide', d => ({
            answer: {
                what: 'Terra à Vista é um mapa aberto do Brasil feito de dados públicos: IBGE, MapBiomas, Comex Stat, Datasus, Inep, Anatel, Tesouro Nacional, Defesa Civil, Funai, Atlas do Desenvolvimento Humano e outros. Este conector responde com os mesmos arquivos que o mapa mostra.',
                map: MAP,
                levels: { municipality: 'os 5.570 municípios', city: 'as 611 cidades do mapa: os arranjos populacionais do IBGE e os municípios isolados de 50 mil habitantes ou mais', state: 'os 27 estados' },
                tools: {
                    place_profile: 'o retrato de um lugar',
                    find_places: 'filtrar e ordenar lugares por qualquer medida',
                    compare_places: 'de 2 a 10 lugares lado a lado',
                    place_trend: 'um tema no tempo',
                    trends: 'o que o Brasil está consultando neste mapa, semana a semana',
                },
                themes: THEMES,
                measures: catalogue(d),
                rules: [
                    'Diga sempre o ano e a fonte do número, e repita a regra quando ela muda a leitura.',
                    'Exportação conta no município da empresa exportadora, não onde a mercadoria foi produzida.',
                    'Crescimento usa as estimativas do IBGE de 2024 a 2026; nunca compare estimativa com contagem do Censo.',
                    'A mortalidade infantil antes de 2010 subestima o Norte e o Nordeste (faltavam registros).',
                    'Um registro de desastre é o município declarando, não uma medida do clima.',
                    'Uma prefeitura que não entregou a declaração ao Tesouro, ou cuja declaração não fecha, fica sem dado.',
                ],
                privacy: 'O texto da sua conversa nunca chega a este servidor: só os argumentos das ferramentas. Para o índice, cada lugar e medida consultados são contados por pessoas diferentes, com um carimbo da conexão que muda toda semana e é apagado no fechamento; nada aparece com menos de 10 pessoas. O endereço da conexão não é guardado. Regras: ' + `${MAP}como-contamos/`,
            },
        }))
    )

    server.registerTool(
        'place_profile',
        {
            title: 'Retrato de um lugar',
            description: 'O retrato de um município, cidade ou estado: população (Censo 2022) e crescimento, PIB e PIB por habitante, renda e desocupação, o que exporta e para quem, quem paga a prefeitura, o tipo de cidade, e o valor mais recente de cada tema (terra, lavoura, saúde, escola, conexão, desastres, IDH), com o ano e a regra.',
            inputSchema: { place: placeArg, level: levelArg, uf: z.string().length(2).optional().describe('A sigla do estado, quando o nome existe em mais de um.') },
            annotations: { title: 'Retrato de um lugar', ...READ },
        },
        run('place_profile', (d, args) => {
            const r = one(d, args)
            if (r.error) return r
            const answer = { ...profile(d, r.place), map: mapLink(r.place) }
            if (r.others?.length) answer.alsoNamed = r.others.slice(0, 5)
            return { answer, resolved: [r.place] }
        })
    )

    server.registerTool(
        'find_places',
        {
            title: 'Achar lugares',
            description: 'Filtrar e ordenar municípios, cidades ou estados por qualquer medida. Exemplos: cidades de 50 a 150 mil habitantes do Centro-Oeste que mais crescem; municípios com pouca banda larga e renda alta; prefeituras que mais dependem do FPM. As medidas estão na ferramenta guide.',
            inputSchema: {
                level: z.enum(['municipality', 'city', 'state']).default('city').describe('O nível dos lugares.'),
                uf: z.string().length(2).optional().describe('Só um estado.'),
                population: z.array(z.number().nullable()).length(2).optional().describe('Faixa de população [mínimo, máximo]; use null para aberto.'),
                filters: z.array(z.object({ measure: z.string(), min: z.number().optional(), max: z.number().optional() })).max(6).optional().describe('Filtros por medida, com mínimo e/ou máximo (parcelas como fração: 20% = 0.2).'),
                sort: z.string().default('population').describe('A medida que ordena.'),
                order: z.enum(['desc', 'asc']).default('desc'),
                limit: z.number().int().min(1).max(50).default(20),
            },
            annotations: { title: 'Achar lugares', ...READ },
        },
        run('find_places', (d, args) => {
            const answer = find(d, args)
            if (answer.error) return answer
            for (const row of answer.places) row.map = mapLink(row.place)
            return { answer }
        })
    )

    server.registerTool(
        'compare_places',
        {
            title: 'Comparar lugares',
            description: 'De 2 a 10 lugares lado a lado, nas medidas pedidas ou num conjunto padrão (população, crescimento, PIB por habitante, renda, exportação, dinheiro próprio da prefeitura, Ideb, mortalidade infantil, banda larga, IDH).',
            inputSchema: {
                places: z.array(z.string()).min(2).max(10).describe('Os lugares, como em place_profile.'),
                measures: z.array(z.string()).max(15).optional().describe('As medidas (ids da ferramenta guide).'),
            },
            annotations: { title: 'Comparar lugares', ...READ },
        },
        run('compare_places', (d, args) => {
            const found = []
            for (const q of args.places) {
                const r = one(d, { place: q })
                if (r.error) return { error: `${q}: ${r.error}` }
                found.push(r.place)
            }
            return { answer: compare(d, found, args.measures?.length ? args.measures : DEFAULT_COMPARE), resolved: found }
        })
    )

    server.registerTool(
        'place_trend',
        {
            title: 'Um tema no tempo',
            description: 'Um tema ao longo dos anos para um lugar, com o Brasil ao lado: people (Censos desde 1970), gdp (PIB real desde 2002), land (MapBiomas desde 1985), farm (lavoura e gado desde 1975), health (desde 2000), school (Ideb desde 2005), net (conexão desde 2019), disasters (desde 1991), idhm (1991, 2000, 2010).',
            inputSchema: { place: placeArg, level: levelArg, uf: z.string().length(2).optional(), theme: z.enum(THEMES) },
            annotations: { title: 'Um tema no tempo', ...READ },
        },
        run('place_trend', (d, args) => {
            const r = one(d, args)
            if (r.error) return r
            const answer = trend(d, r.place, args.theme)
            if (answer.error) return answer
            const year = answer.years?.[answer.years.length - 1]
            const map = args.theme === 'gdp' ? mapLink(r.place) : `${MAP}#year=${year}${args.theme === 'people' ? '' : `&tema=${args.theme}`}`
            return { answer: { ...answer, map }, resolved: [r.place] }
        })
    )

    server.registerTool(
        'trends',
        {
            title: 'O que o Brasil está pesquisando',
            description: 'O índice semanal e anônimo deste mapa: os lugares, as perguntas e os temas mais consultados por pessoas diferentes, e os que mais subiram. Só aparece o que 10 pessoas ou mais consultaram na semana.',
            inputSchema: { week: z.string().regex(/^\d{4}-W\d{2}$/).optional().describe('A semana ISO, "2026-W48"; sem isso, a última fechada.') },
            annotations: { title: 'O que o Brasil está pesquisando', ...READ },
        },
        run('trends', async (d, args) => ({ answer: (await env.READ_TRENDS(args.week)) || { week: null, note: 'Ainda não há semana fechada com caixas acima do mínimo de 10 pessoas.' } }))
    )
}
