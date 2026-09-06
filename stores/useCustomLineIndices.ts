import { defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { ref } from 'vue'
import { modeToShape } from '~/data/modes'

export const useCustomLineIndices = defineStore('customLineIndices', () => {
  const indices = ref<CustomLineIndexDescription[]>([])
  const libraries = ref<IndexLibrary[]>([])

  function getModeIndices(mode: Mode | null): CustomLineIndexDescription[] {
    return indices.value.filter(index => index.mode === mode)
  }

  function findIndexById(id: string): CustomLineIndexDescription | null {
    return indices.value.find(index => index.id === id) ?? null
  }

  function deleteById(id: string): void {
    const index = findIndexById(id)
    if (index) {
      indices.value.splice(indices.value.indexOf(index), 1)
    }
  }

  function createNewIndex(mode: Mode): CustomLineIndexDescription {
    const newIndex: CustomLineIndexDescription = {
      id: uuidv4(),
      shape: modeToShape(mode),
      mode,
      prefix: '',
      index: '',
      suffix: '',
      color: '#000000',
    }
    indices.value.push(newIndex)

    return newIndex
  }

  function createLibrary(name: string): IndexLibrary {
  const newLibrary: IndexLibrary = {
  id: uuidv4(),
  name,
  }
  libraries.value.push(newLibrary)
  return newLibrary
  }
    function renameLibrary(id: string, name: string): void {
    const library = libraries.value.find(l => l.id === id)
    if (library) { library.name = name }
  }
  function deleteLibrary(id: string): void {
    for (const index of indices.value) {
      if (index.libraryId === id) {
        index.libraryId = undefined
      }
    }

    const library = libraries.value.find(l => l.id === id)
    if (library) {
      libraries.value.splice(libraries.value.indexOf(library), 1)
    }                                            // ← ferme le if
  }                                              // ← ferme la fonction
  

  return {
    indices,
    getModeIndices,
    findIndexById,
    deleteById,
    createNewIndex,
    libraries,
    createLibrary,
    renameLibrary,
    deleteLibrary,
  }
}, {
  persist: {
    storage: localStorage,
  },
})