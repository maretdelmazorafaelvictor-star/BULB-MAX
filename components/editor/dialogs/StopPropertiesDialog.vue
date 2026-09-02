<script setup lang="ts">
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { computed, watch } from 'vue'
import { cleanName } from '~/utils/text'

const { allowCity } = defineProps<{
  allowCity: boolean
}>()
const emit = defineEmits<{
  openConnections: []
}>()
const visible = defineModel<boolean>('visible', { required: true })
const stop = defineModel<Stop>({ required: true })

// Hors Île-de-France : une seule case pour les hachures et le fond gris
const outsideIdf = computed({
  get: () => (stop.value.$stop.hatched ?? false) || (stop.value.$stop.grayed ?? false),
  set: (val: boolean) => {
    stop.value.$stop.hatched = val
    stop.value.$stop.grayed = val
  },
})
const accessibilityOptions = [
  { label: 'ui.dialogs.stop_properties.accessible.undefined', value: 'undefined' },
  { label: 'ui.dialogs.stop_properties.accessible.yes', value: true },
  { label: 'ui.dialogs.stop_properties.accessible.no', value: false },
]

const stopStateOptions = [
  { label: 'ui.dialogs.stop_properties.stop_state.open', value: false },
  { label: 'ui.dialogs.stop_properties.stop_state.close', value: true },
]

const stopTypeOptions = [
  { label: 'ui.dialogs.stop_properties.stop_type.regular', value: false },
  { label: 'ui.dialogs.stop_properties.stop_type.terminus', value: true },
]

const accessibleDirectionOptions = [
  { label: 'ui.dialogs.stop_properties.accessible_direction.both', value: null },
  { label: 'ui.dialogs.stop_properties.accessible_direction.left', value: 'left' },
  { label: 'ui.dialogs.stop_properties.accessible_direction.right', value: 'right' },
]
/* Le brun par défaut du point d’intérêt : --place-brown, défini dans app.vue. */
const POI_DEFAUT = '#80551A'

