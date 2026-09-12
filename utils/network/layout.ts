/*
 * Disposition automatique d'un réseau.
 *
 * Sans coordonnées : distances de graphe → MDS classique → majoration du stress (SMACOF) →
 * relaxation par forces (ressorts, répulsion, lissage des lignes, attrait vers les 45°).
 * Avec des ancres GPS (tout ou partie des stations) : les stations connues sont fixées, les
 * autres sont calculées puis recalées sur les ancres par similitude (Procrustes) et relaxées.
 */
import type { ImportedNetwork } from './bulbImport'
import type { NetworkData, NetworkLine } from './types'

export interface LayoutOptions {
  L: number
  iterations: number
  stressIterations: number
  kEdge: number
  kRepel: number
  repelRadius: number
  kNodeEdge: number
  nodeEdgeRadius: number
  kStraight: number
  kOcto: number
  octoStart: number
  stepStart: number
  stepEnd: number
  maxMove: number
  /** positions GPS connues, par clé de station */
  anchors?: Map<string, { lat: number, lon: number, commune?: string | null }> | null
}

export const DEFAULTS: LayoutOptions = {
  L: 1,
  iterations: 450,
  stressIterations: 200,
  kEdge: 0.5,
  kRepel: 0.6,
  repelRadius: 1.4,
  kNodeEdge: 0.5,
  nodeEdgeRadius: 0.55,
  kStraight: 0.35,
  kOcto: 0.08,
  octoStart: 0.5,
  stepStart: 0.35,
  stepEnd: 0.02,
  maxMove: 0.3,
  anchors: null,
}

export interface LayoutResult {
  positions: Map<string, { x: number, y: number }>
  edges: number
  width: number
  height: number
  center?: { lat: number, lon: number }
  kmPerUnit?: number
  anchored?: number
  anchorsInfo?: Map<string, { lat: number, lon: number, commune?: string | null }>
}

const KM_PER_DEG = 111.32
type P2 = [number, number]

/** Similitude (échelle, rotation, translation, réflexion autorisée) envoyant src sur dst au mieux. */
export function procrustes(src: P2[], dst: P2[]) {
  const n = src.length
  const mean = (pts: P2[]) => pts.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n] as P2, [0, 0] as P2)
  const ms = mean(src)
  const md = mean(dst)
  const fit = (flip: number) => {
    let nr = 0
    let ni = 0
    let den = 0
    for (let i = 0; i < n; i++) {
      const qx = src[i][0] - ms[0]
      const qy = (src[i][1] - ms[1]) * flip
      const ax = dst[i][0] - md[0]
      const ay = dst[i][1] - md[1]
      nr += ax * qx + ay * qy
      ni += ay * qx - ax * qy
      den += qx * qx + qy * qy
    }
    const cr = nr / (den || 1)
    const ci = ni / (den || 1)
    let err = 0
    for (let i = 0; i < n; i++) {
      const qx = src[i][0] - ms[0]
      const qy = (src[i][1] - ms[1]) * flip
      const x = cr * qx - ci * qy + md[0]
      const y = ci * qx + cr * qy + md[1]
      err += (x - dst[i][0]) ** 2 + (y - dst[i][1]) ** 2
    }
    return { cr, ci, flip, err, scale: Math.hypot(cr, ci) }
  }
  const a = fit(1)
  const b = fit(-1)
  const best = a.err <= b.err ? a : b
  const apply = (p: P2): P2 => {
    const qx = p[0] - ms[0]
    const qy = (p[1] - ms[1]) * best.flip
    return [best.cr * qx - best.ci * qy + md[0], best.ci * qx + best.cr * qy + md[1]]
  }
  return { ...best, apply }
}

