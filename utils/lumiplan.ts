/*
 * Export vers Lumiplan (SaveFile v2).
 *
 * Deux briques :
 *  - enumerateLinePaths() : parcourt la topologie BULB-MAX (branches,
 *    branches parallèles, boucles) et énumère tous les chemins linéaires
 *    possibles, pour que l'utilisateur choisisse sa branche à l'export.
 *  - buildLumiplanSaveFile() : convertit un chemin choisi en fichier
 *    SaveFile v2 chargeable dans l'éditeur Lumiplan (lignes, desserte,
 *    horaires fictifs réglables, pictos personnalisés).
 */

import { BUILTIN_LINES } from '../data/lines'
import { textContrast } from './colors'

/* ///////////////////////// Contrat Lumiplan ///////////////////////// */

export type LumiplanMode =
  | 'RER'
  | 'METRO'
  | 'TRAM'
  | 'BUS'
  | 'TER'
  | 'NOCTILIEN'
  | 'BUS_REMPLACEMENT'
  | 'BUS_AEROPORT'
  | 'TRANSILIEN'
  | 'CABLE'
  | 'VAL'
  | 'FUNICULAR'
  | 'GONDOLA'
  | 'TRAM_TRAIN'
  | 'BRT'
  | 'BOAT'

export interface LumiplanCustomIndex {
  shape: IndexShape
  index: string
  prefix?: string
  suffix?: string
  color: string
}

export interface LumiplanLine {
  id: string
  name: string
  color: string
  textColor: string
  mode: LumiplanMode
  customIndex?: LumiplanCustomIndex
}

export interface LumiplanStop {
  id: string
  name: string
  subtitle?: string
  isAccessible: boolean
  hasGapWhenSteppingOff: boolean
  connectedLines: LumiplanLine[]
}

export interface LumiplanStopWithTime {
  stop: LumiplanStop
  timeOfArrival: string
  timeOfDeparture: string
  isTerminus: boolean
  isFirstStop: boolean
  isStopSkipped: boolean
}

export interface LumiplanSaveFile {
  header: { dateTime: string, version: string, name: string }
  lines: LumiplanLine[]
  journey: {
    line: LumiplanLine
    desserte: {
      id: string
      direction: string
      isLimitedService: boolean
      stops: LumiplanStopWithTime[]
    }
  }
  messages: { effect: string, message: string }[]
}

export const LUMIPLAN_SAVE_FILE_VERSION = '2.0.0'

/* //////////////////// Énumération des chemins //////////////////// */

export interface LinePath {
  label: string
  stops: Stop[]
}

function isStop(element: BranchElement): element is Stop {
  return '$stop' in element
}

function branchStops(branch: Branch): Stop[] {
  return branch.$branch.elements.filter(isStop)
}

/**
 * Énumère les suites d'arrêts possibles d'une liste de sections.
 * Chaque ParallelBranches double les chemins (haut / bas) ; les Fork
 * sont purement visuels ; une Loop apporte son arrêt éventuel.
 */
function enumerateSections(sections: LineSection[]): Stop[][] {
  let paths: Stop[][] = [[]]

  for (const section of sections) {
    for (const element of section.$lineSection.elements) {
      if ('$branch' in element) {
        const stops = branchStops(element)
        paths = paths.map(p => [...p, ...stops])
      }
      else if ('$parallelBranches' in element) {
        const [top, bottom] = element.$parallelBranches.sections
        const topPaths = enumerateSections([top])
        const bottomPaths = enumerateSections([bottom])
        const next: Stop[][] = []
        for (const p of paths) {
          for (const t of topPaths) next.push([...p, ...t])
          for (const b of bottomPaths) next.push([...p, ...b])
        }
        paths = next
      }
      else if ('$loop' in element && element.$loop.stop) {
        const stop = element.$loop.stop
        paths = paths.map(p => [...p, stop])
      }
      // Fork : élément purement visuel, aucun arrêt.
    }
  }

  return paths
}

export function enumerateLinePaths(topology: LineSection[]): LinePath[] {
  const raw = enumerateSections(topology)
  const unique = new Map<string, Stop[]>()

  for (const stops of raw) {
    if (stops.length < 2) continue
    const key = stops.map(s => s.id).join('>')
    if (!unique.has(key)) unique.set(key, stops)
  }

  return Array.from(unique.values()).map((stops) => {
    const first = stops[0].$stop.name
    const last = stops[stops.length - 1].$stop.name
    return { label: `${first} → ${last} (${stops.length} arrêts)`, stops }
  })
}

/* /////////////////////// Conversion des modes /////////////////////// */

const MODE_MAP: Record<Mode, LumiplanMode | null> = {
  BOAT: 'BOAT',
  BRT: 'BRT',
  BUS: 'BUS',
  AERIAL_TRAMWAY: 'GONDOLA',
  GONDOLA: 'GONDOLA',
  CHAIRLIFT: 'GONDOLA',
  METRO: 'METRO',
  NOCTILIEN: 'NOCTILIEN',
  RER: 'RER',
  SKI_LIFT: 'GONDOLA',
  TRAIN: 'TRANSILIEN',
  TRAIN_RER: 'RER',
  TRAM: 'TRAM',
  TRAM_TRAIN: 'TRAM_TRAIN',
  FUNICULAR: 'FUNICULAR',
  VAL: 'VAL',
  VELO: null,
}

