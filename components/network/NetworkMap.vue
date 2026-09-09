<script setup lang="ts">
import type { Line, LineStop, Network, Station } from '~/utils/network/engine'
import { useResizeObserver } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const {
  network,
  hiddenLineIds,
  selectedStation = null,
  selectedGroup = null,
} = defineProps<{
  network: Network | null
  hiddenLineIds: Set<string>
  selectedStation?: string | null
  selectedGroup?: string | null
}>()

const emit = defineEmits<{
  selectStation: [name: string]
  selectGroup: [group: string]
  clear: []
}>()

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
interface Offsets { pts: [number, number][], tangents: [number, number][] }
let offsetCache: { network: Network, scale: number, map: Map<string, Offsets> } | null = null

function isSchematic(): boolean {
  return !!network?.meta?.straight
}

/** Positions (monde) de chaque ligne une fois les lignes qui partagent un tronçon écartées côte à côte. */
function offsetPolylines(): Map<string, Offsets> {
  if (offsetCache && offsetCache.network === network && offsetCache.scale === view.scale) return offsetCache.map
  const map = new Map<string, Offsets>()
  if (!network) return map
  const key = (a: LineStop, b: LineStop) => a.name < b.name ? `${a.name}|${b.name}` : `${b.name}|${a.name}`
  const edgeGroups = new Map<string, string[]>()
  const order = new Map<string, number>()
  for (const line of network.lines) {
    if (!order.has(line.group)) order.set(line.group, line.rank * 1000 + order.size)
    for (let i = 1; i < line.stops.length; i++) {
      const k = key(line.stops[i - 1], line.stops[i])
      const g = edgeGroups.get(k) ?? []
      if (!g.includes(line.group)) g.push(line.group)
      edgeGroups.set(k, g)
    }
  }
  for (const g of edgeGroups.values()) g.sort((a, b) => order.get(a)! - order.get(b)!)
  for (const line of network.lines) {
    const S = line.stops
    const n = S.length
    const gap = ((SWIDTH[line.mode] ?? 4) + 1.4) / view.scale
    const off: number[] = []
    const nrm: [number, number][] = []
    const dir: [number, number][] = []
    for (let i = 1; i < n; i++) {
      const a = S[i - 1]
      const b = S[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.hypot(dx, dy) || 1
      const sign = a.name < b.name ? 1 : -1
      dir.push([dx / d, dy / d])
      nrm.push([-dy / d * sign, dx / d * sign])
      const groups = edgeGroups.get(key(a, b))!
      off.push((groups.indexOf(line.group) - (groups.length - 1) / 2) * gap)
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
    map.set(line.id, { pts, tangents })
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
  if (!o || o.pts.length < 2) return
  const pts = o.pts.map(p => toScreen(p[0], p[1]))
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
  white-space: nowrap;
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
