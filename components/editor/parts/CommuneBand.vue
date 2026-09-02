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
interface Dot { center: number, y: number, top: number, bottom: number, height: number, label: string }
interface Band { spans: Span[], boundaries: { x: number, from: number, to: number }[] }

const topBand = ref<Band>({ spans: [], boundaries: [] })
const bottomBand = ref<Band>({ spans: [], boundaries: [] })
const containerHeight = ref(0)
const width = ref(0)

/* Regroupement des arrêts voisins portant le même libellé, limites à mi-chemin. */
function makeSpans(dots: Dot[], totalWidth: number): { spans: Span[], cuts: number[] } {
  const runs: { label: string, first: number, last: number }[] = []
  for (const dot of dots) {
    const current = runs[runs.length - 1]
    if (current && current.label === dot.label) current.last = dot.center
    else runs.push({ label: dot.label, first: dot.center, last: dot.center })
  }
  const cuts = runs.slice(1).map((run, i) => (runs[i].last + run.first) / 2)
  const spans = runs.map((run, i) => ({
    label: run.label,
    left: i === 0 ? 0 : cuts[i - 1],
    right: i === runs.length - 1 ? totalWidth : cuts[i],
  }))
  return { spans, cuts }
}

function measure() {
  const root = target
  if (!root) {
    topBand.value = { spans: [], boundaries: [] }
    bottomBand.value = { spans: [], boundaries: [] }
    return
  }

  const base = root.getBoundingClientRect()
  const dots: Dot[] = Array.from(root.querySelectorAll<HTMLElement>('[data-commune]'))
    .map((el) => {
      const rect = el.getBoundingClientRect()
      return {
        center: rect.left + rect.width / 2 - base.left,
        y: rect.top + rect.height / 2 - base.top,
        top: rect.top - base.top,
        bottom: rect.bottom - base.top,
        height: rect.height,
        label: (el.dataset.commune ?? '').trim(),
      }
    })
    .filter(dot => dot.label !== '')
    .sort((a, b) => a.center - b.center)

  width.value = base.width
  containerHeight.value = base.height

  if (dots.length === 0) {
    topBand.value = { spans: [], boundaries: [] }
    bottomBand.value = { spans: [], boundaries: [] }
    return
  }

  /*
   * Les branches superposées occupent les mêmes abscisses avec des communes
   * différentes : un tri gauche-droite global les entrelace. On regroupe donc
   * d’abord les pastilles par rangée verticale (tolérance ≈ 1,5 hauteur de
   * pastille), puis chaque rangée est traitée indépendamment : la rangée du
   * haut alimente le bandeau supérieur, celle du bas le bandeau inférieur,
   * comme sur les plans officiels (T4). Les rangées intermédiaires éventuelles
   * ne sont pas affichées.
   */
  const tolerance = 1.5 * Math.max(...dots.map(dot => dot.height))
  const rows: Dot[][] = []
  for (const dot of [...dots].sort((a, b) => a.y - b.y)) {
    const row = rows.find(r => Math.abs(r[0].y - dot.y) < tolerance)
    if (row) row.push(dot)
    else rows.push([dot])
  }
  rows.forEach(row => row.sort((a, b) => a.center - b.center))

  const first = rows[0]
  const topResult = makeSpans(first, base.width)
  topBand.value = {
    spans: topResult.spans,
    boundaries: topResult.cuts.map(x => ({ x, from: 0, to: Math.max(...first.map(dot => dot.bottom)) })),
  }

  if (rows.length > 1) {
    const last = rows[rows.length - 1]
    const bottomResult = makeSpans(last, base.width)
    bottomBand.value = {
      spans: bottomResult.spans,
      boundaries: bottomResult.cuts.map(x => ({ x, from: Math.min(...last.map(dot => dot.top)), to: base.height })),
    }
  } else {
    bottomBand.value = { spans: [], boundaries: [] }
  }
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
  <div v-if="topBand.spans.length > 0" class="commune-band" :style="{ width: `${width}px` }">
    <div class="rule" />
    <div
      v-for="span in topBand.spans"
      :key="`${span.label}-${span.left}`"
      class="label"
      :style="{ left: `${span.left}px`, width: `${span.right - span.left}px` }"
    >
      {{ span.label }}
    </div>
    <div
      v-for="(b, i) in topBand.boundaries"
      :key="`boundary-${i}`"
      class="boundary"
      :style="{ left: `${b.x}px`, height: `${b.to}px` }"
    />
  </div>
  <div v-if="bottomBand.spans.length > 0" class="commune-band commune-band-bottom" :style="{ width: `${width}px`, top: `${containerHeight}px` }">
    <div class="rule rule-bottom" />
    <div
      v-for="span in bottomBand.spans"
      :key="`${span.label}-${span.left}`"
      class="label label-bottom"
      :style="{ left: `${span.left}px`, width: `${span.right - span.left}px` }"
    >
      {{ span.label }}
    </div>
    <div
      v-for="(b, i) in bottomBand.boundaries"
      :key="`boundary-bottom-${i}`"
      class="boundary boundary-bottom"
      :style="{ left: `${b.x}px`, top: `${b.from - containerHeight}px`, height: `${containerHeight - b.from}px` }"
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

.rule-bottom {
  top: 0;
}

.label-bottom {
  top: .35em;
}

.boundary-bottom {
  top: auto;
}
</style>
