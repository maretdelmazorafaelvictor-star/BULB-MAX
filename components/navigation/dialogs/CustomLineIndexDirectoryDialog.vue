<script setup lang="ts">
import * as htmlToImage from 'html-to-image'
import { storeToRefs } from 'pinia'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import { computed, nextTick, ref, watch } from 'vue'
import { MODES } from '~/data/modes'
import { useCustomModes } from '~/stores/useCustomModes'
import { useCustomLineIndices } from '~/stores/useCustomLineIndices'
import { useI18n } from 'vue-i18n'

const visible = defineModel<boolean>('visible')
const customLineIndices = useCustomLineIndices()
const { indices, libraries } = storeToRefs(customLineIndices)
const {
  getModeIndices,
  createNewIndex,
  deleteById,
  createLibrary,
  deleteLibrary,
  migrateUnclassified,
} = customLineIndices
const toast = useToast()
const confirm = useConfirm()
const { t } = useI18n()
const showEditor = ref(false)
const customModes = useCustomModes()
const allModes = computed(() => [
  ...MODES.map(it => ({ value: it.value as Mode, label: it.label, custom: false })),
  ...customModes.modes.map(it => ({ value: it.id as Mode, label: it.name, custom: true })),
])

const newLibraryName = ref('')
const selectedLibraryId = ref<string | undefined>(undefined)
const selectedIndex = ref<CustomLineIndexDescription | null>(null)
const exportTargets = ref<Record<string, HTMLElement | null>>({})

watch(visible, (isOpen) => {
  if (isOpen) {
    migrateUnclassified()
    if (selectedLibraryId.value == null) {
      selectedLibraryId.value = libraries.value[0]?.id
    }
  }
}, { immediate: true })

function filteredModeIndices(mode: Mode) {
  if (selectedLibraryId.value == null) {
    return []
  }
  return getModeIndices(mode)
    .filter(index => index.libraryId === selectedLibraryId.value)
}

function addLibrary() {
  const name = newLibraryName.value.trim()
  if (name !== '') {
    const library = createLibrary(name)
    selectedLibraryId.value = library.id
    newLibraryName.value = ''
  }
}

function confirmDeleteLibrary() {
  const library = libraries.value.find(l => l.id === selectedLibraryId.value)
  if (!library) {
    return
  }
  const count = indices.value.filter(index => index.libraryId === library.id).length
  confirm.require({
    header: t('ui.dialogs.custom_indices.delete_library'),
    message: t('ui.dialogs.custom_indices.delete_library_confirmation', { libraryName: library.name, count }),
    acceptProps: { label: t('ui.dialogs.custom_indices.delete_library_accept'), severity: 'danger' },
    rejectProps: { label: t('ui.dialogs.custom_indices.delete_library_reject'), severity: 'secondary', text: true },
    accept: () => {
      deleteLibrary(library.id)
      selectedLibraryId.value = libraries.value[0]?.id
    },
  })
}

function create(mode: Mode) {
  if (selectedLibraryId.value == null) {
    return
  }
  selectedIndex.value = createNewIndex(mode)
  selectedIndex.value.libraryId = selectedLibraryId.value
  showEditor.value = true
}

function edit(index: CustomLineIndexDescription) {
  selectedIndex.value = index
  showEditor.value = true
}

function deleteIndex(id: string) {
  if (selectedIndex.value) {
    deleteById(id)
    showEditor.value = false
  }
}

function setExportTarget(id: string, element: Element | null) {
  exportTargets.value[id] = element instanceof HTMLElement ? element : null
}

function sanitizeFilePart(value: string) {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\\/:*?"<>|]/g, '')
}

function getExportFileName(index: CustomLineIndexDescription) {
  const rawIndex = `${index.prefix ?? ''}${index.index}${index.suffix ?? ''}`
  const mode = sanitizeFilePart(index.mode.toLowerCase())
  const value = sanitizeFilePart(rawIndex) || index.id

  return `picto-${mode}-${value}.png`
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = fileName
  a.click()
  a.remove()

  URL.revokeObjectURL(url)
}

async function exportIndex(index: CustomLineIndexDescription, notify = true) {
  await nextTick()

  const target = exportTargets.value[index.id]
  if (!target) {
    throw new Error(`Missing export target for custom index ${index.id}`)
  }

  const blob = await htmlToImage.toBlob(target, {
    pixelRatio: 4,
    backgroundColor: 'transparent',
    cacheBust: true,
  })

  if (blob === null) {
    throw new Error('Failed to export custom index')
  }

  downloadBlob(blob, getExportFileName(index))

  if (notify) {
    toast.add({
      summary: 'ui.toasts.export.success.title',
      detail: 'ui.toasts.export.success.detail',
      severity: 'success',
      life: 5000,
    })
  }
}

