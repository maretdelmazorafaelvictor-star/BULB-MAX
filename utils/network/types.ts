/* Types du plan de réseau (onglet « Réseau »). */

export type NetworkMode = 'metro' | 'train' | 'tram' | 'bus'

/** Arrêt d'une ligne du réseau, ou point de passage (waypoint) sans arrêt. */
export interface NetworkStop {
  name: string
  lat: number
  lon: number
  waypoint?: boolean
  commune?: string | null
  /** Position du libellé sur la carte : l | r | t | b */
  label?: string | null
}

/** Une ligne (ou un service d'une ligne à branches) telle que stockée dans le fichier réseau. */
export interface NetworkLine {
  id: string
  name: string
  /** Identifiant de la ligne « mère » : les services d'une même ligne partagent ce groupe. */
  group?: string
  groupName?: string
  mode: NetworkMode
  color: string
  /** Premier départ (HH:MM). */
  start: string
  /** Dernier départ (HH:MM, éventuellement après minuit). */
  end: string
  frequency_min: number
  loop?: boolean
  speed_kmh?: number
  dwell_s?: number
  terminus_s?: number
  stops: NetworkStop[]
}

export interface NetworkMeta {
  city?: string
  description?: string
  center?: { lat: number, lon: number }
  source?: string
  layout?: string
  [key: string]: unknown
}

/** Fichier réseau : lignes, arrêts et coordonnées. */
export interface NetworkData {
  meta?: NetworkMeta
  lines: NetworkLine[]
  decor?: unknown
}
