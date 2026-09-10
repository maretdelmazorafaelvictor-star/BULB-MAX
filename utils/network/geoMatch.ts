/*
 * Géolocalisation des stations d'un réseau importé à partir d'un référentiel d'arrêts
 * (open data IDFM « Arrêts et lignes associées », GeoJSON ou CSV, ou tout fichier équivalent).
 *
 * Rapprochement par nom normalisé, en privilégiant la même ligne, puis le même mode ; à défaut,
 * rapprochement approché par jetons, uniquement au sein du même mode.
 */
import type { ImportedNetwork, ParsedProject } from './bulbImport'
import type { NetworkMode } from './types'
import { normalizeName } from './bulbImport'

const MODE_MAP: Record<string, NetworkMode> = {
  metro: 'metro',
  rer: 'train',
  rapidtransit: 'train',
  train: 'train',
  localtrain: 'train',
  tramway: 'tram',
  tram: 'tram',
  val: 'metro',
  railshuttle: 'metro',
  cableway: 'tram',
  funicular: 'tram',
  funiculaire: 'tram',
  bus: 'bus',
  noctilien: 'bus',
}

export interface GeoStop { name: string, key: string, lat: number, lon: number, line: string, mode: NetworkMode | string | null, commune: string | null }
export interface GeoPosition { lat: number, lon: number, commune: string | null, how: 'exact' | 'fuzzy', ref: string, score?: number }
export interface MatchResult { positions: Map<string, GeoPosition>, unmatched: string[], matched: number, total: number }

export function normLine(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '').replace(/bis$/, 'b').replace(/^t(?=\d)/, '')
}

