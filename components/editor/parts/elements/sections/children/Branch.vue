<script setup lang="ts">
import type { DraggableEvent, SortableEvent } from 'vue-draggable-plus'
import { useCssVar, useElementSize } from '@vueuse/core'
import { computed, inject, provide, reactive, ref } from 'vue'
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

/*
 * Place réservée aux prolongements de bout de ligne, qui débordent du cadre de leur
 * arrêt. C’est du rembourrage, pas de la marge : le tracé de la branche est positionné
 * sur la boîte de rembourrage, il démarre donc après et ne ressort pas sous les tirets.
 */
const branchOverflow = reactive({ start: 0, end: 0 })
provide<BranchContext>(BranchContextKey, { overflow: branchOverflow })

const overflowStart = computed(() => `${branchOverflow.start}px`)
const overflowEnd = computed(() => `${branchOverflow.end}px`)

const color = computed(() => lineContext?.color.value ?? '#000000')
const lineWidth = computed(() => lineContext.lineThickness.value)
const lineOffset = computed(() => sizeFactor.value * lineWidth.value * 16 / 2)

/*
 * Position d’un élément dans la branche : le premier est en tête, le dernier en queue.
 * Sert à déduire de quel côté part le prolongement de bout de ligne d’un terminus.
 */
function elementPosition(index: number): BranchElementPosition {
  if (index === 0) return 'START'
  if (index === elements.value.length - 1) return 'END'
  return null
}

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

  /*
   * Bornée par la place réservée aux prolongements : un élément positionné se cale sur
   * la boîte de rembourrage, le padding de la branche ne suffirait donc pas à décaler
   * le tracé, et il ressortirait sous les tirets.
   */
  left: v-bind(overflowStart);
  right: v-bind(overflowEnd);
  top: 50%;
  transform: translateY(-50%);
  width: auto;
  padding: 0 calc(v-bind(lineWidth) * .5em / v-bind(lineWidth));
  z-index: -1;
}
</style>
