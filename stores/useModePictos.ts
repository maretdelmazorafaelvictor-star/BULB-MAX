import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** Côté maximal, en pixels, d'un pictogramme importé. */
const MAX_SIDE = 256
/** Poids maximal accepté après redimensionnement, en octets. */
const MAX_BYTES = 200 * 1024

export const useModePictos = defineStore('modePictos', () => {
  /** Image personnalisée de chaque mode, en data URL. */
  const pictos = ref<Partial<Record<Mode, string>>>({})

  const customizedModes = computed(() => Object.keys(pictos.value) as Mode[])

  function pictoOf(mode: Mode | null): string | null {
    if (mode === null) return null
    return pictos.value[mode] ?? null
  }

  function isCustomized(mode: Mode): boolean {
    return pictos.value[mode] !== undefined
  }

  /**
   * Redimensionne l'image à MAX_SIDE au plus grand côté et la range pour ce mode.
   * Rejette si le résultat dépasse MAX_BYTES.
   */
  async function importPicto(mode: Mode, file: File): Promise<void> {
    const dataUrl = await resize(file)
    if (dataUrl.length * 0.75 > MAX_BYTES) {
      throw new Error('too-large')
    }
    pictos.value = { ...pictos.value, [mode]: dataUrl }
  }

  function resetPicto(mode: Mode): void {
    const next = { ...pictos.value }
    delete next[mode]
    pictos.value = next
  }

  function resetAll(): void {
    pictos.value = {}
  }

  function resize(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('unreadable'))
      reader.onload = () => {
        const image = new Image()
        image.onerror = () => reject(new Error('unreadable'))
        image.onload = () => {
          const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.width * scale))
          canvas.height = Math.max(1, Math.round(image.height * scale))
          const context = canvas.getContext('2d')
          if (!context) {
            reject(new Error('unreadable'))
            return
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/png'))
        }
        image.src = reader.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  return {
    pictos,
    customizedModes,
    pictoOf,
    isCustomized,
    importPicto,
    resetPicto,
    resetAll,
  }
}, {
  persist: {
    storage: localStorage,
  },
})
