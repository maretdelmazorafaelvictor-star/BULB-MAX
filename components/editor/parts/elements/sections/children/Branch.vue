<script setup lang="ts">
import type { DraggableEvent, SortableEvent } from 'vue-draggable-plus'
import { useCssVar, useElementSize, useResizeObserver } from '@vueuse/core'
import { computed, inject, nextTick, onMounted, provide, reactive, ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import useElementGrabbing from '~/composables/useElementGrabbing'
import { BranchContextKey, LineContextKey } from '~/utils/symbols'

const {
  fluid = false,
} = defineProps<{
  fluid?: boolean
}>()

const el = ref()
const line = ref()
const sizeFactor = computed(() => Number.parseInt(useCssVar('--base-size', el).value ?? '1'))
const { width: branchLength } = useElementSize(line)

const branch = defineModel<Branch>({ required: true })
const emphasize = ref(false)
const { grab, release } = useElementGrabbing((event) => {
  emphasize.value = ['STOP', 'SPACER'].includes(event.type ?? '')
})

const elements = computed({
  get: () => branch.value.$branch.elements ?? [],
  set: val => branch.value.$branch.elements = val,
})

const lineContext = inject<LineContext>(LineContextKey)!

const elementSpacing = computed(() => `${branch.value.$branch.elementSpacing}em`)
const leftMargin = computed(() => `${branch.value.$branch.marginLeft || 0}em`)
const rightMargin = computed(() => `${branch.value.$branch.marginRight || 0}em`)

const branchOverflow = reactive({ start: 0, end: 0 })
provide<BranchContext>(BranchContextKey, { overflow: branchOverflow })

const overflowStart = computed(() => `${branchOverflow.start}px`)
const overflowEnd = computed(() => `${branchOverflow.end}px`)

const color = computed(() => lineContext?.color.value ?? '#000000')
const lineWidth = computed(() => lineContext.lineThickness.value)
const lineOffset = computed(() => sizeFactor.value * lineWidth.value * 16 / 2)

function elementPosition(index: number): BranchElementPosition {
  if (index === 0) return 'START'
  if (index === elements.value.length - 1) return 'END'
  return null
}

interface OutsideZone { left: number, width: number, gray: boolean, atStart?: boolean, atEnd?: boolean }
interface GrayRect { left: number, top: number, width: number, height: number }
const hatchZones = ref<OutsideZone[]>([])
const grayZones = ref<GrayRect[]>([])
const layerReady = ref(false)

function zoneFlag(e: BranchElement, key: 'hatched' | 'grayed'): boolean {
  return ('$stop' in e ? e.$stop[key] : e.$spacer[key]) ?? false
}

function measureZones() {
  const wrapper = el.value as HTMLElement | undefined
  const container = wrapper?.querySelector('.branch-elements') as HTMLElement | null
  if (!wrapper || !container) return
  const base = wrapper.getBoundingClientRect()
  const rects = elements.value.map((e) => {
    const node = container.querySelector(`[data-id="${e.id}"]`) as HTMLElement | null
    return node ? node.getBoundingClientRect() : null
  })
  function build(key: 'hatched' | 'grayed'): OutsideZone[] {
    const out: OutsideZone[] = []
    let i = 0
    while (i < elements.value.length) {
      if (!zoneFlag(elements.value[i], key) || !rects[i]) {
        i++
        continue
      }
      let j = i
      while (j + 1 < elements.value.length && zoneFlag(elements.value[j + 1], key) && rects[j + 1]) j++
      const left = i === 0 || !rects[i - 1]
        ? rects[i]!.left - base.left
        : (rects[i - 1]!.right + rects[i]!.left) / 2 - base.left
      const right = j === elements.value.length - 1 || !rects[j + 1]
        ? rects[j]!.right - base.left
        : (rects[j]!.right + rects[j + 1]!.left) / 2 - base.left
      let gray = true
      for (let k = i; k <= j; k++) {
        if (!zoneFlag(elements.value[k], 'grayed')) gray = false
      }
      out.push({ left, width: Math.max(0, right - left), gray, atStart: i === 0, atEnd: j === elements.value.length - 1 })
      i = j + 1
    }
    return out
  }
  hatchZones.value = build('hatched')
  const gz = build('grayed') as OutsideZone[]

  const map = wrapper.closest('.content.bg-white') as HTMLElement | null
  const grayRects: GrayRect[] = []
  if (map) {
    const mapRect = map.getBoundingClientRect()
    const others = [...map.querySelectorAll('.branch-wrapper')]
      .filter(node => node !== wrapper && !node.contains(wrapper) && !wrapper.contains(node))
      .map(node => node.getBoundingClientRect())
    const centerY = (base.top + base.bottom) / 2
    const sameRow = others.filter(r => r.bottom > base.top && r.top < base.bottom)
    const leftBound = Math.max(mapRect.left, ...sameRow.filter(r => r.right <= base.left + 1).map(r => r.right))
    const rightBound = Math.min(mapRect.right, ...sameRow.filter(r => r.left >= base.right - 1).map(r => r.left))
    for (const zone of gz) {
      if (zone.atStart) {
        const extension = Math.max(0, (base.left + zone.left) - leftBound)
        zone.left -= extension
        zone.width += extension
      }
      if (zone.atEnd) {
        zone.width += Math.max(0, rightBound - (base.left + zone.left + zone.width))
      }
      const x1 = base.left + zone.left
      const x2 = x1 + zone.width
      let topLimit = mapRect.top
      let bottomLimit = mapRect.bottom
      for (const r of others) {
        if (r.right <= x1 || r.left >= x2) continue
        const otherCenter = (r.top + r.bottom) / 2
        if (otherCenter < centerY) topLimit = Math.max(topLimit, (r.bottom + base.top) / 2)
        else if (otherCenter > centerY) bottomLimit = Math.min(bottomLimit, (base.bottom + r.top) / 2)
      }
      grayRects.push({ left: x1 - mapRect.left, top: topLimit - mapRect.top, width: zone.width, height: bottomLimit - topLimit })
    }
  }
  grayZones.value = grayRects
  layerReady.value = !!map?.querySelector('.hors-idf-layer')
}

onMounted(() => nextTick(measureZones))
useResizeObserver(el, () => measureZones())
watch(elements, () => nextTick(measureZones), { deep: true })
watch(branchLength, () => nextTick(measureZones))

/* Simply because the lib is muffin broken */
function moveOut(event: DraggableEvent<BranchElement>) {
  const el = event.from
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children.item(i)!
    if (child.hasAttribute('data-id') && child.getAttribute('data-id') === event.data.id) {
      el.removeChild(child)
    }
  }
}
</script>

