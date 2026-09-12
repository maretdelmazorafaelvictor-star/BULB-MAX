<script setup lang="ts">
import type { Line, Network, Station, Vehicle } from '~/utils/network/engine'
import { useResizeObserver } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { vehiclesAt } from '~/utils/network/engine'

const {
  network,
  hiddenLineIds,
  selectedStation = null,
  selectedGroup = null,
  timeNetwork = null,
  simTime = null,
  showVehicles = false,
} = defineProps<{
  network: Network | null
  hiddenLineIds: Set<string>
  selectedStation?: string | null
  selectedGroup?: string | null
  /** réseau géographique : ses distances donnent les horaires réels des véhicules */
  timeNetwork?: Network | null
  /** heure simulée, en secondes depuis minuit */
  simTime?: number | null
  showVehicles?: boolean
}>()

const emit = defineEmits<{
  selectStation: [name: string]
  selectGroup: [group: string]
  clear: []
}>()

const { t } = useI18n()

/* ---------- style « plan » ---------- */
const COL = { ground: '#F3F2EE', ink: '#1F2933', halo: 'rgba(243,242,238,0.92)', casing: 'rgba(255,255,255,0.9)' }
const FONT = '\'Parisine\', \'Barlow\', \'Segoe UI\', Roboto, system-ui, sans-serif'
const WIDTH: Record<string, number> = { metro: 6.5, train: 8, tram: 4.5, bus: 3 }
/* ---------- style « plan schématique » (fond blanc, tracés rectilignes, lignes parallèles décalées) ---------- */
const SCHEMA = { ground: '#FFFFFF', ink: '#000000', halo: 'rgba(255,255,255,0.92)' }
const SWIDTH: Record<string, number> = { metro: 5.5, train: 9, tram: 3.6, bus: 2.6 }

const wrapper = ref<HTMLElement>()
const canvas = ref<HTMLCanvasElement>()
const tooltip = ref<{ x: number, y: number, text: string } | null>(null)

let W = 1
let H = 1
let DPR = 1
const view = { scale: 40, ox: 0, oy: 0 }
let fitScale = 40
let dirty = true
let raf = 0
let drag: { x: number, y: number, ox: number, oy: number, moved: boolean } | null = null

const toScreen = (x: number, y: number): [number, number] => [view.ox + x * view.scale, view.oy - y * view.scale]
const toWorld = (sx: number, sy: number): [number, number] => [(sx - view.ox) / view.scale, (view.oy - sy) / view.scale]

function computeFitScale(): number {
  if (!network) return 40
  const b = network.bounds
  const pad = 60
  return Math.min((W - 2 * pad) / Math.max(b.maxX - b.minX, 0.1), (H - 2 * pad) / Math.max(b.maxY - b.minY, 0.1))
}

function fit() {
  if (!network) return
  const b = network.bounds
  const s = computeFitScale()
  fitScale = s
  view.scale = s
  view.ox = W / 2 - (b.minX + b.maxX) / 2 * s
  view.oy = H / 2 + (b.minY + b.maxY) / 2 * s
  dirty = true
}

function zoomAt(factor: number, sx: number, sy: number) {
  const [wx, wy] = toWorld(sx, sy)
  const ns = Math.min(Math.max(view.scale * factor, fitScale * 0.4), fitScale * 16)
  view.scale = ns
  view.ox = sx - wx * ns
  view.oy = sy + wy * ns
  dirty = true
}

function centerOn(st: Station, minScale = 70) {
  const target = Math.max(view.scale, minScale)
  view.scale = target
  view.ox = W / 2 - st.x * target
  view.oy = H / 2 + st.y * target
  dirty = true
}

function resize() {
  if (!wrapper.value || !canvas.value) return
  const r = wrapper.value.getBoundingClientRect()
  const center = network && W > 1 ? toWorld(W / 2, H / 2) : null
  DPR = Math.min(window.devicePixelRatio || 1, 2)
  W = Math.max(1, Math.round(r.width))
  H = Math.max(1, Math.round(r.height))
  canvas.value.width = W * DPR
  canvas.value.height = H * DPR
  canvas.value.style.width = `${W}px`
  canvas.value.style.height = `${H}px`
  if (center) {
    fitScale = computeFitScale()
    view.ox = W / 2 - center[0] * view.scale
    view.oy = H / 2 + center[1] * view.scale
  } else {
    fit()
  }
  dirty = true
}

/* ---------- dessin ---------- */
function strokePath(g: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number) {
  g.beginPath()
  pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))
  g.strokeStyle = color
  g.lineWidth = width
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.stroke()
}

