import type { NetworkData } from '~/utils/network/types'
import { useFileDialog } from '@vueuse/core'
import { useToast } from 'primevue/usetoast'
import { useI18n } from 'vue-i18n'
import { useNetwork } from '~/stores/useNetwork'

/** Dialogues de fichiers de l'onglet Réseau : projets BULB, référentiel d'arrêts, fichier réseau. */
export default function useNetworkFiles() {
  const store = useNetwork()
  const toast = useToast()
  const { t } = useI18n()

  const readAll = (files: FileList | null) => Promise.all([...(files ?? [])].map(f => f.text().then(text => ({ name: f.name, text }))))

  const projectsDialog = useFileDialog({ accept: 'application/json', multiple: true, reset: true })
  projectsDialog.onChange(async (files) => {
    const items = await readAll(files)
    const parsed: { name: string, json: unknown }[] = []
    const errors: string[] = []
    for (const it of items) {
      try {
        parsed.push({ name: it.name, json: JSON.parse(it.text) })
      } catch {
        errors.push(t('ui.network.toasts.invalid_json', { name: it.name }))
      }
    }
    if (parsed.length) errors.push(...store.addProjects(parsed))
    notify(errors, t('ui.network.toasts.projects_added', { count: parsed.length - errors.length }))
  })

  const referenceDialog = useFileDialog({ accept: '.geojson,.json,.csv,application/json,text/csv', multiple: true, reset: true })
  referenceDialog.onChange(async (files) => {
    const items = await readAll(files)
    const errors: string[] = []
    for (const it of items) {
      try {
        store.addReference(it.text, it.name)
      } catch (e) {
        errors.push((e as Error).message)
      }
    }
    notify(errors, t('ui.network.toasts.reference_added', { count: store.reference.length }))
  })

  const networkDialog = useFileDialog({ accept: 'application/json', multiple: false, reset: true })
  networkDialog.onChange(async (files) => {
    const items = await readAll(files)
    if (!items.length) return
    try {
      const json = JSON.parse(items[0].text) as NetworkData
      store.loadData(json)
      notify([], t('ui.network.toasts.network_loaded'))
    } catch (e) {
      notify([(e as Error).message], '')
    }
  })

  function saveNetwork(name = 'reseau') {
    if (!store.data) return
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/(\.json)$/, '')}.json`
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function notify(errors: string[], success: string) {
    if (errors.length) {
      toast.add({ summary: t('ui.network.toasts.error_title'), detail: errors.join(' — '), severity: 'error', life: 8000 })
    }
    if (success) {
      toast.add({ summary: t('ui.network.toasts.success_title'), detail: success, severity: 'success', life: 5000 })
    }
  }

  return {
    openProjects: projectsDialog.open,
    openReference: referenceDialog.open,
    openNetwork: networkDialog.open,
    saveNetwork,
  }
}