const poiColor = computed({
  get: () => stop.value.$stop.interestPointColor || POI_DEFAUT,
  set: (val: string | undefined) => { stop.value.$stop.interestPointColor = val },
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const horizontal = breakpoints.greaterOrEqual('lg')
const branchColor = computed<string | null>({
  get: () => stop.value.$stop.branch_color ?? null,
  set: value => stop.value.$stop.branch_color = value,
})

watch(() => stop.value.$stop.name, val => stop.value.$stop.name = cleanName(val))
watch(() => stop.value.$stop.placeName, val => stop.value.$stop.placeName = cleanName(val))
watch(() => stop.value.$stop.subtitle, val => stop.value.$stop.subtitle = cleanName(val))

watch(() => stop.value.$stop.interestPoint, (newVal) => {
  if (newVal && !stop.value.$stop.interestPointColor) {
    stop.value.$stop.interestPointColor = POI_DEFAUT
  }
})

/*
 * Prolongement de bout de ligne : uniquement proposé sur un terminus.
 * Décocher la case efface le prolongement, cocher le crée vide.
 */
const endOfLineEnabled = computed({
  get: () => !!stop.value.$stop.endOfLineConnection,
  set: (enabled) => {
    stop.value.$stop.endOfLineConnection = enabled
      ? { mode: null, lineIndex: null, color: null }
      : null
  },
})

watch(() => stop.value.$stop.terminus, (terminus) => {
  if (!terminus) stop.value.$stop.endOfLineConnection = null
})

watch(() => stop.value.$stop.endOfLineConnection?.mode, () => {
  const connection = stop.value.$stop.endOfLineConnection
  if (!connection) return
  connection.lineIndex = null
  connection.color = null
})

function openConnectionsEditor() {
  emit('openConnections')
  visible.value = false
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="$t('ui.dialogs.stop_properties.header')"
    modal
  >
    <div class="flex max-lg:flex-col flex-row gap-2">
      <div class="flex flex-col gap-4 min-w-20em">
        <div class="flex flex-col gap-1">
          <label :for="`${stop.id}_title`">{{ $t('ui.dialogs.stop_properties.stop_name') }}</label>
          <Textarea
            :id="`${stop.id}_title`"
            v-model="stop.$stop.name"
            pt:root:class="important-h-auto"
            :spellcheck="false"
            auto-resize
            autofocus
          />
        </div>

        <div class="flex flex-col gap-1">
          <label :for="`${stop.id}_placeName`">{{ $t('ui.dialogs.stop_properties.city_name') }}</label>
          <InputText
            :id="`${stop.id}_placeName`" v-model="stop.$stop.placeName" :spellcheck="false"
            :disabled="!stop.$stop.terminus || !allowCity"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label :for="`${stop.id}_subtitle`">{{ $t('ui.dialogs.stop_properties.subtitle') }}</label>
          <InputText :id="`${stop.id}_subtitle`" v-model="stop.$stop.subtitle" :spellcheck="false" />
        </div>

        <div class="flex flex-col gap-1">
          <label :for="`${stop.id}_commune`">{{ $t('ui.dialogs.stop_properties.commune') }}</label>
          <InputText :id="`${stop.id}_commune`" v-model="stop.$stop.commune" :spellcheck="false" />
        </div>

        <div class="flex items-center gap-4 h-1em mt-2">
          <Checkbox v-model="stop.$stop.preventSubtitleOverlapping" binary :input-id="`${stop.id}_preventOverlapping`" />
          <label :for="`${stop.id}_preventOverlapping`">{{ $t('ui.dialogs.stop_properties.preventOverlapping') }}</label>
        </div>
      </div>

      <Divider v-if="horizontal" layout="vertical" pt:root:class="important-my-1" />
      <Divider v-else layout="horizontal" pt:root:class="important-mx-1" />

      <div class="flex flex-col gap-4 min-w-20em">
        <div class="flex flex-row gap-4">
          <div class="flex flex-col gap-1 flex-1">
            <label>{{ $t('ui.dialogs.stop_properties.accessible.title') }}</label>
            <SelectButton
              v-model="stop.$stop.accessible"
              pt:pc-toggle-button:root:class="flex-grow"
              :options="accessibilityOptions"
              :option-label="option => $t(option.label)"
              option-value="value"
              :allow-empty="false"
            />
          </div>

          <div v-if="stop.$stop.accessible === false" class="flex flex-col gap-1 flex-1">
            <label>{{ $t('ui.dialogs.stop_properties.accessible_direction.title') }}</label>
            <SelectButton
              v-model="stop.$stop.accessibleDirection"
              pt:pc-toggle-button:root:class="flex-grow"
              :options="accessibleDirectionOptions"
              :option-label="option => $t(option.label)"
              option-value="value"
              :allow-empty="false"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label>{{ $t('ui.dialogs.stop_properties.stop_state.title') }}</label>
          <SelectButton
            v-model="stop.$stop.closed"
            pt:pc-toggle-button:root:class="flex-grow"
            :options="stopStateOptions"
            :option-label="option => $t(option.label)"
            option-value="value"
            :allow-empty="false"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label>{{ $t('ui.dialogs.stop_properties.stop_type.title') }}</label>
          <SelectButton
            v-model="stop.$stop.terminus"
            pt:pc-toggle-button:root:class="flex-grow"
            :options="stopTypeOptions"
            :option-label="option => $t(option.label)"
            option-value="value"
            :allow-empty="false"
          />
        </div>

        <div v-if="stop.$stop.terminus" class="flex flex-col gap-1">
          <label>{{ $t('ui.dialogs.stop_properties.branch_color') }}</label>
          <div class="flex items-center gap-2">
            <ColorSelect v-model="branchColor" show-clear />
            <Button
              v-if="branchColor !== null"
              text
              rounded
              icon="i-tabler-x"
              @click="branchColor = null"
            />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1">
              <Checkbox v-model="stop.$stop.reverse" binary :input-id="`${stop.id}_reverse`" />
              <label :for="`${stop.id}_reverse`" class="ml-2">{{ $t('ui.dialogs.stop_properties.reverse') }}</label>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1">
              <Checkbox v-model="outsideIdf" binary :input-id="`${stop.id}_outsideIdf`" />
              <label :for="`${stop.id}_outsideIdf`" class="ml-2">{{ $t('ui.dialogs.stop_properties.outside_idf') }}</label>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-1">
              <Checkbox v-model="stop.$stop.interestPoint" binary :input-id="`${stop.id}_interestPoint`" />
              <label :for="`${stop.id}_interestPoint`" class="ml-2">{{
                $t('ui.dialogs.stop_properties.interest_point')
              }}</label>
            </div>
            <div v-if="stop.$stop.interestPoint" class="flex flex-col gap-1 ml-6">
              <label>{{ $t('ui.dialogs.stop_properties.interest_point_color') }}</label>
              <BColorPicker v-model="poiColor" />
            </div>
          </div>
        </div>

        <div v-if="stop.$stop.terminus" class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <Checkbox v-model="endOfLineEnabled" binary :input-id="`${stop.id}_endOfLine`" />
            <label :for="`${stop.id}_endOfLine`" class="ml-2">{{
              $t('ui.dialogs.stop_properties.end_of_line_connection.title')
            }}</label>
          </div>

          <template v-if="stop.$stop.endOfLineConnection">
            <div class="flex flex-col gap-1">
              <label>{{ $t('ui.dialogs.stop_properties.end_of_line_connection.mode') }}</label>
              <ModeSelect v-model="stop.$stop.endOfLineConnection.mode" />
            </div>

            <div class="flex flex-col gap-1">
              <label>{{ $t('ui.dialogs.stop_properties.end_of_line_connection.line') }}</label>
              <IndexSelect
                v-model="stop.$stop.endOfLineConnection.lineIndex"
                :mode="stop.$stop.endOfLineConnection.mode"
                @update-color="color => stop.$stop.endOfLineConnection && (stop.$stop.endOfLineConnection.color = color)"
              />
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-4 mt-8">
      <Button label="Modifier les correspondances" @click="openConnectionsEditor" />
    </div>
  </Dialog>
</template>
