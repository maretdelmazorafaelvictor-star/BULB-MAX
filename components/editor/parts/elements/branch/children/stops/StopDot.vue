<script setup lang="ts">
import { computed, inject } from 'vue'
import { LineContextKey } from '~/utils/symbols'

const {
  color,
  terminus = false,
  connection = false,
  closed = false,
  directionArrow = null,
} = defineProps<{
  color: string
  terminus?: boolean
  connection?: boolean
  closed?: boolean
  directionArrow?: 'left' | 'right' | null
}>()

const lineContext = inject<LineContext>(LineContextKey)!
const idfm = computed(() => lineContext.brandStyle.value === 'IDFM')

/**
 * Trams et tram-trains en signalétique IDFM : le point reste contenu dans
 * l'épaisseur du tracé au lieu de garder une taille fixe qui la déborde.
 */
const fitsLine = computed(() => idfm.value
  && (lineContext.mode.value === 'TRAM' || lineContext.mode.value === 'TRAM_TRAIN'))
const dotSize = computed(() => fitsLine.value ? `${lineContext.lineThickness.value}em` : '1.125em')
const dotColor = computed(() => {
  if (lineContext.dotsColorPolicy.value === 'WHITE') {
    return 'white'
  }
  return color
})
</script>

<template>
  <div class="w-1em h-1em flex items-center justify-center relative">
    <div v-if="directionArrow" class="absolute direction-arrow" :class="directionArrow" />
    <div
      class="absolute dot dynamic-part"
      :class="{ terminus, connection: connection || closed, idfm }"
      :style="terminus ? undefined : { width: dotSize, height: dotSize }"
    >
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

.direction-arrow {
  width: 0;
  height: 0;
  border-top: .3em solid transparent;
  border-bottom: .3em solid transparent;
  top: 50%;
  transform: translateY(-50%);

  &.right {
    left: 1.4em;
    border-left: .45em solid black;
  }

  &.left {
    right: 1.4em;
    border-right: .45em solid black;
  }
}
</style>
