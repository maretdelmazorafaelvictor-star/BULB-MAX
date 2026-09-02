<script setup lang="ts">
const { value } = defineProps<{
  value: string
}>()
</script>

<template>
  <div class="subtitle">
    <Typography>{{ value }}</Typography>
  </div>
</template>

<style scoped lang="scss">
.subtitle {
  display: flex;
  flex-direction: column;
  gap: .0625em;
  color: var(--brand-color);
  font-weight: bold;
  font-size: .5em;
  font-style: italic;
}
</style>
