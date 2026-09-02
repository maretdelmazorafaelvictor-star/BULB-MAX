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

const emit = defineEmits<{ hasBottomBand: [value: boolean] }>()

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
   * Le bandeau du haut suit, à chaque abscisse, l’arrêt le plus haut : sur un
   * tronçon à branche unique (tronc commun), c’est lui qui parle. Le bandeau
   * du bas n’existe que là où deux rangées coexistent, et il est découpé en
   * segments indépendants (une ligne peut avoir des branches aux deux bouts,
   * comme le RER B) pour ne pas tirer de libellés ni de limites à travers le
   * tronc commun.
   */
  const heightTol = 1.5 * Math.max(...dots.map(dot => dot.height))
  const gaps = dots.slice(1).map((dot, i) => dot.center - dots[i].center).filter(g => g > 1).sort((a, b) => a - b)
  const spacing = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1
  const window = 2 * spacing

  const isTop = (dot: Dot) => !dots.some(other => other !== dot
    && dot.y - other.y > heightTol && Math.abs(other.center - dot.center) <= window)
  const isBottom = (dot: Dot) => !dots.some(other => other !== dot
    && other.y - dot.y > heightTol && Math.abs(other.center - dot.center) <= window)

  const topDots = dots.filter(dot => isTop(dot))
  const bottomDots = dots.filter(dot => !isTop(dot) && isBottom(dot))

  const topResult = makeSpans(topDots, base.width)
  topBand.value = {
    spans: topResult.spans,
    boundaries: topResult.cuts.map(x => ({
      x,
      from: 0,
      to: Math.max(...topDots.filter(dot => Math.abs(dot.center - x) <= window).map(dot => dot.bottom), 0),
    })),
  }

  /* Segments du bas : coupure dès qu’un trou de plus de 3 interstations apparaît. */
  const clusters: Dot[][] = []
  for (const dot of bottomDots) {
    const current = clusters[clusters.length - 1]
    if (current && dot.center - current[current.length - 1].center <= 3 * spacing) current.push(dot)
    else clusters.push([dot])
  }
  const spans: Span[] = []
  const boundaries: { x: number, from: number, to: number }[] = []
  for (const cluster of clusters) {
    const left = Math.max(0, cluster[0].center - spacing)
    const right = Math.min(base.width, cluster[cluster.length - 1].center + spacing)
    const result = makeSpans(cluster, base.width)
    for (const [i, span] of result.spans.entries()) {
      spans.push({
        label: span.label,
        left: i === 0 ? left : span.left,
        right: i === result.spans.length - 1 ? right : span.right,
      })
    }
    for (const x of result.cuts) {
      boundaries.push({ x, from: Math.min(...cluster.map(dot => dot.top)), to: base.height })
    }
  }
  bottomBand.value = { spans, boundaries }
  emit('hasBottomBand', spans.length > 0)
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
  <div v-if="bottomBand.spans.length > 0" class="commune-band commune-band-bottom" :style="{ width: `${width}px` }">
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
      :style="{ left: `${b.x}px`, bottom: `1.1em`, height: `${containerHeight - b.from}px` }"
    />
  </div>
</template>

<style scoped lang="scss">
.commune-band {
  position: absolute;
  top: 0;
  height: 0;
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
  height: calc(2em / 16);
  background: currentColor;
  opacity: .6;
}

.label {
  position: absolute;
  top: 0;
  text-align: center;
  font-size: .4em;
  font-weight: 700;
  line-height: 1;
  opacity: .85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.boundary {
  position: absolute;
  top: .75em;
  width: 0;
  border-left: calc(2em / 16) dotted currentColor;
  opacity: .6;
}

.commune-band-bottom {
  top: auto;
  bottom: 0;
  height: 1.5em;
}

.rule-bottom {
  top: auto;
  bottom: 1.1em;
}

.label-bottom {
  top: auto;
  bottom: .35em;
}

.boundary-bottom {
  top: auto;
}
</style>
