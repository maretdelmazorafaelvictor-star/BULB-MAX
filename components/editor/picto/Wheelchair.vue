<script setup lang="ts">
import { computed } from 'vue'
import wheelchairOff from '~/assets/svg/wheelchair-off.svg?raw'
import wheelchairOffLeft from '~/assets/svg/wheelchair-off_left.svg?raw'
import wheelchairOffRight from '~/assets/svg/wheelchair-off_right.svg?raw'
import wheelchair from '~/assets/svg/wheelchair.svg?raw'

const {
  off = false,
  direction = null,
} = defineProps<{
  off?: boolean
  direction?: 'left' | 'right' | null
}>()

// SVGs use `currentColor` for the brand colour, so the picto follows --brand-color
const svg = computed(() => {
  if (off && direction === 'left') return wheelchairOffLeft
  if (off && direction === 'right') return wheelchairOffRight
  if (off) return wheelchairOff
  return wheelchair
})
</script>

<template>
  <div class="picto" role="img" aria-label="wheelchair user" v-html="svg" />
</template>

<style scoped lang="scss">
.picto {
  width: 1em;
  height: 1em;
  color: var(--brand-color);

  :deep(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
}
</style>