export function layoutNetwork(network: ImportedNetwork, options?: Partial<LayoutOptions>): LayoutResult {
  const o0: LayoutOptions = { ...DEFAULTS, ...options }
  const anchors = o0.anchors instanceof Map ? o0.anchors : null
  const anchored = anchors ? network.stations.filter(s => anchors.has(s.key)) : []
  if (anchored.length < 3) return graphLayout(network, o0, null)
  const lat0 = anchored.reduce((a, s) => a + anchors!.get(s.key)!.lat, 0) / anchored.length
  const lon0 = anchored.reduce((a, s) => a + anchors!.get(s.key)!.lon, 0) / anchored.length
  const cos = Math.cos(lat0 * Math.PI / 180)
  const km = (g: { lat: number, lon: number }): P2 => [(g.lon - lon0) * KM_PER_DEG * cos, (g.lat - lat0) * KM_PER_DEG]
  const fixed = new Map(anchored.map(s => [s.key, km(anchors!.get(s.key)!)] as [string, P2]))
  let init: Map<string, P2>
  if (anchored.length < network.stations.length) {
    const g = graphLayout(network, { ...o0, anchors: null }, null)
    const src = anchored.map((s) => {
      const p = g.positions.get(s.key)!
      return [p.x, p.y] as P2
    })
    const T = procrustes(src, anchored.map(s => fixed.get(s.key)!))
    init = new Map()
    for (const s of network.stations) {
      if (fixed.has(s.key)) {
        init.set(s.key, fixed.get(s.key)!)
      } else {
        const p = g.positions.get(s.key)!
        init.set(s.key, T.apply([p.x, p.y]))
      }
    }
  } else {
    init = new Map(fixed)
  }
  const res = graphLayout(network, { ...o0, kOcto: 0, iterations: anchored.length < network.stations.length ? 250 : 0, stressIterations: 0 }, { init, fixed })
  res.center = { lat: lat0, lon: lon0 }
  res.kmPerUnit = 1
  res.anchored = anchored.length
  res.anchorsInfo = anchors!
  return res
}

