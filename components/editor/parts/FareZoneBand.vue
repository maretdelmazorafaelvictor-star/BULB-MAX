<script setup lang="ts">
import { useElementSize, useMutationObserver } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'

/*
 * Bandeau des zones tarifaires, dessiné sous le plan entier (accolades du T9).
 *
 * Même mécanique de mesure que le bandeau des communes : on lit la position
 * réelle des pastilles portant une zone, on regroupe les arrêts contigus de
 * même zone, et chaque groupe reçoit une accolade « ZONE n ». Sur les tronçons
 * à branches superposées, seule la rangée visible du bas fait foi.
 */

const { target = null } = defineProps<{
  target?: HTMLElement | null
}>()

const emit = defineEmits<{ hasFareBand: [value: boolean] }>()

interface Bracket { label: string, left: number, right: number }
interface Dot { center: number, y: number, label: string }

const brackets = ref<Bracket[]>([])
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

  /* Rangée visible du bas : personne en dessous dans le voisinage. */
  const visible = dots.filter(dot => !dots.some(other => other !== dot
    && other.y - dot.y > heightTol && Math.abs(other.center - dot.center) <= windowX))

  const runs: { label: string, first: number, last: number }[] = []
  for (const dot of visible) {
    const current = runs[runs.length - 1]
    if (current && current.label === dot.label) current.last = dot.center
    else runs.push({ label: dot.label, first: dot.center, last: dot.center })
  }

  const cuts = runs.slice(1).map((run, i) => (runs[i].last + run.first) / 2)
  brackets.value = runs.map((run, i) => ({
    label: run.label,
    left: (i === 0 ? Math.max(0, run.first - spacing / 2) : cuts[i - 1]) + 2,
    right: (i === runs.length - 1 ? Math.min(base.width, run.last + spacing / 2) : cuts[i]) - 2,
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
  <div v-if="brackets.length > 0" class="fare-band" :style="{ width: `${width}px` }">
    <div
      v-for="bracket in brackets"
      :key="`${bracket.label}-${bracket.left}`"
      class="bracket"
      :style="{ left: `${bracket.left}px`, width: `${bracket.right - bracket.left}px` }"
    >
      <span class="zone-label">ZONE {{ bracket.label }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.fare-band {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 1.25em;
  z-index: 0;
  pointer-events: none;
  color: var(--brand-color);
}

/* Accolade : trait horizontal avec retours vers le haut aux extrémités */
.bracket {
  position: absolute;
  top: .25em;
  height: .25em;
  border-bottom: calc(2em / 16) solid currentColor;
  border-left: calc(2em / 16) solid currentColor;
  border-right: calc(2em / 16) solid currentColor;
  opacity: .75;
}

.zone-label {
  position: absolute;
  top: .3em;
  left: 0;
  width: 100%;
  text-align: center;
  font-size: .4em;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}
</style>
