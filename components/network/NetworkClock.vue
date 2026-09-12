<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { CLOCK_RATES, useNetwork } from '~/stores/useNetwork'
import { formatTime } from '~/utils/network/engine'

/** Horloge de simulation : heure, marche/arrêt, accéléré, affichage des véhicules. */
const store = useNetwork()
const { clock, network } = storeToRefs(store)

onMounted(() => store.startClock())
onBeforeUnmount(() => store.stopClock())

const label = computed(() => formatTime(clock.value.time, true))

/** Curseur sur la journée, en minutes. */
const minutes = computed({
  get: () => Math.floor(clock.value.time / 60),
  set: v => store.setClockTime(v * 60),
})
</script>

<template>
  <div class="clock-bar">
    <div class="time" :class="{ paused: !clock.real && !clock.playing }">
      {{ label }}
    </div>
    <Button
      :icon="clock.playing || clock.real ? 'i-tabler-player-pause' : 'i-tabler-player-play'"
      :title="$t(clock.playing || clock.real ? 'ui.network.clock.pause' : 'ui.network.clock.play')"
      severity="secondary"
      rounded
      size="small"
      :disabled="!network"
      @click="store.toggleClockPlaying()"
    />
    <div class="rates">
      <button
        v-for="r of CLOCK_RATES"
        :key="r"
        type="button"
        class="rate"
        :class="{ on: !clock.real && clock.rate === r }"
        :disabled="!network"
        @click="store.setClockRate(r)"
      >
        ×{{ r }}
      </button>
      <button
        type="button"
        class="rate"
        :class="{ on: clock.real }"
        :disabled="!network"
        @click="store.useRealTime()"
      >
        {{ $t('ui.network.clock.real') }}
      </button>
    </div>
    <Slider v-model="minutes" class="flex-grow" :min="0" :max="1439" :step="1" :disabled="!network" />
    <Button
      :label="$t('ui.network.clock.vehicles')"
      :icon="clock.vehicles ? 'i-tabler-eye' : 'i-tabler-eye-off'"
      :severity="clock.vehicles ? 'primary' : 'secondary'"
      size="small"
      text
      :disabled="!network"
      @click="store.toggleVehicles()"
    />
  </div>
</template>

<style scoped lang="scss">
.clock-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: .6rem;
  padding: .35rem .75rem;
  border-top: 1px solid var(--p-panel-border-color);
  background: #fff;
}

.time {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 1.1rem;
  min-width: 5.2em;

  &.paused {
    opacity: .5;
  }
}

.rates {
  display: flex;
  gap: .15rem;
}

.rate {
  border: 1px solid var(--p-panel-border-color);
  background: none;
  border-radius: .3em;
  padding: .15em .5em;
  font-size: .8rem;
  cursor: pointer;
  color: inherit;

  &.on {
    background: var(--p-primary-color);
    color: var(--p-primary-contrast-color);
    border-color: var(--p-primary-color);
  }

  &:disabled {
    opacity: .5;
    cursor: default;
  }
}
</style>
