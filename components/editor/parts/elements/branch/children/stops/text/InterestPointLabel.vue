<script setup lang="ts">
import { computed } from 'vue'

const { value, backgroundColor = '#80551A' } = defineProps<{
  value: string
  backgroundColor?: string
}>()

const valueParts = computed(() => value.split('\n').filter(part => part.trim() !== ''))

const textColor = computed(() => {
  const hex = backgroundColor.replace('#', '')
  const r = Number.parseInt(hex.substring(0, 2), 16)
  const g = Number.parseInt(hex.substring(2, 4), 16)
  const b = Number.parseInt(hex.substring(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b)
  return luminance > 150 ? '#000000' : '#FFFFFF'
})
</script>

<template>
  <div class="subtitle">
    <Typography v-for="(part, index) in valueParts" :key="`${part}-${index}`" class="name">
      {{ part }}
    </Typography>
  </div>
</template>

<style scoped lang="scss">
.subtitle {
  padding: .125em .125em;
  display: flex;
  flex-direction: column;
  gap: .0625em;
  background-color: v-bind(backgroundColor);
  color: v-bind(textColor);
  font-weight: bold;
  font-style: italic;
  width: fit-content;

  .debug & {
    outline: 1px solid blue;
  }
}

.name {
  font-size: .5em;
}

span {
  line-height: .9375em;
  margin-top: calc(-2em / 12);
  margin-right: calc(1em / 12);
  text-wrap: nowrap;
  height: fit-content;
}
</style>
