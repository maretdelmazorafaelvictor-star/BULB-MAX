<script setup lang="ts">
import type { Line } from '~/utils/network/engine'
import { computed } from 'vue'

const { line, small = false } = defineProps<{
  line: Line
  small?: boolean
}>()

/** Indice affiché : sans la lettre de mode ajoutée par l'importateur (M1 → 1, RA → A, T3a → T3a). */
const text = computed(() => {
  const g = line.group || line.id
  const idx = line.raw.groupName ? g.replace(/^[MRTB](?=.)/, '') : g
  return line.mode === 'tram' && /^\d/.test(idx) ? `T${idx}` : idx
})

const textColor = computed(() => {
  const m = /^#([0-9a-f]{6})$/i.exec(line.color)
  if (!m) return '#fff'
  const n = Number.parseInt(m[1], 16)
  const lum = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
  return lum > 150 ? '#1a1a1a' : '#fff'
})
</script>

<template>
  <span
    class="roundel" :class="[line.mode, { small }]"
    :style="{ backgroundColor: line.color, color: textColor }"
  >{{ text }}</span>
</template>

<style scoped lang="scss">
.roundel {
  display: inline-grid;
  place-items: center;
  min-width: 1.9em;
  height: 1.7em;
  padding: 0 .4em;
  border-radius: .45em;
  font-weight: 700;
  font-size: .9em;
  line-height: 1;
  letter-spacing: .02em;
  white-space: nowrap;

  &.metro {
    border-radius: 50%;
    width: 1.9em;
    padding: 0;
  }

  &.train {
    border-radius: .3em;
  }

  &.bus {
    border-radius: .2em;
  }

  &.small {
    font-size: .75em;
  }
}
</style>
