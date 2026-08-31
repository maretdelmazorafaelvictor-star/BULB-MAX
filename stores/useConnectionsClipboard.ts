import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { computed, ref, toRaw } from 'vue'

/*
 * Presse-papiers des correspondances, interne à l’application et vidé avec la session.
 * Il conserve le bloc complet d’un arrêt, et en rend une copie indépendante à chaque
 * collage : identifiants régénérés de fond en comble, sans quoi deux arrêts
 * partageraient les mêmes clés de rendu.
 */
export const useConnectionsClipboard = defineStore('connectionsClipboard', () => {
  const connections = ref<Connection[] | null>(null)

  const filled = computed(() => connections.value !== null)

  function copy(source: Connection[]): void {
    connections.value = clone(source)
  }

  function paste(): Connection[] | null {
    if (connections.value === null) return null
    return clone(connections.value)
  }

  function clear(): void {
    connections.value = null
  }

  function clone(source: Connection[]): Connection[] {
    return source.map((connection) => {
      const copied = structuredClone(toRaw(connection)) as Connection
      copied.id = uuidv4()

      if ('$modeConnection' in copied) {
        copied.$modeConnection.elements.forEach((element) => {
          element.id = uuidv4()
          if (element.$modeConnectionElement.ornament) {
            element.$modeConnectionElement.ornament.id = uuidv4()
          }
        })
      }

      if ('$serviceConnection' in copied) {
        copied.$serviceConnection.elements.forEach((element) => {
          element.id = uuidv4()
          if (element.$serviceConnectionElement.ornament) {
            element.$serviceConnectionElement.ornament.id = uuidv4()
          }
        })
      }

      return copied
    })
  }

  return {
    connections,
    filled,
    copy,
    paste,
    clear,
  }
})
