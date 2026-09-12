import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { ref } from 'vue'

/** Préfixe des identifiants de modes personnalisés. */
export const CUSTOM_MODE_PREFIX = 'CUSTOM:'

export function isCustomMode(mode: Mode | null): boolean {
  return typeof mode === 'string' && mode.startsWith(CUSTOM_MODE_PREFIX)
}

export const useCustomModes = defineStore('customModes', () => {
  const modes = ref<CustomModeDescription[]>([])

  function findById(id: string): CustomModeDescription | null {
    return modes.value.find(mode => mode.id === id) ?? null
  }

  function create(name: string): CustomModeDescription {
    const mode: CustomModeDescription = {
      id: `${CUSTOM_MODE_PREFIX}${uuidv4()}`,
      name: name.trim(),
      shape: 'ROUNDED_SQUARE',
      picto: null,
    }
    modes.value.push(mode)
    return mode
  }

  function rename(id: string, name: string): void {
    const mode = findById(id)
    if (mode) mode.name = name.trim()
  }

  function setShape(id: string, shape: IndexShape): void {
    const mode = findById(id)
    if (mode) mode.shape = shape
  }

  function setPicto(id: string, picto: string | null): void {
    const mode = findById(id)
    if (mode) mode.picto = picto
  }

  function remove(id: string): void {
    const mode = findById(id)
    if (mode) modes.value.splice(modes.value.indexOf(mode), 1)
  }

  return { modes, findById, create, rename, setShape, setPicto, remove }
}, {
  persist: {
    storage: localStorage,
  },
})
