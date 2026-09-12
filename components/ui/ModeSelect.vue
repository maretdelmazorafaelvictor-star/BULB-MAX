<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { findModeByValue, MODES } from '~/data/modes'
import { useCustomModes } from '~/stores/useCustomModes'

interface ModeOption { value: Mode, label: string, custom?: boolean }

const mode = defineModel<Mode | null>({ required: true })
const customModes = useCustomModes()

const options = computed<ModeOption[]>(() => [
  ...MODES as ModeOption[],
  ...customModes.modes.map(it => ({ value: it.id as Mode, label: it.name, custom: true })),
])

function findOption(value: Mode | null): ModeOption | null {
  if (value === null) return null
  return options.value.find(it => it.value === value) ?? findModeByValue(value) as ModeOption | null
}

const selectedMode = ref<ModeOption | null>(findOption(mode.value))

watch(selectedMode, val => mode.value = val?.value ?? null)
watch(mode, val => selectedMode.value = findOption(val))
watch(() => customModes.modes, () => selectedMode.value = findOption(mode.value), { deep: true })
</script>

<template>
  <Select
    v-model="selectedMode"
    :options="options"
    :placeholder="$t('components.mode_select.placeholder')"
    class="flex-auto"
  >
    <template #value="slotProps">
      <div v-if="slotProps.value" class="flex items-center gap-3">
        <Mode class="text-1.25em" plain :mode="slotProps.value.value" />
        <span>{{ slotProps.value.custom ? slotProps.value.label : $t(slotProps.value.label.toLowerCase()) }}</span>
      </div>
    </template>
    <template #option="slotProps">
      <div class="flex items-center gap-3">
        <Mode class="text-1.25em" plain :mode="slotProps.option.value" />
        <span>{{ slotProps.option.custom ? slotProps.option.label : $t(slotProps.option.label.toLowerCase()) }}</span>
      </div>
    </template>
  </Select>
</template>
