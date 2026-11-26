import { describe, expect, test } from 'bun:test'
import { MIN_PEOPLE, band, observations, publish, questionOf, rankings, stamp, weekOf } from '../src/tally.js'

describe('the minimum', () => {
    test('a box with fewer than 10 people never appears, not even as "fewer than"', () => {
        const kept = publish({ 'place:city:1': 9, 'place:city:2': 10, 'place:city:3': 400 }, { random: () => 0.5 })
        expect(Object.keys(kept).sort()).toEqual(['place:city:2', 'place:city:3'])
    })
    test('the minimum is 10', () => expect(MIN_PEOPLE).toBe(10))
    test('noise never takes a published count below the minimum', () => {
        for (let i = 0; i < 200; i++) expect(Object.values(publish({ a: 10 }, { random: Math.random }))[0]).toBeGreaterThanOrEqual(10)
    })
    test('noise moves a count', () => {
        const seen = new Set(Array.from({ length: 50 }, () => publish({ a: 200 })['a']))
        expect(seen.size).toBeGreaterThan(1)
    })
})

describe('what is observed', () => {
    test('only resolved codes and measure ids, never the text a person typed', () => {
        const obs = observations('place_profile', { place: 'onde abro minha clínica em Sinop' }, [{ level: 'city', key: '5107909' }])
        expect(obs).toEqual(['tool:place_profile', 'place:city:5107909'])
        expect(obs.join(' ')).not.toContain('clínica')
    })
    test('an unresolved name leaves no place at all', () => {
        expect(observations('place_profile', { place: 'Cidade que não existe' }, [])).toEqual(['tool:place_profile'])
    })
    test('a search becomes one canonical question, with population in bands', () => {
        const a = questionOf({ level: 'city', uf: 'go', population: [55000, 140000], sort: 'growth' })
        const b = questionOf({ level: 'city', uf: 'GO', population: [60000, 150000], sort: 'growth' })
        expect(a).toBe(b)
        expect(a).toBe('cidades de GO com 50 a 100 mil até 100 a 250 mil habitantes por growth')
    })
    test('bands', () => {
        expect(band([0, 20000])).toBe('até 20 mil')
        expect(band([1500000, null])).toBe('mais de 1 milhão')
        expect(band(null)).toBe(null)
    })
})

describe('stamps and weeks', () => {
    test('the same connection gives the same stamp within a week key, another key gives another stamp', async () => {
        expect(await stamp('k1', 'ip|ua')).toBe(await stamp('k1', 'ip|ua'))
        expect(await stamp('k1', 'ip|ua')).not.toBe(await stamp('k2', 'ip|ua'))
    })
    test('ISO weeks', () => {
        expect(weekOf(new Date('2026-11-26T12:00:00Z'))).toBe('2026-W48')
        expect(weekOf(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
    })
})

describe('rankings', () => {
    test('rising compares with the weeks before, only for boxes seen in them', () => {
        const r = rankings({ 'place:city:1': 40, 'place:city:2': 20 }, [{ 'place:city:1': 20 }, { 'place:city:1': 20 }])
        expect(r.places.map(p => p.box)).toEqual(['place:city:1', 'place:city:2'])
        expect(r.rising).toEqual([{ box: 'place:city:1', name: 'place:city:1', n: 40, before: 20, change: 1 }])
    })
})
