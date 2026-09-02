<script setup lang="ts">
import { inject } from 'vue'
import { LineContextKey } from '~/utils/symbols'

const props = defineProps<{
  value: string
  placeName: string | null
  subtitle: string | null
  preventSubtitleOverlapping: boolean
  interestPoint?: boolean
  interestPointColor?: string
  terminus?: boolean
  reverse: boolean
  accessible: boolean | 'undefined' | undefined
  accessibleDirection?: 'left' | 'right' | null
}>()

const lineContext = inject<LineContext>(LineContextKey)!
</script>

<template>
  <StopTerminusLabel v-if="props.terminus && lineContext.frameTerminusNames.value" v-bind="props" />
  <StopRegularLabel v-else v-bind="props" :prevent-subtitle-overlapping="preventSubtitleOverlapping" />
</template>
