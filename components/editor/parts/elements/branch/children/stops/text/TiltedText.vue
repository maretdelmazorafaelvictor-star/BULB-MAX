<script setup lang="ts">
import { computed } from 'vue'

const {
  angle = -30,
  reverse = false,
} = defineProps<{
  angle?: number
  reverse?: boolean
}>()

const angleInDeg = computed(() => `${angle}deg`)
const flat = computed(() => angle === 0)
</script>

<template>
  <div v-bind="$attrs" class="tilted-text" :class="{ reverse, flat }">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tilted-text {
  position: relative;
  display: block;
  min-width: 1em;
  height: 0;

  & > * {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: rotate(v-bind(angleInDeg));
    transform-origin: bottom left;
  }

  &.reverse > * {
    left: auto;
    bottom: auto;
    right: 50%;
    top: 0;
    transform-origin: top right;
  }

  &.flat {
    width: max-content;
    height: auto;
    display: flex;
    align-items: flex-end;

    & > * {
      position: relative;
      left: auto;
      right: auto;
      top: auto;
      bottom: auto;
      transform: none;
    }
  }
}
</style>
