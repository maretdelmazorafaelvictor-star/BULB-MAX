<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { useDateFormat } from '@vueuse/shared'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import idfmLogo from '~/assets/svg/brands/idfm.svg'
import idfmLightLogo from '~/assets/svg/brands/idfm_light.png'
import transilienSncfLogo from '~/assets/svg/brands/transilien_sncf.png'
import useVersion from '~/composables/useVersion'
import { findBrandStyleByValue } from '~/data/brands'
import { findOperatorByValue } from '~/data/operators'
import { useProject } from '~/stores/useProject'

const { applicationVersion } = useVersion()
const { line, outdated, presetBased } = storeToRefs(useProject())

const brand = computed(() => findBrandStyleByValue(line.value.brandStyle) ?? findBrandStyleByValue('RATP')!)

const idfm = computed(() => brand.value.value === 'IDFM')
const sncf = computed(() => brand.value.value === 'SNCF')
const operator = computed(() => findOperatorByValue(line.value.operator))

const hasBottomCommunes = ref(false)
const hasFareZones = ref(false)

const now = useNow()
const date = useDateFormat(now.value, 'DD.MM.YYYY')

const mapArea = ref<HTMLElement | null>(null)
</script>

<template>
  <div
    v-bind="$attrs" class="relative isolate content bg-white flex gap-10 flex-row" :class="`brand-${brand.value.toLowerCase()}`"
    :style="{ minHeight: `${line.mapSize}em` }"
  >
    <div class="hors-idf-layer" />
    <div class="flex flex-col min-w-fit gap-3" :class="idfm ? 'side-column-idfm' : 'ml-3'">
      <!-- IDFM: authority logo on an anthracite band -->
      <div v-if="idfm" class="band-idfm flex justify-center items-center bg-[var(--brand-color)] py-.625em px-.75em">
        <img :src="idfmLogo" alt="Île-de-France Mobilités" class="authority-logo">
      </div>
      <div v-else class="w-full h-8" :class="sncf ? '' : 'bg-[var(--brand-color)]'" />
      <div v-if="idfm" class="flex-grow" />
      <div class="w-full flex flex-row gap-3 items-center text-4em" :class="sncf ? 'justify-start' : 'justify-center'">
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
      <div v-if="idfm && operator && operator.logos.length" class="flex flex-col items-start gap-.25em mb-.75em px-.75em">
        <span class="operated-by">OPÉRÉ PAR</span>
        <img v-for="logo of operator.logos" :key="logo" :src="logo" :alt="operator.value" class="operator-logo">
      </div>
      <!-- SNCF: Transilien SNCF Voyageurs pour Île-de-France Mobilités -->
      <div v-if="sncf" class="flex flex-row items-end gap-.25em mb-.75em px-.75em">
        <img :src="transilienSncfLogo" alt="Transilien SNCF Voyageurs" class="transilien-logo">
        <span class="brand-pour">pour</span>
        <img :src="idfmLightLogo" alt="Île-de-France Mobilités" class="idfm-inline-logo">
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
    <div ref="mapArea" class="relative w-max-content flex items-center" :class="{ 'pb-2em': hasBottomCommunes, 'pb-fare': hasFareZones }">
      <CommuneBand :target="mapArea" :class="{ 'communes-above-fare': hasFareZones }" @has-bottom-band="hasBottomCommunes = $event" />
      <FareZoneBand :target="mapArea" variant="transilien" @has-fare-band="hasFareZones = $event" />
      <SectionsGroup
        v-model="line.topology"
        class="w-max-content min-h-15em p-1em pt-20 pr-10em"
      />
    </div>

    <div class="mr-3 my-3 rotate-180 text-[var(--brand-color)] text-.125em opacity-50">
      <div class="legal-notice flex flex-col line-height-1">
        <span>Non affilié à la RATP, à Île-de-France Mobilités, à SNCF Voyageurs ou à toute autre société. Les pictogrammes ainsi que les polices utilisés demeurent la propriété intellectuelle exclusive des entités susmentionnées.</span>
        <span class="italic text-.75em">Not affiliated with RATP, Île-de-France Mobilités, SNCF Voyageurs or any other company. The pictograms and fonts used remain the exclusive intellectual property of the aforementioned entities.</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* Aplats hors Île-de-France : au-dessus du fond du plan, sous tout le contenu */
.hors-idf-layer {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
}

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
  height: 1em;
  width: auto;
  max-width: 6em;
  object-fit: contain;
}

.transilien-logo {
  width: 6em;
  height: auto;
  object-fit: contain;
}

.brand-pour {
  font-size: .5em;
  font-weight: 500;
  color: var(--gray);
  align-self: flex-end;
  padding-bottom: .25em;
}

.idfm-inline-logo {
  width: 3.75em;
  height: auto;
  object-fit: contain;
}

/* Réserve pour le bandeau des zones tarifaires ; s'ajoute au pb-2em des communes */
.pb-fare {
  padding-bottom: 1.5em;

  &.pb-2em {
    padding-bottom: 3.5em;
  }
}

/* Quand les zones occupent le bas, le bandeau des communes du bas remonte d'autant */
.communes-above-fare :deep(.commune-band-bottom) {
  bottom: 1.5em;
}

.legal-notice {
  writing-mode: vertical-rl;
}
</style>
