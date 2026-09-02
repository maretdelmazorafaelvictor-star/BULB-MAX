<script setup lang="ts">
import { useElementSize, useMutationObserver } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'

/*
 * Bandeau des communes, dessiné au-dessus du plan entier.
 *
 * Les arrêts sont posés en flex : personne ne connaît leur abscisse avant le rendu.
 * On mesure donc la position réelle de chaque pastille portant une commune, on trie
 * de gauche à droite — ce tri traverse naturellement les fourches et les branches
 * parallèles, puisqu’il ne regarde que des pixels — puis on pose une limite en
 * pointillés à mi-chemin entre deux arrêts de communes différentes.
 */

const { target = null } = defineProps<{
  target?: HTMLElement | null
}>()

interface Span { label: string, left: number, right: number }

const spans = ref<Span[]>([])
const boundaries = ref<number[]>([])
const bottom = ref(0)
const width = ref(0)

function measure() {
  const root = target
  if (!root) {
    spans.value = []
    boundaries.value = []
    return
  }

  const base = root.getBoundingClientRect()
  const dots = Array.from(root.querySelectorAll<HTMLElement>('[data-commune]'))
    .map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        center: rect.left + rect.width / 2 - base.left,
        bottom: rect.bottom - base.top,
        label: (el.dataset.commune ?? '').trim(),
      }
    })
    .filter(dot => dot.label !== '')
    .sort((a, b) => a.center - b.center)

  width.value = base.width

  if (dots.length === 0) {
    spans.value = []
    boundaries.value = []
    return
  }

  bottom.value = Math.max(...dots.map(dot => dot.bottom))

  /* Regroupement des arrêts voisins portant le même libellé. */
  const runs: { label: string, first: number, last: number }[] = []
  for (const dot of dots) {
    const current = runs[runs.length - 1]
    if (current && current.label === dot.label) current.last = dot.center
    else runs.push({ label: dot.label, first: dot.center, last: dot.center })
  }

  /* Une limite tombe à mi-chemin entre la fin d’un tronçon et le début du suivant. */
  const cuts = runs.slice(1).map((run, i) => (runs[i].last + run.first) / 2)
  boundaries.value = cuts

  spans.value = runs.map((run, i) => ({
    label: run.label,
    left: i === 0 ? 0 : cuts[i - 1],
    right: i === runs.length - 1 ? base.width : cuts[i],
  }))
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
  attributeFilter: ['data-commune', 'style', 'class'],
  childList: true,
  subtree: true,
  characterData: true,
})
</script>

<template>
  <div v-if="spans.length > 0" class="commune-band" :style="{ width: `${width}px` }">
    <div class="rule" />
    <div
      v-for="span in spans"
      :key="`${span.label}-${span.left}`"
      class="label"
      :style="{ left: `${span.left}px`, width: `${span.right - span.left}px` }"
    >
      {{ span.label }}
    </div>
    <div
      v-for="(x, i) in boundaries"
      :key="`boundary-${i}`"
      class="boundary"
      :style="{ left: `${x}px`, height: `${bottom}px` }"
    />
  </div>
</template>

<style scoped lang="scss">
.commune-band {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  color: var(--brand-color);
}

.rule {
  position: absolute;
  top: .75em;
  left: 0;
  width: 100%;
  height: 1px;
  background: currentColor;
  opacity: .45;
}

.label {
  position: absolute;
  top: 0;
  text-align: center;
  font-size: .4em;
  line-height: 1;
  opacity: .65;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.boundary {
  position: absolute;
  top: .75em;
  width: 0;
  border-left: 1px dotted currentColor;
  opacity: .45;
}
</style>