<template>
  <div
    ref="el"
    class="branch-wrapper" :class="{
      empty: elements?.length === 0,
      fluid,
      negativeLeftMargin: (branch.$branch.marginLeft ?? 0) < 0,
      negativeRightMargin: (branch.$branch.marginRight ?? 0) < 0,
      positiveLeftMargin: (branch.$branch.marginLeft ?? 0) > 0,
      positiveRightMargin: (branch.$branch.marginRight ?? 0) > 0,
    }"
  >
    <VueDraggable
      v-model="elements"
      :animation="150"
      class="branch-elements open"
      :class="{ emphasize }"
      group="branchElements"
      ghost-class="branch-element-ghost"
      :swap-threshold=".75"
      handle=".branch-element-handle"
      @remove="(e: SortableEvent) => moveOut(e as DraggableEvent<BranchElement>)"
      @start="grab('STOP')"
      @end="release()"
    >
      <BranchElement
        v-for="(element, i) in elements"
        :key="element.id"
        v-model="elements[i]"
        :data-id="element.id"
        :reverse="branch.$branch.invertedElements"
        :position="elementPosition(i)"
      />
    </VueDraggable>
    <div ref="line" class="line">
      <svg width="100%" :height="`${lineWidth}em`" overflow="visible">
        <g :transform="`translate(0 ${lineOffset})`">
          <SvgLine
            :path="`M 0 0 L ${branchLength} 0`"
            :color="color"
            :line-width="lineWidth"
            :striped="lineContext.lineStyle.value === 'STRIPED'"
          />
        </g>
      </svg>
    </div>
    <Teleport v-if="layerReady" to=".hors-idf-layer">
      <div
        v-for="(zone, i) in grayZones" :key="`gray-${i}`" class="zone-gray"
        :style="{ left: `${zone.left}px`, top: `${zone.top}px`, width: `${zone.width}px`, height: `${zone.height}px` }"
      >
        <span class="zone-gray-label label-bottom">HORS TARIFICATION ÎLE-DE-FRANCE</span>
      </div>
    </Teleport>
    <div
      v-for="(zone, i) in hatchZones" :key="`hatch-${i}`" class="zone-hatch"
      :class="{ 'on-gray': zone.gray }"
      :style="{ left: `${zone.left}px`, width: `${zone.width}px` }"
    />
  </div>
