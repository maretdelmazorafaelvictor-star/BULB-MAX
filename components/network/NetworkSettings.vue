<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { DEFAULT_SCHEMATIC, useNetwork } from '~/stores/useNetwork'

/** Réglages du plan : vue schématique ou géographique, dilatation, espacement, angles. */
const store = useNetwork()
const { schematicSettings, schematicScore, computing, data } = storeToRefs(store)

const dilation = computed({
  get: () => Math.round(schematicSettings.value.dilation * 100),
  set: v => schematicSettings.value.dilation = v / 100,
})
const spacing = computed({
  get: () => Math.round(schematicSettings.value.spacing * 100),
  set: v => schematicSettings.value.spacing = v / 100,
})
const octo = computed({
  get: () => Math.round(schematicSettings.value.octo * 100),
  set: v => schematicSettings.value.octo = v / 100,
})

const fidelity = computed({
  get: () => Math.round((schematicSettings.value.fidelity ?? 0.5) * 100),
  set: v => schematicSettings.value.fidelity = v / 100,
})

const grid = computed({
  get: () => Math.round((schematicSettings.value.grid ?? 1) * 100),
  set: v => schematicSettings.value.grid = v / 100,
})

const isDefault = computed(() => JSON.stringify(schematicSettings.value) === JSON.stringify(DEFAULT_SCHEMATIC))

function reset() {
  schematicSettings.value = { ...DEFAULT_SCHEMATIC }
  store.reschematize()
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="setting">
      <label>{{ $t('ui.network.settings.dilation') }}</label>
      <div class="flex items-center gap-3">
        <Slider v-model="dilation" class="flex-grow" :min="0" :max="100" :step="5" :disabled="!data" />
        <span class="value">{{ dilation ? `${dilation} %` : $t('ui.network.settings.auto') }}</span>
      </div>
    </div>
    <div class="setting">
      <label>{{ $t('ui.network.settings.spacing') }}</label>
      <div class="flex items-center gap-3">
        <Slider v-model="spacing" class="flex-grow" :min="50" :max="200" :step="5" :disabled="!data" />
        <span class="value">{{ spacing }} %</span>
      </div>
    </div>
    <div class="setting">
      <label>{{ $t('ui.network.settings.fidelity') }}</label>
      <div class="flex items-center gap-3">
        <Slider v-model="fidelity" class="flex-grow" :min="0" :max="200" :step="5" :disabled="!data" />
        <span class="value">{{ fidelity }} %</span>
      </div>
    </div>
    <div class="setting">
      <label>{{ $t('ui.network.settings.grid') }}</label>
      <div class="flex items-center gap-3">
        <Slider v-model="grid" class="flex-grow" :min="0" :max="150" :step="5" :disabled="!data" />
        <span class="value">{{ grid ? `${grid} %` : $t('ui.network.settings.off') }}</span>
      </div>
    </div>
    <div class="setting">
      <label>{{ $t('ui.network.settings.octo') }}</label>
      <div class="flex items-center gap-3">
        <Slider v-model="octo" class="flex-grow" :min="0" :max="100" :step="5" :disabled="!data" />
        <span class="value">{{ octo }} %</span>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Button
        :label="$t('ui.network.settings.apply')"
        icon="i-tabler-refresh"
        size="small"
        :loading="computing"
        :disabled="!data"
        @click="store.reschematize()"
      />
      <Button
        :label="$t('ui.network.settings.reset')"
        severity="secondary"
        size="small"
        text
        :disabled="isDefault"
        @click="reset()"
      />
    </div>
    <p v-if="schematicScore !== null" class="text-sm op-70 m-0">
      {{ $t('ui.network.settings.score', { value: Math.round(schematicScore * 100) }) }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.setting {
  display: flex;
  flex-direction: column;
  gap: .4rem;

  label {
    font-size: .9em;
  }
}

.value {
  min-width: 3.5em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: .9em;
}
</style>
