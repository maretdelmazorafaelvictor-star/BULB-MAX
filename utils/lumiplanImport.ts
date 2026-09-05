/*
 * Import depuis Lumiplan : convertit un SaveFile v2 (éditeur Lumiplan)
 * en ligne BULB-MAX éditable.
 *
 * Limites structurelles assumées :
 *  - une desserte Lumiplan est linéaire : la ligne importée n'a qu'une
 *    branche (enrichissable ensuite dans l'éditeur) ;
 *  - les horaires ne sont pas repris (BULB-MAX n'en stocke pas).
 */

import { BUILTIN_LINES } from '../data/lines'
import type {
  LumiplanCustomIndex,
  LumiplanLine,
  LumiplanMode,
  LumiplanSaveFile,
  LumiplanStopWithTime,
} from './lumiplan'

/* /////////////////////// Modes Lumiplan -> BULB /////////////////////// */

const REVERSE_MODE_MAP: Record<LumiplanMode, Mode> = {
  RER: 'RER',
  METRO: 'METRO',
  TRAM: 'TRAM',
  BUS: 'BUS',
  TER: 'TRAIN',
  NOCTILIEN: 'NOCTILIEN',
  BUS_REMPLACEMENT: 'BUS',
  BUS_AEROPORT: 'BUS',
  TRANSILIEN: 'TRAIN',
  CABLE: 'GONDOLA',
  VAL: 'VAL',
  FUNICULAR: 'FUNICULAR',
  GONDOLA: 'GONDOLA',
  TRAM_TRAIN: 'TRAM_TRAIN',
  BRT: 'BRT',
  BOAT: 'BOAT',
}

export function fromLumiplanMode(mode: LumiplanMode): Mode {
  return REVERSE_MODE_MAP[mode] ?? 'BUS'
}

/* //////////////////////// Indices de ligne //////////////////////// */

/** Retrouve l'indice intégré correspondant à une ligne Lumiplan (mode +
 *  nom affiché, en tenant compte du préfixe T des trams). */
function findBuiltinIndex(mode: Mode, name: string): string | null {
  const normalized = name.trim().toUpperCase()
  const candidate = (mode === 'TRAM' || mode === 'TRAM_TRAIN')
    ? normalized.replace(/^T/, '')
    : normalized

  const found = BUILTIN_LINES.find(l =>
    l.value.mode === mode
    && l.value.$builtinLineIndex.index.toUpperCase() === candidate,
  )
  return found?.value.$builtinLineIndex.index ?? null
}

/** Id stable pour un indice personnalisé importé : on retrouve l'id
 *  d'origine des exports BULB-MAX (aller-retour sans doublon), sinon
 *  on en génère un. */
function customIndexId(line: LumiplanLine): string {
  const match = /^bulbmax:custom:(.+)$/.exec(line.id)
  return match ? match[1] : crypto.randomUUID()
}

function customIndexFromLumiplan(
  line: LumiplanLine,
  mode: Mode,
  custom: LumiplanCustomIndex,
): CustomLineIndexDescription {
  return {
    id: customIndexId(line),
    index: custom.index,
    prefix: custom.prefix ?? '',
    suffix: custom.suffix ?? '',
    shape: custom.shape,
    mode,
    color: custom.color,
  }
}

export interface ImportedIndex {
  lineIndex: LineIndex
  customIndex: CustomLineIndexDescription | null
}

/**
 * Convertit une ligne Lumiplan en indice BULB-MAX :
 *  - picto personnalisé -> indice personnalisé fidèle ;
 *  - sinon indice intégré si mode + nom correspondent ;
 *  - sinon indice personnalisé rond de repli (nom + couleur conservés).
 */
