<script setup lang="ts">
const {
  value,
  interestPoint,
  interestPointColor,
} = defineProps<{
  value: string
  interestPoint?: boolean
  interestPointColor?: string
}>()
</script>

<template>
  <InterestPointLabel v-if="interestPoint" :value="value" :background-color="interestPointColor" />
  <SubtitleLabel v-else :value="value" />
</template>