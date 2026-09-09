/*
 * Moteur du plan de réseau : construction du réseau (projection, tracés lissés, stations et
 * correspondances), horaires aux arrêts (départs toutes les `frequency_min` minutes entre
 * `start` et `end`), itinéraires, et position des véhicules à un instant donné.
 *
 * Tout est déterministe en fonction de l'heure de la journée t (secondes depuis minuit).
 */
import type { NetworkData, NetworkLine, NetworkMode } from './types'

export const KM_PER_DEG = 111.32
export const DAY = 86400
const SUBDIV = 8

export interface ModeDefaults { label: string, speed_kmh: number, dwell_s: number, terminus_s: number, accel: number, rank: number }
export const MODE_DEFAULTS: Record<NetworkMode, ModeDefaults> = {
  metro: { label: 'Métro', speed_kmh: 34, dwell_s: 25, terminus_s: 60, accel: 0.25, rank: 4 },
  train: { label: 'Train', speed_kmh: 75, dwell_s: 45, terminus_s: 90, accel: 0.15, rank: 3 },
  tram: { label: 'Tram', speed_kmh: 22, dwell_s: 20, terminus_s: 60, accel: 0.25, rank: 2 },
  bus: { label: 'Bus', speed_kmh: 18, dwell_s: 15, terminus_s: 45, accel: 0.30, rank: 1 },
}

export type Point = [number, number]

export interface Projection {
  center: { lat: number, lon: number }
  toXY: (lat: number, lon: number) => { x: number, y: number }
  toLatLon: (x: number, y: number) => { lat: number, lon: number }
}

export interface LineStop { name: string, x: number, y: number, dist: number, label: string | null, commune: string | null, index: number }

export interface Leg { move: boolean, from?: number, to?: number, at?: number, t0: number, t1: number, len?: number, d0: number }

export interface Timeline {
  dir: 0 | 1
  seq: LineStop[]
  dists: number[]
  legs: Leg[]
  duration: number
  accel: number
  origin: LineStop
  destination: LineStop
  arrive: number[]
  depart: number[]
}

export interface Line {
  id: string
  name: string
  group: string
  mode: NetworkMode
  modeLabel: string
  color: string
  index: number
  rank: number
  speed: number
  dwell: number
  terminus: number
  freq: number
  loop: boolean
  start: number
  end: number
  endAbs: number
  samples: Point[]
  cum: number[]
  total: number
  stops: LineStop[]
  timelines: Timeline[]
  nTripsPerDir: number
  raw: NetworkLine
}

export interface Station {
  name: string
  x: number
  y: number
  lines: Line[]
  groups: string[]
  interchange: boolean
  color: string
  label: string | null
  commune: string | null
  /** indice de l'arrêt dans chaque ligne (par identifiant de ligne) */
  stopsByLine: Map<string, number>
}

export interface Network {
  meta: NetworkData['meta']
  decor: unknown
  center: { lat: number, lon: number }
  proj: Projection
  lines: Line[]
  stations: Station[]
  bounds: { minX: number, minY: number, maxX: number, maxY: number }
}

export interface Vehicle {
  id: string
  line: Line
  dir: 0 | 1
  trip: number
  dep: number
  x: number
  y: number
  bearing: number
  state: 'boarding' | 'dwell' | 'moving' | 'arrived'
  s: number
  along: number
  atStop: LineStop | null
  nextStop: LineStop | null
  destination: LineStop
  eta?: number
  wait?: number
}

/* ---------- temps ---------- */
export function parseTime(s: string | number): number {
  if (typeof s === 'number' && Number.isFinite(s)) return s
  const m = /^\s*(\d{1,2})[:h](\d{2})(?::(\d{2}))?\s*$/.exec(String(s))
  if (!m) throw new Error(`Heure invalide : « ${s} » (format attendu HH:MM)`)
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + (m[3] ? Number(m[3]) : 0)
}

export function formatTime(t: number, withSeconds = false): string {
  t = ((t % DAY) + DAY) % DAY
  const p = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(t / 3600)
  const m = Math.floor(t / 60) % 60
  const s = Math.floor(t % 60)
  return withSeconds ? `${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}`
}

/* ---------- projection équirectangulaire centrée ---------- */
export function makeProjection(center: { lat: number, lon: number }): Projection {
  const cos = Math.cos(center.lat * Math.PI / 180)
  return {
    center,
    toXY: (lat, lon) => ({ x: (lon - center.lon) * KM_PER_DEG * cos, y: (lat - center.lat) * KM_PER_DEG }),
    toLatLon: (x, y) => ({ lat: center.lat + y / KM_PER_DEG, lon: center.lon + x / (KM_PER_DEG * cos) }),
  }
}

