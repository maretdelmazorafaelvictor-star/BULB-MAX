<script setup lang="ts">
defineProps<{
  line: NoctilienLine
}>()
</script>

<template>
  <span class="picto">{{ line }}</span>
</template>

<style scoped lang="scss">
.picto {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2em;
  height: .9em;
  padding: 0 .15em;
  box-sizing: border-box;
  border-bottom: .1em solid #a0006e;
  background: #0a0082;
  color: white;
  font-family: var(--brand-font);
  font-size: .5em;
  font-weight: 600;
  line-height: 1;
}
</style>