function drawTrack(g: CanvasRenderingContext2D, line: Line, f: number) {
  const pts = line.samples.map(p => toScreen(p[0], p[1]))
  const w = (WIDTH[line.mode] ?? 4) * f
  strokePath(g, pts, COL.casing, w + 2.2)
  strokePath(g, pts, line.color, w)
  if (line.mode === 'train') strokePath(g, pts, 'rgba(255,255,255,0.85)', 1.6 * f)
}

/* ---------- géométrie du plan schématique ---------- */
interface Offsets {
  pts: [number, number][]
  tangents: [number, number][]
  path: [number, number][]
  /** pour chaque arrêt, sa place dans `path` (le tracé octolinéaire ajoute des coudes) */
  idx: number[]
}
let offsetCache: { network: Network, scale: number, map: Map<string, Offsets> } | null = null

function isSchematic(): boolean {
  return !!network?.meta?.straight
}

const OCT = Math.PI / 4

/**
 * Rend un tracé strictement octolinéaire : chaque segment devient une portion droite et une
 * portion à 45°, reliées par un coude. Les stations ne bougent pas ; seul le chemin entre elles
 * est redressé. Un segment déjà sur une des huit directions est laissé tel quel.
 */
function octolinearPath(pts: [number, number][]): { path: [number, number][], idx: number[] } {
  if (pts.length < 2) return { path: pts.slice(), idx: pts.map((_, i) => i) }
  const out: [number, number][] = [pts[0]]
  const idx: number[] = [0]
  let prev: [number, number] | null = null
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = out[out.length - 1]
    const [x2, y2] = pts[i]
    const dx = x2 - x1
    const dy = y2 - y1
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
      idx.push(out.length - 1)
      continue
    }
    const dev = Math.abs(Math.atan2(dy, dx) - Math.round(Math.atan2(dy, dx) / OCT) * OCT)
    if (dev < 0.005) { // déjà sur une des huit directions
      out.push([x2, y2])
      idx.push(out.length - 1)
      prev = [Math.sign(dx), Math.sign(dy)]
      continue
    }
    const sx = Math.sign(dx) || 1
    const sy = Math.sign(dy) || 1
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    // partie droite (horizontale ou verticale) et partie à 45°, dans un ordre ou dans l'autre
    const axisFirst: [number, number] = ax > ay ? [x1 + sx * (ax - ay), y1] : [x1, y1 + sy * (ay - ax)]
    const diagFirst: [number, number] = ax > ay ? [x1 + sx * ay, y2] : [x2, y1 + sy * ax]
    const dirOf = (from: [number, number], to: [number, number]): [number, number] => [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])]
    const same = (a: [number, number], b: [number, number] | null) => !!b && a[0] === b[0] && a[1] === b[1]
    // on prolonge la direction précédente quand c'est possible : moins de coudes visibles
    const elbow = same(dirOf([x1, y1], diagFirst), prev) ? diagFirst : axisFirst
    out.push(elbow, [x2, y2])
    idx.push(out.length - 1)
    prev = dirOf(elbow, [x2, y2])
  }
  return { path: out, idx }
}

