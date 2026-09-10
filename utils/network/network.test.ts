import type { NetworkData } from './types'
import { describe, expect, it } from 'vitest'
import metro1 from '~/data/presets/metro/metro_1.json'
import metro7 from '~/data/presets/metro/metro_7.json'
import { buildNetwork, normalizeName, parseProject } from './bulbImport'
import { build, DAY, formatTime, nextDepartures, parseTime, route, vehiclesAt } from './engine'
import valmont from './fixtures/valmont.json'
import { matchStations, parseReference } from './geoMatch'
import { layoutNetwork, toNetworkData } from './layout'

const T = (h: number, m = 0, s = 0) => h * 3600 + m * 60 + s

describe('moteur', () => {
  const net = build(valmont as NetworkData)

  it('construit le réseau fictif : 6 lignes, 31 stations, 16 correspondances', () => {
    expect(net.lines.length).toBe(6)
    expect(net.stations.length).toBe(31)
    expect(net.stations.filter(s => s.interchange).length).toBe(16)
    expect(net.stations.find(s => s.name === 'Gare Centrale')!.groups.sort()).toEqual(['M1', 'M2', 'R'])
  })

  it('véhicules : présents en journée, absents la nuit, service après minuit', () => {
    expect(vehiclesAt(net, T(3)).length).toBe(0)
    const day = vehiclesAt(net, T(10))
    expect(day.length).toBeGreaterThan(25)
    expect(new Set(day.map(v => v.id)).size).toBe(day.length)
    const night = vehiclesAt(net, T(0, 10)).filter(v => v.line.id === 'M1')
    expect(night.some(v => v.dep >= DAY)).toBe(true)
    expect(night.some(v => v.dep < DAY)).toBe(true)
  })

  it('prochains passages à une correspondance', () => {
    const gc = net.stations.find(s => s.name === 'Gare Centrale')!
    const deps = nextDepartures(net, gc, T(9), 3)
    expect(deps.length).toBe(6) // M1, M2, R × 2 sens
    for (const d of deps) {
      expect(d.times.length).toBe(3)
      expect(d.times[0]).toBeGreaterThanOrEqual(T(9))
      expect(d.times[1] - d.times[0]).toBeCloseTo(d.line.freq, 6)
    }
  })

  it('itinéraire avec correspondance', () => {
    const a = net.stations.find(s => s.name === 'Port-Ouest')!
    const b = net.stations.find(s => s.name === 'Les Vignes')!
    const r = route(net, a, b, T(9))!
    expect(r).not.toBeNull()
    expect(r.legs.map(l => l.line.group)).toEqual(['M1', 'M2'])
    expect(r.legs[0].to.name).toBe('Gare Centrale')
    expect(r.duration).toBeGreaterThan(10 * 60)
    expect(r.duration).toBeLessThan(60 * 60)
  })

  it('heures', () => {
    expect(parseTime('05:30')).toBe(19800)
    expect(formatTime(DAY + 65, true)).toBe('00:01:05')
    expect(() => parseTime('25h')).toThrow(/Heure invalide/)
  })
})

describe('import BULB', () => {
  it('lit une ligne simple', () => {
    const p = parseProject(metro1 as unknown as Project, 'metro_1.json')
    expect(p.id).toBe('M1')
    expect(p.mode).toBe('metro')
    expect(p.services.length).toBe(1)
    expect(p.services[0][0].name).toBe('La Défense')
    expect(p.services[0][p.services[0].length - 1].name).toBe('Château de Vincennes')
  })

  it('développe les branches en services', () => {
    const p = parseProject(metro7 as unknown as Project, 'metro_7.json')
    expect(p.services.length).toBe(2)
    const dests = p.services.map(s => s[s.length - 1].name).sort()
    expect(dests).toEqual(['Mairie d’Ivry', 'Villejuif Louis Aragon'])
  })

  it('fusionne les stations par nom normalisé', () => {
    expect(normalizeName('St-Denis\nUniversité')).toBe('saint denis universite')
    expect(normalizeName('Pte de Clignancourt')).toBe(normalizeName('Porte de Clignancourt'))
    const net = buildNetwork([parseProject(metro1 as unknown as Project), parseProject(metro7 as unknown as Project)])
    const chatelet = net.stations.find(s => s.key === 'chatelet')!
    expect(chatelet.lines.sort()).toEqual(['M1', 'M7'])
    expect(net.lines.length).toBe(3)
    expect(net.lines.find(l => l.id === 'M7a')!.frequency_min).toBe(8) // deux services : fréquence doublée par service
  })
})

describe('géolocalisation et disposition', () => {
  const ref = parseReference(JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.2379, 48.8918] }, properties: { stop_name: 'La Défense', route_long_name: '1', mode: 'Metro', nom_commune: 'Puteaux' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.3467, 48.8586] }, properties: { stop_name: 'Châtelet', route_long_name: '1', mode: 'Metro' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.3948, 48.8482] }, properties: { stop_name: 'Gare de Lyon', route_long_name: '1', mode: 'Metro' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.3378, 48.8532] }, properties: { stop_name: 'Saint-Michel', route_long_name: '4', mode: 'Metro' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.4404, 48.8443] }, properties: { stop_name: 'Château de Vincennes', route_long_name: '1', mode: 'Metro' } },
    ],
  }))

  it('rapproche les noms, sans faux positifs entre modes', () => {
    const p = parseProject(metro1 as unknown as Project)
    const net = buildNetwork([p])
    const m = matchStations(net, ref, [p])
    expect(m.positions.get('la defense')!.how).toBe('exact')
    expect(m.positions.get('la defense')!.commune).toBe('Puteaux')
    expect(m.matched).toBe(4)
    expect(m.unmatched).toContain('Esplanade de la Défense')
  })

  it('dispose un réseau sans coordonnées puis avec ancres', () => {
    const p = parseProject(metro1 as unknown as Project)
    const net = buildNetwork([p])
    const auto = layoutNetwork(net)
    expect(auto.positions.size).toBe(net.stations.length)
    const anchors = matchStations(net, ref, [p]).positions
    const hybrid = layoutNetwork(net, { anchors })
    expect(hybrid.anchored).toBe(4)
    const data = toNetworkData(net, hybrid, { city: 'Test' })
    const ld = data.lines[0].stops.find(s => s.name === 'La Défense')!
    expect(ld.lat).toBeCloseTo(48.8918, 3)
    expect(ld.lon).toBeCloseTo(2.2379, 3)
    // les stations non géolocalisées restent entre leurs voisines connues
    const esp = data.lines[0].stops.find(s => s.name === 'Esplanade de la Défense')!
    expect(esp.lon).toBeGreaterThan(2.2)
    expect(esp.lon).toBeLessThan(2.35)
    expect(() => build(data)).not.toThrow()
  })
})
