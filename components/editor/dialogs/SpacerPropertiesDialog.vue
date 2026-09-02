<script setup lang="ts">
import { computed } from 'vue'

const visible = defineModel<boolean>('visible', { required: true })
const spacer = defineModel<Spacer>({ required: true })

// Hors Île-de-France : une seule case pour les hachures et le fond gris
const outsideIdf = computed({
  get: () => (spacer.value.$spacer.hatched ?? false) || (spacer.value.$spacer.grayed ?? false),
  set: (val: boolean) => {
    spacer.value.$spacer.hatched = val
    spacer.value.$spacer.grayed = val
  },
})
</script>

<template>
  <Dialog
    v-model:visible="visible"
    pt:root:class="max-w-30em"
    modal
  >
    <template #header>
      <div class="flex flex-row gap-4">
        <Tag severity="warn">
          <i class="i-tabler-traffic-cone" />
          WIP
        </Tag>
        <span class="p-dialog-title" data-pc-section="title">{{ $t('ui.dialogs.spacer_properties.header') }}</span>
      </div>
    </template>
    <div class="flex flex-col gap-4 min-w-20em">
      <div class="flex flex-col gap-1">
        <label :for="`${spacer.id}_placeName`">{{ $t('ui.dialogs.spacer_properties.size') }}</label>
        <BInputNumber :id="`${spacer.id}_placeName`" v-model="spacer.$spacer.size" />
      </div>
      <div class="flex items-center gap-1">
        <Checkbox v-model="outsideIdf" binary :input-id="`${spacer.id}_outsideIdf`" />
        <label :for="`${spacer.id}_outsideIdf`" class="ml-2">{{ $t('ui.dialogs.spacer_properties.outside_idf') }}</label>
      </div>
      <div class="opacity-50">
        {{ $t('ui.dialogs.spacer_properties.spacer_export_notice') }}
      </div>
    </div>
  </Dialog>
</template>