/** Positions (monde) de chaque ligne une fois les lignes qui partagent un tronçon écartées côte à côte. */
function offsetPolylines(): Map<string, Offsets> {
  if (offsetCache && offsetCache.network === network && offsetCache.scale === view.scale) return offsetCache.map
  const map = new Map<string, Offsets>()
  if (!network) return map

  /* Couloirs : deux tronçons de lignes différentes qui suivent le même axe et se recouvrent se
   * superposeraient à l'écran. On les regroupe par axe (direction et position de la droite qui
   * les porte), puis par recouvrement, et on écarte les lignes du groupe côte à côte. Le cas
   * le plus courant reste deux lignes qui partagent le même tronçon, mais des lignes qui longent
   * simplement le même axe sans desservir les mêmes stations sont traitées de la même façon. */
  const order = new Map<string, number>()
  for (const line of network.lines) {
    if (!order.has(line.group)) order.set(line.group, line.rank * 1000 + order.size)
  }
  interface Seg { group: string, mode: string, key: string, t0: number, t1: number }
  const corridors = new Map<string, Seg[]>()
  const segKey = (line: Line, i: number) => `${line.id}#${i}`
  const tol = 0.35 // fraction de l'écartement typique : deux axes plus proches sont confondus
  const width = (mode: string) => SWIDTH[mode] ?? 4
  const spacing = (() => {
    const lengths: number[] = []
    for (const line of network.lines) {
      for (let i = 1; i < line.stops.length; i++) lengths.push(Math.hypot(line.stops[i].x - line.stops[i - 1].x, line.stops[i].y - line.stops[i - 1].y))
    }
    lengths.sort((a, b) => a - b)
    return lengths.length ? lengths[Math.floor(lengths.length / 2)] || 1 : 1
  })()
  for (const line of network.lines) {
    for (let i = 1; i < line.stops.length; i++) {
      const a = line.stops[i - 1]
      const b = line.stops[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy)
      if (len < 1e-9) continue
      // axe non orienté : angle ramené à [0, π)
      let ang = Math.atan2(dy, dx)
      if (ang < 0) ang += Math.PI
      const oct = Math.round(ang / (Math.PI / 4)) % 4
      const theta = oct * Math.PI / 4
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      const perp = Math.round((-sin * a.x + cos * a.y) / (tol * spacing))
      const t0 = cos * a.x + sin * a.y
      const t1 = cos * b.x + sin * b.y
      const k = `${oct}:${perp}`
      const list = corridors.get(k) ?? []
      list.push({ group: line.group, mode: line.mode, key: segKey(line, i), t0: Math.min(t0, t1), t1: Math.max(t0, t1) })
      corridors.set(k, list)
    }
  }
  /** Décalage retenu pour chaque tronçon, et écart utilisé. */
  const offsets = new Map<string, { index: number, count: number, gap: number }>()
  for (const segs of corridors.values()) {
    segs.sort((a, b) => a.t0 - b.t0)
    let cluster: Seg[] = []
    let end = -Infinity
    const flush = () => {
      if (!cluster.length) return
      const groups = [...new Set(cluster.map(s => s.group))].sort((a, b) => order.get(a)! - order.get(b)!)
      const gap = (Math.max(...cluster.map(s => width(s.mode))) + 1.4) / view.scale
      for (const s of cluster) offsets.set(s.key, { index: groups.indexOf(s.group), count: groups.length, gap })
      cluster = []
    }
    for (const s of segs) {
      // recouvrement réel : on laisse un peu de marge pour les tronçons qui se touchent
      if (cluster.length && s.t0 > end - 0.15 * spacing) flush()
      cluster.push(s)
      end = Math.max(end, s.t1)
    }
    flush()
  }

  for (const line of network.lines) {
    const S = line.stops
    const n = S.length
    const off: number[] = []
    const nrm: [number, number][] = []
    const dir: [number, number][] = []
    for (let i = 1; i < n; i++) {
      const a = S[i - 1]
      const b = S[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      // l'orientation de la normale ne doit pas dépendre du sens de parcours de la ligne
      const sign = (dx !== 0 ? dx : dy) > 0 ? 1 : -1
      dir.push([dx / d, dy / d])
      nrm.push([-dy / d * sign, dx / d * sign])
      const o = offsets.get(segKey(line, i))
      off.push(o ? (o.index - (o.count - 1) / 2) * o.gap : 0)
    }
    const pts: [number, number][] = []
    const tangents: [number, number][] = []
    for (let j = 0; j < n; j++) {
      const i0 = j - 1
      const i1 = j
      let v: [number, number]
      let t: [number, number]
      if (i0 < 0 || i1 > n - 2) {
        const i = i0 < 0 ? i1 : i0
        v = [nrm[i][0] * off[i], nrm[i][1] * off[i]]
        t = dir[i]
      } else {
        const [a, b] = nrm[i0]
        const [c, d] = nrm[i1]
        const det = a * d - b * c
        if (Math.abs(det) < 0.2) {
          v = [(a * off[i0] + c * off[i1]) / 2, (b * off[i0] + d * off[i1]) / 2]
        } else {
          v = [(off[i0] * d - b * off[i1]) / det, (a * off[i1] - c * off[i0]) / det]
        }
        const cap = 2.5 * Math.max(Math.abs(off[i0]), Math.abs(off[i1]))
        const len = Math.hypot(v[0], v[1])
        if (len > cap) v = [v[0] / len * cap, v[1] / len * cap]
        const tx = dir[i0][0] + dir[i1][0]
        const ty = dir[i0][1] + dir[i1][1]
        const tl = Math.hypot(tx, ty) || 1
        t = [tx / tl, ty / tl]
      }
      pts.push([S[j].x + v[0], S[j].y + v[1]])
      tangents.push(t)
    }
    map.set(line.id, { pts, tangents, ...octolinearPath(pts) })
  }
  offsetCache = { network, scale: view.scale, map }
  return map
}

/** Tracé aux angles arrondis (écran). */
function roundedPath(g: CanvasRenderingContext2D, pts: [number, number][], radius: number) {
  g.beginPath()
  g.moveTo(pts[0][0], pts[0][1])
  for (let j = 1; j < pts.length - 1; j++) {
    const [px, py] = pts[j - 1]
    const [x, y] = pts[j]
    const [nx, ny] = pts[j + 1]
    const l0 = Math.hypot(x - px, y - py)
    const l1 = Math.hypot(nx - x, ny - y)
    const cos = ((x - px) * (nx - x) + (y - py) * (ny - y)) / ((l0 * l1) || 1)
    const theta = Math.acos(Math.max(-1, Math.min(1, cos)))
    // la coupe de l'angle reste couverte par le disque de la station
    const r = theta < 0.05 ? 0 : Math.min(radius, 2.4 / Math.tan(theta / 2), l0 * 0.45, l1 * 0.45)
    if (r > 0.5) g.arcTo(x, y, nx, ny, r)
    else g.lineTo(x, y)
  }
  const last = pts[pts.length - 1]
  g.lineTo(last[0], last[1])
}

function drawTrackSchematic(g: CanvasRenderingContext2D, line: Line, f: number, offsets: Map<string, Offsets>) {
  const o = offsets.get(line.id)
  if (!o || o.path.length < 2) return
  const pts = o.path.map(p => toScreen(p[0], p[1]))
  const w = (SWIDTH[line.mode] ?? 4) * f
  g.lineJoin = 'round'
  g.lineCap = 'round'
  roundedPath(g, pts, 7 * f)
  g.strokeStyle = SCHEMA.ground
  g.lineWidth = w + 1.6
  g.stroke()
  g.strokeStyle = line.color
  g.lineWidth = w
  g.stroke()
}

interface StationGeom { x: number, y: number, r: number, tan: [number, number], pts: [number, number][] }

/** Centre, rayon et points d'ancrage d'une station à l'écran. */
function stationGeom(st: Station, f: number, offsets: Map<string, Offsets> | null): StationGeom {
  if (!offsets) {
    const [x, y] = toScreen(st.x, st.y)
    return { x, y, r: (st.interchange ? (st.groups.length >= 3 ? 7 : 6) : 3.6) * f, tan: [1, 0], pts: [[x, y]] }
  }
  const pts: [number, number][] = []
  let tan: [number, number] = [1, 0]
  for (const line of st.lines) {
    const i = st.stopsByLine.get(line.id)
    const o = offsets.get(line.id)
    if (i === undefined || !o?.pts[i]) continue
    pts.push(toScreen(o.pts[i][0], o.pts[i][1]))
    tan = [o.tangents[i][0], -o.tangents[i][1]]
  }
  if (!pts.length) {
    const [x, y] = toScreen(st.x, st.y)
    pts.push([x, y])
  }
  const x = pts.reduce((a, p) => a + p[0], 0) / pts.length
  const y = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const spread = pts.reduce((m, p) => Math.max(m, Math.hypot(p[0] - x, p[1] - y)), 0)
  const base = st.interchange ? (st.groups.length >= 3 ? 6.5 : 5.5) : 3.2
  return { x, y, r: base * f + spread, tan, pts }
}

function drawStationSchematic(g: CanvasRenderingContext2D, st: Station, geom: StationGeom, f: number, color: string) {
  if (st.interchange) {
    // pastille blanche cerclée de noir couvrant les lignes écartées
    let p = geom.pts[0]
    let q = geom.pts[0]
    let best = -1
    for (const a of geom.pts) {
      for (const b of geom.pts) {
        const d = Math.hypot(a[0] - b[0], a[1] - b[1])
        if (d > best) {
          best = d
          p = a
          q = b
        }
      }
    }
    const r = (st.groups.length >= 3 ? 6.5 : 5.5) * f
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(p[0], p[1])
    g.lineTo(q[0], q[1])
    g.strokeStyle = SCHEMA.ink
    g.lineWidth = 2 * r + 2.4 * f
    g.stroke()
    g.strokeStyle = '#fff'
    g.lineWidth = 2 * r
    g.stroke()
    return
  }
  const line = st.lines[0]
  const [x, y] = geom.pts[0]
  if (line.mode === 'train') {
    // trait blanc perpendiculaire à la voie (masqué quand la carte est trop réduite)
    if (f < 0.8) return
    const w = (SWIDTH.train) * f
    const [tx, ty] = geom.tan
    g.beginPath()
    g.moveTo(x - ty * w * 0.5, y + tx * w * 0.5)
    g.lineTo(x + ty * w * 0.5, y - tx * w * 0.5)
    g.strokeStyle = '#fff'
    g.lineWidth = 2.2 * f
    g.lineCap = 'butt'
    g.stroke()
    return
  }
  g.beginPath()
  g.arc(x, y, (line.mode === 'metro' ? 3.2 : 2.6) * f, 0, Math.PI * 2)
  g.fillStyle = '#fff'
  g.fill()
  g.strokeStyle = color
  g.lineWidth = 1.8 * f
  g.stroke()
}

function roundelText(line: Line): string {
  const g = line.group || line.id
  const idx = line.raw.groupName ? g.replace(/^[MRTB](?=.)/, '') : g
  return line.mode === 'tram' && /^\d/.test(idx) ? `T${idx}` : idx
}

function textOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#fff'
  const n = Number.parseInt(m[1], 16)
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) > 150 ? '#1A1A1A' : '#FFFFFF'
}

