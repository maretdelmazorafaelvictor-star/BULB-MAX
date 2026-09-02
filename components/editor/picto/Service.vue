<script setup lang="ts">
import bulletTrain from 'assets/svg/services/bullet_train.svg?raw'
import longDistanceBus from 'assets/svg/services/long_distance_bus.svg?raw'
import mainStation from 'assets/svg/services/main_station.svg?raw'
import suburbanTrain from 'assets/svg/services/suburban_train.svg?raw'
import ter from 'assets/svg/services/ter.svg?raw'
import tgv from 'assets/svg/services/tgv.svg?raw'
import { computed } from 'vue'
import airport from '~/assets/svg/airport/airport-generic.svg'
import cdgExpress from '~/assets/svg/services/cdg_express.svg'
import orlyBus from '~/assets/svg/services/orlybus.svg'
import roissyBus from '~/assets/svg/services/roissybus.svg'

const {
  service,
} = defineProps<{
  service: Service | null
}>()

// SVG bruts (couleur de marque via currentColor) ; les autres restent des URL d'images
const isUrl = computed(() => ['AIRPORT', 'ROISSY_BUS', 'ORLY_BUS', 'CDG_EXPRESS'].includes(service ?? ''))

const icon = computed(() => {
  switch (service) {
    case 'MAIN_STATION':
      return mainStation
    case 'BULLET_TRAIN':
      return bulletTrain
    case 'SUBURBAN_TRAIN':
      return suburbanTrain
    case 'TGV':
      return tgv
    case 'TER':
      return ter
    case 'LONG_DISTANCE_BUS':
      return longDistanceBus
    case 'AIRPORT':
      return airport
    case 'ROISSY_BUS':
      return roissyBus
    case 'ORLY_BUS':
      return orlyBus
    case 'CDG_EXPRESS':
      return cdgExpress
  }
  return null
})
</script>

<template>
  <img v-if="isUrl" :src="icon!" alt="service" class="picto">
  <div v-else-if="icon" class="picto inline-svg" role="img" aria-label="service" v-html="icon" />
</template>

<style scoped lang="scss">
.picto {
  //width: 1em;
  height: 1em;
}

/* Pictos monochromes : suivent la couleur de marque */
.inline-svg {
  color: var(--brand-color);

  :deep(svg) {
    display: block;
    width: auto;
    height: 100%;
  }
}
</style>
