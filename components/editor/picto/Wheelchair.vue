<script setup lang="ts">
import wheelchairOff from '~/assets/svg/wheelchair-off.svg'
import wheelchair from '~/assets/svg/wheelchair.svg'
import wheelchairOffLeft from '~/assets/svg/wheelchair-off_left.svg'
import wheelchairOffRight from '~/assets/svg/wheelchair-off_right.svg'

const {
  off = false,
  direction = null,
} = defineProps<{
  off?: boolean
  direction?: 'left' | 'right' | null
}>()

const getSrc = () => {
  if (off && direction === 'left') return wheelchairOffLeft
  if (off && direction === 'right') return wheelchairOffRight
  if (off) return wheelchairOff
  return wheelchair
}
</script>

<template>
  <img :src="getSrc()" alt="wheelchair user" class="picto">
</template>

<style scoped lang="scss">
.picto {
  width: 1em;
  height: 1em;
}
</style>