function drawRoundel(g: CanvasRenderingContext2D, x: number, y: number, line: Line, f: number) {
  const txt = roundelText(line)
  const size = 15 * f
  g.font = `700 ${Math.round(9.5 * f + (txt.length > 2 ? -1.5 : 0))}px ${FONT}`
  const w = Math.max(size, g.measureText(txt).width + 8 * f)
  g.fillStyle = line.color
  g.strokeStyle = '#fff'
  g.lineWidth = 1.5
  g.beginPath()
  if (line.mode === 'metro') {
    g.arc(x, y, w / 2, 0, Math.PI * 2)
  } else {
    const r = line.mode === 'train' ? 4 * f : 3 * f
    g.roundRect(x - w / 2, y - size / 2, w, size, r)
  }
  g.fill()
  g.stroke()
  g.fillStyle = textOn(line.color)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(txt, x, y + 0.5)
}

/* ---------- véhicules ---------- */
const VSIZE: Record<string, number> = { metro: 4.2, train: 4.8, tram: 3.6, bus: 3.2 }

/** Arrêt précédent et fraction parcourue vers le suivant, à partir de la distance parcourue. */
function alongToStop(line: Line, along: number): { i: number, frac: number } {
  const S = line.stops
  const n = S.length
  if (n < 2) return { i: 0, frac: 0 }
  if (along <= S[0].dist) return { i: 0, frac: 0 }
  if (along >= S[n - 1].dist) return { i: n - 2, frac: 1 }
  let lo = 0
  let hi = n - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (S[mid].dist <= along) lo = mid
    else hi = mid
  }
  return { i: lo, frac: (along - S[lo].dist) / ((S[lo + 1].dist - S[lo].dist) || 1) }
}

