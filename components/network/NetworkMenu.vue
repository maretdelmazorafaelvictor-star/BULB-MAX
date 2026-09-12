<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import useNetworkFiles from '~/composables/useNetworkFiles'
import { useCustomLineIndices } from '~/stores/useCustomLineIndices'
import { useNetwork } from '~/stores/useNetwork'
import { useProject } from '~/stores/useProject'

const store = useNetwork()
const { projects, reference, referenceFiles, data, report, network, hiddenStations } = storeToRefs(store)
const { openProjects, openReference, openNetwork, saveNetwork } = useNetworkFiles()
const project = useProject()
const { indices } = storeToRefs(useCustomLineIndices())
const confirm = useConfirm()
const toast = useToast()
const { t } = useI18n()

const stationCount = computed(() => network.value?.stations.length ?? 0)
const interchangeCount = computed(() => network.value?.stations.filter(s => s.interchange).length ?? 0)
const lineCount = computed(() => new Set(network.value?.lines.map(l => l.group)).size)

/** Ajoute au réseau la ligne en cours d'édition dans l'éditeur de plan. */
function addCurrentLine() {
  const json: Project = {
    version: project.version ?? '',
    presetBased: project.presetBased,
    line: JSON.parse(JSON.stringify(project.line)),
    customIndices: indices.value,
  }
  const errors = store.addProjects([{ name: t('ui.network.menu.current_line'), json }])
  if (errors.length) toast.add({ summary: t('ui.network.toasts.error_title'), detail: errors.join(' — '), severity: 'error', life: 8000 })
  else toast.add({ summary: t('ui.network.toasts.success_title'), detail: t('ui.network.toasts.projects_added', { count: 1 }), severity: 'success', life: 5000 })
}

function clearNetwork() {
  confirm.require({
    header: t('ui.network.dialogs.clear.header'),
    message: t('ui.network.dialogs.clear.message'),
    acceptProps: { label: t('ui.network.dialogs.clear.accept'), severity: 'warn' },
    rejectProps: { label: t('ui.network.dialogs.clear.reject'), severity: 'secondary', text: true },
    accept: () => store.clear(),
  })
}
</script>

<template>
  <div class="flex flex-col items-stretch flex-grow">
    <Button
      pt:root:class="important-justify-start"
      :label="$t('ui.network.menu.import_projects')"
      severity="secondary"
      icon="i-tabler-files"
      text
      @click="openProjects()"
    />
    <Button
      pt:root:class="important-justify-start"
      :label="$t('ui.network.menu.add_current')"
      severity="secondary"
      icon="i-tabler-map-plus"
      text
      @click="addCurrentLine()"
    />
    <Button
      pt:root:class="important-justify-start"
      :label="$t('ui.network.menu.reference')"
      severity="secondary"
      icon="i-tabler-map-pin"
      text
      @click="openReference()"
    />
    <Divider />
    <Button
      pt:root:class="important-justify-start"
      :label="$t('ui.network.menu.open')"
      severity="secondary"
      icon="i-tabler-folder-open"
      text
      @click="openNetwork()"
    />
    <Button
      pt:root:class="important-justify-start"
      :label="$t('ui.network.menu.save')"
      severity="secondary"
      icon="i-tabler-device-floppy"
      text
      :disabled="!data"
      @click="saveNetwork(data?.meta?.city ?? 'reseau')"
    />
    <Button
      pt:root:class="important-justify-start"
      :label="$t('ui.network.menu.clear')"
      severity="secondary"
      icon="i-tabler-trash"
      text
      :disabled="!data && !projects.length"
      @click="clearNetwork()"
    />
    <Divider />
    <div class="px-3 py-2 flex flex-col gap-1 text-sm">
      <div v-if="network">
        <strong>{{ $t('ui.network.summary.lines', { count: lineCount }) }}</strong> ·
        {{ $t('ui.network.summary.stations', { count: stationCount }) }} ·
        {{ $t('ui.network.summary.interchanges', { count: interchangeCount }) }}
      </div>
      <div v-else class="text-gray">
        {{ $t('ui.network.summary.empty') }}
      </div>
      <div v-if="reference.length" class="text-gray">
        {{ $t('ui.network.summary.reference', { count: reference.length, files: referenceFiles.length }) }}
      </div>
      <template v-if="report">
        <div v-if="report.fromProjects" class="text-gray">
          {{ $t('ui.network.summary.from_projects', { count: report.fromProjects, total: report.stations }) }}
        </div>
        <div v-if="reference.length" class="text-gray">
          {{ $t('ui.network.summary.geolocated', { count: report.geolocated, total: report.stations }) }}
        </div>
        <details v-if="report.unmatched.length">
          <summary class="cursor-pointer">
            {{ $t('ui.network.summary.unmatched', { count: report.unmatched.length }) }}
          </summary>
          <div class="max-h-30 overflow-y-auto text-xs text-gray">
            {{ report.unmatched.join(' · ') }}
          </div>
        </details>
        <details v-if="report.fuzzy.length">
          <summary class="cursor-pointer">
            {{ $t('ui.network.summary.fuzzy', { count: report.fuzzy.length }) }}
          </summary>
          <div class="max-h-30 overflow-y-auto text-xs text-gray">
            {{ report.fuzzy.map(f => `${f.station} → ${f.ref}`).join(' · ') }}
          </div>
        </details>
      </template>
      <details v-if="hiddenStations.length">
        <summary class="cursor-pointer">
          {{ $t('ui.network.summary.hidden', { count: hiddenStations.length }) }}
        </summary>
        <div class="max-h-30 overflow-y-auto flex flex-col items-start">
          <Button
            v-for="st of hiddenStations" :key="st.key"
            :label="st.name" icon="i-tabler-eye" size="small" severity="secondary" text
            :title="$t('ui.network.summary.restore')"
            @click="store.unhideStation(st.key)"
          />
        </div>
      </details>
    </div>
    <div v-if="projects.length" class="px-3 pb-2 flex flex-col gap-1">
      <div class="text-xs tracking-wider text-gray">
        {{ $t('ui.network.menu.projects', { count: projects.length }) }}
      </div>
      <div v-for="p of projects" :key="p.id" class="flex flex-row items-center gap-2 text-sm">
        <span class="flex-grow truncate">{{ p.name }} · {{ $t('ui.network.summary.stations', { count: p.stopCount }) }}</span>
        <Button icon="i-tabler-x" text rounded size="small" severity="secondary" :title="$t('ui.network.menu.remove')" @click="store.removeProject(p.id)" />
      </div>
    </div>
  </div>
</template>