export function lumiplanLineToIndex(line: LumiplanLine): ImportedIndex {
  const mode = fromLumiplanMode(line.mode)

  if (line.customIndex) {
    const description = customIndexFromLumiplan(line, mode, line.customIndex)
    return {
      lineIndex: { mode, $customLineIndex: { id: description.id } },
      customIndex: description,
    }
  }

  const builtin = findBuiltinIndex(mode, line.name)
  if (builtin !== null) {
    return {
      lineIndex: { mode, $builtinLineIndex: { index: builtin } },
      customIndex: null,
    }
  }

  const fallback: CustomLineIndexDescription = {
    id: customIndexId(line),
    index: line.name,
    prefix: '',
    suffix: '',
    shape: 'CIRCLE',
    mode,
    color: line.color,
  }
  return {
    lineIndex: { mode, $customLineIndex: { id: fallback.id } },
    customIndex: fallback,
  }
}

/* /////////////////////////// Conversion /////////////////////////// */

function stopFromLumiplan(
  entry: LumiplanStopWithTime,
  isFirst: boolean,
  isLast: boolean,
  collectIndex: (line: LumiplanLine) => LineIndex,
): Stop {
  const byMode = new Map<Mode, ModeConnectionElement[]>()

  for (const connectedLine of entry.stop.connectedLines) {
    const mode = fromLumiplanMode(connectedLine.mode)
    const elements = byMode.get(mode) ?? []
    elements.push({
      id: crypto.randomUUID(),
      $modeConnectionElement: {
        lineIndex: collectIndex(connectedLine),
        walk: false,
        ornament: null,
      },
    })
    byMode.set(mode, elements)
  }

  const connections: ModeConnection[] = Array.from(byMode.entries()).map(
    ([mode, elements]) => ({
      id: crypto.randomUUID(),
      $modeConnection: { mode, elements, walk: false },
    }),
  )

  return {
    id: crypto.randomUUID(),
    $stop: {
      name: entry.stop.name,
      placeName: '',
      subtitle: entry.stop.subtitle ?? '',
      accessible: entry.stop.isAccessible,
      reverse: false,
      interestPoint: false,
      preventSubtitleOverlapping: false,
      closed: entry.isStopSkipped,
      terminus: isFirst || isLast,
      connections,
    },
  }
}

export interface LumiplanImportResult {
  line: Line
  customIndices: CustomLineIndexDescription[]
}

/**
 * Convertit un SaveFile v2 Lumiplan en ligne BULB-MAX à une branche.
 * brandStyle et operator ne sont pas décidés ici : le chargeur conserve
 * ceux du projet courant.
 */
export function lumiplanSaveFileToLine(saveFile: LumiplanSaveFile): LumiplanImportResult {
  const stops = saveFile.journey?.desserte?.stops
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('SaveFile Lumiplan sans desserte exploitable')
  }

  const customIndices = new Map<string, CustomLineIndexDescription>()
  const indexCache = new Map<string, LineIndex>()

  const collectIndex = (lumiplanLine: LumiplanLine): LineIndex => {
    const cached = indexCache.get(lumiplanLine.id)
    if (cached) return cached
    const { lineIndex, customIndex } = lumiplanLineToIndex(lumiplanLine)
    if (customIndex) customIndices.set(customIndex.id, customIndex)
    indexCache.set(lumiplanLine.id, lineIndex)
    return lineIndex
  }

  const mainIndex = collectIndex(saveFile.journey.line)
  const lastIndex = stops.length - 1

  const branch: Branch = {
    id: crypto.randomUUID(),
    $branch: {
      elementSpacing: 1,
      invertedElements: false,
      elements: stops.map((entry, i) =>
        stopFromLumiplan(entry, i === 0, i === lastIndex, collectIndex),
      ),
    },
  }

  const line: Line = {
    mode: fromLumiplanMode(saveFile.journey.line.mode),
    index: mainIndex,
    color: saveFile.journey.line.color ?? null,
    lineThickness: null,
    lineStyle: null,
    dotsColorPolicy: null,
    mapSize: null,
    fullyAccessible: stops.every(s => s.stop.isAccessible),
    frameTerminusNames: false,
    terminusNamesLineColor: false,
    brandStyle: 'RATP',
    operator: 'RATP',
    topology: [{
      id: crypto.randomUUID(),
      $lineSection: { elements: [branch] },
    }],
  }

  return { line, customIndices: Array.from(customIndices.values()) }
}