/* ---------- lissage : spline de Catmull-Rom centripète ---------- */
export function smoothPath(pts: Point[], subdiv: number, closed: boolean): Point[] {
  const n = pts.length
  if (n < 3) return pts.map(p => [p[0], p[1]])
  const get = (i: number): Point => {
    if (closed) {
      const m = n - 1
      return pts[((i % m) + m) % m]
    }
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]]
    if (i >= n) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]]
    return pts[i]
  }
  const out: Point[] = [[pts[0][0], pts[0][1]]]
  const knot = (a: Point, b: Point, t: number) => {
    const d = Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]))
    return t + (d > 1e-9 ? d : 1e-6)
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    const t0 = 0
    const t1 = knot(p0, p1, t0)
    const t2 = knot(p1, p2, t1)
    const t3 = knot(p2, p3, t2)
    for (let j = 1; j <= subdiv; j++) {
      const t = t1 + (t2 - t1) * j / subdiv
      const lerp = (a: Point, b: Point, ta: number, tb: number): Point => {
        const w = (t - ta) / (tb - ta)
        return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]
      }
      const A1 = lerp(p0, p1, t0, t1)
      const A2 = lerp(p1, p2, t1, t2)
      const A3 = lerp(p2, p3, t2, t3)
      const B1 = lerp(A1, A2, t0, t2)
      const B2 = lerp(A2, A3, t1, t3)
      const C = lerp(B1, B2, t1, t2)
      out.push(j === subdiv ? [p2[0], p2[1]] : C)
    }
  }
  return out
}

/* ---------- profil de vitesse trapézoïdal ---------- */
export function trapezoid(u: number, p: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  p = Math.min(Math.max(p, 0.05), 0.5)
  const vmax = 1 / (1 - p)
  if (u < p) return vmax * u * u / (2 * p)
  if (u <= 1 - p) return vmax * (p / 2 + (u - p))
  const r = 1 - u
  return 1 - vmax * r * r / (2 * p)
}

/* ---------- construction ---------- */
function buildLine(raw: NetworkLine, proj: Projection, index: number): Line {
  if (!raw || !Array.isArray(raw.stops)) throw new Error(`Ligne sans liste d'arrêts (index ${index})`)
  const id = String(raw.id ?? raw.name ?? index + 1)
  const mode: NetworkMode = MODE_DEFAULTS[raw.mode] ? raw.mode : 'bus'
  const def = MODE_DEFAULTS[mode]
  const speed = Number(raw.speed_kmh) > 0 ? Number(raw.speed_kmh) : def.speed_kmh
  const dwell = raw.dwell_s != null ? Number(raw.dwell_s) : def.dwell_s
  const terminus = raw.terminus_s != null ? Number(raw.terminus_s) : def.terminus_s
  const freq = (Number(raw.frequency_min) > 0 ? Number(raw.frequency_min) : 10) * 60
  const loop = !!raw.loop

  const ctrl = raw.stops.map((s, i) => {
    if (typeof s.lat !== 'number' || typeof s.lon !== 'number') throw new Error(`Ligne ${id} : arrêt ${i + 1} sans coordonnées lat/lon`)
    const p = proj.toXY(s.lat, s.lon)
    return { x: p.x, y: p.y, stop: !s.waypoint, name: s.name || `Arrêt ${i + 1}`, label: s.label ?? null, commune: s.commune ?? null }
  })
  if (ctrl.filter(c => c.stop).length < 2) throw new Error(`Ligne ${id} : il faut au moins deux arrêts`)
  if (!ctrl[0].stop || (!loop && !ctrl[ctrl.length - 1].stop)) throw new Error(`Ligne ${id} : le tracé doit commencer et finir par un arrêt`)

  const ctrlPath = loop ? ctrl.concat([ctrl[0]]) : ctrl
  const samples = smoothPath(ctrlPath.map(c => [c.x, c.y] as Point), SUBDIV, loop)
  const cum = [0]
  for (let i = 1; i < samples.length; i++) cum.push(cum[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]))
  const total = cum[cum.length - 1]

  const stops: LineStop[] = []
  ctrlPath.forEach((c, i) => {
    if (c.stop) stops.push({ name: c.name, x: c.x, y: c.y, dist: cum[i * SUBDIV], label: c.label, commune: c.commune, index: stops.length })
  })

  const start = parseTime(raw.start ?? '05:00')
  const end = parseTime(raw.end ?? '00:00')
  const line: Line = {
    id,
    name: raw.name || id,
    group: raw.group != null ? String(raw.group) : id,
    mode,
    modeLabel: def.label,
    color: raw.color || '#666',
    index,
    rank: def.rank,
    speed,
    dwell,
    terminus,
    freq,
    loop,
    start,
    end,
    endAbs: end < start ? end + DAY : end,
    samples,
    cum,
    total,
    stops,
    timelines: [],
    nTripsPerDir: 0,
    raw,
  }
  line.timelines = (loop ? [0] : [0, 1]).map(d => makeTimeline(line, d as 0 | 1, def.accel))
  line.nTripsPerDir = Math.floor((line.endAbs - line.start) / freq) + 1
  return line
}

