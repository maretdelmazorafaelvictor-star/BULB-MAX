import type { ImportedNetwork, NetworkEdits, ParsedProject } from '~/utils/network/bulbImport'
import type { GeoStop } from '~/utils/network/geoMatch'
import type { NetworkData } from '~/utils/network/types'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { buildNetwork, mergedKey, normalizeName, parseProject } from '~/utils/network/bulbImport'
import { build } from '~/utils/network/engine'
import { matchStations, parseReference } from '~/utils/network/geoMatch'
import { layoutNetwork, toNetworkData } from '~/utils/network/layout'
import { octolinearity, schematize, toSchematicData } from '~/utils/network/schematic'

export interface SchematicSettings {
  /** dilatation du centre : 0 = automatique, sinon 0..1 */
  dilation: number
  /** espacement des stations (0.5..2) */
  spacing: number
  /** force de l'alignement à 45° (0..1) */
  octo: number
  /** fidélité à la géographie (0..2) */
  fidelity: number
}

export const DEFAULT_SCHEMATIC: SchematicSettings = { dilation: 0, spacing: 1, octo: 1, fidelity: 0.5 }

export interface ImportReport {
  projects: number
  stations: number
  interchanges: number
  /** stations placées grâce au champ position des projets eux-mêmes */
  fromProjects: number
  geolocated: number
  unmatched: string[]
  fuzzy: { station: string, ref: string }[]
}

/**
 * Réseau multi-lignes : les projets BULB importés (forme compacte), le référentiel d'arrêts
 * géolocalisés et le fichier réseau qui en résulte (lignes, arrêts, coordonnées).
 */
