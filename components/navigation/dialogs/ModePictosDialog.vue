<script setup lang="ts">
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MODES } from '~/data/modes'
import { useModePictos } from '~/stores/useModePictos'

const visible = defineModel<boolean>('visible', { required: true })

const modePictos = useModePictos()
const confirm = useConfirm()
const toast = useToast()
const { t } = useI18n()

const fileInput = ref<HTMLInputElement | null>(null)
const targetMode = ref<Mode | null>(null)

function pick(mode: Mode) {
  targetMode.value = mode
  fileInput.value?.click()
}

async function onFileChosen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const mode = targetMode.value
  input.value = ''
  if (!file || !mode) return

  try {
    await modePictos.importPicto(mode, file)
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('ui.dialogs.mode_pictos.import_failure.title'),
      detail: (error as Error).message === 'too-large'
        ? t('ui.dialogs.mode_pictos.import_failure.too_large')
        : t('ui.dialogs.mode_pictos.import_failure.unreadable'),
      life: 5000,
    })
  }
}

function confirmResetAll() {
  confirm.require({
    header: t('ui.dialogs.mode_pictos.reset_all'),
    message: t('ui.dialogs.mode_pictos.reset_all_confirmation'),
    acceptProps: { label: t('ui.dialogs.mode_pictos.reset_all_accept'), severity: 'danger' },
    rejectProps: { label: t('ui.dialogs.mode_pictos.reset_all_reject'), severity: 'secondary', text: true },
    accept: () => modePictos.resetAll(),
  })
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="$t('ui.dialogs.mode_pictos.header')"
    pt:root:class="max-w-50em"
    modal
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-row items-center justify-between gap-4">
        <span>{{ $t('ui.dialogs.mode_pictos.notice') }}</span>
        <Button
          :label="$t('ui.dialogs.mode_pictos.reset_all')"
          size="small"
          severity="secondary"
          icon="i-tabler-rotate"
          :disabled="modePictos.customizedModes.length === 0"
          @click="confirmResetAll()"
        />
      </div>

      <div class="mode-grid">
        <div v-for="choice in MODES" :key="choice.value" class="mode-card">
          <div class="preview">
            <Mode :mode="choice.value" />
          </div>
          <span class="label">{{ $t(choice.label) }}</span>
          <span class="state">{{
            modePictos.isCustomized(choice.value)
              ? $t('ui.dialogs.mode_pictos.state_custom')
              : $t('ui.dialogs.mode_pictos.state_default')
          }}</span>
          <div class="flex flex-row gap-1">
            <Button
              size="small"
              text
              icon="i-tabler-upload"
              :label="$t('ui.dialogs.mode_pictos.import')"
              @click="pick(choice.value)"
            />
            <Button
              v-if="modePictos.isCustomized(choice.value)"
              size="small"
              text
              severity="secondary"
              icon="i-tabler-rotate"
              @click="modePictos.resetPicto(choice.value)"
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

.label {
  font-weight: 600;
  text-align: center;
}

.state {
  font-size: .75rem;
  opacity: .7;
}
</style>