function makeTimeline(line: Line, dir: 0 | 1, accel: number): Timeline {
  const seq = dir === 0 ? line.stops : line.stops.slice().reverse()
  const dists = seq.map(s => dir === 0 ? s.dist : line.total - s.dist)
  const legs: Leg[] = []
  let t = 0
  for (let k = 0; k < seq.length - 1; k++) {
    const len = dists[k + 1] - dists[k]
    const travel = len / line.speed * 3600
    legs.push({ move: true, from: k, to: k + 1, t0: t, t1: t + travel, len, d0: dists[k] })
    t += travel
    if (k < seq.length - 2) {
      legs.push({ move: false, at: k + 1, t0: t, t1: t + line.dwell, d0: dists[k + 1] })
      t += line.dwell
    }
  }
  const arrive = [0]
  const depart = [0]
  for (const g of legs) {
    if (g.move) {
      arrive[g.to!] = g.t1
      depart[g.to!] = g.t1
    } else {
      depart[g.at!] = g.t1
    }
  }
  return { dir, seq, dists, legs, duration: t, accel, origin: seq[0], destination: seq[seq.length - 1], arrive, depart }
}

interface State { state: Vehicle['state'], s: number, atStop: number | null, nextStop: number | null, prevStop?: number, wait?: number, eta?: number, u?: number }

function stateAt(line: Line, tl: Timeline, tau: number): State | null {
  if (tau < -line.terminus || tau > tl.duration + line.terminus) return null
  if (tau < 0) return { state: 'boarding', s: 0, atStop: 0, nextStop: 1, wait: -tau }
  if (tau >= tl.duration) return { state: 'arrived', s: tl.dists[tl.dists.length - 1], atStop: tl.seq.length - 1, nextStop: null }
  let lo = 0
  let hi = tl.legs.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tl.legs[mid].t0 <= tau) lo = mid
    else hi = mid - 1
  }
  const leg = tl.legs[lo]
  if (!leg.move) return { state: 'dwell', s: leg.d0, atStop: leg.at!, nextStop: leg.at! + 1, wait: leg.t1 - tau }
  const u = (tau - leg.t0) / (leg.t1 - leg.t0)
  const f = trapezoid(u, tl.accel)
  return { state: 'moving', s: leg.d0 + f * leg.len!, atStop: null, prevStop: leg.from, nextStop: leg.to!, u, eta: leg.t1 - tau }
}

export function positionAlong(line: Line, along: number): { x: number, y: number, seg: number } {
  const cum = line.cum
  const samples = line.samples
  if (along <= 0) return { x: samples[0][0], y: samples[0][1], seg: 0 }
  if (along >= line.total) {
    const n = samples.length - 1
    return { x: samples[n][0], y: samples[n][1], seg: n - 1 }
  }
  let lo = 0
  let hi = cum.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= along) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[lo + 1]
  const w = (along - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1)
  return { x: a[0] + (b[0] - a[0]) * w, y: a[1] + (b[1] - a[1]) * w, seg: lo }
}

export function build(data: NetworkData): Network {
  if (!data || !Array.isArray(data.lines) || data.lines.length === 0) throw new Error('La base doit contenir un tableau « lines » non vide')
  let center = data.meta?.center
  if (!center) {
    let n = 0
    let lat = 0
    let lon = 0
    data.lines.forEach(l => (l.stops || []).forEach((s) => {
      if (typeof s.lat === 'number') {
        lat += s.lat
        lon += s.lon
        n++
      }
    }))
    center = { lat: lat / (n || 1), lon: lon / (n || 1) }
  }
  const proj = makeProjection(center)
  const lines = data.lines.map((l, i) => buildLine(l, proj, i))

  const byName = new Map<string, Station>()
  lines.forEach(line => line.stops.forEach((s, k) => {
    if (line.loop && k === line.stops.length - 1) return
    let st = byName.get(s.name)
    if (!st) {
      st = { name: s.name, x: s.x, y: s.y, lines: [], groups: [], interchange: false, color: line.color, label: s.label, commune: s.commune, stopsByLine: new Map() }
      byName.set(s.name, st)
    }
    if (!st.lines.includes(line)) st.lines.push(line)
    if (!st.stopsByLine.has(line.id)) st.stopsByLine.set(line.id, k)
    if (!st.label && s.label) st.label = s.label
    if (!st.commune && s.commune) st.commune = s.commune
  }))
  const stations = [...byName.values()]
  stations.forEach((st) => {
    st.groups = [...new Set(st.lines.map(l => l.group))]
    st.interchange = st.groups.length > 1
    st.color = st.lines[0].color
  })

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  lines.forEach(l => l.samples.forEach((p) => {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
  }))
  return { meta: data.meta ?? {}, decor: data.decor ?? null, center, proj, lines, stations, bounds: { minX, minY, maxX, maxY } }
}

