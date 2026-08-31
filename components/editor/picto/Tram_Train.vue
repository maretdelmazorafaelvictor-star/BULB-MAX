<script setup lang="ts">
import { computed } from 'vue'
import LINE_4 from '~/assets/svg/lines/tram_train/tram_T4.svg'
import LINE_11 from '~/assets/svg/lines/tram_train/tram_T11.svg'
import LINE_12 from '~/assets/svg/lines/tram_train/tram_T12.svg'
import LINE_13 from '~/assets/svg/lines/tram_train/tram_T13.svg'
import LINE_14 from '~/assets/svg/lines/tram_train/tram_T14.svg'
const {
  line,
} = defineProps<{
  line: Tram_TrainLine
}>()

const picto = computed(() => {
  switch (line) {
      case '4':
        return LINE_4
    case '11':
      return LINE_11
    case '12':
      return LINE_12
    case '13':
      return LINE_13
    case '14':
      return LINE_14
  }
  return null
})
</script>

<template>
  <img v-if="picto" :src="picto" alt="metro" class="picto">
</template>

<style scoped lang="scss">
.picto {
  width: 1em;
  height: 1em;
}
</style>
