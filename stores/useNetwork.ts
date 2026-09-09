import type { ImportedNetwork, ParsedProject } from '~/utils/network/bulbImport'
import type { GeoStop } from '~/utils/network/geoMatch'
import type { NetworkData } from '~/utils/network/types'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { buildNetwork, normalizeName, parseProject } from '~/utils/network/bulbImport'
import { build } from '~/utils/network/engine'
import { matchStations, parseReference } from '~/utils/network/geoMatch'
import { layoutNetwork, toNetworkData } from '~/utils/network/layout'

export interface ImportReport {
  projects: number
  stations: number
  interchanges: number
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
  const report = ref<ImportReport | null>(null)
  const computing = ref(false)

  // le réseau construit (tracés, stations, horaires) est dérivé du fichier réseau
  const network = shallowRef(data.value ? build(data.value) : null)
  watch(data, (d) => {
    network.value = d ? build(d) : null
  }, { deep: true })

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
      const imported: ImportedNetwork = buildNetwork(projects.value)
      const anchors = new Map<string, { lat: number, lon: number, commune?: string | null }>()
      // positions déjà connues (calcul précédent) : conservées pour les stations non géolocalisées
      for (const line of data.value?.lines ?? []) {
        for (const s of line.stops) {
          if (!s.waypoint) anchors.set(normalizeName(s.name), { lat: s.lat, lon: s.lon, commune: s.commune })
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
      const useAnchors = [...anchors.keys()].filter(k => imported.stations.some(s => s.key === k)).length >= 3
      const layout = layoutNetwork(imported, useAnchors ? { anchors } : {})
      const city = data.value?.meta?.city
      data.value = toNetworkData(imported, layout, city ? { city } : {})
      report.value = {
        projects: projects.value.length,
        stations: imported.stations.length,
        interchanges: imported.stations.filter(s => s.lines.length > 1).length,
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
  }

  function clear() {
    projects.value = []
    data.value = null
    report.value = null
    hiddenGroups.value = []
  }

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
    report,
    computing,
    network,
    lineGroups,
    hiddenLineIds,
    recompute,
    addProjects,
    removeProject,
    addReference,
    clearReference,
    loadData,
    clear,
    toggleGroup,
  }
}, {
  persist: {
    storage: localStorage,
    pick: ['projects', 'reference', 'referenceFiles', 'data', 'hiddenGroups', 'report'],
  },
})
