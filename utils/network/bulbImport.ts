/*
 * Lecture des projets BULB (plans de ligne) et assemblage d'un réseau multi-lignes.
 *
 * Un projet décrit une ligne par une topologie « série-parallèle » (sections → branches,
 * fourches, branches parallèles, boucles). Chaque combinaison de branches devient un service
 * (un parcours de bout en bout). Les stations sont fusionnées entre lignes par nom normalisé.
 */
import type { NetworkMode } from './types'

const MODE_MAP: Record<string, NetworkMode> = {
  METRO: 'metro',
  VAL: 'metro',
  RER: 'train',
  TRAIN: 'train',
  TRAIN_RER: 'train',
  TRANSILIEN: 'train',
  TRAM: 'tram',
  TRAM_TRAIN: 'tram',
  FUNICULAR: 'tram',
  GONDOLA: 'tram',
  AERIAL_TRAMWAY: 'tram',
  CABLE: 'tram',
  CHAIRLIFT: 'tram',
  SKI_LIFT: 'tram',
  BUS: 'bus',
  NOCTILIEN: 'bus',
  BRT: 'bus',
  BOAT: 'bus',
  VELO: 'bus',
}
const MODE_LABEL: Record<string, string> = {
  METRO: 'Métro',
  RER: 'RER',
  TRAIN: 'Train',
  TRAIN_RER: 'Train',
  TRANSILIEN: 'Transilien',
  TRAM: 'Tram',
  TRAM_TRAIN: 'Tram-train',
  BUS: 'Bus',
  NOCTILIEN: 'Noctilien',
  BRT: 'BHNS',
  VAL: 'VAL',
  FUNICULAR: 'Funiculaire',
  GONDOLA: 'Télécabine',
  AERIAL_TRAMWAY: 'Téléphérique',
  CABLE: 'Câble',
  BOAT: 'Navette fluviale',
  VELO: 'Vélo',
  CHAIRLIFT: 'Télésiège',
  SKI_LIFT: 'Téléski',
}
const MODE_PREFIX: Record<NetworkMode, string> = { metro: 'M', train: 'R', tram: 'T', bus: 'B' }
const DEFAULT_COLOR: Record<NetworkMode, string> = { metro: '#1F5FBF', train: '#7B3FA0', tram: '#2E9E4F', bus: '#F28C28' }
export const DEFAULT_SERVICE: Record<NetworkMode, { start: string, end: string, frequency_min: number }> = {
  metro: { start: '05:30', end: '00:45', frequency_min: 4 },
  train: { start: '05:00', end: '00:30', frequency_min: 10 },
  tram: { start: '05:00', end: '00:30', frequency_min: 6 },
  bus: { start: '06:00', end: '22:30', frequency_min: 10 },
}

export interface ServiceStop { name: string, key: string, terminus: boolean }
export interface ParsedProject {
  id: string
  name: string
  mode: NetworkMode
  bulbMode: string
  index: string
  color: string
  services: ServiceStop[][]
  stopCount: number
}
export interface ImportedLine {
  id: string
  name: string
  group: string
  groupName: string
  mode: NetworkMode
  kind: string
  index: string
  color: string
  start: string
  end: string
  frequency_min: number
  stops: { name: string, key: string }[]
}
export interface ImportedStation { key: string, name: string, lines: string[] }
export interface ImportedNetwork { lines: ImportedLine[], stations: ImportedStation[] }

