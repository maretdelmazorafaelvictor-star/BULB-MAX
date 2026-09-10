<script setup lang="ts">
import { useElementSize, useMutationObserver } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'

const { target = null, variant = 'brackets' } = defineProps<{
  target?: HTMLElement | null
  variant?: 'brackets' | 'transilien'
}>()

const emit = defineEmits<{ hasFareBand: [value: boolean] }>()

interface Bracket { label: string, left: number, right: number }
interface Dot { center: number, y: number, label: string }

const brackets = ref<Bracket[]>([])
const separators = ref<number[]>([])
const width = ref(0)

function measure() {
  const root = target
  if (!root) {
    brackets.value = []
    return
  }

  const base = root.getBoundingClientRect()
  const dots: Dot[] = Array.from(root.querySelectorAll<HTMLElement>('[data-fare-zone]'))
    .map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        center: rect.left + rect.width / 2 - base.left,
        y: rect.top + rect.height / 2 - base.top,
        label: (el.dataset.fareZone ?? '').trim(),
      }
    })
    .filter(dot => dot.label !== '')
    .sort((a, b) => a.center - b.center)

  width.value = base.width

  if (dots.length === 0) {
    brackets.value = []
    emit('hasFareBand', false)
    return
  }

  const heights = Array.from(root.querySelectorAll<HTMLElement>('[data-fare-zone]'))
    .map(el => el.getBoundingClientRect().height)
  const heightTol = 1.5 * Math.max(...heights, 1)
  const gaps = dots.slice(1).map((dot, i) => dot.center - dots[i].center).filter(g => g > 1).sort((a, b) => a - b)
  const spacing = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1
  const windowX = 2 * spacing

  const visible = dots.filter(dot => !dots.some(other => other !== dot
    && other.y - dot.y > heightTol && Math.abs(other.center - dot.center) <= windowX))

  const runs: { label: string, first: number, last: number }[] = []
  for (const dot of visible) {
    const current = runs[runs.length - 1]
    if (current && current.label === dot.label) current.last = dot.center
    else runs.push({ label: dot.label, first: dot.center, last: dot.center })
  }

  const cuts = runs.slice(1).map((run, i) => (runs[i].last + run.first) / 2)
  separators.value = cuts
  brackets.value = runs.map((run, i) => ({
    label: run.label,
    left: (i === 0 ? Math.max(0, run.first - spacing / 2) : cuts[i - 1]) + 5,
    right: (i === runs.length - 1 ? Math.min(base.width, run.last + spacing / 2) : cuts[i]) - 5,
  }))
  emit('hasFareBand', brackets.value.length > 0)
}

function schedule() {
  nextTick(() => requestAnimationFrame(measure))
}

const targetRef = ref<HTMLElement | null>(null)
watch(() => target, (el) => {
  targetRef.value = el ?? null
  schedule()
}, { immediate: true })

const { width: targetWidth, height: targetHeight } = useElementSize(targetRef)
watch([targetWidth, targetHeight], schedule)
useMutationObserver(targetRef, schedule, {
  attributes: true,
  attributeFilter: ['data-fare-zone', 'style', 'class'],
  childList: true,
  subtree: true,
  characterData: true,
})
</script>

<template>
  <div v-if="variant === 'brackets' && brackets.length > 0" class="fare-band" :style="{ width: `${width}px` }">
    <div
      v-for="bracket in brackets"
      :key="`${bracket.label}-${bracket.left}`"
      class="bracket"
      :style="{ left: `${bracket.left}px`, width: `${bracket.right - bracket.left}px` }"
    >
      <span class="zone-label">ZONE {{ bracket.label }}</span>
    </div>
  </div>
  <div v-else-if="variant === 'transilien' && brackets.length > 0" class="fare-transilien">
    <div
      v-for="cut in separators" :key="`sep-${cut}`"
      class="fare-sep" :style="{ left: `${cut}px` }"
    />
    <div
      v-for="bracket in brackets" :key="`rule-${bracket.label}-${bracket.left}`"
      class="fare-rule"
      :style="{ left: `${bracket.left}px`, width: `${bracket.right - bracket.left}px` }"
    />
    <template v-for="bracket in brackets" :key="`t-${bracket.label}-${bracket.left}`">
      <span
        class="fare-label fare-label-bottom"
        :style="{ left: `${(bracket.left + bracket.right) / 2}px` }"
      >ZONE {{ bracket.label }}</span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.fare-band {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 1.4em;
  z-index: 0;
  pointer-events: none;
  color: var(--brand-color);
}

.bracket {
  position: absolute;
  top: .2em;
  height: .3em;
  border-bottom: calc(2em / 16) solid currentColor;
  border-left: calc(2em / 16) solid currentColor;
  border-right: calc(2em / 16) solid currentColor;
  opacity: .75;
}

.fare-transilien {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  color: #8a8f98;
}


.fare-rule {
  position: absolute;
  top: .35em;
  height: .25em;
  border-top: calc(1.5em / 16) solid currentColor;
  border-left: calc(1.5em / 16) solid currentColor;
  border-right: calc(1.5em / 16) solid currentColor;
  opacity: .55;
}

.fare-label {
  position: absolute;
  transform: translateX(-50%);
  background: white;
  padding: 0 .6em;
  font-size: .35em;
  font-weight: 600;
  letter-spacing: .04em;
  line-height: 1;
  white-space: nowrap;
  opacity: .9;
}

.fare-label-bottom {
  top: .50em;
}

.zone-label {
  position: absolute;
  top: 100%;
  margin-top: .35em;
  left: 0;
  width: 100%;
  text-align: center;
  font-size: .4em;
  font-weight: 600;
  letter-spacing: .08em;
  line-height: 1;
  white-space: nowrap;
}
</style>