/**
 * Position (monde) d'un véhicule sur le plan. Les horaires viennent des distances réelles ;
 * l'entre-deux-arrêts est reporté en proportion sur le tracé dessiné, qui lui est schématique.
 */
function vehicleWorld(v: Vehicle, offsets: Map<string, Offsets> | null): { x: number, y: number, bearing: number } | null {
  if (!offsets) return { x: v.x, y: v.y, bearing: v.bearing }
  const o = offsets.get(v.line.id)
  if (!o) return null
  const { i, frac } = alongToStop(v.line, v.along)
  const a = o.idx[i]
  const b = o.idx[i + 1]
  if (a === undefined || b === undefined) return null
  const seg = o.path.slice(a, b + 1)
  if (seg.length < 2) {
    const p = o.path[a] ?? o.path[0]
    return p ? { x: p[0], y: p[1], bearing: 0 } : null
  }
  const lens: number[] = []
  let total = 0
  for (let k = 1; k < seg.length; k++) {
    const l = Math.hypot(seg[k][0] - seg[k - 1][0], seg[k][1] - seg[k - 1][1])
    lens.push(l)
    total += l
  }
  let d = frac * total
  for (let k = 0; k < lens.length; k++) {
    if (d <= lens[k] || k === lens.length - 1) {
      const u = lens[k] ? Math.max(0, Math.min(1, d / lens[k])) : 0
      const p = seg[k]
      const q = seg[k + 1]
      return { x: p[0] + (q[0] - p[0]) * u, y: p[1] + (q[1] - p[1]) * u, bearing: Math.atan2(q[1] - p[1], q[0] - p[0]) }
    }
    d -= lens[k]
  }
  return null
}

/** Véhicules en circulation à l'heure simulée, replacés sur le plan. */
function currentVehicles(): Vehicle[] {
  const src = timeNetwork ?? network
  if (!showVehicles || simTime == null || !src) return []
  return vehiclesAt(src, simTime, { hidden: hiddenLineIds })
}

/** Position à l'écran des véhicules dessinés, pour le survol. */
let vehicleHits: { v: Vehicle, x: number, y: number, r: number }[] = []

