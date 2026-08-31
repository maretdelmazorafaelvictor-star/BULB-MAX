<script setup lang="ts">
import { computed } from 'vue'
import MONTMARTRE from '~/assets/svg/lines/funicular/funicular_montmartre.svg'

const {
  line,
} = defineProps<{
  line: FunicularLine
}>()

const picto = computed(() => {
  switch (line) {
    case 'MONTMARTRE':
      return MONTMARTRE
  }
  return null
})
</script>

<template>
  <span v-if="picto" class="picto">
    <img :src="picto" alt="funicular">
  </span>
</template>

<style scoped lang="scss">
.picto {
  position: relative;
  display: block;
  min-width: 1em;
  min-height: 1em;
  width: 1em;
  height: 1em;
  overflow: hidden;

  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}
</style>