export function graphLayout(network: ImportedNetwork, options: LayoutOptions, hybrid: { init: Map<string, P2>, fixed: Map<string, P2> } | null): LayoutResult {
  const o: LayoutOptions = { ...DEFAULTS, ...options }
  const keys = network.stations.map(s => s.key)
  const idx = new Map(keys.map((k, i) => [k, i]))
  const N = keys.length
  const P: P2[] = Array.from({ length: N }, () => [0, 0])
  const paths = network.lines.map(l => l.stops.map(s => idx.get(s.key)!))

  const nbrs: Set<number>[] = Array.from({ length: N }, () => new Set())
  const edgeSet = new Map<string, [number, number]>()
  for (const p of paths) {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]
      const b = p[i]
      if (a === b) continue
      nbrs[a].add(b)
      nbrs[b].add(a)
      const k = a < b ? `${a}:${b}` : `${b}:${a}`
      if (!edgeSet.has(k)) edgeSet.set(k, [a, b])
    }
  }
  const edges = [...edgeSet.values()]
  const fixedIdx = new Set<number>()
  if (hybrid) {
    keys.forEach((k, i) => {
      const p = hybrid.init.get(k)!
      P[i] = [p[0], p[1]]
      if (hybrid.fixed.has(k)) fixedIdx.add(i)
    })
    const ls = edges.filter(([a, b]) => fixedIdx.has(a) && fixedIdx.has(b)).map(([a, b]) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1])).filter(d => d > 1e-6).sort((x, y) => x - y)
    if (ls.length) {
      o.L = ls[Math.floor(ls.length / 2)]
    } else {
      // pas de tronçon entre deux ancres : espacement déduit de l'emprise des ancres
      const xs = [...hybrid.fixed.values()]
      const w = Math.max(...xs.map(p => p[0])) - Math.min(...xs.map(p => p[0]))
      const h = Math.max(...xs.map(p => p[1])) - Math.min(...xs.map(p => p[1]))
      o.L = Math.max(Math.hypot(w, h) / Math.sqrt(N), 1e-3)
    }
  }
  const L = o.L
  const rnd = (seed => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  })(12345)

  if (!hybrid) {
    // distances de graphe (BFS)
    const adj = nbrs.map(s => [...s])
    const D: Int32Array[] = []
    let maxD = 0
    for (let s = 0; s < N; s++) {
      const d = new Int32Array(N).fill(-1)
      d[s] = 0
      const q = [s]
      for (let h = 0; h < q.length; h++) {
        const u = q[h]
        for (const v of adj[u]) {
          if (d[v] < 0) {
            d[v] = d[u] + 1
            q.push(v)
          }
        }
      }
      D[s] = d
      for (let i = 0; i < N; i++) maxD = Math.max(maxD, d[i])
    }
    const far = maxD + 2
    for (let s = 0; s < N; s++) {
      for (let i = 0; i < N; i++) {
        if (D[s][i] < 0) D[s][i] = far
      }
    }
    // MDS classique
    const B = new Float64Array(N * N)
    const rowMean = new Float64Array(N)
    let mean = 0
    for (let i = 0; i < N; i++) {
      let r = 0
      for (let j = 0; j < N; j++) {
        const v = D[i][j] * D[i][j]
        B[i * N + j] = v
        r += v
      }
      rowMean[i] = r / N
      mean += r / N
    }
    mean /= N
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) B[i * N + j] = -0.5 * (B[i * N + j] - rowMean[i] - rowMean[j] + mean)
    }
    const powerIter = (deflate: { v: Float64Array, lambda: number } | null) => {
      const v = Float64Array.from({ length: N }, () => rnd() - 0.5)
      let lambda = 0
      for (let it = 0; it < 120; it++) {
        const w = new Float64Array(N)
        for (let i = 0; i < N; i++) {
          let acc = 0
          const row = i * N
          for (let j = 0; j < N; j++) acc += B[row + j] * v[j]
          w[i] = acc
        }
        if (deflate) {
          let dot = 0
          for (let i = 0; i < N; i++) dot += deflate.v[i] * w[i]
          for (let i = 0; i < N; i++) w[i] -= dot * deflate.v[i]
        }
        let norm = 0
        for (let i = 0; i < N; i++) norm += w[i] * w[i]
        norm = Math.sqrt(norm) || 1
        lambda = norm
        for (let i = 0; i < N; i++) v[i] = w[i] / norm
      }
      return { v, lambda }
    }
    const e1 = powerIter(null)
    const e2 = powerIter(e1)
    for (let i = 0; i < N; i++) P[i] = [e1.v[i] * Math.sqrt(Math.max(e1.lambda, 0)), e2.v[i] * Math.sqrt(Math.max(e2.lambda, 0))]
    // majoration du stress
    for (let it = 0; it < o.stressIterations; it++) {
      const Q: P2[] = Array.from({ length: N }, () => [0, 0])
      for (let i = 0; i < N; i++) {
        let sx = 0
        let sy = 0
        let sw = 0
        for (let j = 0; j < N; j++) {
          if (j === i) continue
          const dij = D[i][j] * L
          const w = 1 / (dij * dij)
          let dx = P[i][0] - P[j][0]
          let dy = P[i][1] - P[j][1]
          let d = Math.hypot(dx, dy)
          if (d < 1e-9) {
            dx = rnd() - 0.5
            dy = rnd() - 0.5
            d = Math.hypot(dx, dy)
          }
          sx += w * (P[j][0] + dij * dx / d)
          sy += w * (P[j][1] + dij * dy / d)
          sw += w
        }
        Q[i] = [sx / sw, sy / sw]
      }
      for (let i = 0; i < N; i++) P[i] = Q[i]
    }
  }

  // relaxation par forces
  const F: P2[] = Array.from({ length: N }, () => [0, 0])
  const R = o.repelRadius * L
  const cell = R
  for (let it = 0; it < o.iterations; it++) {
    const t = it / o.iterations
    const step = o.stepStart + (o.stepEnd - o.stepStart) * t
    for (const f of F) {
      f[0] = 0
      f[1] = 0
    }
    const grid = new Map<string, number[]>()
    const ck = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`
    P.forEach((p, i) => {
      const k = ck(p[0], p[1])
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k)!.push(i)
    })
    const around = (x: number, y: number, fn: (j: number) => void) => {
      const cx = Math.floor(x / cell)
      const cy = Math.floor(y / cell)
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const b = grid.get(`${gx},${gy}`)
          if (b) {
            for (const j of b) fn(j)
          }
        }
      }
    }
    for (const [a, b] of edges) {
      const dx = P[b][0] - P[a][0]
      const dy = P[b][1] - P[a][1]
      const d = Math.hypot(dx, dy) || 1e-6
      const f = o.kEdge * (d - L) / d
      F[a][0] += f * dx
      F[a][1] += f * dy
      F[b][0] -= f * dx
      F[b][1] -= f * dy
    }
    for (let i = 0; i < N; i++) {
      around(P[i][0], P[i][1], (j) => {
        if (j <= i) return
        let dx = P[j][0] - P[i][0]
        let dy = P[j][1] - P[i][1]
        let d = Math.hypot(dx, dy)
        if (d >= R) return
        if (d < 1e-6) {
          dx = rnd() - 0.5
          dy = rnd() - 0.5
          d = Math.hypot(dx, dy)
        }
        const f = o.kRepel * (R - d) / R / d
        F[i][0] -= f * dx
        F[i][1] -= f * dy
        F[j][0] += f * dx
        F[j][1] += f * dy
      })
    }
    const Rne = o.nodeEdgeRadius * L
    for (const [a, b] of edges) {
      const ax = P[a][0]
      const ay = P[a][1]
      const bx = P[b][0]
      const by = P[b][1]
      around((ax + bx) / 2, (ay + by) / 2, (j) => {
        if (j === a || j === b) return
        const px = P[j][0]
        const py = P[j][1]
        const vx = bx - ax
        const vy = by - ay
        const len2 = vx * vx + vy * vy || 1e-9
        const u = Math.max(0.05, Math.min(0.95, ((px - ax) * vx + (py - ay) * vy) / len2))
        const qx = ax + u * vx
        const qy = ay + u * vy
        let dx = px - qx
        let dy = py - qy
        let d = Math.hypot(dx, dy)
        if (d >= Rne) return
        if (d < 1e-6) {
          dx = -vy
          dy = vx
          d = Math.hypot(dx, dy) || 1
        }
        const f = o.kNodeEdge * (Rne - d) / Rne / d
        F[j][0] += f * dx
        F[j][1] += f * dy
        F[a][0] -= f * dx * (1 - u) * 0.5
        F[a][1] -= f * dy * (1 - u) * 0.5
        F[b][0] -= f * dx * u * 0.5
        F[b][1] -= f * dy * u * 0.5
      })
    }
    for (const p of paths) {
      for (let i = 1; i < p.length - 1; i++) {
        const a = p[i - 1]
        const n = p[i]
        const b = p[i + 1]
        F[n][0] += o.kStraight * ((P[a][0] + P[b][0]) / 2 - P[n][0])
        F[n][1] += o.kStraight * ((P[a][1] + P[b][1]) / 2 - P[n][1])
      }
    }
    if (t > o.octoStart && o.kOcto > 0) {
      for (const [a, b] of edges) {
        const dx = P[b][0] - P[a][0]
        const dy = P[b][1] - P[a][1]
        const d = Math.hypot(dx, dy) || 1e-6
        const ang = Math.atan2(dy, dx)
        const target = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
        const ex = (Math.cos(target) * d - dx) / 2
        const ey = (Math.sin(target) * d - dy) / 2
        F[b][0] += o.kOcto * ex
        F[b][1] += o.kOcto * ey
        F[a][0] -= o.kOcto * ex
        F[a][1] -= o.kOcto * ey
      }
    }
    const cap = o.maxMove * L
    for (let i = 0; i < N; i++) {
      if (fixedIdx.has(i)) continue
      let mx = F[i][0] * step
      let my = F[i][1] * step
      const m = Math.hypot(mx, my)
      if (m > cap) {
        mx *= cap / m
        my *= cap / m
      }
      P[i][0] += mx
      P[i][1] += my
    }
  }

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  P.forEach((p) => {
    x0 = Math.min(x0, p[0])
    y0 = Math.min(y0, p[1])
    x1 = Math.max(x1, p[0])
    y1 = Math.max(y1, p[1])
  })
  const cx = hybrid ? 0 : (x0 + x1) / 2
  const cy = hybrid ? 0 : (y0 + y1) / 2
  const positions = new Map<string, { x: number, y: number }>()
  keys.forEach((k, i) => positions.set(k, { x: P[i][0] - cx, y: P[i][1] - cy }))
  return { positions, edges: edges.length, width: x1 - x0, height: y1 - y0 }
}

/** Réseau importé + disposition → fichier réseau (coordonnées GPS, réelles ou fictives). */
export function toNetworkData(network: ImportedNetwork, layout: LayoutResult, options?: { kmPerUnit?: number, center?: { lat: number, lon: number }, city?: string }): NetworkData {
  const o = { kmPerUnit: layout.kmPerUnit ?? 0.8, center: layout.center ?? { lat: 46.0, lon: 4.0 }, city: 'Réseau importé', ...options }
  const KM = 111.32
  const cos = Math.cos(o.center.lat * Math.PI / 180)
  const gps = (x: number, y: number) => ({ lat: Number((o.center.lat + y * o.kmPerUnit / KM).toFixed(6)), lon: Number((o.center.lon + x * o.kmPerUnit / (KM * cos)).toFixed(6)) })
  const lines: NetworkLine[] = network.lines.map(l => ({
    id: l.id,
    name: l.name,
    group: l.group,
    groupName: l.groupName,
    mode: l.mode,
    kind: l.kind,
    index: l.index,
    color: l.color,
    start: l.start,
    end: l.end,
    frequency_min: l.frequency_min,
    stops: l.stops.map((s) => {
      const p = layout.positions.get(s.key)!
      const a = layout.anchorsInfo?.get(s.key)
      return { name: s.name, ...gps(p.x, p.y), ...(s.waypoint ? { waypoint: true } : {}), ...(a?.commune ? { commune: a.commune } : {}) }
    }),
  }))
  return {
    meta: {
      city: o.city,
      description: layout.anchored ? `${layout.anchored} station(s) géolocalisée(s), les autres disposées automatiquement.` : 'Positions calculées automatiquement.',
      center: o.center,
      source: 'BULB',
      layout: layout.anchored ? 'gps+auto' : 'auto',
    },
    lines,
  }
}
