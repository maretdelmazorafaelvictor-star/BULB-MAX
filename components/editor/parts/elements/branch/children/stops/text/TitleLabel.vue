<script setup lang="ts">
const { value, weight = 'bold' } = defineProps<{
  value: string
  weight?: string
}>()
</script>

<template>
  <div class="flex flex-row items-center h-1em">
    <Typography class="title" :style="{ fontWeight: weight }">
      {{ value }}
    </Typography>
  </div>
</template>

<style scoped lang="scss">
.title {
  color: var(--brand-color);
}

span {
  line-height: .9375em;
  margin-top: -.1875em;
  margin-right: .0625em;
  text-wrap: nowrap;
  height: fit-content;
}
</style>