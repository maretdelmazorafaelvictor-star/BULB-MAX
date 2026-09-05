import { describe, expect, it } from 'vitest'
import { buildLumiplanSaveFile } from './lumiplan'
import { fromLumiplanMode, lumiplanLineToIndex, lumiplanSaveFileToLine } from './lumiplanImport'

describe('fromLumiplanMode', () => {
  it('mappe les modes directs et approximés', () => {
    expect(fromLumiplanMode('TRANSILIEN')).toBe('TRAIN')
    expect(fromLumiplanMode('TER')).toBe('TRAIN')
    expect(fromLumiplanMode('BUS_REMPLACEMENT')).toBe('BUS')
    expect(fromLumiplanMode('CABLE')).toBe('GONDOLA')
  })
})

describe('lumiplanLineToIndex', () => {
  it('retrouve un indice intégré par mode et nom (préfixe T des trams)', () => {
    const result = lumiplanLineToIndex({
      id: 'x', name: 'T3a', color: '#f78f4b', textColor: '#000', mode: 'TRAM',
    })
    expect(result.customIndex).toBeNull()
    expect(result.lineIndex).toEqual({ mode: 'TRAM', $builtinLineIndex: { index: '3a' } })
  })

  it('recrée fidèlement un picto personnalisé', () => {
    const result = lumiplanLineToIndex({
      id: 'bulbmax:custom:ci-1',
      name: 'K42',
      color: '#82c8e6',
      textColor: '#000',
      mode: 'BUS',
      customIndex: { shape: 'CIRCLE', index: '42', prefix: 'K', color: '#82c8e6' },
    })
    expect(result.customIndex).toMatchObject({
      id: 'ci-1', index: '42', prefix: 'K', shape: 'CIRCLE', mode: 'BUS', color: '#82c8e6',
    })
    expect(result.lineIndex).toEqual({ mode: 'BUS', $customLineIndex: { id: 'ci-1' } })
  })

  it('replie une ligne inconnue en indice personnalisé rond', () => {
    const result = lumiplanLineToIndex({
      id: 'x', name: 'EXP1', color: '#009639', textColor: '#fff', mode: 'BRT',
    })
    expect(result.customIndex).toMatchObject({ index: 'EXP1', shape: 'CIRCLE', color: '#009639' })
  })
})

describe('aller-retour BULB-MAX -> Lumiplan -> BULB-MAX', () => {
  it('conserve arrêts, terminus, accessibilité et picto personnalisé', () => {
    const customIndices: CustomLineIndexDescription[] = [
      { id: 'ci-1', index: '42', prefix: 'K', suffix: '', shape: 'ROUNDED_SQUARE', mode: 'BUS', color: '#82c8e6' },
    ]

    const stops: Stop[] = ['Départ', 'Milieu', 'Arrivée'].map((name, i) => ({
      id: `s${i}`,
      $stop: {
        name,
        placeName: '',
        subtitle: i === 1 ? 'Centre' : '',
        accessible: i !== 1,
        reverse: false,
        interestPoint: false,
        preventSubtitleOverlapping: false,
        closed: false,
        terminus: i !== 1,
        connections: i === 0
          ? [{
              id: 'mc1',
              $modeConnection: {
                mode: 'BUS' as Mode,
                walk: false,
                elements: [{
                  id: 'mce1',
                  $modeConnectionElement: {
                    lineIndex: { mode: 'BUS' as Mode, $customLineIndex: { id: 'ci-1' } },
                    walk: false,
                    ornament: null,
                  },
                }],
              },
            }]
          : [],
      },
    }))

    const line: Line = {
      mode: 'BUS',
      index: { mode: 'BUS', $customLineIndex: { id: 'ci-1' } },
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

    const saveFile = buildLumiplanSaveFile(line, customIndices, {
      path: { label: 'Départ → Arrivée (3 arrêts)', stops },
      departure: new Date('2026-09-05T08:00:00.000Z'),
      intervalMinutes: 2,
      name: 'aller-retour',
    })

    const result = lumiplanSaveFileToLine(saveFile)

    expect(result.line.mode).toBe('BUS')
    expect(result.line.index).toEqual({ mode: 'BUS', $customLineIndex: { id: 'ci-1' } })
    expect(result.customIndices).toHaveLength(1)
    expect(result.customIndices[0]).toMatchObject({
      id: 'ci-1', index: '42', prefix: 'K', shape: 'ROUNDED_SQUARE', color: '#82c8e6',
    })

    const branch = result.line.topology[0].$lineSection.elements[0] as Branch
    const importedStops = branch.$branch.elements as Stop[]
    expect(importedStops.map(s => s.$stop.name)).toEqual(['Départ', 'Milieu', 'Arrivée'])
    expect(importedStops[0].$stop.terminus).toBe(true)
    expect(importedStops[1].$stop.terminus).toBe(false)
    expect(importedStops[2].$stop.terminus).toBe(true)
    expect(importedStops[1].$stop.accessible).toBe(false)
    expect(importedStops[1].$stop.subtitle).toBe('Centre')

    const connection = importedStops[0].$stop.connections[0] as ModeConnection
    expect(connection.$modeConnection.mode).toBe('BUS')
    const lineIndex = connection.$modeConnection.elements[0].$modeConnectionElement.lineIndex
    expect(lineIndex).toEqual({ mode: 'BUS', $customLineIndex: { id: 'ci-1' } })
  })

  it('rejette un fichier sans desserte', () => {
    expect(() => lumiplanSaveFileToLine({ journey: {} } as never)).toThrow()
  })
})
