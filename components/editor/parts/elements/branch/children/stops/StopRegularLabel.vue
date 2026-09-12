<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import { LineContextKey, StopContextKey } from '~/utils/symbols'
import { goesBelowLine } from '~/utils/text'

const {
  value,
  preventSubtitleOverlapping,
  subtitle = '',
  interestPoint = false,
  interestPointColor,
  accessible = 'undefined',
  accessibleDirection = null,
  reverse = false,
  terminus = false,
  nameWeight = undefined,
} = defineProps<{
  value: string
  preventSubtitleOverlapping: boolean
  placeName: string | null
  subtitle?: string | null
  accessible?: boolean | 'undefined' | undefined
  accessibleDirection?: 'left' | 'right' | null
  interestPoint?: boolean
  interestPointColor?: string
  reverse?: boolean
  terminus?: boolean
  nameWeight?: 'normal' | 'bold'
}>()

const stopContext = inject<StopContext>(StopContextKey)!
const lineContext = inject<LineContext>(LineContextKey)!

const flat = computed(() => lineContext.stopNameAngle.value === 0)
const sncfTerminus = computed(() => terminus && lineContext.brandStyle.value === 'SNCF')
const terminusStyle = computed(() => sncfTerminus.value
  ? { fontWeight: 'bold', color: lineContext.terminusNamesLineColor.value ? lineContext.color.value : 'black' }
  : undefined)
const WEIGHTS = { normal: '400', medium: '500', bold: '700' }
const nameFontWeight = computed(() =>
  lineContext.brandStyle.value === 'RATP' ? '700' : WEIGHTS[nameWeight ?? 'bold'],
)
const valueParts = computed(() => value.split('\n').filter(part => part.trim() !== ''))
const shift = computed(() => {
  if (valueParts.value.length === 0) return false
  return goesBelowLine(valueParts.value[valueParts.value.length - 1]) && preventSubtitleOverlapping
})

watch([shift, () => interestPoint, () => subtitle], ([_shift, _interestPoint, _subtitle]) => {
  let margin = 1
  if (_shift) margin += 0.25
  if (_interestPoint) margin += 0.5

  if (_subtitle) {
    stopContext.margins.rightMargin.subtitle = `${margin}em`
  } else {
    stopContext.margins.rightMargin.subtitle = `0em`
  }
}, { immediate: true })
</script>

<template>
  <div class="regular-label" :class="{ reverse, flat, 'opacity-50 export-hide': valueParts.length === 0 }">
    <div class="flex gap-1em" :class="{ 'name-parts-flat': flat }">
      <TiltedText
        v-for="(part, index) in valueParts"
        :key="`${part}-${index}`"
        :reverse="reverse"
        :angle="lineContext.stopNameAngle.value"
      >
        <div class="title-holder" :style="terminusStyle">
          <TitleLabel :value="part" :weight="nameFontWeight" />
          <Wheelchair
            v-if="index === valueParts.length - 1 && accessible !== 'undefined'"
            :off="!accessible"
            :direction="accessibleDirection"
          />
        </div>
      </TiltedText>
      <TiltedText v-if="valueParts.length === 0" :reverse="reverse" :angle="lineContext.stopNameAngle.value">
        <TitleLabel :value="$t('ui.map_editor.toolbox.untitled_stop')" :weight="nameFontWeight" />
      </TiltedText>
    </div>
    <div
      v-if="subtitle"
      class="subtitle-holder"
      :class="{
        'interest-point': interestPoint,
        shift,
        'subtitle-flat': flat,
      }"
    >
      <TiltedText :reverse="reverse" :angle="lineContext.stopNameAngle.value">
        <StopSubtitle :interest-point="interestPoint" :interest-point-color="interestPointColor" :value="subtitle" />
      </TiltedText>
    </div>
  </div>
</template>

<style scoped lang="scss">
.regular-label {
  display: flex;
  flex-direction: row;
  align-items: end;
  justify-content: center;
  min-width: 1em;
  height: 0;
}

.regular-label.flat {
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: .1em;
}

.regular-label.flat.reverse {
  flex-direction: column;
  justify-content: flex-start;
}

.name-parts-flat {
  flex-direction: column;
  align-items: center;
  gap: 0 !important;
  line-height: 1.05;
}

.subtitle-flat {
  transform: none !important;
  width: auto !important;
  text-align: center;
}

.title-holder {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: .25em;

  .reverse & {
    flex-direction: row-reverse;
  }
}

.subtitle-holder {
  --initial: 0em;
  --interest-point: 0em;
  --shift: 0em;

  transform: translate(calc(var(--initial) + var(--interest-point) + var(--shift)), -.125em);
  width: 0;

  .reverse & {
    --initial: 0.5625em;

    transform: translate(calc(var(--initial) + var(--interest-point) + var(--shift)), .25em);
  }

  &.shift {
    --shift: .25em;
  }

  &.interest-point {
    --interest-point: .5em;

    .reverse & {
      --interest-point: 0em;
    }
  }
}
</style>