/* ---------- véhicules en service à l'instant t ---------- */
export function vehiclesAt(network: Network, t: number, opts?: { hidden?: Set<string> }): Vehicle[] {
  const hidden = opts?.hidden
  const out: Vehicle[] = []
  t = ((t % DAY) + DAY) % DAY
  for (const line of network.lines) {
    if (hidden?.has(line.id)) continue
    for (const tl of line.timelines) {
      for (const tt of [t, t + DAY]) {
        const kMin = Math.max(0, Math.ceil((tt - tl.duration - line.terminus - line.start) / line.freq))
        const kMax = Math.min(line.nTripsPerDir - 1, Math.floor((tt + line.terminus - line.start) / line.freq))
        for (let k = kMin; k <= kMax; k++) {
          const dep = line.start + k * line.freq
          const st = stateAt(line, tl, tt - dep)
          if (!st) continue
          const along = tl.dir === 0 ? st.s : line.total - st.s
          const p = positionAlong(line, along)
          const a = line.samples[p.seg]
          const b = line.samples[Math.min(p.seg + 1, line.samples.length - 1)]
          let bearing = Math.atan2(b[1] - a[1], b[0] - a[0])
          if (tl.dir === 1) bearing += Math.PI
          out.push({
            id: `${line.id}/${tl.dir}/${k}`,
            line,
            dir: tl.dir,
            trip: k,
            dep,
            x: p.x,
            y: p.y,
            bearing,
            state: st.state,
            s: st.s,
            along,
            atStop: st.atStop != null ? tl.seq[st.atStop] : null,
            nextStop: st.nextStop != null ? tl.seq[st.nextStop] : null,
            destination: tl.destination,
            eta: st.eta,
            wait: st.wait,
          })
        }
      }
    }
  }
  return out
}

/* ---------- horaires aux arrêts ---------- */
/** Prochains départs d'une ligne dans un sens à l'arrêt d'indice k (dans le sens), à partir de t. */
export function departuresAt(line: Line, tl: Timeline, k: number, t: number, n: number): number[] {
  const off = tl.depart[k]
  const out: number[] = []
  for (const base of [-DAY, 0]) {
    const kMin = Math.max(0, Math.ceil((t - base - off - line.start) / line.freq))
    for (let i = kMin; i < line.nTripsPerDir && out.length < n; i++) out.push(base + line.start + i * line.freq + off)
    if (out.length >= n) break
  }
  if (out.length < n) {
    for (let i = 0; i < line.nTripsPerDir && out.length < n; i++) out.push(DAY + line.start + i * line.freq + off)
  }
  return out.slice(0, n)
}

export interface Departure { line: Line, dir: 0 | 1, destination: LineStop, times: number[] }

/** Prochains passages à une station, par ligne et par sens. */
export function nextDepartures(network: Network, station: Station, t: number, n = 3): Departure[] {
  const out: Departure[] = []
  for (const line of station.lines) {
    const idx = station.stopsByLine.get(line.id)!
    for (const tl of line.timelines) {
      const k = tl.dir === 0 ? idx : line.stops.length - 1 - idx
      if (k >= tl.seq.length - 1) continue
      out.push({ line, dir: tl.dir, destination: tl.destination, times: departuresAt(line, tl, k, t, n) })
    }
  }
  return out
}

/* ---------- itinéraires ---------- */
export interface RouteLeg { line: Line, dir: 0 | 1, tripStart: number, from: Station, to: Station, depart: number, arrive: number, stops: Station[], nStops: number, destination: LineStop }
export interface Route { legs: RouteLeg[], depart: number, arrive: number, duration: number, transfers: number }

interface WalkState { kind: 'walk', station: Station, time: number, prev: SearchState | null, first: boolean }
interface RideState { kind: 'ride', station: Station, line: Line, dir: 0 | 1, k: number, time: number, tripStart: number, prev: SearchState | null, boardedAt: number }
type SearchState = WalkState | RideState