export const useNetwork = defineStore('network', () => {
  const projects = ref<ParsedProject[]>([])
  const reference = ref<GeoStop[]>([])
  const referenceFiles = ref<string[]>([])
  const data = ref<NetworkData | null>(null)
  const hiddenGroups = ref<string[]>([])
  /** retouches de l'utilisateur (fusions, renommages, masquages), rejouées après chaque import */
  const edits = ref<NetworkEdits>({ merge: {}, rename: {}, hide: [] })
  const report = ref<ImportReport | null>(null)
  const computing = ref(false)
  /** vue : plan schématique (angles à 45°) ou géographie */
  const view = ref<'schematic' | 'geo'>('schematic')
  const schematicSettings = ref<SchematicSettings>({ ...DEFAULT_SCHEMATIC })
  // réglages enregistrés par une version antérieure : on complète les champs manquants
  watch(schematicSettings, (v) => {
    if (v && typeof v.fidelity !== 'number') v.fidelity = DEFAULT_SCHEMATIC.fidelity
  }, { immediate: true, deep: true })
  /** fichier réseau schématisé (positions à 45°), dérivé de `data` */
  const schematicData = ref<NetworkData | null>(null)
  const schematicScore = ref<number | null>(null)

  // le réseau construit (tracés, stations, horaires) est dérivé du fichier réseau
  const geoNetwork = shallowRef(data.value ? build(data.value) : null)
  watch(data, (d) => {
    geoNetwork.value = d ? build(d) : null
  }, { deep: true, flush: 'sync' })

  const schematicNetwork = shallowRef(schematicData.value ? build(schematicData.value) : null)
  watch(schematicData, (d) => {
    schematicNetwork.value = d ? build(d) : null
  }, { deep: true, flush: 'sync' })

  const network = computed(() => (view.value === 'schematic' && schematicNetwork.value) ? schematicNetwork.value : geoNetwork.value)

  /** Recalcule le plan schématique à partir du réseau géographique. */
  function reschematize() {
    const base = geoNetwork.value
    if (!base || !data.value) {
      schematicData.value = null
      schematicScore.value = null
      return
    }
    computing.value = true
    try {
      const s = schematicSettings.value
      const result = schematize(base, { dilation: s.dilation > 0 ? s.dilation : undefined, spacing: s.spacing, octo: s.octo, fidelity: s.fidelity })
      schematicData.value = toSchematicData(data.value, base, result)
      schematicScore.value = octolinearity(base, result.positions)
    } finally {
      computing.value = false
    }
  }

  const lineGroups = computed(() => {
    const groups = new Map<string, NonNullable<typeof network.value>['lines']>()
    for (const line of network.value?.lines ?? []) {
      if (!groups.has(line.group)) groups.set(line.group, [])
      groups.get(line.group)!.push(line)
    }
    return [...groups.values()]
  })

  const hiddenLineIds = computed(() => {
    const set = new Set<string>()
    for (const line of network.value?.lines ?? []) {
      if (hiddenGroups.value.includes(line.group)) set.add(line.id)
    }
    return set
  })

  /** Recalcule le fichier réseau à partir des projets : géolocalisation puis disposition. */
  function recompute() {
    if (!projects.value.length) {
      data.value = null
      report.value = null
      return
    }
    computing.value = true
    try {
      const imported: ImportedNetwork = buildNetwork(projects.value, { edits: edits.value })
      const anchors = new Map<string, { lat: number, lon: number, commune?: string | null }>()
      // positions déjà connues (calcul précédent) : conservées pour les stations non géolocalisées
      for (const line of data.value?.lines ?? []) {
        for (const s of line.stops) {
          if (!s.waypoint) anchors.set(mergedKey(edits.value, normalizeName(s.name)), { lat: s.lat, lon: s.lon, commune: s.commune })
        }
      }
      let geolocated = 0
      let unmatched: string[] = []
      let fuzzy: { station: string, ref: string }[] = []
      if (reference.value.length) {
        const m = matchStations(imported, reference.value, projects.value)
        for (const [key, pos] of m.positions) anchors.set(key, pos)
        geolocated = m.matched
        unmatched = m.unmatched
        fuzzy = [...m.positions.entries()].filter(([, v]) => v.how === 'fuzzy').map(([k, v]) => ({ station: imported.stations.find(s => s.key === k)?.name ?? k, ref: v.ref }))
      }
      // positions portées par les projets eux-mêmes : elles font foi sur le référentiel
      const known = new Set(imported.stations.map(s => s.key))
      const placed = new Set<string>()
      for (const p of projects.value) {
        for (const [rawKey, pos] of Object.entries(p.positions ?? {})) {
          const key = mergedKey(edits.value, rawKey)
          if (!known.has(key)) continue
          anchors.set(key, { ...pos, commune: anchors.get(key)?.commune ?? null })
          placed.add(key)
        }
      }
      const fromProjects = placed.size
      const useAnchors = [...anchors.keys()].filter(k => imported.stations.some(s => s.key === k)).length >= 3
      const layout = layoutNetwork(imported, useAnchors ? { anchors } : {})
      const city = data.value?.meta?.city
      data.value = toNetworkData(imported, layout, city ? { city } : {})
      reschematize()
      report.value = {
        projects: projects.value.length,
        stations: imported.stations.length,
        interchanges: imported.stations.filter(s => s.lines.length > 1).length,
        fromProjects,
        geolocated,
        unmatched,
        fuzzy,
      }
    } finally {
      computing.value = false
    }
  }

  /** Ajoute (ou remplace) des projets BULB. Retourne les erreurs de lecture, fichier par fichier. */
  function addProjects(items: { name: string, json: unknown }[]): string[] {
    const errors: string[] = []
    for (const it of items) {
      try {
        const p = parseProject(it.json as Project, it.name)
        const i = projects.value.findIndex(x => x.id === p.id)
        if (i >= 0) projects.value.splice(i, 1, p)
        else projects.value.push(p)
      } catch (e) {
        errors.push((e as Error).message)
      }
    }
    recompute()
    return errors
  }

  function removeProject(id: string) {
    projects.value = projects.value.filter(p => p.id !== id)
    recompute()
  }

  /** Ajoute un référentiel d'arrêts géolocalisés (GeoJSON ou CSV). */
  function addReference(text: string, fileName: string) {
    const stops = parseReference(text, fileName)
    reference.value = reference.value.concat(stops)
    if (!referenceFiles.value.includes(fileName)) referenceFiles.value.push(fileName)
    recompute()
  }

  function clearReference() {
    reference.value = []
    referenceFiles.value = []
  }

  /** Charge directement un fichier réseau (lignes et coordonnées). */
  function loadData(d: NetworkData) {
    build(d) // validation
    projects.value = []
    data.value = d
    report.value = null
    hiddenGroups.value = []
    if (d.meta?.layout === 'schematic') {
      schematicData.value = d
      schematicScore.value = null
    } else {
      reschematize()
    }
  }

  function clear() {
    projects.value = []
    data.value = null
    schematicData.value = null
    schematicScore.value = null
    report.value = null
    hiddenGroups.value = []
  }

  /* ---------- retouches ---------- */

  /** Nom d'origine de chaque station, par clé (les retouches se raisonnent sur les clés). */
  const nameByKey = computed(() => {
    const m: Record<string, string> = {}
    for (const p of projects.value) {
      for (const stop of p.services.flat()) {
        if (!m[stop.key]) m[stop.key] = stop.name
      }
    }
    return m
  })

  /** Clé de la station portant ce nom sur le plan (le nom affiché peut avoir été changé). */
  const keyByName = computed(() => {
    const m: Record<string, string> = {}
    if (projects.value.length) {
      for (const st of buildNetwork(projects.value, { edits: edits.value }).stations) m[st.name] = st.key
    }
    return m
  })

  const keyOf = (name: string) => keyByName.value[name] ?? mergedKey(edits.value, normalizeName(name))

  /** Rattache une station à une autre : les deux n'en font plus qu'une (correspondance). */
  function mergeStations(fromName: string, intoName: string) {
    const from = keyOf(fromName)
    const into = keyOf(intoName)
    if (from === into) return
    edits.value.merge = { ...edits.value.merge, [from]: into }
    recompute()
  }

  /** Détache les stations rattachées à celle-ci. */
  function splitStation(name: string) {
    const key = keyOf(name)
    const merge = { ...edits.value.merge }
    for (const [from, into] of Object.entries(merge)) {
      if (into === key || from === key) delete merge[from]
    }
    edits.value.merge = merge
    recompute()
  }

  /** Stations rattachées à celle-ci (noms d'origine). */
  function mergedInto(name: string): string[] {
    const key = keyOf(name)
    return Object.entries(edits.value.merge ?? {})
      .filter(([, into]) => mergedKey(edits.value, into) === key)
      .map(([from]) => nameByKey.value[from] ?? from)
  }

  /** Nom affiché d'une station sur le plan. Chaîne vide : on revient au nom d'origine. */
  function renameStation(name: string, label: string) {
    const key = keyOf(name)
    const rename = { ...edits.value.rename }
    if (label.trim()) rename[key] = label.trim()
    else delete rename[key]
    edits.value.rename = rename
    recompute()
  }

  /** Masque une station : la ligne continue de passer, sans arrêt marqué. */
  function toggleStationHidden(name: string) {
    const key = keyOf(name)
    const hide = edits.value.hide ?? []
    edits.value.hide = hide.includes(key) ? hide.filter(k => k !== key) : [...hide, key]
    recompute()
  }

  function isStationHidden(name: string): boolean {
    return (edits.value.hide ?? []).includes(keyOf(name))
  }

  /** Annule toutes les retouches. */
  function clearEdits() {
    edits.value = { merge: {}, rename: {}, hide: [] }
    recompute()
  }

  const editCount = computed(() => Object.keys(edits.value.merge ?? {}).length + Object.keys(edits.value.rename ?? {}).length + (edits.value.hide ?? []).length)

  function toggleGroup(group: string) {
    const i = hiddenGroups.value.indexOf(group)
    if (i >= 0) hiddenGroups.value.splice(i, 1)
    else hiddenGroups.value.push(group)
  }

  return {
    projects,
    reference,
    referenceFiles,
    data,
    hiddenGroups,
    edits,
    report,
    computing,
    view,
    schematicSettings,
    schematicData,
    schematicScore,
    network,
    geoNetwork,
    lineGroups,
    hiddenLineIds,
    recompute,
    reschematize,
    addProjects,
    removeProject,
    addReference,
    clearReference,
    loadData,
    clear,
    toggleGroup,
    edits,
    editCount,
    nameByKey,
    mergeStations,
    splitStation,
    mergedInto,
    renameStation,
    toggleStationHidden,
    isStationHidden,
    clearEdits,
  }
}, {
  persist: {
    storage: localStorage,
    pick: ['projects', 'reference', 'referenceFiles', 'data', 'hiddenGroups', 'edits', 'report', 'view', 'schematicSettings', 'schematicData'],
  },
})
