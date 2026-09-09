<script setup lang="ts">
import type { Line } from '~/utils/network/engine'
import { computed } from 'vue'
import { findLineByValue } from '~/data/lines'
import { findModeByValue, modeToShape } from '~/data/modes'

/**
 * « Thermomètre » des modes : une rangée par mode BULB avec les pictos officiels des lignes.
 */
const { groups, hiddenGroups, selectedGroup = null } = defineProps<{
  groups: Line[][]
  hiddenGroups: string[]
  selectedGroup?: string | null
}>()

const emit = defineEmits<{
  select: [group: string]
  toggle: [group: string]
}>()

/** Ordre des rangées, comme sur le plan IDFM : trains, métro, tram, puis le reste. */
const ROW_ORDER = ['RER', 'TRAIN', 'TRAIN_RER', 'METRO', 'VAL', 'TRAM', 'TRAM_TRAIN', 'FUNICULAR', 'GONDOLA', 'AERIAL_TRAMWAY', 'BRT', 'BUS', 'NOCTILIEN', 'BOAT', 'VELO']
const FALLBACK_MODE: Record<string, Mode> = { metro: 'METRO', train: 'TRAIN', tram: 'TRAM', bus: 'BUS' }

interface Picto {
  group: string
  line: Line
  builtin: BuiltinLineIndex | null
  index: string
  shape: IndexShape
}

interface Row { mode: Mode, label: string, pictos: Picto[] }

function kindOf(line: Line): Mode {
  return (line.raw.kind as Mode | undefined) ?? FALLBACK_MODE[line.mode] ?? 'BUS'
}

/** Indice affiché : sans la lettre de mode ajoutée par l'importateur (M1 → 1, RA → A). */
function indexOf(line: Line): string {
  if (line.raw.index) return line.raw.index
  const g = line.group || line.id
  return line.raw.groupName ? g.replace(/^[MRTB](?=.)/, '') : g
}

const rows = computed<Row[]>(() => {
  const byMode = new Map<Mode, Picto[]>()
  for (const lines of groups) {
    const line = lines[0]
    const mode = kindOf(line)
    const index = indexOf(line)
    const candidate = { mode, $builtinLineIndex: { index } } as BuiltinLineIndex
    const builtin = findLineByValue(candidate) ? candidate : null
    if (!byMode.has(mode)) byMode.set(mode, [])
    byMode.get(mode)!.push({ group: line.group, line, builtin, index, shape: modeToShape(mode) })
  }
  const rank = (m: Mode) => {
    const i = ROW_ORDER.indexOf(m)
    return i < 0 ? ROW_ORDER.length : i
  }
  return [...byMode.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([mode, pictos]) => ({
      mode,
      label: findModeByValue(mode)?.label ?? mode,
      pictos: pictos.sort((a, b) => a.index.localeCompare(b.index, undefined, { numeric: true })),
    }))
})

function onClick(p: Picto, e: MouseEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) emit('toggle', p.group)
  else emit('select', p.group)
}
</script>

<template>
  <div class="legend">
    <div v-for="row in rows" :key="row.mode" class="row">
      <div class="mode">
        <Mode :mode="row.mode" />
        <span class="mode-label">{{ $t(row.label) }}</span>
      </div>
      <div class="pictos">
        <button
          v-for="p in row.pictos"
          :key="p.group"
          type="button"
          class="picto"
          :class="{ hidden: hiddenGroups.includes(p.group), selected: selectedGroup === p.group }"
          :title="p.line.raw.groupName ?? p.line.name"
          @click="onClick(p, $event)"
          @contextmenu.prevent="emit('toggle', p.group)"
        >
          <LineIndex v-if="p.builtin" :mode="row.mode" :index="p.builtin" />
          <CustomLineIndex v-else :shape="p.shape" :index="p.index" :color="p.line.color" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.legend {
  display: flex;
  flex-direction: column;
  gap: .35rem;
  font-size: 1.35rem;
}

.row {
  display: flex;
  align-items: center;
  gap: .5em;
}

.mode {
  display: flex;
  align-items: center;
  gap: .3em;
  min-width: 7.5em;
  font-size: .8em;
}

.mode-label {
  font-size: .8em;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pictos {
  display: flex;
  flex-wrap: wrap;
  gap: .2em;
}

.picto {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  border-radius: .25em;
  line-height: 0;
  outline-offset: 2px;
  transition: opacity .15s, transform .15s;

  &:hover {
    transform: scale(1.12);
  }

  &.hidden {
    opacity: .25;
  }

  &.selected {
    box-shadow: 0 0 0 .12em #F5C542;
  }
}
</style>
