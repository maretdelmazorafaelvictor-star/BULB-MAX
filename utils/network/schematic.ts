/*
 * Schématisation : de la géographie au plan octolinéaire (angles multiples de 45°).
 *
 * 1. Centre détecté par densité de stations, puis dilaté (transformation radiale r' ∝ r^p) pour
 *    donner de la place au centre et resserrer la périphérie ; l'exposant p est déduit du réseau
 *    (rapport des espacements centre / périphérie) ou imposé par le curseur « dilatation ».
 * 2. Relaxation par forces : ressorts vers un espacement uniforme, répulsion station/station et
 *    station/tronçon, fidélité à la géographie, continuité des lignes, et attraction croissante
 *    vers les directions octolinéaires ; puis projection finale sur les 8 directions.
 *
 * Entrée : le réseau construit (stations en km, lignes avec leurs arrêts). Sortie : positions
 * schématiques (mêmes unités, même centre), à convertir en coordonnées par le module appelant.
 */
import type { Network } from './engine'
import type { NetworkData } from './types'
import { KM_PER_DEG } from './engine'

export interface SchematicOptions {
  /** dilatation du centre, 0 (aucune) à 1 (forte) ; absent = automatique */
  dilation?: number | null
  /** facteur d'espacement des stations (1 = espacement médian après dilatation) */
  spacing: number
  /** force de l'attraction vers les 45° (0 à 1) */
  octo: number
  /** fidélité à la géographie : 0 = libre, 1 = forte, au-delà = très proche du terrain */
  fidelity: number
  iterations: number
}

export const SCHEMATIC_DEFAULTS: SchematicOptions = { dilation: null, spacing: 1, octo: 1, fidelity: 0.5, iterations: 500 }

export interface SchematicResult {
  positions: Map<string, { x: number, y: number }>
  center: { x: number, y: number }
  spacing: number
  exponent: number
}

type P2 = [number, number]
const OCTANT = Math.PI / 4

