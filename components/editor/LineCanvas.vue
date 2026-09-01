<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { useDateFormat } from '@vueuse/shared'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import idfmLogo from '~/assets/svg/brands/idfm.svg'
import useVersion from '~/composables/useVersion'
import { findBrandStyleByValue } from '~/data/brands'
import { findOperatorByValue } from '~/data/operators'
import { useProject } from '~/stores/useProject'

const { applicationVersion } = useVersion()
const { line, outdated, presetBased } = storeToRefs(useProject())

const brand = computed(() => findBrandStyleByValue(line.value.brandStyle) ?? findBrandStyleByValue('RATP')!)

const idfm = computed(() => brand.value.value === 'IDFM')
const operator = computed(() => findOperatorByValue(line.value.operator))

const now = useNow()
const date = useDateFormat(now.value, 'DD.MM.YYYY')

const mapArea = ref<HTMLElement | null>(null)
</script>

<template>
  <div
    v-bind="$attrs" class="relative content bg-white flex gap-10 flex-row" :class="`brand-${brand.value.toLowerCase()}`"
    :style="{ minHeight: `${line.mapSize}em` }"
  >
    <div class="flex flex-col min-w-fit gap-3" :class="idfm ? 'side-column-idfm' : 'ml-3'">
      <!-- IDFM: authority logo on an anthracite band -->
      <div v-if="idfm" class="band-idfm flex justify-center items-center bg-[var(--brand-color)] py-.625em px-.75em">
        <img :src="idfmLogo" alt="Île-de-France Mobilités" class="authority-logo">
      </div>
      <div v-else class="w-full h-8 bg-[var(--brand-color)]" />
      <div v-if="idfm" class="flex-grow" />
      <div class="w-full flex flex-row gap-3 justify-center items-center text-4em">
        <Mode :mode="line.mode" />
        <LineIndex :mode="line.mode" :index="line.index" />
      </div>
      <div
        v-if="line.fullyAccessible"
        class="w-full flex flex-row gap-3 justify-center items-center mt-.5em py-3 text-1.75em"
        :class="idfm ? '' : 'bg-[var(--brand-color-secondary)]/50'"
      >
        <Wheelchair />
      </div>
      <div class="flex-grow" />
      <!-- IDFM: operator -->
      <div v-if="idfm && operator?.logo" class="flex flex-col items-start gap-.375em mb-.75em px-.75em">
        <span class="operated-by">OPÉRÉ PAR</span>
        <img :src="operator.logo" :alt="operator.value" class="operator-logo">
      </div>
      <div class="text-.25em flex flex-col line-height-1.75 text-[var(--brand-color)] mb-3">
        <div class="flex flex-row gap-.5">
          <span>BULB-{{ brand.footer }} •</span>
          <!-- Preset Based Project -->
          <span v-if="presetBased">PBP •</span>
          <!-- Project Version Unsupported / Project Version Supported -->
          <span>{{ outdated ? 'PVU' : 'PVS' }} •</span>
          <span>{{ date }} •</span>
          <span>V{{ applicationVersion }}</span>
        </div>
      </div>
    </div>
    <div ref="mapArea" class="relative w-max-content">
      <CommuneBand :target="mapArea" />
      <SectionsGroup
        v-model="line.topology"
        class="w-max-content min-h-15em p-1em pt-20 pr-10em"
      />
    </div>

    <div class="mr-3 my-3 rotate-180 text-[var(--brand-color)] text-.125em opacity-50">
      <div class="legal-notice flex flex-col line-height-1">
        <span>Non affilié à la RATP, à Île-de-France Mobilités, à TCL, à SNCF Voyageurs ou à toute autre société. Les pictogrammes ainsi que les polices utilisés demeurent la propriété intellectuelle exclusive des entités susmentionnées.</span>
        <span class="italic text-.75em">Not affiliated with RATP, Île-de-France Mobilités, TCL, SNCF Voyageurs or any other company. The pictograms and fonts used remain the exclusive intellectual property of the aforementioned entities.</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.content {
  font-size: var(--font-size);
  font-family: var(--brand-font);
  outline: 1px solid var(--p-gray-200);
  box-sizing: content-box;

  overflow: hidden;
  min-width: max-content;
}

.side-column-idfm {
  border-right: .0625em solid var(--brand-color);
  padding-left: .75em;
  padding-right: .75em;
}

.band-idfm {
  margin-left: -.75em;
  width: calc(100% + 1.5em);
}

.authority-logo {
  width: 6em;
  height: auto;
}

.operated-by {
  color: var(--idfm-blue);
  font-size: .4em;
  font-weight: 600;
  letter-spacing: .05em;
}

.operator-logo {
  width: 5em;
  max-height: 3em;
  height: auto;
  object-fit: contain;
}

.legal-notice {
  writing-mode: vertical-rl;
}
</style>
