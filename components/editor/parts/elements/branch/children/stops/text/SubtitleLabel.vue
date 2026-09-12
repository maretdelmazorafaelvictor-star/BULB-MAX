<script setup lang="ts">
import { computed, inject } from 'vue'
import { LineContextKey } from '~/utils/symbols'

const { value } = defineProps<{
  value: string
}>()

const lineContext = inject<LineContext>(LineContextKey)!
const steep = computed(() => Math.abs(lineContext.stopNameAngle.value) >= 45)
</script>

<template>
  <div class="subtitle" :class="{ upright: steep }">
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

  &.upright {
    font-style: normal;
  }
}
</style>