/** Itinéraire le plus rapide entre deux stations (Dijkstra dépendant du temps), départ à t. */
export function route(network: Network, from: Station, to: Station, t: number, opts?: { transfer_s?: number }): Route | null {
  const transferPenalty = opts?.transfer_s ?? 180
  if (from === to) return null
  const best = new Map<string, number>()
  const heap: { time: number, state: SearchState }[] = []
  const swap = (a: number, b: number) => {
    const tmp = heap[a]
    heap[a] = heap[b]
    heap[b] = tmp
  }
  const push = (time: number, state: SearchState) => {
    heap.push({ time, state })
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p].time <= heap[i].time) {
        break
      }
      swap(p, i)
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l].time < heap[m].time) m = l
        if (r < heap.length && heap[r].time < heap[m].time) m = r
        if (m === i) {
          break
        }
        swap(m, i)
        i = m
      }
    }
    return top
  }
  const stationOf = (name: string) => network.stations.find(s => s.name === name)
  push(t, { kind: 'walk', station: from, time: t, prev: null, first: true })
  let goal: WalkState | null = null
  while (heap.length) {
    const { time, state } = pop()
    const key = state.kind === 'walk' ? `w|${state.station.name}` : `r|${state.station.name}|${state.line.id}|${state.dir}`
    if (best.has(key) && best.get(key)! <= time) continue
    best.set(key, time)
    if (state.kind === 'walk' && state.station === to) {
      goal = state
      break
    }
    if (state.kind === 'walk') {
      const wait = state.first ? 0 : transferPenalty
      for (const line of state.station.lines) {
        const idx = state.station.stopsByLine.get(line.id)!
        for (const tl of line.timelines) {
          const k = tl.dir === 0 ? idx : line.stops.length - 1 - idx
          if (k >= tl.seq.length - 1) continue
          const dep = departuresAt(line, tl, k, time + wait, 1)[0]
          if (dep == null) continue
          push(dep, { kind: 'ride', station: state.station, line, dir: tl.dir, k, time: dep, tripStart: dep - tl.depart[k], prev: state, boardedAt: dep })
        }
      }
    } else {
      const tl = state.line.timelines[state.dir]
      const st = stationOf(tl.seq[state.k + 1].name)
      if (!st) continue
      const arr = state.tripStart + tl.arrive[state.k + 1]
      push(arr, { kind: 'walk', station: st, time: arr, prev: state, first: false })
      if (state.k + 1 < tl.seq.length - 1) {
        const dep = state.tripStart + tl.depart[state.k + 1]
        push(dep, { kind: 'ride', station: st, line: state.line, dir: state.dir, k: state.k + 1, time: dep, tripStart: state.tripStart, prev: state, boardedAt: state.boardedAt })
      }
    }
  }
  if (!goal) return null
  const chain: SearchState[] = []
  for (let s: SearchState | null = goal; s; s = s.prev) chain.unshift(s)
  const legs: RouteLeg[] = []
  for (const s of chain) {
    if (s.kind !== 'ride') continue
    const last = legs[legs.length - 1]
    if (last && last.line === s.line && last.dir === s.dir && last.tripStart === s.tripStart) {
      last.stops.push(s.station)
      continue
    }
    legs.push({ line: s.line, dir: s.dir, tripStart: s.tripStart, from: s.station, to: s.station, depart: s.time, arrive: s.time, stops: [s.station], nStops: 0, destination: s.line.timelines[s.dir].destination })
  }
  for (const leg of legs) {
    const tl = leg.line.timelines[leg.dir]
    const lastRide = leg.stops[leg.stops.length - 1]
    const idx = lastRide.stopsByLine.get(leg.line.id)!
    const kLast = leg.dir === 0 ? idx : leg.line.stops.length - 1 - idx
    leg.to = stationOf(tl.seq[kLast + 1].name)!
    leg.arrive = leg.tripStart + tl.arrive[kLast + 1]
    leg.stops.push(leg.to)
    leg.nStops = leg.stops.length - 1
  }
  return { legs, depart: legs[0].depart, arrive: legs[legs.length - 1].arrive, duration: legs[legs.length - 1].arrive - t, transfers: legs.length - 1 }
}

export function lineSummary(line: Line) {
  const tl = line.timelines[0]
  return {
    id: line.id,
    mode: line.mode,
    lengthKm: line.total,
    durationS: tl.duration,
    tripsPerDirection: line.nTripsPerDir,
    vehiclesPerDirection: Math.ceil((tl.duration + line.terminus) / line.freq),
  }
}