function drawVehicles(g: CanvasRenderingContext2D, veh: Vehicle[], f: number, offsets: Map<string, Offsets> | null) {
  vehicleHits = []
  const focus = selectedGroup
  const lit = (v: Vehicle) => !focus || v.line.group === focus
  const sorted = veh.slice().sort((a, b) => (Number(lit(a)) - Number(lit(b))) || (a.line.rank - b.line.rank))
  const s = Math.min(Math.max(f, 0.7), 1.7)
  g.shadowColor = 'rgba(0,0,0,0.3)'
  g.shadowBlur = 4 * s
  g.shadowOffsetY = 1.5
  for (const v of sorted) {
    const p = vehicleWorld(v, offsets)
    if (!p) continue
    const [x, y] = toScreen(p.x, p.y)
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue
    g.globalAlpha = lit(v) ? 1 : 0.18
    const r = (VSIZE[v.line.mode] ?? 3.5) * s
    vehicleHits.push({ v, x, y, r })
    g.fillStyle = v.line.color
    if (v.line.mode === 'train') {
      g.save()
      g.translate(x, y)
      g.rotate(-p.bearing)
      g.beginPath()
      g.roundRect(-r * 1.45, -r * 0.8, r * 2.9, r * 1.6, r * 0.6)
      g.strokeStyle = SCHEMA.ink
      g.lineWidth = 3.6
      g.stroke()
      g.strokeStyle = '#fff'
      g.lineWidth = 2.2
      g.stroke()
      g.fill()
      g.restore()
    } else {
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.strokeStyle = SCHEMA.ink
      g.lineWidth = 3.6
      g.stroke()
      g.strokeStyle = '#fff'
      g.lineWidth = 2.2
      g.stroke()
      g.fill()
    }
  }
  g.globalAlpha = 1
  g.shadowColor = 'transparent'
  g.shadowBlur = 0
  g.shadowOffsetY = 0
}

interface Box { x0: number, y0: number, x1: number, y1: number }
function labelBox(g: CanvasRenderingContext2D, text: string, x: number, y: number, r: number, hint: string | null, f: number, draw: boolean, bold = false): Box {
  const size = Math.round(11.5 * Math.min(Math.max(f, 0.9), 1.35))
  g.font = `${bold ? 700 : 500} ${size}px ${FONT}`
  const off = r + 4
  let tx = x
  let ty = y
  let align: CanvasTextAlign = 'left'
  let base: CanvasTextBaseline = 'middle'
  switch (hint ?? 'r') {
    case 'l':
      align = 'right'
      tx = x - off
      break
    case 't':
      align = 'center'
      base = 'bottom'
      ty = y - off
      break
    case 'b':
      align = 'center'
      base = 'top'
      ty = y + off
      break
    default:
      tx = x + off
  }
  const w = g.measureText(text).width
  const h = size * 1.15
  const x0 = align === 'right' ? tx - w : align === 'center' ? tx - w / 2 : tx
  const y0 = base === 'bottom' ? ty - h : base === 'top' ? ty : ty - h / 2
  if (draw) {
    g.textAlign = align
    g.textBaseline = base
    g.lineWidth = 3.5
    g.strokeStyle = isSchematic() ? SCHEMA.halo : COL.halo
    g.fillStyle = isSchematic() ? SCHEMA.ink : COL.ink
    g.lineJoin = 'round'
    g.strokeText(text, tx, ty)
    g.fillText(text, tx, ty)
  }
  return { x0: x0 - 2, y0: y0 - 1, x1: x0 + w + 2, y1: y0 + h + 1 }
}

