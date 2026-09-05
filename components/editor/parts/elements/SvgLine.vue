<script setup lang="ts">
import { roundCorners } from 'svg-round-corners'
import { computed } from 'vue'

const {
  path,
  color,
  lineWidth,
  striped = false,
  dashed = false,
} = defineProps<{
  path: string
  color: string
  lineWidth: number | string
  striped?: boolean
  dashed?: boolean
}>()

const dashArray = computed(() => dashed ? '.75em .3em' : undefined)
const dashStyle = computed(() => dashed ? { strokeLinecap: 'butt' } : undefined)

const roundedPath = computed(() => {
  try {
    return roundCorners(path, 200).path
  } catch (e: unknown) {
    console.error(e)
    return path
  }
})
</script>

<template>
  <path
    :d="roundedPath"
    :stroke="color"
    fill="transparent"
    :stroke-width="`${lineWidth}em`"
    :stroke-dasharray="dashArray"
    :style="dashStyle"
    stroke-cap-round
    stroke-join-round
  />
  <path
    v-if="striped"
    :d="roundedPath"
    opacity="50%"
    stroke="white"
    fill="transparent"
    :stroke-width="`calc(${lineWidth}em / 3)`"
    :stroke-dasharray="dashArray"
    :style="dashStyle"
    stroke-cap-round
    stroke-join-round
  />
</template>