export function toLumiplanMode(mode: Mode | null): LumiplanMode | null {
  if (!mode) return null
  return MODE_MAP[mode] ?? null
}

/* //////////////////// Conversion des indices //////////////////// */

function textColorFor(color: string): string {
  return textContrast(color) ? '#ffffff' : '#231f20'
}

function builtinDisplayName(mode: Mode, index: string): string {
  if (mode === 'TRAM' || mode === 'TRAM_TRAIN') return `T${index}`
  return index.toUpperCase()
}

function findBuiltinColor(mode: Mode, index: string): string | null {
  const found = BUILTIN_LINES.find(l =>
    l.value.mode === mode && l.value.$builtinLineIndex.index === index,
  )
  return found?.color ?? null
}

/**
 * Convertit un LineIndex BULB-MAX (intégré ou personnalisé) en ligne
 * Lumiplan. Les indices personnalisés emportent leur picto complet
 * (customIndex) ; les intégrés s'appuient sur le rendu standard.
 */
export function lineIndexToLumiplanLine(
  lineIndex: LineIndex,
  customIndices: CustomLineIndexDescription[],
  fallbackColor: string | null,
): LumiplanLine | null {
  const lumiplanMode = toLumiplanMode(lineIndex.mode)
  if (!lumiplanMode) return null

  if ('$builtinLineIndex' in lineIndex) {
    const index = lineIndex.$builtinLineIndex.index
    const color = findBuiltinColor(lineIndex.mode, index) ?? fallbackColor ?? '#0a0086'
    const name = builtinDisplayName(lineIndex.mode, index)
    return {
      id: `bulbmax:builtin:${lineIndex.mode.toLowerCase()}:${index.toLowerCase()}`,
      name,
      color,
      textColor: textColorFor(color),
      mode: lumiplanMode,
    }
  }

  const description = customIndices.find(d => d.id === lineIndex.$customLineIndex.id)
  if (!description) return null

  const name = `${description.prefix ?? ''}${description.index}${description.suffix ?? ''}`
  return {
    id: `bulbmax:custom:${description.id}`,
    name,
    color: description.color,
    textColor: textColorFor(description.color),
    mode: lumiplanMode,
    customIndex: {
      shape: description.shape,
      index: description.index,
      prefix: description.prefix || undefined,
      suffix: description.suffix || undefined,
      color: description.color,
    },
  }
}

function stopConnectedLines(
  stop: Stop,
  customIndices: CustomLineIndexDescription[],
): LumiplanLine[] {
  const lines: LumiplanLine[] = []
  for (const connection of stop.$stop.connections) {
    if (!('$modeConnection' in connection)) continue
    for (const element of connection.$modeConnection.elements) {
      const lineIndex = element.$modeConnectionElement.lineIndex
      if (!lineIndex) continue
      const line = lineIndexToLumiplanLine(lineIndex, customIndices, null)
      if (line && !lines.find(l => l.id === line.id)) lines.push(line)
    }
  }
  return lines
}

/* //////////////////////// Construction du fichier //////////////////////// */

export interface LumiplanExportOptions {
  /** Chemin (branche) choisi par l'utilisateur. */
  path: LinePath
  /** Heure de départ du premier arrêt. */
  departure: Date
  /** Minutes entre deux arrêts. */
  intervalMinutes: number
  /** Nom de la course/du fichier. */
  name: string
}

export function buildLumiplanSaveFile(
  line: Line,
  customIndices: CustomLineIndexDescription[],
  options: LumiplanExportOptions,
): LumiplanSaveFile {
  const mainLine: LumiplanLine
    = (line.index && lineIndexToLumiplanLine(line.index, customIndices, line.color))
      ?? {
        id: 'bulbmax:main',
        name: options.name,
        color: line.color ?? '#0a0086',
        textColor: textColorFor(line.color ?? '#0a0086'),
        mode: toLumiplanMode(line.mode) ?? 'BUS',
      }

  const stops = options.path.stops
  const lastIndex = stops.length - 1
  const allLines = new Map<string, LumiplanLine>([[mainLine.id, mainLine]])

  const stopsWithTime: LumiplanStopWithTime[] = stops.map((stop, i) => {
    const arrival = new Date(
      options.departure.getTime() + i * options.intervalMinutes * 60_000,
    )
    const departureTime = new Date(arrival.getTime() + 30_000)
    const connectedLines = stopConnectedLines(stop, customIndices)
    connectedLines.forEach(l => allLines.set(l.id, l))

    return {
      stop: {
        id: `bulbmax:stop:${stop.id}`,
        name: stop.$stop.name,
        subtitle: stop.$stop.subtitle ?? undefined,
        isAccessible: stop.$stop.accessible === true,
        hasGapWhenSteppingOff: false,
        connectedLines,
      },
      timeOfArrival: arrival.toISOString(),
      timeOfDeparture: departureTime.toISOString(),
      isTerminus: i === lastIndex,
      isFirstStop: i === 0,
      isStopSkipped: stop.$stop.closed === true,
    }
  })

  const direction = stops[lastIndex].$stop.name

  return {
    header: {
      dateTime: new Date().toISOString(),
      version: LUMIPLAN_SAVE_FILE_VERSION,
      name: options.name,
    },
    lines: Array.from(allLines.values()),
    journey: {
      line: mainLine,
      desserte: {
        id: `bulbmax:desserte:${Date.now()}`,
        direction,
        isLimitedService: false,
        stops: stopsWithTime,
      },
    },
    messages: [],
  }
}
