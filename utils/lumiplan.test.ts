import { describe, expect, it } from 'vitest'
import { buildLumiplanSaveFile, enumerateLinePaths, toLumiplanMode } from './lumiplan'

function stop(id: string, name: string, extra: Partial<Stop['$stop']> = {}): Stop {
  return {
    id,
    $stop: {
      name,
      subtitle: null,
      placeName: null,
      accessible: true,
      preventSubtitleOverlapping: false,
      interestPoint: false,
      terminus: false,
      closed: false,
      reverse: false,
      connections: [],
      ...extra,
    },
  }
}

function branch(id: string, stops: Stop[]): Branch {
  return {
    id,
    $branch: {
      elementSpacing: 1,
      invertedElements: false,
      elements: stops,
    },
  }
}

function section(id: string, elements: LineElement[]): LineSection {
  return { id, $lineSection: { elements } }
}

describe('enumerateLinePaths', () => {
  it('ligne simple : un seul chemin', () => {
    const topology = [
      section('s1', [branch('b1', [stop('a', 'Alpha'), stop('b', 'Bravo'), stop('c', 'Charlie')])]),
    ]
    const paths = enumerateLinePaths(topology)
    expect(paths).toHaveLength(1)
    expect(paths[0].stops.map(s => s.$stop.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    expect(paths[0].label).toContain('Alpha → Charlie')
  })

  it('branches parallèles : deux chemins', () => {
    const topology = [
      section('s1', [
        branch('b1', [stop('a', 'Alpha')]),
        {
          id: 'pb1',
          $parallelBranches: {
            alignement: 'FLUID',
            sections: [
              section('top', [branch('bt', [stop('t', 'Nord')])]),
              section('bot', [branch('bb', [stop('u', 'Sud')])]),
            ],
          },
        } as ParallelBranches,
        branch('b2', [stop('z', 'Zulu')]),
      ]),
    ]
    const paths = enumerateLinePaths(topology)
    expect(paths).toHaveLength(2)
    expect(paths[0].stops.map(s => s.$stop.name)).toEqual(['Alpha', 'Nord', 'Zulu'])
    expect(paths[1].stops.map(s => s.$stop.name)).toEqual(['Alpha', 'Sud', 'Zulu'])
  })

  it('les chemins à moins de deux arrêts sont ignorés', () => {
    const topology = [section('s1', [branch('b1', [stop('a', 'Seul')])])]
    expect(enumerateLinePaths(topology)).toHaveLength(0)
  })
})

describe('toLumiplanMode', () => {
  it('mappe les modes directs et approximés', () => {
    expect(toLumiplanMode('METRO')).toBe('METRO')
    expect(toLumiplanMode('TRAIN')).toBe('TRANSILIEN')
    expect(toLumiplanMode('AERIAL_TRAMWAY')).toBe('GONDOLA')
    expect(toLumiplanMode('VELO')).toBeNull()
  })
})

describe('buildLumiplanSaveFile', () => {
  const line: Line = {
    mode: 'BUS',
    index: null,
    color: '#0055c8',
    lineThickness: null,
    lineStyle: null,
    dotsColorPolicy: null,
    mapSize: null,
    fullyAccessible: false,
    frameTerminusNames: false,
    terminusNamesLineColor: false,
    brandStyle: 'IDFM',
    operator: 'RATP',
    topology: [],
  }

  const customIndices: CustomLineIndexDescription[] = [
    { id: 'ci-1', index: '42', prefix: 'K', suffix: '', shape: 'CIRCLE', mode: 'BUS', color: '#82c8e6' },
  ]

  const stops = [
    stop('a', 'Départ', {
      connections: [{
        id: 'mc1',
        $modeConnection: {
          mode: 'BUS',
          walk: false,
          elements: [{
            id: 'mce1',
            $modeConnectionElement: {
              lineIndex: { mode: 'BUS', $customLineIndex: { id: 'ci-1' } },
              walk: false,
              ornament: null,
            },
          }],
        },
      }],
    }),
    stop('b', 'Milieu'),
    stop('c', 'Arrivée'),
  ]

  it('produit un SaveFile v2 complet avec horaires et picto personnalisé', () => {
    const file = buildLumiplanSaveFile(line, customIndices, {
      path: { label: 'Départ → Arrivée (3 arrêts)', stops },
      departure: new Date('2026-09-05T08:00:00.000Z'),
      intervalMinutes: 2,
      name: 'Test',
    })

    expect(file.header.version).toBe('2.0.0')
    expect(file.journey.desserte.stops).toHaveLength(3)
    expect(file.journey.desserte.direction).toBe('Arrivée')
    expect(file.journey.desserte.stops[0].isFirstStop).toBe(true)
    expect(file.journey.desserte.stops[2].isTerminus).toBe(true)
    expect(file.journey.desserte.stops[0].timeOfArrival).toBe('2026-09-05T08:00:00.000Z')
    expect(file.journey.desserte.stops[1].timeOfArrival).toBe('2026-09-05T08:02:00.000Z')

    const connected = file.journey.desserte.stops[0].stop.connectedLines
    expect(connected).toHaveLength(1)
    expect(connected[0].name).toBe('K42')
    expect(connected[0].customIndex).toEqual({
      shape: 'CIRCLE',
      index: '42',
      prefix: 'K',
      suffix: undefined,
      color: '#82c8e6',
    })

    // Les lignes de correspondance figurent aussi dans la liste globale
    expect(file.lines.map(l => l.id)).toContain('bulbmax:custom:ci-1')
  })
})
