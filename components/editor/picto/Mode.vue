<script setup lang="ts">
import { computed } from 'vue'
import { isCustomMode, useCustomModes } from '~/stores/useCustomModes'
import { useModePictos } from '~/stores/useModePictos'

const {
  mode,
} = defineProps<{
  mode: Mode | null
}>()

const modePictos = useModePictos()
const customModes = useCustomModes()
const custom = computed(() => isCustomMode(mode) ? customModes.findById(mode as string) : null)
const customPicto = computed(() => custom.value ? custom.value.picto ?? null : modePictos.pictoOf(mode))
const circle = computed(() => custom.value ? custom.value.shape === 'CIRCLE' : ['METRO', 'VAL'].includes(mode ?? ''))
const roundRectangle = computed(() => custom.value ? custom.value.shape === 'ROUNDED_SQUARE' : ['RER', 'TER', 'TRAIN', 'TRAIN_RER'].includes(mode ?? ''))
const square = computed(() => ['AERIAL_TRAMWAY', 'BOAT', 'BUS', 'BRT', 'CHAIRLIFT', 'FUNICULAR', 'GONDOLA', 'NOCTILIEN', 'SKI_LIFT', 'TRAM', 'TRAM_TRAIN', 'VELO'].includes(mode ?? ''))
</script>

<template>
  <div class="relative picto-wrapper">
    <img v-if="customPicto" class="custom-picto" :src="customPicto" alt="">
    <template v-else>
      <div class="absolute" :class="{ circle, 'round-rectangle': roundRectangle, square }" />
    <MBoat v-if="mode === 'BOAT'" />
    <MAerialTramway v-if="mode === 'AERIAL_TRAMWAY'" />
    <MBRT v-if="mode === 'BRT'" />
    <MBus v-if="mode === 'BUS'" />
    <MGondola v-if="mode === 'GONDOLA'" />
    <MChairlift v-if="mode === 'CHAIRLIFT'" />
    <MMetro v-if="mode === 'METRO'" />
    <MNoctilien v-if="mode === 'NOCTILIEN'" />
    <MRER v-if="mode === 'RER'" />
    <MSkiLift v-if="mode === 'SKI_LIFT'" />
    <MTram v-if="mode === 'TRAM'" />
    <MTramTrain v-if="mode === 'TRAM_TRAIN'" />
    <MFunicular v-if="mode === 'FUNICULAR'" />
    <MTransilien v-if="mode === 'TRAIN'" />
    <MVelo v-if="mode === 'VELO'" />
      <MVal v-if="mode === 'VAL'" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.picto-wrapper {
  min-width: 1em;
  min-height: 1em;
}

.custom-picto {
  display: block;
  width: 1em;
  height: 1em;
  object-fit: contain;
}

.circle {
  border-radius: 50%;
  background: white;
  top: .0625em;
  left: .0625em;
  min-width: .875em;
  min-height: .875em;
}

.round-rectangle {
  border-radius: .125em;
  background: white;
  top: .0625em;
  left: .0625em;
  min-width: .875em;
  min-height: .875em;
}

.square {
  border-radius: .01em;
  background: white;
  top: .025em;
  min-width: 1em;
  min-height: .95em;
}
</style>