async function exportAll() {
  try {
    for (const index of indices.value) {
      await exportIndex(index, false)
    }

    toast.add({
      summary: 'ui.toasts.export.success.title',
      detail: 'ui.toasts.export.success.detail',
      severity: 'success',
      life: 5000,
    })
  } catch (err) {
    console.error(err)
    toast.add({
      summary: 'ui.toasts.export.failure.title',
      detail: 'ui.toasts.export.failure.detail',
      severity: 'error',
      life: 5000,
    })
  }
}

function exportSingleIndex(index: CustomLineIndexDescription) {
  exportIndex(index).catch((err) => {
    console.error(err)
    toast.add({
      summary: 'ui.toasts.export.failure.title',
      detail: 'ui.toasts.export.failure.detail',
      severity: 'error',
      life: 5000,
    })
  })
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
  >
    <template #header>
      <div class="flex flex-row gap-4 items-center justify-between flex-grow">
        <span class="p-dialog-title">{{ $t('ui.dialogs.custom_indices.header') }}</span>
        <Button
          :label="$t('ui.dialogs.custom_indices.export_all')"
          icon="i-tabler-download"
          size="small"
          severity="secondary"
          :disabled="indices.length === 0"
          @click="exportAll()"
        />
        <InputText
          v-model="newLibraryName"
          :placeholder="$t('ui.dialogs.custom_indices.new_library_placeholder')"
          size="small"
          @keyup.enter="addLibrary()"
        />
        <Button
          icon="i-tabler-plus"
          size="small"
          severity="secondary"
          @click="addLibrary()"
        />
        <Select
          v-model="selectedLibraryId"
          :options="libraries"
          option-label="name"
          option-value="id"
          ::placeholder="$t('ui.dialogs.custom_indices.library_placeholder')"
          size="small"
        />
        <Button
          icon="i-tabler-trash"
          size="small"
          severity="danger"
          text
          :disabled="selectedLibraryId == null"
          @click="confirmDeleteLibrary()"
        />
      </div>
    </template>

        <p v-if="libraries.length === 0">
      {{ $t('ui.dialogs.custom_indices.empty_state') }}
    </p>

    <template v-else>
      <Fieldset
        v-for="mode in allModes"
        :key="mode.value"
        :legend="mode.label"
      >
      <template #legend>
        <div class="flex items-center gap-2">
          <Mode class="text-xl" :mode="mode.value" />
          <span>{{ mode.custom ? mode.label : $t(mode.label) }}</span>
        </div>
      </template>
      <div class="btn-group">
        <div
          v-for="index in filteredModeIndices(mode.value)"
          :key="index.id"
          class="index-item"
        >
          <Button
            text
            severity="secondary"
            :pt="{ root: { class: 'important-p-1 important-text-1em important-w-full' } }"
            @click="edit(index)"
          >
            <CustomLineIndex
              :class="{ 'text-.5em': index.shape === 'RECTANGLE' || index.shape === 'CUT_RECTANGLE' }"
              :shape="index.shape"
              :prefix="index.prefix"
              :index="index.index"
              :suffix="index.suffix"
              :color="index.color"
            />
          </Button>
          <Button
            :aria-label="$t('ui.dialogs.custom_indices.export_one')"
            icon="i-tabler-download"
            text
            rounded
            severity="secondary"
            size="small"
            class="export-button"
            @click="exportSingleIndex(index)"
          />
        </div>
        <Button
          text
          severity="secondary"
          icon="i-tabler-plus"
          :disabled="selectedLibraryId == null"
          :pt="{ root: { class: 'important-p-1 important-text-2xl important-w-3.625rem important-h-3.625rem' } }"
          @click="create(mode.value)"
        />
      </div>
    </Fieldset>
    </template>
  </Dialog>

  <LineIndexEditorDialog
    v-if="selectedIndex"
    v-model="selectedIndex"
    v-model:visible="showEditor"
    @delete="deleteIndex"
  />

  <div class="export-sources" aria-hidden="true">
    <div
      v-for="index in indices"
      :key="`export-${index.id}`"
      :ref="(element: Element | null) => setExportTarget(index.id, element)"
      class="export-source"
    >
      <CustomLineIndex
        :shape="index.shape"
        :prefix="index.prefix"
        :index="index.index"
        :suffix="index.suffix"
        :color="index.color"
      />
    </div>
  </div>
</template>

<style scoped>
.btn-group {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: .125em;
  font-size: 3em;
}

.index-item {
  position: relative;
  display: flex;
  min-width: 0;
}

.index-item:hover .export-button,
.index-item:focus-within .export-button {
  opacity: 1;
}

.export-button {
  position: absolute;
  right: -.375rem;
  bottom: -.375rem;
  opacity: 0;
  transition: opacity .15s ease;
}

.export-sources {
  position: fixed;
  left: -10000px;
  top: 0;
  pointer-events: none;
  clip-path: inset(100%);
}

.export-source {
  display: inline-block;
  padding: .125em;
  font-size: 10rem;
}

@media (max-width: 640px) {
  .btn-group {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 1024px) and (min-width: 641px) {
  .btn-group {
    grid-template-columns: repeat(8, 1fr);
  }
}
</style>
