<script setup lang="ts">
import type { SelectChangeEvent } from 'primevue/select'
import { ref, watch } from 'vue'

interface StopNameAngleChoice {
  value: string
  label: string
}

const ANGLES: StopNameAngleChoice[] = [
  { label: 'data.stop_name_angle.tilted', value: '-30' },
  { label: 'data.stop_name_angle.horizontal', value: '0' },
  { label: 'data.stop_name_angle.tilted_45', value: '-45' },
  { label: 'data.stop_name_angle.tilted_60', value: '-60' },
  { label: 'data.stop_name_angle.vertical', value: '-90' },
  { label: 'data.stop_name_angle.custom', value: '' },
]

function findAngleByValue(value: string | null) {
  return ANGLES.find(angle => angle.value === value) ?? { label: 'data.stop_name_angle.custom', value: '' }
}

const angle = defineModel<string | null>({ required: true })
const selectedAngle = ref<StopNameAngleChoice | null>(findAngleByValue(angle.value))
const showCustomDialog = ref(false)

watch(selectedAngle, (val) => {
  if (val && val.value === '') return
  angle.value = val?.value ?? null
})
watch(angle, val => selectedAngle.value = findAngleByValue(val))
watch(showCustomDialog, (val) => {
  if (!val) selectedAngle.value = findAngleByValue(angle.value)
})

function handleClick(event: SelectChangeEvent) {
  if (event.value.value === '') {
    showCustomDialog.value = true
  }
}

function close() {
  showCustomDialog.value = false
  selectedAngle.value = findAngleByValue(angle.value)
}
</script>

<template>
  <Select
    v-model="selectedAngle"
    :options="ANGLES"
    :placeholder="$t('components.stop_name_angle_select.placeholder')"
    class="flex-auto"
    @change="handleClick"
  >
    <template #value="slotProps">
      <div v-if="slotProps.value" class="flex items-center gap-1">
        <span>{{ $t(slotProps.value.label.toLowerCase()) }}</span>
        <span class="opacity-50">{{ slotProps.value.value || angle || '-30' }}°</span>
      </div>
    </template>
    <template #option="slotProps">
      <div class="flex items-center gap-1">
        <span>{{ $t(slotProps.option.label.toLowerCase()) }}</span>
        <span v-if="slotProps.option.value" class="opacity-50">{{ slotProps.option.value }}°</span>
      </div>
    </template>
  </Select>

  <Dialog
    v-model:visible="showCustomDialog"
    :header="$t('ui.dialogs.custom_stop_name_angle.header')"
    modal
  >
    <InputGroup>
      <BInputNumber v-model="angle" class="w-full" />
      <InputGroupAddon>
        <span>°</span>
      </InputGroupAddon>
    </InputGroup>
    <template #footer>
      <Button :label="$t('ui.dialogs.custom_stop_name_angle.accept')" @click="close()" />
    </template>
  </Dialog>
</template>