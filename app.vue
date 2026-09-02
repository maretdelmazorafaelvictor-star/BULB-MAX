<script setup lang="ts">
import { useHead } from '#imports'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import useLocale from '~/composables/useLocale'
import useVersionTracking from '~/composables/useVersionTracking'
import { findBrandStyleByValue } from '~/data/brands'
import { useProject } from '~/stores/useProject'

useVersionTracking()
useLocale()

/*
 * La charte est portée par le body, et pas seulement par le cadre du plan : les menus
 * de PrimeVue sont téléportés hors de ce cadre, et leurs pictogrammes y perdraient
 * la couleur de marque.
 */
const { line } = storeToRefs(useProject())
const brandClass = computed(() => {
  const brand = findBrandStyleByValue(line.value.brandStyle) ?? findBrandStyleByValue('RATP')!
  return `brand-${brand.value.toLowerCase()}`
})
useHead({ bodyAttrs: { class: brandClass } })
</script>

<template>
  <NuxtLayout>
    <Snow />
    <NuxtPage />
  </NuxtLayout>

  <BToast />
  <ConfirmDialog pt:root:class="max-w-40em m-4" />
</template>

<style lang="scss">
:root {
  /* Brand tokens, see assets/style/custom.css for the per-brand mapping */
  --ratp-blue: #1F3C90;
  --ratp-blue-secondary: rgba(31, 59, 143, 0.125);
  --idfm-anthracite: #25303B;
  --idfm-anthracite-secondary: rgba(37, 48, 59, 0.125);
  --idfm-blue: #64B5F6;
  --sncf-anthracite: #26272B;
  --sncf-anthracite-secondary: rgba(38, 39, 43, 0.125);
  --sncf-red: #E30513;
  --place-brown: #80551A;
  --gray: #414241;
  --background-color: #eaeaea;

  /*
   * Repli de charte. Les classes .brand-* (custom.css) surchargent ces valeurs, mais
   * un pictogramme rendu hors de leur portée — un menu PrimeVue est téléporté dans le
   * body — doit rester visible plutôt que de virer au transparent.
   */
  --brand-color: var(--ratp-blue);
  --brand-color-secondary: var(--ratp-blue-secondary);
  --brand-font: "Parisine Ptf", sans-serif;
}

html, body {
  font-size: 16px;
}

html, body, #__nuxt {
  min-height: 100vh;
}

kbd {
  background-color: var(--p-gray-100);
  border-radius: 0.25em;
  padding: 0.1em 0.25em;
  box-shadow: 0 0 0 1px var(--p-gray-300);
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  font-size: 0.9em;
  line-height: 1;
  color: var(--p-gray-700);
  margin: 0 0.125em;
  border: 1px solid var(--p-gray-300);

  .dark-mode & {
    background-color: var(--p-gray-800);
    box-shadow: 0 0 0 1px var(--p-gray-600);
    color: var(--p-gray-100);
    border: 1px solid var(--p-gray-600);
  }
}
</style>
