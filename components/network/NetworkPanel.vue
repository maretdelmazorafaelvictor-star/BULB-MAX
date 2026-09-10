<script setup lang="ts">
import type { AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import type { Line, Network, Station } from '~/utils/network/engine'
import { useNow } from '@vueuse/core'
import { computed, ref } from 'vue'
import { nextDepartures } from '~/utils/network/engine'

const {
  network,
  hiddenGroups,
  selectedStation = null,
  selectedGroup = null,
} = defineProps<{
  network: Network | null
  hiddenGroups: string[]
  selectedStation?: string | null
  selectedGroup?: string | null
}>()

const emit = defineEmits<{
  selectStation: [name: string | null]
  selectGroup: [group: string | null]
  toggleGroup: [group: string]
}>()

/* ---------- recherche ---------- */
const query = ref('')
const suggestions = ref<string[]>([])
function search(e: AutoCompleteCompleteEvent) {
  const q = e.query.trim().toLowerCase()
  const names = (network?.stations ?? []).map(s => s.name)
  suggestions.value = (q ? names.filter(n => n.toLowerCase().includes(q)) : names).sort((a, b) => a.localeCompare(b)).slice(0, 12)
}
function pick(name: string) {
  emit('selectStation', name)
  query.value = ''
}

/* ---------- fiche station ---------- */
const now = useNow({ interval: 1000 })
const station = computed<Station | null>(() => network?.stations.find(s => s.name === selectedStation) ?? null)

const lineGroups = computed(() => {
  const groups = new Map<string, Line[]>()
  for (const line of network?.lines ?? []) {
    if (!groups.has(line.group)) groups.set(line.group, [])
    groups.get(line.group)!.push(line)
  }
  return [...groups.values()]
})

function groupOf(st: Station, group: string): Line {
  return st.lines.find(l => l.group === group)!
}

interface DepartureRow { line: Line, destination: string, minutes: number[] }
const departures = computed<DepartureRow[]>(() => {
  if (!network || !station.value) return []
  const d = now.value
  const t = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
  const merged = new Map<string, DepartureRow & { times: number[] }>()
  for (const dep of nextDepartures(network, station.value, t, 4)) {
    const key = `${dep.line.group}|${dep.destination.name}`
    if (!merged.has(key)) merged.set(key, { line: dep.line, destination: dep.destination.name, minutes: [], times: [] })
    merged.get(key)!.times.push(...dep.times)
  }
  return [...merged.values()]
    .map(r => ({ line: r.line, destination: r.destination, minutes: [...new Set(r.times)].sort((a, b) => a - b).slice(0, 3).map(x => Math.max(0, Math.round((x - t) / 60))) }))
    .sort((a, b) => a.line.group.localeCompare(b.line.group, undefined, { numeric: true }) || a.destination.localeCompare(b.destination))
})

/* ---------- ligne sélectionnée ---------- */
const group = computed(() => selectedGroup ? lineGroups.value.find(g => g[0].group === selectedGroup) ?? null : null)
const groupStations = computed(() => {
  const g = group.value
  if (!g) return []
  return g.map(l => ({
    line: l,
    stops: l.stops.filter((s, i) => !(l.loop && i === l.stops.length - 1)).map(s => ({ name: s.name, interchange: network?.stations.find(x => x.name === s.name)?.interchange ?? false })),
  }))
})
</script>

<template>
  <div class="panel">
    <AutoComplete
      v-model="query"
      :suggestions="suggestions"
      :placeholder="$t('ui.network.search')"
      :disabled="!network"
      fluid
      @complete="search"
      @option-select="pick($event.value)"
    />

    <div v-if="station" class="card">
      <div class="card-head">
        <h3>{{ station.name }}</h3>
        <Button icon="i-tabler-x" text rounded size="small" severity="secondary" @click="emit('selectStation', null)" />
      </div>
      <div class="meta">
        <span v-if="station.commune">{{ station.commune }} · </span>
        <span>{{ station.interchange ? $t('ui.network.station.interchange', { count: station.groups.length }) : $t('ui.network.station.lines', { count: station.groups.length }) }}</span>
      </div>
      <div class="chips">
        <NetworkRoundel
          v-for="g of station.groups" :key="g"
          :line="groupOf(station, g)"
          class="clickable"
          role="button"
          @click="emit('selectGroup', g)"
        />
      </div>
      <div class="departures">
        <div class="section-title">
          {{ $t('ui.network.station.next_departures') }}
        </div>
        <div v-for="row of departures" :key="`${row.line.id}-${row.destination}`" class="dep">
          <NetworkRoundel :line="row.line" small />
          <span class="dest" :title="row.destination">→ {{ row.destination }}</span>
          <span class="times">{{ row.minutes.map(m => m < 1 ? '<1' : m).join(', ') }} min</span>
        </div>
        <div v-if="!departures.length" class="meta">
          {{ $t('ui.network.station.no_departure') }}
        </div>
      </div>
    </div>

    <div v-if="group" class="card">
      <div class="card-head">
        <NetworkRoundel :line="group[0]" />
        <h3>{{ group[0].raw.groupName ?? group[0].name }}</h3>
        <Button icon="i-tabler-x" text rounded size="small" severity="secondary" @click="emit('selectGroup', null)" />
      </div>
      <div class="meta">
        {{ group[0].modeLabel }} · {{ $t('ui.network.line.stations', { count: new Set(group.flatMap(l => l.stops.map(s => s.name))).size }) }}
      </div>
      <div class="stoplist" :style="{ '--line-color': group[0].color }">
        <template v-for="svc of groupStations" :key="svc.line.id">
          <div v-if="groupStations.length > 1" class="svc">
            {{ svc.line.name.replace(/^.*?· /, '') }}
          </div>
          <button v-for="s of svc.stops" :key="s.name" type="button" class="stop" @click="emit('selectStation', s.name)">
            <span class="dot" :class="{ inter: s.interchange }" /><span>{{ s.name }}</span>
          </button>
        </template>
      </div>
    </div>

    <div v-if="network" class="lines">
      <div class="section-title">
        {{ $t('ui.network.lines.title') }}
      </div>
      <button
        v-for="g of lineGroups" :key="g[0].group"
        type="button"
        class="line-row" :class="{ off: hiddenGroups.includes(g[0].group), active: selectedGroup === g[0].group }"
        @click="emit('selectGroup', g[0].group)"
      >
        <NetworkRoundel :line="g[0]" />
        <span class="name">{{ g[0].raw.groupName ?? g[0].name }}</span>
        <Button
          :icon="hiddenGroups.includes(g[0].group) ? 'i-tabler-eye-off' : 'i-tabler-eye'"
          text rounded size="small" severity="secondary"
          :title="$t('ui.network.lines.toggle')"
          @click.stop="emit('toggleGroup', g[0].group)"
        />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.panel {
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.card {
  border: 1px solid var(--p-content-border-color);
  border-radius: var(--p-content-border-radius);
  padding: .75rem;
  display: flex;
  flex-direction: column;
  gap: .5rem;
}

.card-head {
  display: flex;
  align-items: center;
  gap: .5rem;

  h3 {
    margin: 0;
    font-size: 1.05rem;
    flex: 1;
  }
}

.meta {
  font-size: .85rem;
  color: var(--p-text-muted-color);
}

.section-title {
  font-size: .75rem;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: .3rem;

  .clickable {
    cursor: pointer;
  }
}

.departures {
  display: flex;
  flex-direction: column;
  gap: .3rem;
}

.dep {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: .5rem;
  font-size: .85rem;

  .dest {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--p-text-muted-color);
  }

  .times {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }
}

.stoplist {
  max-height: 16rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  .svc {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--p-text-muted-color);
    margin: .4rem 0 .15rem;
  }

  .stop {
    display: grid;
    grid-template-columns: 1rem 1fr;
    align-items: center;
    gap: .4rem;
    text-align: left;
    background: transparent;
    border: 0;
    color: inherit;
    padding: .15rem 0;
    font-size: .85rem;
    cursor: pointer;

    &:hover {
      color: var(--p-primary-color);
    }
  }

  .dot {
    width: .6rem;
    height: .6rem;
    border-radius: 50%;
    background: #fff;
    border: 2px solid var(--line-color, #888);
    justify-self: center;

    &.inter {
      border-color: #1F2933;
    }
  }
}

.lines {
  display: flex;
  flex-direction: column;
}

.line-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: .5rem;
  padding: .25rem .25rem;
  border: 0;
  border-top: 1px solid var(--p-content-border-color);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover, &.active {
    background: var(--p-content-hover-background);
  }

  &.off {
    opacity: .45;
  }

  .name {
    font-size: .9rem;
  }
}
</style>