export function schematize(network: Network, options?: Partial<SchematicOptions>): SchematicResult {
  const o: SchematicOptions = { ...SCHEMATIC_DEFAULTS, ...options }
  const stations = network.stations
  const N = stations.length
  const idx = new Map(stations.map((s, i) => [s.name, i]))
  const P: P2[] = stations.map(s => [s.x, s.y])
  if (N < 2) return { positions: new Map(stations.map(s => [s.name, { x: s.x, y: s.y }])), center: { x: 0, y: 0 }, spacing: 1, exponent: 1 }

  // parcours (listes d'indices) et arêtes uniques
  const paths: number[][] = []
  for (const line of network.lines) {
    const p = line.stops.map(s => idx.get(s.name)!).filter((v, i, a) => i === 0 || v !== a[i - 1])
    if (line.loop && p.length > 1 && p[0] === p[p.length - 1]) p.pop()
    if (p.length >= 2) paths.push(p)
  }
  const edgeSet = new Map<string, [number, number]>()
  const nbrs: Set<number>[] = Array.from({ length: N }, () => new Set())
  for (const p of paths) {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]
      const b = p[i]
      if (a === b) continue
      const k = a < b ? `${a}:${b}` : `${b}:${a}`
      if (!edgeSet.has(k)) edgeSet.set(k, [a, b])
      nbrs[a].add(b)
      nbrs[b].add(a)
    }
  }
  const edges = [...edgeSet.values()]

  /* ---------- 1. centre et dilatation ---------- */
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of P) {
    minX = Math.min(minX, p[0])
    maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1])
    maxY = Math.max(maxY, p[1])
  }
  const diag = Math.hypot(maxX - minX, maxY - minY) || 1
  const R0 = 0.08 * diag
  let best = 0
  let bestCount = -1
  const counts = P.map((p, i) => {
    let c = 0
    for (const q of P) {
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < R0) c++
    }
    if (c > bestCount) {
      bestCount = c
      best = i
    }
    return c
  })
  // centre = barycentre des stations les plus denses (au moins 80 % de la densité maximale)
  let cx = 0
  let cy = 0
  let cw = 0
  P.forEach((p, i) => {
    if (counts[i] >= 0.8 * bestCount) {
      cx += p[0]
      cy += p[1]
      cw++
    }
  })
  cx = cw ? cx / cw : P[best][0]
  cy = cw ? cy / cw : P[best][1]

  const edgeLen = ([a, b]: [number, number], Q: P2[]) => Math.hypot(Q[a][0] - Q[b][0], Q[a][1] - Q[b][1])
  const median = (v: number[]) => {
    const s = v.slice().sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 1
  }
  const radii = P.map(p => Math.hypot(p[0] - cx, p[1] - cy))
  const Rmax = Math.max(...radii) || 1
  // exposant automatique : équilibrer l'espacement des tronçons intérieurs et extérieurs
  let exponent = 1
  const inner = edges.filter(([a, b]) => (radii[a] + radii[b]) / 2 < 0.25 * Rmax)
  const outer = edges.filter(([a, b]) => (radii[a] + radii[b]) / 2 > 0.5 * Rmax)
  if (inner.length >= 5 && outer.length >= 5) {
    const dIn = median(inner.map(e => edgeLen(e, P)))
    const dOut = median(outer.map(e => edgeLen(e, P)))
    const rIn = median(inner.map(([a, b]) => (radii[a] + radii[b]) / 2))
    const rOut = median(outer.map(([a, b]) => (radii[a] + radii[b]) / 2))
    if (dIn > 0 && dOut > 0 && rIn > 0 && rOut > rIn) exponent = 1 + Math.log(dOut / dIn) / Math.log(rIn / rOut)
  }
  if (o.dilation != null) exponent = 1 - 0.65 * Math.min(Math.max(o.dilation, 0), 1)
  exponent = Math.min(Math.max(exponent, 0.35), 1)
  const Q0: P2[] = P.map((p, i) => {
    const r = radii[i]
    if (r < 1e-9) return [cx, cy]
    const r2 = Rmax * (r / Rmax) ** exponent
    return [cx + (p[0] - cx) * r2 / r, cy + (p[1] - cy) * r2 / r]
  })

  /* ---------- 2. relaxation ---------- */
  const L = median(edges.map(e => edgeLen(e, Q0))) * o.spacing
  const X: P2[] = Q0.map(p => [p[0], p[1]])
  const F: P2[] = Array.from({ length: N }, () => [0, 0])
  const cell = 1.5 * L
  const octoDir = (dx: number, dy: number): P2 => {
    const a = Math.round(Math.atan2(dy, dx) / OCTANT) * OCTANT
    return [Math.cos(a), Math.sin(a)]
  }

  /* Direction cible de chaque tronçon : le parcours est simplifié (Douglas-Peucker) en quelques
   * segments rectilignes ; chaque segment reçoit une des 8 directions et l'impose à tous ses
   * tronçons. On obtient de longues lignes droites, comme sur un plan dessiné à la main. */
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  const targets = new Map<string, P2>()
  const simplify = (p: number[], eps: number): number[] => {
    const keep: boolean[] = Array.from({ length: p.length }, () => false)
    keep[0] = true
    keep[p.length - 1] = true
    const stack: [number, number][] = [[0, p.length - 1]]
    while (stack.length) {
      const [i0, i1] = stack.pop()!
      if (i1 - i0 < 2) continue
      const A = X[p[i0]]
      const B = X[p[i1]]
      const vx = B[0] - A[0]
      const vy = B[1] - A[1]
      const len = Math.hypot(vx, vy)
      let bestD = -1
      let bestI = -1
      for (let i = i0 + 1; i < i1; i++) {
        const C = X[p[i]]
        // distance au segment (ou au point de départ si le segment est dégénéré)
        const d = len < 1e-9 ? Math.hypot(C[0] - A[0], C[1] - A[1]) : Math.abs((C[0] - A[0]) * vy - (C[1] - A[1]) * vx) / len
        if (d > bestD) {
          bestD = d
          bestI = i
        }
      }
      if (bestD > eps) {
        keep[bestI] = true
        stack.push([i0, bestI], [bestI, i1])
      }
    }
    return p.map((_, i) => i).filter(i => keep[i])
  }
  const assignTargets = (eps: number) => {
    targets.clear()
    const votes = new Map<string, Map<number, number>>() // arête → octant (0..7) → poids
    const vote = (a: number, b: number, oct: number, w: number) => {
      const k = edgeKey(a, b)
      const sign = a < b ? 0 : 4 // orientation canonique : petit indice → grand
      const oc = (oct + sign) % 8
      if (!votes.has(k)) votes.set(k, new Map())
      const m = votes.get(k)!
      m.set(oc, (m.get(oc) ?? 0) + w)
    }
    for (const p of paths) {
      const breaks = simplify(p, eps)
      for (let r = 1; r < breaks.length; r++) {
        const i0 = breaks[r - 1]
        const i1 = breaks[r]
        const dx = X[p[i1]][0] - X[p[i0]][0]
        const dy = X[p[i1]][1] - X[p[i0]][1]
        const oct = ((Math.round(Math.atan2(dy, dx) / OCTANT) % 8) + 8) % 8
        const w = Math.min(i1 - i0, 6)
        for (let i = i0; i < i1; i++) vote(p[i], p[i + 1], oct, w)
      }
    }
    for (const [k, m] of votes) {
      let bestO = 0
      let bestW = -1
      for (const [oc, w] of m) {
        if (w > bestW) {
          bestW = w
          bestO = oc
        }
      }
      targets.set(k, [Math.cos(bestO * OCTANT), Math.sin(bestO * OCTANT)])
    }
  }
  const targetDir = (a: number, b: number): P2 => {
    const t = targets.get(edgeKey(a, b))
    if (!t) return octoDir(X[b][0] - X[a][0], X[b][1] - X[a][1])
    return a < b ? t : [-t[0], -t[1]]
  }

  /** Un pas de relaxation : ressorts, répulsions, continuité, fidélité, attraction octolinéaire. */
  const relaxStep = (step: number, kOcto: number, kFid: number) => {
    for (const f of F) {
      f[0] = 0
      f[1] = 0
    }
    // grille spatiale
    const grid = new Map<string, number[]>()
    X.forEach((p, i) => {
      const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k)!.push(i)
    })
    const around = (x: number, y: number, fn: (j: number) => void) => {
      const gx = Math.floor(x / cell)
      const gy = Math.floor(y / cell)
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) return
      for (let a = gx - 1; a <= gx + 1; a++) {
        for (let b = gy - 1; b <= gy + 1; b++) {
          const bucket = grid.get(`${a},${b}`)
          if (bucket) {
            for (const j of bucket) fn(j)
          }
        }
      }
    }
    // ressorts vers l'espacement cible (plus fermes quand le tronçon est trop court)
    for (const [a, b] of edges) {
      const dx = X[b][0] - X[a][0]
      const dy = X[b][1] - X[a][1]
      const d = Math.hypot(dx, dy) || 1e-6
      const k = d < L ? 0.6 : 0.25
      const f = k * (d - L) / d
      F[a][0] += f * dx
      F[a][1] += f * dy
      F[b][0] -= f * dx
      F[b][1] -= f * dy
    }
    // répulsion station/station
    const R = 1.1 * L
    for (let i = 0; i < N; i++) {
      around(X[i][0], X[i][1], (j) => {
        if (j <= i) return
        let dx = X[j][0] - X[i][0]
        let dy = X[j][1] - X[i][1]
        let d = Math.hypot(dx, dy)
        if (d >= R) return
        if (d < 1e-6) {
          dx = (i % 7 - 3) * 1e-3
          dy = (j % 5 - 2) * 1e-3
          d = Math.hypot(dx, dy) || 1e-3
        }
        const f = 0.7 * (R - d) / R / d
        F[i][0] -= f * dx
        F[i][1] -= f * dy
        F[j][0] += f * dx
        F[j][1] += f * dy
      })
    }
    // répulsion station/tronçon
    const Rne = 0.5 * L
    for (const [a, b] of edges) {
      const ax = X[a][0]
      const ay = X[a][1]
      const bx = X[b][0]
      const by = X[b][1]
      around((ax + bx) / 2, (ay + by) / 2, (j) => {
        if (j === a || j === b) return
        const vx = bx - ax
        const vy = by - ay
        const l2 = vx * vx + vy * vy || 1e-9
        const u = Math.max(0.05, Math.min(0.95, ((X[j][0] - ax) * vx + (X[j][1] - ay) * vy) / l2))
        let dx = X[j][0] - (ax + u * vx)
        let dy = X[j][1] - (ay + u * vy)
        let d = Math.hypot(dx, dy)
        if (d >= Rne) return
        if (d < 1e-6) {
          dx = -vy
          dy = vx
          d = Math.hypot(dx, dy) || 1
        }
        const f = 0.6 * (Rne - d) / Rne / d
        F[j][0] += f * dx
        F[j][1] += f * dy
        F[a][0] -= f * dx * (1 - u) * 0.5
        F[a][1] -= f * dy * (1 - u) * 0.5
        F[b][0] -= f * dx * u * 0.5
        F[b][1] -= f * dy * u * 0.5
      })
    }
    // continuité des lignes : une station intermédiaire tend vers l'alignement de ses voisines
    for (const p of paths) {
      for (let i = 1; i < p.length - 1; i++) {
        const a = p[i - 1]
        const n = p[i]
        const b = p[i + 1]
        const ux = X[n][0] - X[a][0]
        const uy = X[n][1] - X[a][1]
        const vx = X[b][0] - X[n][0]
        const vy = X[b][1] - X[n][1]
        const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1e-9)
        if (cos < 0.5) continue // vrai virage : on ne force pas
        const t1 = targetDir(a, n)
        const t2 = targetDir(n, b)
        const same = t1[0] === t2[0] && t1[1] === t2[1]
        const k = same ? 0.35 : 0.12
        F[n][0] += k * ((X[a][0] + X[b][0]) / 2 - X[n][0])
        F[n][1] += k * ((X[a][1] + X[b][1]) / 2 - X[n][1])
      }
    }
    // fidélité à la géographie dilatée
    if (kFid > 0) {
      for (let i = 0; i < N; i++) {
        F[i][0] += kFid * (Q0[i][0] - X[i][0])
        F[i][1] += kFid * (Q0[i][1] - X[i][1])
      }
    }
    // attraction vers les 8 directions
    if (kOcto > 0) {
      for (const [a, b] of edges) {
        const dx = X[b][0] - X[a][0]
        const dy = X[b][1] - X[a][1]
        const d = Math.hypot(dx, dy) || 1e-6
        const [ox, oy] = targetDir(a, b)
        const ex = (ox * d - dx) / 2
        const ey = (oy * d - dy) / 2
        F[b][0] += kOcto * ex
        F[b][1] += kOcto * ey
        F[a][0] -= kOcto * ex
        F[a][1] -= kOcto * ey
      }
    }
    const cap = 0.25 * L
    for (let i = 0; i < N; i++) {
      let mx = F[i][0] * step
      let my = F[i][1] * step
      const m = Math.hypot(mx, my)
      if (m > cap) {
        mx *= cap / m
        my *= cap / m
      }
      X[i][0] += mx
      X[i][1] += my
    }
  }

  const iterations = Math.max(50, o.iterations)
  for (let it = 0; it < iterations; it++) {
    if (it % 40 === 0) assignTargets(L * (1.4 - 0.6 * it / iterations))
    const t = it / iterations
    relaxStep(0.4 - 0.32 * t, o.octo * (t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.5)) * 0.9, o.fidelity * 0.10 * (1 - 0.5 * t))
  }

  /* ---------- 3. projection octolinéaire finale (entrecoupée d'une relaxation pour garder l'espacement) ---------- */
  const project = (passes: number) => {
    for (let it = 0; it < passes; it++) {
      const acc: P2[] = Array.from({ length: N }, () => [0, 0])
      const cnt: number[] = Array.from({ length: N }, () => 0)
      for (const [a, b] of edges) {
        const dx = X[b][0] - X[a][0]
        const dy = X[b][1] - X[a][1]
        const d = Math.hypot(dx, dy) || 1e-6
        const [ox, oy] = targetDir(a, b)
        const mx = (X[a][0] + X[b][0]) / 2
        const my = (X[a][1] + X[b][1]) / 2
        acc[a][0] += mx - ox * d / 2
        acc[a][1] += my - oy * d / 2
        acc[b][0] += mx + ox * d / 2
        acc[b][1] += my + oy * d / 2
        cnt[a]++
        cnt[b]++
      }
      const w = o.octo * (0.6 + 0.6 * it / passes)
      const kGeo = o.fidelity * 0.05
      for (let i = 0; i < N; i++) {
        if (!cnt[i]) continue
        if (kGeo > 0) {
          X[i][0] += kGeo * (Q0[i][0] - X[i][0])
          X[i][1] += kGeo * (Q0[i][1] - X[i][1])
        }
        X[i][0] += w * (acc[i][0] / cnt[i] - X[i][0])
        X[i][1] += w * (acc[i][1] / cnt[i] - X[i][1])
      }
    }
  }
  if (o.octo > 0) {
    assignTargets(0.8 * L)
    project(100)
    for (let it = 0; it < 60; it++) relaxStep(0.12, 1.4, 0)
    project(150)
  }

  const positions = new Map<string, { x: number, y: number }>()
  stations.forEach((s, i) => positions.set(s.name, { x: X[i][0], y: X[i][1] }))
  return { positions, center: { x: cx, y: cy }, spacing: L, exponent }
}