function draw() {
  const c = canvas.value
  if (!c) return
  const g = c.getContext('2d')!
  g.setTransform(DPR, 0, 0, DPR, 0, 0)
  g.clearRect(0, 0, W, H)
  const schematic = isSchematic()
  g.fillStyle = schematic ? SCHEMA.ground : COL.ground
  g.fillRect(0, 0, W, H)
  if (!network) return
  const sc = view.scale
  const f = Math.min(Math.max(sc / 50, 0.6), 2.2)
  const focus = selectedGroup
  const dimmed = (line: Line) => hiddenLineIds.has(line.id) ? 0.12 : (focus && line.group !== focus) ? 0.18 : 1
  const lines = network.lines.slice().sort((a, b) => a.rank - b.rank)
  const offsets = schematic ? offsetPolylines() : null
  const track = (line: Line) => offsets ? drawTrackSchematic(g, line, f, offsets) : drawTrack(g, line, f)
  for (const line of lines) {
    if (dimmed(line) < 1) {
      g.globalAlpha = dimmed(line)
      track(line)
    }
  }
  g.globalAlpha = 1
  for (const line of lines) {
    if (dimmed(line) === 1) track(line)
  }

  const stationFocus = (st: Station) => focus ? st.groups.includes(focus) : true
  const geoms = new Map<string, StationGeom>()
  for (const st of network.stations) {
    const vis = st.lines.filter(l => !hiddenLineIds.has(l.id))
    g.globalAlpha = vis.length ? (stationFocus(st) ? 1 : 0.3) : 0.25
    const geom = stationGeom(st, f, offsets)
    geoms.set(st.name, geom)
    const color = (vis[0] ?? st.lines[0]).color
    if (offsets) {
      drawStationSchematic(g, st, geom, f, color)
      continue
    }
    const { x, y, r } = geom
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = '#fff'
    g.fill()
    g.lineWidth = (st.interchange ? 2.2 : 1.9) * f
    g.strokeStyle = st.interchange ? COL.ink : color
    g.stroke()
    if (st.interchange && st.groups.length >= 3) {
      g.beginPath()
      g.arc(x, y, r * 0.4, 0, Math.PI * 2)
      g.fillStyle = COL.ink
      g.fill()
    }
  }
  g.globalAlpha = 1

  drawVehicles(g, currentVehicles(), f, offsets)

  // libellés : correspondances d'abord, sans chevauchement
  const placed: Box[] = []
  const wantAll = sc >= 40
  const wantInter = sc >= 25
  const order = network.stations.slice().sort((a, b) => (Number(stationFocus(b)) - Number(stationFocus(a))) || (b.groups.length - a.groups.length) || a.name.localeCompare(b.name))
  for (const st of order) {
    const focused = stationFocus(st) && !!focus
    if (!(focused || wantAll || (wantInter && st.interchange))) continue
    if (focus && !stationFocus(st) && !(wantAll && st.interchange)) continue
    if (!st.lines.some(l => !hiddenLineIds.has(l.id))) continue
    const { x, y, r } = geoms.get(st.name)!
    if (x < -200 || y < -50 || x > W + 200 || y > H + 50) continue
    const bold = schematic && st.interchange
    const box = labelBox(g, st.name, x, y, r, st.label, f, false, bold)
    if (placed.some(b => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) continue
    placed.push(box)
    g.globalAlpha = stationFocus(st) ? 1 : 0.35
    labelBox(g, st.name, x, y, r, st.label, f, true, bold)
    g.globalAlpha = 1
  }

  // pictos de ligne aux terminus
  if (sc >= 25) {
    const done = new Set<string>()
    for (const line of lines) {
      if (dimmed(line) < 1 || line.loop) continue
      const o = offsets?.get(line.id)
      for (const end of [0, 1]) {
        const key = `${line.group}|${end === 0 ? line.stops[0].name : line.stops[line.stops.length - 1].name}`
        if (done.has(key)) continue
        done.add(key)
        let x: number
        let y: number
        let dx: number
        let dy: number
        if (o) {
          const i = end === 0 ? 0 : o.pts.length - 1
          ;[x, y] = toScreen(o.pts[i][0], o.pts[i][1])
          const t = o.tangents[i]
          dx = end === 0 ? -t[0] : t[0]
          dy = end === 0 ? t[1] : -t[1]
        } else {
          const S = line.samples
          const i = end === 0 ? 0 : S.length - 1
          const j = end === 0 ? Math.min(3, S.length - 1) : Math.max(S.length - 4, 0)
          ;[x, y] = toScreen(S[i][0], S[i][1])
          const [x2, y2] = toScreen(S[j][0], S[j][1])
          const d = Math.hypot(x - x2, y - y2) || 1
          dx = (x - x2) / d
          dy = (y - y2) / d
        }
        const gap = (schematic ? 18 : 16) * f
        drawRoundel(g, x + dx * gap, y + dy * gap, line, f)
      }
    }
  }

  // station sélectionnée
  if (selectedStation) {
    const geom = geoms.get(selectedStation)
    if (geom) {
      g.beginPath()
      g.arc(geom.x, geom.y, Math.max(13 * Math.min(Math.max(f, 0.7), 1.7), geom.r + 5), 0, Math.PI * 2)
      g.strokeStyle = '#F5C542'
      g.lineWidth = 3.5
      g.stroke()
      g.strokeStyle = COL.ink
      g.lineWidth = 1
      g.stroke()
    }
  }
}

function frame() {
  raf = requestAnimationFrame(frame)
  if (dirty) {
    dirty = false
    draw()
  }
}

/* ---------- interaction ---------- */
function pickStation(sx: number, sy: number, radius: number): Station | null {
  if (!network) return null
  let best: Station | null = null
  let bd = radius
  for (const st of network.stations) {
    const [x, y] = toScreen(st.x, st.y)
    const d = Math.hypot(x - sx, y - sy)
    if (d < bd) {
      bd = d
      best = st
    }
  }
  return best
}

function pickLine(sx: number, sy: number): Line | null {
  if (!network) return null
  let best: Line | null = null
  let bd = isSchematic() ? 11 : 8
  for (const line of network.lines) {
    if (hiddenLineIds.has(line.id)) continue
    const S = line.samples
    for (let i = 1; i < S.length; i++) {
      const [ax, ay] = toScreen(S[i - 1][0], S[i - 1][1])
      const [bx, by] = toScreen(S[i][0], S[i][1])
      if (Math.min(ax, bx) > sx + bd || Math.max(ax, bx) < sx - bd || Math.min(ay, by) > sy + bd || Math.max(ay, by) < sy - bd) continue
      const vx = bx - ax
      const vy = by - ay
      const l2 = vx * vx + vy * vy || 1e-9
      const u = Math.max(0, Math.min(1, ((sx - ax) * vx + (sy - ay) * vy) / l2))
      const d = Math.hypot(sx - (ax + u * vx), sy - (ay + u * vy))
      if (d < bd) {
        bd = d
        best = line
      }
    }
  }
  return best
}

/** Véhicule sous le pointeur, d'après le dernier dessin. */
function pickVehicle(sx: number, sy: number): Vehicle | null {
  let best: Vehicle | null = null
  let bd = Infinity
  for (const h of vehicleHits) {
    const d = Math.hypot(h.x - sx, h.y - sy)
    if (d < h.r + 4 && d < bd) {
      bd = d
      best = h.v
    }
  }
  return best
}

function localPos(e: PointerEvent | WheelEvent): [number, number] {
  const r = wrapper.value!.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false }
  wrapper.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  const [sx, sy] = localPos(e)
  if (drag) {
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (Math.hypot(dx, dy) > 3) drag.moved = true
    if (drag.moved) {
      view.ox = drag.ox + dx
      view.oy = drag.oy + dy
      dirty = true
    }
    return
  }
  const veh = pickVehicle(sx, sy)
  if (veh) {
    const where = veh.atStop
      ? t('ui.network.vehicle.at_stop', { station: veh.atStop.name })
      : veh.nextStop
        ? t('ui.network.vehicle.next_stop', { station: veh.nextStop.name })
        : ''
    tooltip.value = { x: sx, y: sy, text: `${roundelText(veh.line)} → ${veh.destination.name}${where ? `\n${where}` : ''}` }
    return
  }
  const st = pickStation(sx, sy, 12)
  tooltip.value = st ? { x: sx, y: sy, text: st.name } : null
}

