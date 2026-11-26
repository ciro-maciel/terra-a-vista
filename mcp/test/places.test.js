import { beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { SERIES } from '../src/data.js'
import { compare, find, measures, profile, resolve, trend } from '../src/places.js'

const DATA = new URL('../../web/data/', import.meta.url)
let d
beforeAll(() => {
    const files = ['cities', 'states', 'nation', 'history', 'world', 'exports', 'finances', 'protected', 'districts', ...SERIES.map(s => `series_${s}`)]
    d = Object.fromEntries(files.map(f => [f, JSON.parse(readFileSync(new URL(`${f}.json`, DATA)))]))
})

describe('resolve', () => {
    test('a city name gives the city, its state in parentheses narrows it', () => {
        expect(resolve(d, 'Sinop').place).toMatchObject({ level: 'city', key: '5107909', uf: 'MT' })
        expect(resolve(d, 'Sinop (MT)').place.key).toBe('5107909')
    })
    test('a 7-digit code is the municipality', () => expect(resolve(d, '3550308').place).toMatchObject({ level: 'municipality', name: 'São Paulo' }))
    test('a state by its letters', () => expect(resolve(d, 'mt').place).toMatchObject({ level: 'state', key: 'MT' }))
    test('a name in several states asks which', () => expect(resolve(d, 'Bom Jesus').candidates.length).toBeGreaterThan(1))
    test('a CEP is sent to the CNPJ e CEP connector', () => expect(resolve(d, '78550-000').error).toContain('CEP'))
})

describe('answers', () => {
    test('a profile carries exports, the city hall and the series', () => {
        const p = profile(d, resolve(d, 'Sorriso (MT)').place)
        expect(p.values['farm.soy'].value).toBeGreaterThan(0.3)
        expect(p.exports.buyers[0].name).toBe('China')
        expect(p.values.own_revenue_share.value).toBeGreaterThan(0)
    })
    test('find sorts and filters', () => {
        const r = find(d, { level: 'city', uf: 'MT', population: [100000, null], sort: 'growth', limit: 3 })
        expect(r.places[0].place.name).toBe('Sinop')
        expect(r.places.every(x => x.population >= 100000)).toBe(true)
    })
    test('an unknown measure is refused in words', () => expect(find(d, { sort: 'nope' }).error).toContain('guide'))
    test('a measure that does not exist for municipalities says so', () => expect(find(d, { level: 'municipality', sort: 'income' }).error).toContain('nível'))
    test('compare keeps one value per place per measure', () => {
        const ps = ['Sinop', 'Sorriso (MT)'].map(q => resolve(d, q).place)
        expect(compare(d, ps).rows.every(r => r.values.length === 2)).toBe(true)
    })
    test('a trend for a state', () => {
        const t = trend(d, resolve(d, 'PA').place, 'land')
        expect(t.years[0]).toBe(1985)
        expect(t.metrics[0].values.length).toBe(t.years.length)
    })
    test('change since the first comparable year', () => {
        const v = measures(d)['land.natural.change'].value(d, resolve(d, 'Sorriso (MT)').place)
        expect(v).toBeLessThan(-0.4)
    })
})
