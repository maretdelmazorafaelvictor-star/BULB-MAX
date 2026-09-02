<script setup lang="ts">
import { computed } from 'vue'
import LINE_1 from '~/assets/svg/lines/tram/tram_T1.svg'
import LINE_2 from '~/assets/svg/lines/tram/tram_T2.svg'
import LINE_3A from '~/assets/svg/lines/tram/tram_T3a.svg'
import LINE_3B from '~/assets/svg/lines/tram/tram_T3b.svg'
import LINE_5 from '~/assets/svg/lines/tram/tram_T5.svg'
import LINE_6 from '~/assets/svg/lines/tram/tram_T6.svg'
import LINE_7 from '~/assets/svg/lines/tram/tram_T7.svg'
import LINE_8 from '~/assets/svg/lines/tram/tram_T8.svg'
import LINE_9 from '~/assets/svg/lines/tram/tram_T9.svg'
import LINE_10 from '~/assets/svg/lines/tram/tram_T10.svg'

const {
  line,
} = defineProps<{
  line: TramLine
}>()

const picto = computed(() => {
  switch (line) {
    case '1':
      return LINE_1
    case '2':
      return LINE_2
    case '3a':
      return LINE_3A
    case '3b':
      return LINE_3B
    case '5':
      return LINE_5
    case '6':
      return LINE_6
    case '7':
      return LINE_7
    case '8':
      return LINE_8
    case '9':
      return LINE_9
    case '10':
      return LINE_10
    default:
      return null
  }
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
