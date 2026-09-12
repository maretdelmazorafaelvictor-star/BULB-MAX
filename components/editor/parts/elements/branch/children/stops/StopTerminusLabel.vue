<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { LineContextKey, StopContextKey } from '~/utils/symbols'
const lineContext = inject<LineContext>(LineContextKey)!
const {
  value,
  placeName = '',
  subtitle = '',
  interestPoint = false,
  interestPointColor,
  accessible = 'undefined',
  accessibleDirection = null,
  reverse = false,
} = defineProps<{
  value: string
  placeName?: string | null
  subtitle?: string | null
  interestPoint?: boolean
  interestPointColor?: string
  reverse?: boolean
  accessible?: boolean | 'undefined' | undefined
  accessibleDirection?: 'left' | 'right' | null
}>()

const stopContext = inject<StopContext>(StopContextKey)!

const flat = computed(() => lineContext.stopNameAngle.value === 0)
const effectiveValue = computed(() => value.trim())
const frame = ref<HTMLDivElement | null>(null)
const { stop } = useResizeObserver(frame, e => updateMargins(e[0].target as HTMLDivElement))
watch(stopContext.inverted, () => updateMargins(frame.value!))

watch([() => interestPoint, () => subtitle], ([_interestPoint, _subtitle]) => {
  let margin = 1
  if (_interestPoint) margin += 0.5

  if (_subtitle) {
    stopContext.margins.rightMargin.subtitle = `${margin}em`
  } else {
    stopContext.margins.rightMargin.subtitle = `0em`
  }
}, { immediate: true })

function updateMargins(element: HTMLElement) {
  if (lineContext.stopNameAngle.value === 0) {
    const half = `calc(${element.offsetWidth / 2}px - .5em)`
    stopContext.margins.leftMargin.name = half
    stopContext.margins.rightMargin.name = half
    return
  }
  const size = element.offsetHeight
  if (reverse) {
    stopContext.margins.rightMargin.name = `calc(${size * 2}px - 1.5em)`
    stopContext.margins.leftMargin.name = '0px'
  } else {
    stopContext.margins.leftMargin.name = `calc(${size * 2}px - 1.5em)`
    stopContext.margins.rightMargin.name = '0px'
  }
}

onUnmounted(() => {
  stop()
  stopContext.margins.rightMargin.name = '0px'
  stopContext.margins.leftMargin.name = '0px'
})
</script>

<template>
  <div class="terminus-label" :class="{ reverse, flat }">
        <TiltedText :reverse="reverse" :angle="lineContext.stopNameAngle.value">
      <div ref="frame" class="flex flex-col items-end gap-1" :class="{ 'opacity-50 export-hide': !effectiveValue }">
        <div class="title-holder">
          <TerminusLabel :value="effectiveValue || $t('ui.map_editor.toolbox.untitled_stop')" :place-name="placeName" />
          <Wheelchair v-if="accessible !== 'undefined'" :off="!accessible" :direction="accessibleDirection" />
        </div>
        <StopSubtitle v-if="subtitle && reverse" :interest-point="interestPoint" :interest-point-color="interestPointColor" :value="subtitle" />
      </div>
    </TiltedText>
    <TiltedText
      v-if="subtitle && !reverse"
      class="subtitle-holder"
      :angle="lineContext.stopNameAngle.value"
      :class="{
        'interest-point': interestPoint,
      }"
    >
      <StopSubtitle :interest-point="interestPoint" :interest-point-color="interestPointColor" :value="subtitle" />
    </TiltedText>
  </div>
</template>

<style scoped lang="scss">
.terminus-label.flat {
  width: auto;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: .1em;
}

.terminus-label.flat.reverse {
  justify-content: flex-start;
}

.terminus-label {
  display: flex;
  flex-direction: row;
  align-items: end;
  gap: .75em;
  transform: translateY(-.125em);
  width: 1em;
  height: 0;

  .reverse & {
    transform: translateY(.125em);
  }
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
  --initial: -.75;
  --interest-point: 0;

  transform: translateX(calc((var(--initial) + var(--interest-point)) * 1em));
  width: 0;

  &.interest-point {
    --interest-point: .5;
  }
}
</style>
