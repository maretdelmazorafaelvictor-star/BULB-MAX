import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
/*
 * Renseigne le champ `position` (latitude, longitude) des arrêts des presets à partir d'un
 * référentiel d'arrêts géolocalisés — par exemple l'open data Île-de-France Mobilités
 * « Arrêts et lignes associées » (un fichier GeoJSON ou CSV par mode).
 *
 *   pnpm fill:preset-positions chemin/arretslignes*.geojson [--force] [--dry]
 *
 * Les fichiers presets sont modifiés par insertion de texte : le reste du fichier, y compris sa
 * mise en forme, n'est pas touché. Sans --force, un arrêt qui a déjà une position est laissé tel quel.
 */
import process from 'node:process'

const PRESET_ROOT = join(import.meta.dirname, '..', 'data', 'presets')

type Mode = 'metro' | 'train' | 'tram' | 'bus'

/** Mode BULB → famille de mode utilisée pour le rapprochement. */
const BULB_MODES: Record<string, Mode> = {
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
  BUS: 'bus',
  BRT: 'bus',
  NOCTILIEN: 'bus',
}

/** Mode du référentiel → même famille. */
const REF_MODES: Record<string, Mode> = {
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

/** Nom d'arrêt réduit à sa forme comparable (accents, abréviations, ponctuation). */
export function normalizeName(name: unknown): string {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[’'`]/g, '\'')
    .replace(/\bst\b\.?/g, 'saint')
    .replace(/\bste\b\.?/g, 'sainte')
    .replace(/\bpte\b\.?/g, 'porte')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normLine(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '').replace(/bis$/, 'b').replace(/^t(?=\d)/, '')
}

interface GeoStop { name: string, key: string, lat: number, lon: number, line: string, mode: Mode | null }

/** Lit un GeoJSON (features → properties) ou un CSV (séparateur ; ou ,). */
function parseReference(text: string, fileName: string): GeoStop[] {
  const t = text.trim()
  let rows: Record<string, unknown>[]
  if (t.startsWith('{') || t.startsWith('[')) {
    const json = JSON.parse(t)
    const feats: Record<string, any>[] = Array.isArray(json) ? json : (json.features ?? json.records ?? [])
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
      let quoted = false
      for (const c of l) {
        if (c === '"') {
          quoted = !quoted
        } else if (c === sep && !quoted) {
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
      const [a, b] = r.pointgeo.split(',')
      lat = Number(a)
      lon = Number(b)
    }
    if (!name || Number.isNaN(lat) || Number.isNaN(lon)) continue
    const modeRaw = String(r.mode ?? r.transportmode ?? '').toLowerCase()
    stops.push({
      name: String(name).trim(),
      key: normalizeName(name),
      lat,
      lon,
      line: normLine(r.route_long_name ?? r.shortname ?? r.ligne ?? ''),
      mode: REF_MODES[modeRaw] ?? null,
    })
  }
  if (!stops.length) throw new Error(`${fileName} : aucun arrêt avec un nom et des coordonnées`)
  return stops
}

// mots trop fréquents pour attester à eux seuls un rapprochement
const WEAK = new Set(['saint', 'sainte', 'porte', 'gare', 'mairie', 'place', 'pont', 'rue', 'avenue', 'de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'et', 'paris', 'ville', 'centre'])

function tokens(key: string): string[] {
  return key.split(' ').filter(w => w.length > 1 || /\d/.test(w))
}

interface Similarity { score: number, inclusion: boolean, strong: number, shorterIsA: boolean }

function similarity(a: string, b: string): Similarity {
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
  return { score: strong / ((sA + sB - strong) || 1), inclusion: inter === Math.min(A.size, B.size), strong, shorterIsA: A.size <= B.size }
}

/* Un seul jeton significatif ne suffit que si c'est le nom du preset qui est le plus court (le
 * référentiel ajoute un qualificatif) — « Esplanade de la Défense » ne doit pas devenir
 * « La Défense », ni « Porte de Vincennes » devenir « Château de Vincennes ». */
function accept(sim: Similarity, sameLine: boolean, sameMode: boolean): boolean {
  if (!sameLine && !sameMode) return false
  if (sim.inclusion && (sim.strong >= 2 || (sameLine && sim.strong >= 1 && sim.shorterIsA))) return true
  return sim.strong >= 2 && sim.score >= (sameLine ? 0.4 : 0.6)
}

interface Match { lat: number, lon: number, ref: string, how: 'exact' | 'fuzzy' }

function matcher(reference: GeoStop[]) {
  const byKey = new Map<string, GeoStop[]>()
  for (const s of reference) {
    if (!byKey.has(s.key)) byKey.set(s.key, [])
    byKey.get(s.key)!.push(s)
  }
  const avg = (list: GeoStop[]) => ({
    lat: Number((list.reduce((a, s) => a + s.lat, 0) / list.length).toFixed(6)),
    lon: Number((list.reduce((a, s) => a + s.lon, 0) / list.length).toFixed(6)),
  })
  // à nom égal, on privilégie la même ligne, puis le même mode
  const rank = (cands: GeoStop[], line: string, mode: Mode) => {
    const sameLine = cands.filter(c => c.line && c.line === line)
    if (sameLine.length) return sameLine
    const sameMode = cands.filter(c => c.mode === mode)
    return sameMode.length ? sameMode : cands
  }
  return (name: string, line: string, mode: Mode): Match | null => {
    const key = normalizeName(name)
    const exact = byKey.get(key)
    if (exact) {
      const best = rank(exact, line, mode)
      return { ...avg(best), ref: best[0].name, how: 'exact' }
    }
    let best: GeoStop[] | null = null
    let bestScore = 0
    for (const [k, list] of byKey) {
      const sim = similarity(key, k)
      const sameLine = list.some(c => c.line && c.line === line)
      const sameMode = list.some(c => c.mode === mode)
      if (!accept(sim, sameLine, sameMode)) continue
      const score = sim.score + (sim.inclusion ? 0.5 : 0) + (sameLine ? 0.25 : 0)
      if (score > bestScore) {
        best = list
        bestScore = score
      }
    }
    if (!best) return null
    const b = rank(best, line, mode)
    return { ...avg(b), ref: b[0].name, how: 'fuzzy' }
  }
}

/** Indice de la ligne d'un preset, tel qu'il sert au rapprochement (« 3bis » → « 3b »). */
function lineIndex(project: Record<string, any>): string {
  const idx = project.line?.index
  if (!idx) return ''
  if (idx.$builtinLineIndex) return normLine(idx.$builtinLineIndex.index)
  const custom = (project.customIndices ?? []).find((c: any) => c.id === idx.$customLineIndex?.id)
  return custom ? normLine(`${custom.prefix ?? ''}${custom.index ?? ''}${custom.suffix ?? ''}`) : ''
}

/** Arrêts du preset, dans l'ordre où ils apparaissent dans le fichier. */
function collectStops(value: unknown, out: Record<string, any>[] = []): Record<string, any>[] {
  if (Array.isArray(value)) {
    for (const v of value) collectStops(v, out)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '$stop' && v && typeof v === 'object') out.push(v as Record<string, any>)
      collectStops(v, out)
    }
  }
  return out
}

/** Position, dans le texte du fichier, de l'accolade ouvrante de chaque objet `$stop`. */
function stopBraces(text: string): number[] {
  const out: number[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"') {
      const start = i
      i++
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
      if (text.slice(start, i + 1) === '"$stop"') {
        let j = i + 1
        while (j < text.length && text[j] !== '{') j++
        out.push(j)
      }
    }
    i++
  }
  return out
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const dry = args.includes('--dry')
const refFiles = args.filter(a => !a.startsWith('--'))
if (!refFiles.length) {
  console.error('Usage : pnpm fill:preset-positions <référentiel.geojson|csv> [...] [--force] [--dry]')
  process.exit(1)
}

const reference = refFiles.flatMap(f => parseReference(readFileSync(f, 'utf8'), basename(f)))
const match = matcher(reference)
console.log(`Référentiel : ${reference.length} arrêts géolocalisés (${refFiles.length} fichier(s))`)

const files = readdirSync(PRESET_ROOT, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .flatMap(d => readdirSync(join(PRESET_ROOT, d.name)).filter(f => f.endsWith('.json')).map(f => join(PRESET_ROOT, d.name, f)))
  .sort()

let total = 0
let filled = 0
let fuzzy = 0
const missing = new Set<string>()

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const project = JSON.parse(text)
  const stops = collectStops(project)
  const braces = stopBraces(text)
  if (stops.length !== braces.length) throw new Error(`${basename(file)} : ${stops.length} arrêts mais ${braces.length} objets $stop repérés dans le texte`)
  const mode = BULB_MODES[project.line?.mode] ?? 'bus'
  const line = lineIndex(project)
  const inserts: { at: number, text: string }[] = []
  let done = 0
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]
    total++
    if (stop.position && !force) {
      filled++
      done++
      continue
    }
    const found = match(stop.name, line, mode)
    if (!found) {
      missing.add(String(stop.name).replace(/\s+/g, ' '))
      continue
    }
    if (found.how === 'fuzzy') fuzzy++
    filled++
    done++
    if (stop.position) continue // --force sur un arrêt déjà renseigné : on ne réécrit pas le texte
    const brace = braces[i]
    const after = text.slice(brace + 1, brace + 200)
    const indent = /^\r?\n([ \t]*)/.exec(after)?.[1]
    const value = `{ "lat": ${found.lat}, "lon": ${found.lon} }`
    inserts.push({
      at: brace + 1,
      text: indent === undefined ? `"position":${value.replace(/\s+/g, '')},` : `\n${indent}"position": ${value},`,
    })
  }
  let out = text
  for (const ins of inserts.reverse()) out = out.slice(0, ins.at) + ins.text + out.slice(ins.at)
  if (inserts.length && !dry) writeFileSync(file, out)
  console.log(`${basename(file).padEnd(22)} ${String(done).padStart(3)}/${String(stops.length).padEnd(3)} arrêts situés`)
}

console.log(`\n${filled}/${total} arrêts situés (${fuzzy} par rapprochement approché)`)
if (missing.size) console.log(`Sans position (${missing.size}) : ${[...missing].join(', ')}`)
if (dry) console.log('(--dry : aucun fichier modifié)')