function onPointerUp(e: PointerEvent) {
  if (!drag) return
  const moved = drag.moved
  drag = null
  if (moved) return
  const [sx, sy] = localPos(e)
  const st = pickStation(sx, sy, 14)
  if (st) {
    emit('selectStation', st.name)
    return
  }
  const line = pickLine(sx, sy)
  if (line) emit('selectGroup', line.group)
  else emit('clear')
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const [sx, sy] = localPos(e)
  zoomAt(Math.exp(-e.deltaY * 0.0015), sx, sy)
}

onMounted(() => {
  resize()
  raf = requestAnimationFrame(frame)
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      dirty = true
    })
  }
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
useResizeObserver(wrapper, () => resize())

watch(() => network, () => {
  offsetCache = null
  fit()
})
watch(() => [hiddenLineIds, selectedGroup, selectedStation], () => {
  dirty = true
}, { deep: true })
watch(() => [simTime, showVehicles], () => {
  dirty = true
})
watch(() => selectedStation, (name) => {
  const st = network?.stations.find(s => s.name === name)
  if (st) centerOn(st)
})

defineExpose({ fit, zoomIn: () => zoomAt(1.4, W / 2, H / 2), zoomOut: () => zoomAt(1 / 1.4, W / 2, H / 2) })
</script>

<template>
  <div
    ref="wrapper"
    class="network-map"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="drag = null"
    @pointerleave="tooltip = null"
    @wheel="onWheel"
  >
    <canvas ref="canvas" />
    <div v-if="tooltip" class="tooltip" :style="{ left: `${tooltip.x + 14}px`, top: `${tooltip.y - 10}px` }">
      {{ tooltip.text }}
    </div>
    <div class="hud">
      <Button icon="i-tabler-plus" severity="secondary" rounded size="small" @click="zoomAt(1.4, W / 2, H / 2)" />
      <Button icon="i-tabler-minus" severity="secondary" rounded size="small" @click="zoomAt(1 / 1.4, W / 2, H / 2)" />
      <Button icon="i-tabler-focus-2" severity="secondary" rounded size="small" @click="fit()" />
    </div>
    <div v-if="!network" class="empty">
      <slot name="empty" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.network-map {
  position: relative;
  flex: 1 1 0;
  width: 100%;
  height: 100%;
  min-height: 14em;
  overflow: hidden;
  background: #fff;
  cursor: grab;
  touch-action: none;

  canvas {
    display: block;
  }
}

.tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(22, 33, 44, .95);
  color: #fff;
  padding: .3em .6em;
  border-radius: .3em;
  font-size: .85rem;
  white-space: pre-line;
  line-height: 1.35;
}

.hud {
  position: absolute;
  right: .75rem;
  bottom: .75rem;
  display: flex;
  flex-direction: column;
  gap: .25rem;
}

.empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--p-gray-500);
  pointer-events: none;
}
</style>
