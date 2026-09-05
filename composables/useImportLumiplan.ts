import type { LumiplanSaveFile } from '~/utils/lumiplan'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useToast } from 'primevue/usetoast'
import { useCustomLineIndices } from '~/stores/useCustomLineIndices'
import { useProject } from '~/stores/useProject'
import { lumiplanSaveFileToLine } from '~/utils/lumiplanImport'

export default function useImportLumiplan() {
  const toast = useToast()
  const { open, onChange } = useFileDialog({
    accept: 'application/json',
    multiple: false,
    directory: false,
    reset: true,
  })

  const { line, presetBased } = storeToRefs(useProject())
  const { indices } = storeToRefs(useCustomLineIndices())

  function load(saveFile: LumiplanSaveFile) {
    const result = lumiplanSaveFileToLine(saveFile)

    presetBased.value = false
    line.value.mode = result.line.mode
    line.value.index = result.line.index
    line.value.color = result.line.color
    line.value.fullyAccessible = result.line.fullyAccessible
    line.value.topology = result.line.topology

    const existingIds = indices.value.map(it => it.id)
    const newIndices = result.customIndices.filter(it => !existingIds.includes(it.id))
    indices.value.push(...newIndices)

    toast.add({
      summary: 'ui.toasts.load.success.title',
      detail: 'ui.toasts.load.success.detail',
      severity: 'success',
      life: 5000,
    })
  }

  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      load(JSON.parse(ev.target?.result as string) as LumiplanSaveFile)
    } catch (error) {
      console.warn(error)
      toast.add({
        summary: 'ui.toasts.load.failure.title',
        detail: 'ui.toasts.load.failure.detail.corrupted',
        severity: 'error',
        life: 5000,
      })
    }
  }

  onChange((files) => {
    if (files !== null && files.length > 0) {
      reader.readAsText(files[0])
    }
  })

  return open
}
