<script setup lang="ts">
import { computed } from 'vue'
import cdgval from '~/assets/svg/services/cdgval.svg'
import orlyval from '~/assets/svg/services/orlyval.svg'

const {
  line,
} = defineProps<{
  line: VALLine
}>()

const picto = computed(() => {
  switch (line) {
    case 'CDGVAL':
      return cdgval
    case 'ORLYVAL':
      return orlyval
  }
  return null
})
</script>

<template>
  <img v-if="picto" :src="picto" alt="val" class="picto">
</template>

<style scoped lang="scss">
.picto {
  width: 1em;
  height: 1em;
  object-fit: contain;
}
</style>