/** Nom affichable : retours à la ligne et espaces fines → espaces. */
export function displayName(name: unknown): string {
  return String(name ?? '').replace(/[\n\r]+/g, ' ').replace(/[\u202F\u00A0]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Clé de fusion entre lignes : minuscules, sans accents ni ponctuation, abréviations courantes. */
export function normalizeName(name: unknown): string {
  return displayName(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '').replace(/[’'`]/g, '\'').replace(/\bst\b\.?/g, 'saint').replace(/\bste\b\.?/g, 'sainte').replace(/\bpte\b\.?/g, 'porte').replace(/[^a-z0-9]+/g, ' ').trim()
}

function elementKind(e: Record<string, unknown>): string | undefined {
  return Object.keys(e).find(k => k.startsWith('$'))
}

/** Développe une liste d'éléments de topologie en parcours alternatifs (listes d'arrêts BULB). */
export function expandElements(elements: LineElement[] | undefined): Stop[][] {
  let paths: Stop[][] = [[]]
  for (const e of elements ?? []) {
    const kind = elementKind(e as unknown as Record<string, unknown>)
    if (kind === '$branch') {
      const stops = ((e as Branch).$branch.elements ?? []).filter((x): x is Stop => '$stop' in x)
      paths = paths.map(p => p.concat(stops))
    } else if (kind === '$parallelBranches') {
      const alts = ((e as ParallelBranches).$parallelBranches.sections ?? []).map(s => expandElements(s.$lineSection?.elements))
      const next: Stop[][] = []
      for (const p of paths) {
        for (const alt of alts) {
          for (const a of alt) next.push(p.concat(a))
        }
      }
      paths = next
    } else if (kind === '$loop') {
      const stop = (e as Loop).$loop.stop
      if (stop) paths = paths.map(p => p.concat([stop]))
    }
    // $fork : pur élément graphique, sans arrêt
  }
  return paths
}

function lineIndexText(project: Project): string {
  const idx = project.line?.index
  if (!idx) return ''
  if ('$builtinLineIndex' in idx) return String(idx.$builtinLineIndex.index ?? '')
  if ('$customLineIndex' in idx) {
    const c = (project.customIndices ?? []).find(x => x.id === idx.$customLineIndex.id)
    return c ? `${c.prefix ?? ''}${c.index ?? ''}${c.suffix ?? ''}` : ''
  }
  return ''
}

/** Lit un projet BULB → ligne, services et arrêts (sans coordonnées). */
export function parseProject(project: Project, fileName?: string): ParsedProject {
  if (!project || !project.line || !Array.isArray(project.line.topology)) throw new Error(`${fileName ?? 'fichier'} : ce n'est pas un projet BULB (pas de line.topology)`)
  const line = project.line
  const bulbMode = line.mode ?? 'METRO'
  const mode = MODE_MAP[bulbMode] ?? 'bus'
  const index = lineIndexText(project)
  const elements = line.topology.flatMap(s => s.$lineSection?.elements ?? [])
  const services = expandElements(elements)
    .map(p => p.map(s => ({ name: displayName(s.$stop.name), key: normalizeName(s.$stop.name), terminus: !!s.$stop.terminus })))
    .map(p => p.filter((s, i) => i === 0 || s.key !== p[i - 1].key))
    .filter(p => p.length >= 2)
  if (!services.length) throw new Error(`${fileName ?? 'fichier'} : aucune branche avec au moins deux arrêts`)
  const label = MODE_LABEL[bulbMode] ?? bulbMode
  return {
    id: `${MODE_PREFIX[mode]}${index || (fileName ?? '').replace(/\.json$/i, '')}`,
    name: index ? `${label} ${index}` : label,
    mode,
    bulbMode,
    index,
    color: line.color || DEFAULT_COLOR[mode],
    services,
    stopCount: new Set(services.flat().map(s => s.key)).size,
  }
}

/** Assemble plusieurs projets en un réseau (sans coordonnées) : stations fusionnées par nom. */
export function buildNetwork(parsed: ParsedProject[], opts?: { service?: Partial<Record<NetworkMode, Partial<{ start: string, end: string, frequency_min: number }>>> }): ImportedNetwork {
  const stations = new Map<string, { key: string, name: string, lines: Set<string> }>()
  const station = (s: ServiceStop) => {
    let st = stations.get(s.key)
    if (!st) {
      st = { key: s.key, name: s.name, lines: new Set() }
      stations.set(s.key, st)
    }
    return st
  }
  const usedIds = new Set<string>()
  const lines: ImportedLine[] = []
  for (const p of parsed) {
    const nServ = p.services.length
    const base = { ...DEFAULT_SERVICE[p.mode], ...(opts?.service?.[p.mode] ?? {}) }
    p.services.forEach((path, k) => {
      let id = nServ > 1 ? `${p.id}${String.fromCharCode(97 + k)}` : p.id
      while (usedIds.has(id)) id += '\''
      usedIds.add(id)
      const dest = path[path.length - 1].name
      const orig = path[0].name
      let label = `${orig} → ${dest}`
      if (nServ > 1 && p.services.some((q, j) => j !== k && q[0].name === orig && q[q.length - 1].name === dest)) {
        const others = new Set(p.services.filter((q, j) => j !== k).flat().map(s => s.key))
        const own = path.find(s => !others.has(s.key))
        if (own) label += ` via ${own.name}`
      }
      lines.push({
        id,
        name: nServ > 1 ? `${p.name} · ${label}` : p.name,
        group: p.id,
        groupName: p.name,
        mode: p.mode,
        kind: p.bulbMode,
        index: p.index,
        color: p.color,
        start: base.start,
        end: base.end,
        frequency_min: base.frequency_min * nServ,
        stops: path.map((s) => {
          const st = station(s)
          st.lines.add(p.id)
          return { name: st.name, key: st.key }
        }),
      })
    })
  }
  return { lines, stations: [...stations.values()].map(s => ({ key: s.key, name: s.name, lines: [...s.lines] })) }
}