/** Mesure de qualité : part des tronçons à moins de `tol` degrés d'une direction octolinéaire. */
export function octolinearity(network: Network, positions: Map<string, { x: number, y: number }>, tol = 3): number {
  let n = 0
  let ok = 0
  const seen = new Set<string>()
  for (const line of network.lines) {
    for (let i = 1; i < line.stops.length; i++) {
      const a = line.stops[i - 1].name
      const b = line.stops[i].name
      const k = a < b ? `${a}|${b}` : `${b}|${a}`
      if (seen.has(k) || a === b) continue
      seen.add(k)
      const pa = positions.get(a)!
      const pb = positions.get(b)!
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x)
      const dev = Math.abs(ang - Math.round(ang / OCTANT) * OCTANT) * 180 / Math.PI
      n++
      if (dev <= tol) ok++
    }
  }
  return n ? ok / n : 1
}

/** Fichier réseau schématique : mêmes lignes, positions schématiques converties en coordonnées. */
export function toSchematicData(data: NetworkData, network: Network, result: SchematicResult): NetworkData {
  const center = network.center
  const cos = Math.cos(center.lat * Math.PI / 180)
  const gps = (x: number, y: number) => ({ lat: Number((center.lat + y / KM_PER_DEG).toFixed(6)), lon: Number((center.lon + x / (KM_PER_DEG * cos)).toFixed(6)) })
  return {
    ...data,
    meta: { ...(data.meta ?? {}), center, straight: true, layout: 'schematic' },
    lines: data.lines.map(l => ({
      ...l,
      stops: l.stops.filter(s => !s.waypoint).map((s) => {
        const p = result.positions.get(s.name)
        return p ? { ...s, ...gps(p.x, p.y) } : s
      }),
    })),
  }
}