</template>

<style lang="scss">
.element-ghost {
  opacity: .5;
}
</style>

<style scoped lang="scss">
.branch-wrapper {
  .debug & {
    outline: 1px solid orange;
    outline-offset: 1px;
  }

  position: relative;
  z-index: 2;

  padding-left: v-bind(overflowStart);
  padding-right: v-bind(overflowEnd);

  &.fluid {
    flex-grow: 1;
  }

  &.empty {
    min-width: 3em;
  }

  &.negativeLeftMargin {
    margin-left: v-bind(leftMargin);
  }

  &.negativeRightMargin {
    margin-right: v-bind(rightMargin);
  }

  &.positiveLeftMargin {
    padding-left: v-bind(leftMargin);
  }

  &.positiveRightMargin {
    padding-right: v-bind(rightMargin);
  }

  .section-element + .section-element & {
     .line {
       padding-left: 0;
       clip: rect(auto, calc(v-bind(branchLength) * 1px + 1em), auto, 0);
     }
   }

  .section-element:not(:last-child) & {
    .line {
      padding-right: 0;
      clip: rect(auto, calc(v-bind(branchLength) * 1px + .5em), auto, calc(v-bind(lineWidth) * -.25em));
    }
  }

  // both
  .section-element:not(:last-child):has(+ .section-element) .section-element:not(:first-child) &,
  .section-element + .section-element .section-element:not(:last-child) &,
  .section-element + .section-element:not(:last-child) &
  {
    .line {
      padding: 0;
      clip: rect(auto, calc(v-bind(branchLength) * 1px), auto, 0);
    }
  }
}

.branch-elements {
  position: relative;
  min-height: 4em;
  display: flex;
  z-index: 10;
  flex-grow: 1;
  flex-direction: row;
  justify-content: space-evenly;
  align-items: center;
  gap: calc(v-bind(elementSpacing));
  pointer-events: fill;

  &:after {
    position: absolute;
    pointer-events: none;
    content: '';
    top: 50%;
    left: 0;
    right: 0;
    bottom: 0;
    min-height: 5em;
    transform: translateY(-50%);
    background-color: transparent;
    border: 2px dashed transparent;
    border-radius: .25em;
    padding: 0 2em;
    margin: 0 -2em;
    transition: background-color .2s ease, border-color .2s ease;
  }
}

.emphasize {
  --border-color: var(--p-blue-400);
  padding: 0 2em;
  margin: 0 -2em;

  &:after {
    background: color-mix(in srgb, var(--border-color), transparent 85%);
    border-color: var(--border-color);
    padding: 0;
    margin: 0;
  }
}

.line {
  position: absolute;

  left: v-bind(overflowStart);
  right: v-bind(overflowEnd);
  top: 50%;
  transform: translateY(-50%);
  width: auto;
  padding: 0 calc(v-bind(lineWidth) * .5em / v-bind(lineWidth));
  z-index: -1;
}

.zone-gray {
  position: absolute;
  background: var(--hors-idf-gray);
  pointer-events: none;
  display: flex;
  justify-content: center;
}

.zone-gray-label {
  position: absolute;
  font-size: .45em;
  font-weight: 800;
  letter-spacing: .08em;
  color: #3A3A3A;
  text-align: center;
  max-width: 90%;
  font-family: var(--brand-font);

  &.label-bottom {
    bottom: .5em;
  }
}

.zone-hatch {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: calc(v-bind(lineWidth) * 1em + 4px);
  background: repeating-linear-gradient(90deg, transparent 0 .21875em, white .21875em .4375em);
  pointer-events: none;
  z-index: 5;

  &.on-gray {
    background: repeating-linear-gradient(90deg, transparent 0 .21875em, var(--hors-idf-gray) .21875em .4375em);
  }
}
</style>
