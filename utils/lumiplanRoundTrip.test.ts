import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildLumiplanSaveFile,
  enumerateLinePaths,
  LUMIPLAN_SAVE_FILE_VERSION,
} from './lumiplan'
import { lumiplanSaveFileToLine } from './lumiplanImport'

const PRESET_ROOT = join(__dirname, '..', 'data', 'presets')

function loadPreset(relative: string): Project {
  return JSON.parse(readFileSync(join(PRESET_ROOT, relative), 'utf8')) as Project
}

function countStops(topology: unknown): number {
  return JSON.stringify(topology).match(/"\$stop"/g)?.length ?? 0
}

const DEPARTURE = new Date('2030-01-01T08:00:00Z')

describe.each([
  ['métro 1 (linéaire)', 'metro/metro_1.json'],
  ['métro 13 (branches)', 'metro/metro_13.json'],
  ['ligne K (hors-IDF)', 'train/train_k.json'],
])('aller-retour Lumiplan — %s', (_label, file) => {
  const project = loadPreset(file)

  it('énumère au moins un chemin', () => {
    expect(enumerateLinePaths(project.line.topology).length).toBeGreaterThan(0)
  })

  it('exporte tous les arrêts du chemin avec des horaires croissants', () => {
    const path = enumerateLinePaths(project.line.topology)[0]
    const save = buildLumiplanSaveFile(project.line, project.customIndices ?? [], {
      path,
      departure: DEPARTURE,
      intervalMinutes: 2,
      name: file,
    })

    expect(save.header.version).toBe(LUMIPLAN_SAVE_FILE_VERSION)

    const stops = save.journey.desserte.stops
    expect(stops).toHaveLength(path.stops.length)
    expect(stops[0].isFirstStop).toBe(true)
    expect(stops.at(-1)?.isTerminus).toBe(true)

    for (let i = 1; i < stops.length; i++) {
      expect(new Date(stops[i].timeOfArrival).getTime())
        .toBeGreaterThan(new Date(stops[i - 1].timeOfArrival).getTime())
    }
  })

  it('retrouve tous les arrêts après réimport', () => {
    const path = enumerateLinePaths(project.line.topology)[0]
    const save = buildLumiplanSaveFile(project.line, project.customIndices ?? [], {
      path,
      departure: DEPARTURE,
      intervalMinutes: 2,
      name: file,
    })

    const imported = lumiplanSaveFileToLine(JSON.parse(JSON.stringify(save)))
    expect(countStops(imported.line.topology)).toBe(path.stops.length)
  })
})

describe('aller-retour Lumiplan — picto personnalisé', () => {
  function buildCustomSave() {
    const project = loadPreset('metro/metro_1.json')
    const customIndices: CustomLineIndexDescription[] = [{
      id: 'test-val-sl2',
      index: 'SL2',
      shape: 'LINES',
      mode: 'VAL',
      color: '#8757bd',
    }]
    project.line.index = { mode: 'VAL', $customLineIndex: { id: 'test-val-sl2' } } as LineIndex

    const path = enumerateLinePaths(project.line.topology)[0]
    return buildLumiplanSaveFile(project.line, customIndices, {
      path,
      departure: DEPARTURE,
      intervalMinutes: 2,
      name: 'VAL SL2',
    })
  }

  it('exporte le customIndex avec sa forme, sa couleur et son mode', () => {
    const save = buildCustomSave()
    expect(save.journey.line.mode).toBe('VAL')
    expect(save.journey.line.color).toBe('#8757bd')
    expect(save.journey.line.customIndex).toMatchObject({ shape: 'LINES', index: 'SL2' })
  })

  it('recrée un index personnalisé identique au réimport', () => {
    const save = buildCustomSave()
    const imported = lumiplanSaveFileToLine(JSON.parse(JSON.stringify(save)))
    expect(imported.customIndices[0]).toMatchObject({ index: 'SL2', shape: 'LINES', mode: 'VAL', color: '#8757bd' })
  })
})
