<script setup lang="ts">
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCustomModes } from '~/stores/useCustomModes'
import { resizeImage } from '~/utils/images'

const visible = defineModel<boolean>('visible', { required: true })

const customModes = useCustomModes()
const confirm = useConfirm()
const toast = useToast()
const { t } = useI18n()

const newModeName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const targetMode = ref<string | null>(null)

const SHAPES: { label: string, value: IndexShape }[] = [
  { label: 'data.shapes.circle', value: 'CIRCLE' },
  { label: 'data.shapes.rounded_square', value: 'ROUNDED_SQUARE' },
  { label: 'data.shapes.rectangle', value: 'RECTANGLE' },
]

function createMode() {
  const name = newModeName.value.trim()
  if (name === '') return
  customModes.create(name)
  newModeName.value = ''
}

function pick(id: string) {
  targetMode.value = id
  fileInput.value?.click()
}

async function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const id = targetMode.value
  input.value = ''
  if (!file || !id) return
  try {
    customModes.setPicto(id, await resizeImage(file))
  } catch {
    toast.add({
      severity: 'error',
      summary: t('ui.dialogs.mode_pictos.import_failure.title'),
      detail: t('ui.dialogs.mode_pictos.import_failure.unreadable'),
      life: 5000,
    })
  }
}

function confirmDeleteMode(id: string, name: string) {
  confirm.require({
    header: t('ui.dialogs.mode_pictos.delete_mode'),
    message: t('ui.dialogs.mode_pictos.delete_mode_confirmation', { name }),
    acceptProps: { label: t('ui.dialogs.mode_pictos.delete_mode_accept'), severity: 'danger' },
    rejectProps: { label: t('ui.dialogs.mode_pictos.reset_all_reject'), severity: 'secondary', text: true },
    accept: () => customModes.remove(id),
  })
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="$t('ui.dialogs.custom_modes.header')"
    pt:root:class="max-w-50em"
    modal
  >
    <div class="flex flex-col gap-4">
      <span>{{ $t('ui.dialogs.custom_modes.notice') }}</span>

      <div class="flex flex-row items-center gap-2">
        <InputText
          v-model="newModeName"
          class="flex-grow"
          :placeholder="$t('ui.dialogs.mode_pictos.new_mode_placeholder')"
          @keyup.enter="createMode()"
        />
        <Button
          icon="i-tabler-plus"
          :label="$t('ui.dialogs.mode_pictos.create_mode')"
          :disabled="newModeName.trim() === ''"
          @click="createMode()"
        />
      </div>

      <div v-if="customModes.modes.length === 0" class="opacity-70">
        {{ $t('ui.dialogs.mode_pictos.custom_modes_empty') }}
      </div>

      <div v-else class="mode-grid">
        <div v-for="custom in customModes.modes" :key="custom.id" class="mode-card">
          <div class="preview">
            <Mode :mode="custom.id" />
          </div>
          <InputText
            :model-value="custom.name"
            class="w-full text-center"
            size="small"
            @update:model-value="value => customModes.rename(custom.id, value ?? '')"
          />
          <Select
            :model-value="custom.shape"
            :options="SHAPES"
            option-value="value"
            :option-label="option => $t(option.label)"
            class="w-full"
            size="small"
            @update:model-value="value => customModes.setShape(custom.id, value)"
          />
          <div class="flex flex-row gap-1">
            <Button
              size="small"
              text
              icon="i-tabler-upload"
              :label="$t('ui.dialogs.mode_pictos.import')"
              @click="pick(custom.id)"
            />
            <Button
              v-if="custom.picto"
              size="small"
              text
              severity="secondary"
              icon="i-tabler-rotate"
              @click="customModes.setPicto(custom.id, null)"
            />
            <Button
              size="small"
              text
              severity="danger"
              icon="i-tabler-trash"
              @click="confirmDeleteMode(custom.id, custom.name)"
            />
          </div>
        </div>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        class="hidden"
        @change="onFileChosen"
      >
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.mode-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: .75rem;
}

@media (max-width: 1024px) {
  .mode-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .25rem;
  padding: .5rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
}

.preview {
  font-size: 2.5rem;
  color: var(--p-primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 1.2em;
}
</style>
