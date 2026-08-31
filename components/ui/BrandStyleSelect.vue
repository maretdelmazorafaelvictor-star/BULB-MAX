<script setup lang="ts">
import type { BrandStyleChoice } from '~/data/brands'
import { ref, watch } from 'vue'
import { BRAND_STYLES, findBrandStyleByValue } from '~/data/brands'

const brand = defineModel<BrandStyle>({ required: true })
const selectedBrand = ref<BrandStyleChoice | null>(findBrandStyleByValue(brand.value))

watch(selectedBrand, val => brand.value = val?.value ?? 'RATP')
watch(brand, val => selectedBrand.value = findBrandStyleByValue(val))
</script>

<template>
  <Select
    v-model="selectedBrand"
    :options="BRAND_STYLES"
    class="flex-auto"
  >
    <template #value="slotProps">
      <span v-if="slotProps.value">{{ $t(slotProps.value.label) }}</span>
    </template>
    <template #option="slotProps">
      <span>{{ $t(slotProps.option.label) }}</span>
    </template>
  </Select>
</template>
