<script setup lang="ts">
import { useCssVar, useElementSize } from '@vueuse/core'
import { computed, inject, ref } from 'vue'
import { modeToLineStyle, modeToLineThickness } from '~/utils/properties'
import { LineContextKey } from '~/utils/symbols'

const {
  connection,
  reverse = false,
} = defineProps<{
  connection: EndOfLineConnection
  reverse?: boolean
}>()

const lineContext = inject<LineContext>(LineContextKey)!

const el = ref()
const stub = ref()
const { width: stubLength } = useElementSize(stub)
const sizeFactor = computed(() => Number.parseFloat(useCssVar('--base-size', el).value ?? '1'))

const color = computed(() => connection.color ?? lineContext.color.value)

const MAX_THICKNESS = 0.625

const lineWidth = computed(() => {
  if (connection.mode === null) return lineContext.lineThickness.value
  return Math.min(Number.parseFloat(modeToLineThickness(connection.mode)), MAX_THICKNESS)
})
const striped = computed(() =>
  connection.mode !== null && modeToLineStyle(connection.mode) === 'STRIPED',
)
const dashed = true

const lineOffset = computed(() => sizeFactor.value * lineWidth.value * 16 / 2)

const stubPath = computed(() =>
  reverse ? `M ${stubLength.value} 0 L 0 0` : `M 0 0 L ${stubLength.value} 0`,
)
</script>

<template>
  <div ref="el" class="end-of-line-connection" :class="{ reverse }">
    <div class="link dynamic-part" />
    <StopDot terminus :color="color" />
    <div ref="stub" class="stub dynamic-part">
      <svg width="100%" :height="`${lineWidth}em`" overflow="visible">
        <g :transform="`translate(0 ${lineOffset})`">
          <SvgLine
            :path="stubPath"
            :color="color"
            :line-width="lineWidth"
            :dashed="dashed"
            :striped="striped"
          />
        </g>
      </svg>
    </div>
    <div class="picto">
      <Mode :mode="connection.mode" />
      <LineIndex :mode="connection.mode" :index="connection.lineIndex" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.end-of-line-connection {
  display: flex;
  flex-direction: row;
  align-items: center;

  flex: none;

  > * {
    flex: none;
  }

  &.reverse {
    flex-direction: row-reverse;
  }

  .debug & {
    outline: 1px solid limegreen;
  }
}

.link {
  position: relative;
  flex: none;
  width: .300em;
  height: .375em;
  z-index: 3;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: .0105em;
    right: .0105em;
    height: calc(7em / 18);
    background-color: black;
  }

  &::after {
    content: '';
    position: absolute;
    top: 50%;
    left: -.100em;
    right: -.100em;
    height: calc(2em / 16);
    transform: translateY(-50%);
    background-color: white;
  }
}

.stub {
  width: 2.5em;
  display: flex;
  align-items: center;
  margin: 0 -.0625em;
  z-index: -1;
}

.picto {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: .125em;
  margin-left: .25em;

  .reverse & {
    margin-left: 0;
    margin-right: .25em;
  }
}
</style>
