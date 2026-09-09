import type { NetworkData } from './types'
import { describe, expect, it } from 'vitest'
import { build } from './engine'
import valmont from './fixtures/valmont.json'
import { octolinearity, schematize, toSchematicData } from './schematic'

describe('schématisation', () => {
  const data = valmont as unknown as NetworkData
  const network = build(data)

  it('aligne la majorité des tronçons sur les 8 directions', () => {
    const r = schematize(network)
    expect(r.positions.size).toBe(network.stations.length)
    for (const p of r.positions.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    }
    expect(octolinearity(network, r.positions, 8)).toBeGreaterThan(0.6)
    expect(octolinearity(network, r.positions, 8)).toBeGreaterThan(octolinearity(network, new Map(network.stations.map(s => [s.name, { x: s.x, y: s.y }])), 8))
  })

  it('sans attraction octolinéaire, la géographie dilatée est conservée', () => {
    const r = schematize(network, { octo: 0, iterations: 50 })
    expect(octolinearity(network, r.positions, 8)).toBeLessThan(0.9)
    expect(r.spacing).toBeGreaterThan(0)
  })

  it('produit un fichier réseau rectiligne reconstruisible', () => {
    const r = schematize(network)
    const d = toSchematicData(data, network, r)
    expect(d.meta?.straight).toBe(true)
    expect(d.lines.length).toBe(data.lines.length)
    const n2 = build(d)
    expect(n2.stations.length).toBe(network.stations.length)
    expect(n2.lines[0].samples.length).toBeGreaterThan(n2.lines[0].stops.length)
  })
})
