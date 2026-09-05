<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useCustomLineIndices } from '~/stores/useCustomLineIndices'
import { useProject } from '~/stores/useProject'
import {
  buildLumiplanSaveFile,
  enumerateLinePaths,
  type LinePath,
} from '~/utils/lumiplan'

const visible = defineModel<boolean>('visible', { required: true })

const { line } = storeToRefs(useProject())
const { indices } = storeToRefs(useCustomLineIndices())

const paths = ref<LinePath[]>([])
const selectedPath = ref<LinePath | null>(null)
const departure = ref('')
const intervalMinutes = ref(2)
const name = ref('lumiplan')

/** Intervalle par défaut selon le mode de la ligne. */
const DEFAULT_INTERVALS: Partial<Record<Mode, number>> = {
  METRO: 1.5,
  TRAM: 2,
  TRAM_TRAIN: 3,
  RER: 4,
  TRAIN: 5,
  TRAIN_RER: 4,
}

watch(visible, (value) => {
  if (!value) return
  paths.value = enumerateLinePaths(line.value.topology)
  selectedPath.value = paths.value[0] ?? null
  intervalMinutes.value = (line.value.mode && DEFAULT_INTERVALS[line.value.mode]) ?? 2

  const inFiveMinutes = new Date(Date.now() + 5 * 60_000)
  inFiveMinutes.setSeconds(0, 0)
  const offset = inFiveMinutes.getTimezoneOffset() * 60_000
  departure.value = new Date(inFiveMinutes.getTime() - offset).toISOString().slice(0, 16)

  name.value = `lumiplan_${line.value.mode ?? 'ligne'}`.toLowerCase()
})

const exportDisabled = computed(() =>
  selectedPath.value === null || !departure.value || intervalMinutes.value <= 0,
)

function doExport() {
  if (selectedPath.value === null) return

  const saveFile = buildLumiplanSaveFile(line.value, indices.value, {
    path: selectedPath.value,
    departure: new Date(departure.value),
    intervalMinutes: intervalMinutes.value,
    name: name.value,
  })

  const blob = new Blob([JSON.stringify(saveFile, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.value.replace(/(\.json)$/, '')}.json`
  a.click()
  URL.revokeObjectURL(url)

  visible.value = false
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="$t('ui.dialogs.lumiplan_export.header')"
    modal
  >
    <div class="flex flex-col gap-5" style="max-width: 32rem">
      <Message v-if="paths.length === 0" severity="warn">
        {{ $t('ui.dialogs.lumiplan_export.no_path') }}
      </Message>

      <template v-else>
        <Message severity="secondary">
          {{ $t('ui.dialogs.lumiplan_export.description') }}
        </Message>

        <div class="flex flex-col gap-1">
          <span>{{ $t('ui.dialogs.lumiplan_export.branch') }}</span>
          <Select
            v-model="selectedPath"
            :options="paths"
            option-label="label"
            :disabled="paths.length === 1"
          />
        </div>

        <div class="flex flex-col gap-1">
          <span>{{ $t('ui.dialogs.lumiplan_export.departure') }}</span>
          <InputText v-model="departure" type="datetime-local" />
        </div>

        <div class="flex flex-col gap-1">
          <span>{{ $t('ui.dialogs.lumiplan_export.interval') }}</span>
          <InputNumber
            v-model="intervalMinutes"
            :min="0.5"
            :step="0.5"
            :max-fraction-digits="1"
          />
        </div>

        <div class="flex flex-row items-center gap-4">
          <span class="text-nowrap">{{ $t('ui.dialogs.lumiplan_export.file_name') }}</span>
          <InputGroup>
            <InputText v-model="name" />
            <InputGroupAddon>.json</InputGroupAddon>
          </InputGroup>
        </div>
      </template>
    </div>

    <template #footer>
      <Button
        :label="$t('ui.dialogs.lumiplan_export.cancel')"
        severity="secondary"
        text
        @click="visible = false"
      />
      <Button
        :label="$t('ui.dialogs.lumiplan_export.accept')"
        icon="i-tabler-download"
        :disabled="exportDisabled"
        @click="doExport()"
      />
    </template>
  </Dialog>
</template>