/** Lit un GeoJSON (features → properties) ou un CSV (séparateur ; ou ,) → liste d'arrêts géolocalisés. */
export function parseReference(text: string, fileName?: string): GeoStop[] {
  const t = text.trim()
  let rows: Record<string, unknown>[]
  if (t.startsWith('{') || t.startsWith('[')) {
    const j = JSON.parse(t)
    const feats: any[] = Array.isArray(j) ? j : (j.features ?? j.records ?? [])
    rows = feats.map((f) => {
      const p = f.properties ?? f.fields ?? f.record?.fields ?? f
      const g = f.geometry?.coordinates
      return { ...p, ...(g && p.stop_lat == null ? { stop_lon: g[0], stop_lat: g[1] } : {}) }
    })
  } else {
    const lines = t.split(/\r?\n/).filter(Boolean)
    const sep = (lines[0].match(/;/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? ';' : ','
    const split = (l: string) => {
      const out: string[] = []
      let cur = ''
      let q = false
      for (const c of l) {
        if (c === '"') {
          q = !q
        } else if (c === sep && !q) {
          out.push(cur)
          cur = ''
        } else {
          cur += c
        }
      }
      out.push(cur)
      return out
    }
    const head = split(lines[0]).map(h => h.trim().toLowerCase())
    rows = lines.slice(1).map((l) => {
      const v = split(l)
      const o: Record<string, unknown> = {}
      head.forEach((h, i) => o[h] = v[i])
      return o
    })
  }
  const stops: GeoStop[] = []
  for (const r of rows) {
    const name = r.stop_name ?? r.nom_arret ?? r.name ?? r.nom
    let lat = Number(r.stop_lat ?? r.lat)
    let lon = Number(r.stop_lon ?? r.lon)
    if ((Number.isNaN(lat) || Number.isNaN(lon)) && typeof r.pointgeo === 'string') {
      const m = r.pointgeo.split(',')
      lat = Number(m[0])
      lon = Number(m[1])
    }
    if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue
    const modeRaw = String(r.mode ?? r.transportmode ?? '').toLowerCase()
    stops.push({
      name: String(name).trim(),
      key: normalizeName(name),
      lat,
      lon,
      line: normLine(r.route_long_name ?? r.shortname ?? r.ligne ?? ''),
      mode: MODE_MAP[modeRaw] ?? modeRaw ?? null,
      commune: (r.nom_commune ?? r.commune ?? null) as string | null,
    })
  }
  if (!stops.length) throw new Error(`${fileName ?? 'référentiel'} : aucun arrêt avec nom et coordonnées`)
  return stops
}

// mots trop fréquents pour attester à eux seuls un rapprochement
const WEAK = new Set(['saint', 'sainte', 'porte', 'gare', 'mairie', 'place', 'pont', 'rue', 'avenue', 'de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'paris', 'ville', 'centre'])
function tokens(key: string): string[] {
  return key.split(' ').filter(w => w.length > 1 || /\d/.test(w))
}

export interface Similarity { score: number, inclusion: boolean, strong: number, shorterIsA: boolean }
export function similarity(a: string, b: string): Similarity {
  const A = new Set(tokens(a))
  const B = new Set(tokens(b))
  if (!A.size || !B.size) return { score: 0, inclusion: false, strong: 0, shorterIsA: true }
  let inter = 0
  let strong = 0
  let sA = 0
  let sB = 0
  for (const w of A) {
    if (!WEAK.has(w)) sA++
    if (B.has(w)) {
      inter++
      if (!WEAK.has(w)) strong++
    }
  }
  for (const w of B) {
    if (!WEAK.has(w)) sB++
  }
  const inclusion = inter === Math.min(A.size, B.size)
  const score = strong / ((sA + sB - strong) || 1)
  return { score, inclusion, strong, shorterIsA: A.size <= B.size }
}

/* Inclusion avec un seul jeton significatif : seulement si c'est le nom du réseau qui est le plus
 * court (le référentiel ajoute un qualificatif : « Pont Marie (Cité des Arts) »), jamais l'inverse
 * (« Esplanade de la Défense » ne doit pas devenir « La Défense »). */
function accept(sim: Similarity, sameLine: boolean, sameMode: boolean): boolean {
  if (!sameLine && !sameMode) return false
  if (sim.inclusion && (sim.strong >= 2 || (sameLine && sim.strong >= 1 && sim.shorterIsA))) return true
  // similarité partielle : au moins deux jetons significatifs communs (« Porte de Vincennes » ≠ « Château de Vincennes »)
  return sim.strong >= 2 && sim.score >= (sameLine ? 0.4 : 0.6)
}

/** Pour chaque station du réseau : position GPS trouvée dans le référentiel, ou rien. */
export function matchStations(network: ImportedNetwork, reference: GeoStop[], parsedProjects?: ParsedProject[]): MatchResult {
  const byKey = new Map<string, GeoStop[]>()
  for (const s of reference) {
    if (!byKey.has(s.key)) byKey.set(s.key, [])
    byKey.get(s.key)!.push(s)
  }
  const stationLines = new Map<string, { line: string, mode: NetworkMode }[]>()
  for (const p of parsedProjects ?? []) {
    for (const path of p.services) {
      for (const s of path) {
        if (!stationLines.has(s.key)) stationLines.set(s.key, [])
        stationLines.get(s.key)!.push({ line: normLine(p.index), mode: p.mode })
      }
    }
  }
  const avg = (list: GeoStop[]) => ({
    lat: list.reduce((a, s) => a + s.lat, 0) / list.length,
    lon: list.reduce((a, s) => a + s.lon, 0) / list.length,
    commune: list.find(s => s.commune)?.commune ?? null,
  })
  const rank = (cands: GeoStop[], ctx: { line: string, mode: NetworkMode }[]) => {
    const sameLine = cands.filter(c => ctx.some(x => x.line && x.line === c.line))
    if (sameLine.length) return sameLine
    const sameMode = cands.filter(c => ctx.some(x => x.mode && x.mode === c.mode))
    return sameMode.length ? sameMode : cands
  }
  const result = new Map<string, GeoPosition>()
  const unmatched: string[] = []
  for (const st of network.stations) {
    const ctx = stationLines.get(st.key) ?? []
    const exact = byKey.get(st.key)
    if (exact) {
      const best = rank(exact, ctx)
      result.set(st.key, { ...avg(best), how: 'exact', ref: best[0].name })
      continue
    }
    let best: GeoStop[] | null = null
    let bestScore = 0
    for (const [key, list] of byKey) {
      const sim = similarity(st.key, key)
      const sameLine = list.some(c => ctx.some(x => x.line && x.line === c.line))
      const sameMode = list.some(c => ctx.some(x => x.mode && x.mode === c.mode))
      if (!accept(sim, sameLine, sameMode)) continue
      const sc = sim.score + (sim.inclusion ? 0.5 : 0) + (sameLine ? 0.25 : 0)
      if (sc > bestScore) {
        best = list
        bestScore = sc
      }
    }
    if (best) {
      const b = rank(best, ctx)
      result.set(st.key, { ...avg(b), how: 'fuzzy', score: bestScore, ref: b[0].name })
    } else {
      unmatched.push(st.name)
    }
  }
  return { positions: result, unmatched, matched: result.size, total: network.stations.length }
}
