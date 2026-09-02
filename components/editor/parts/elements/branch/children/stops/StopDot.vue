<script setup lang="ts">
import { computed, inject } from 'vue'
import { LineContextKey } from '~/utils/symbols'

const {
  color,
  terminus = false,
  connection = false,
  closed = false,
} = defineProps<{
  color: string
  terminus?: boolean
  connection?: boolean
  closed?: boolean
}>()

const lineContext = inject<LineContext>(LineContextKey)!
const idfm = computed(() => lineContext.brandStyle.value === 'IDFM')
// Le point central du terminus reste couleur de ligne dans tous les styles, même en
// politique de points blancs ; dotColor garde son sens d'origine ailleurs.
const dotColor = computed(() => {
  if (lineContext.dotsColorPolicy.value === 'WHITE') {
    return 'white'
  }
  return color
})
</script>

<template>
  <div class="w-1em h-1em flex items-center justify-center relative">
    <div class="absolute dot dynamic-part" :class="{ terminus, connection: connection || closed, idfm }">
      <span v-if="terminus" class="inner-dot" :style="{ backgroundColor: color }" />
    </div>
    <img v-if="closed" class="absolute closed" src="~/assets/svg/closed.svg">
  </div>
</template>

<style scoped lang="scss">
.dot {
  width: 1.125em;
  height: 1.125em;
  border-radius: 50%;
  background-color: v-bind(dotColor);
  border: calc(2em / 16) solid v-bind(color);

  transition: filter .2s ease;
  &:hover {
    filter: brightness(.5);
  }

  &.connection {
    background-color: white;
    border: calc(2em / 16) solid black;
  }

  /* IDFM : point blanc cerclé de la couleur de la ligne, anneau noir en correspondance */
  &.idfm:not(.terminus) {
    background-color: white;
    border: calc(2em / 16) solid v-bind(color);

    &.connection {
      border-color: black;
    }
  }

  &.terminus {
    background-color: v-bind(color);
    border: calc(2em / 16) solid black;
    box-shadow: inset 0 0 0 calc(3em / 16) white;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.inner-dot {
  width: .55em;
  height: .55em;
  border-radius: 50%;
  pointer-events: none;
}

.closed {
  display: flex;
  width: 1em;
  height: 1em;
  scale: 1.375;
  object-fit: cover;
  pointer-events: none;
}
</style>
