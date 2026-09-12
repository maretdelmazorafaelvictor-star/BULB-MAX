import { storeToRefs } from 'pinia'
import { useToast } from 'primevue/usetoast'
import { useCustomLineIndices } from '~/stores/useCustomLineIndices'
import { useModePictos } from '~/stores/useModePictos'
import { useProject } from '~/stores/useProject'
import { getCustomIndicesIds, getInvolvedModes } from '~/utils/project'

export default function useSaveProject() {
  const toast = useToast()
  const { version, line, presetBased } = storeToRefs(useProject())
  const { indices } = storeToRefs(useCustomLineIndices())
  const modePictos = useModePictos()

  function stringifyLine() {
    const involvedCustomIndices = getCustomIndicesIds(line.value)
    const customIndices = indices.value.filter(index => involvedCustomIndices.includes(index.id))

    const modePictosOfLine: Partial<Record<Mode, string>> = {}
    for (const mode of getInvolvedModes(line.value)) {
      const picto = modePictos.pictoOf(mode)
      if (picto) modePictosOfLine[mode] = picto
    }

    return JSON.stringify({
      version: version.value,
      line: line.value,
      presetBased: presetBased.value,
      customIndices,
      modePictos: modePictosOfLine,
    })
  }

  function save(name: string) {
    const blob = new Blob([stringifyLine()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `${name?.replace(/(\.json)$/, '')}.json`
    a.click()

    toast.add({
      summary: 'ui.toasts.save.success.title',
      detail: 'ui.toasts.save.success.detail',
      severity: 'success',
      life: 5000,
    })
  }

  return save
}
