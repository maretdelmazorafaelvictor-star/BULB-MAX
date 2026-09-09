<script setup lang="ts">
import type { Line, Network, Station } from '~/utils/network/engine'
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
function labelBox(g: CanvasRenderingContext2D, text: string, x: number, y: number, r: number, hint: string | null, f: number, draw: boolean): Box {
  const size = Math.round(11.5 * Math.min(Math.max(f, 0.9), 1.35))
  g.font = `500 ${size}px ${FONT}`
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
    g.strokeStyle = COL.halo
    g.fillStyle = COL.ink
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
  g.fillStyle = COL.ground
  g.fillRect(0, 0, W, H)
  if (!network) return
  const sc = view.scale
  const f = Math.min(Math.max(sc / 50, 0.6), 2.2)
  const focus = selectedGroup
  const dimmed = (line: Line) => hiddenLineIds.has(line.id) ? 0.12 : (focus && line.group !== focus) ? 0.18 : 1
  const lines = network.lines.slice().sort((a, b) => a.rank - b.rank)
  for (const line of lines) {
    if (dimmed(line) < 1) {
      g.globalAlpha = dimmed(line)
      drawTrack(g, line, f)
    }
  }
  g.globalAlpha = 1
  for (const line of lines) {
    if (dimmed(line) === 1) drawTrack(g, line, f)
  }

  const stationFocus = (st: Station) => focus ? st.groups.includes(focus) : true
  for (const st of network.stations) {
    const vis = st.lines.filter(l => !hiddenLineIds.has(l.id))
    g.globalAlpha = vis.length ? (stationFocus(st) ? 1 : 0.3) : 0.25
    const [x, y] = toScreen(st.x, st.y)
    const r = (st.interchange ? (st.groups.length >= 3 ? 7 : 6) : 3.6) * f
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = '#fff'
    g.fill()
    g.lineWidth = (st.interchange ? 2.2 : 1.9) * f
    g.strokeStyle = st.interchange ? COL.ink : (vis[0] ?? st.lines[0]).color
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
    const [x, y] = toScreen(st.x, st.y)
    if (x < -200 || y < -50 || x > W + 200 || y > H + 50) continue
    const r = (st.interchange ? (st.groups.length >= 3 ? 7 : 6) : 3.6) * f
    const box = labelBox(g, st.name, x, y, r, st.label, f, false)
    if (placed.some(b => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) continue
    placed.push(box)
    g.globalAlpha = stationFocus(st) ? 1 : 0.35
    labelBox(g, st.name, x, y, r, st.label, f, true)
    g.globalAlpha = 1
  }

  // pictos de ligne aux terminus
  if (sc >= 25) {
    const done = new Set<string>()
    for (const line of lines) {
      if (dimmed(line) < 1 || line.loop) continue
      for (const end of [0, 1]) {
        const S = line.samples
        const i = end === 0 ? 0 : S.length - 1
        const j = end === 0 ? Math.min(3, S.length - 1) : Math.max(S.length - 4, 0)
        const key = `${line.group}|${end === 0 ? line.stops[0].name : line.stops[line.stops.length - 1].name}`
        if (done.has(key)) continue
        done.add(key)
        const [x, y] = toScreen(S[i][0], S[i][1])
        const [x2, y2] = toScreen(S[j][0], S[j][1])
        const dx = x - x2
        const dy = y - y2
        const d = Math.hypot(dx, dy) || 1
        drawRoundel(g, x + dx / d * 16 * f, y + dy / d * 16 * f, line, f)
      }
    }
  }

  // station sélectionnée
  if (selectedStation) {
    const st = network.stations.find(s => s.name === selectedStation)
    if (st) {
      const [x, y] = toScreen(st.x, st.y)
      g.beginPath()
      g.arc(x, y, 13 * Math.min(Math.max(f, 0.7), 1.7), 0, Math.PI * 2)
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
  let bd = 8
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
  width: 100%;
  height: 100%;
  min-height: 20em;
  overflow: hidden;
  background: #F3F2EE;
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
