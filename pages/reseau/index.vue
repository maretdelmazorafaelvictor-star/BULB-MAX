<script setup lang="ts">
import { definePageMeta } from '#imports'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useNetwork } from '~/stores/useNetwork'

definePageMeta({
  layout: 'default-fixed-size',
})

const store = useNetwork()
const { network, hiddenGroups, hiddenLineIds } = storeToRefs(store)

const selectedStation = ref<string | null>(null)
const selectedGroup = ref<string | null>(null)

function selectStation(name: string | null) {
  selectedStation.value = name
}

function selectGroup(group: string | null) {
  selectedGroup.value = group
}

function clearSelection() {
  selectedStation.value = null
  selectedGroup.value = null
}
</script>

<template>
  <div class="layout">
    <div class="menus">
      <Panel :header="$t('ui.network.menu.title')">
        <NetworkMenu />
      </Panel>
    </div>

    <Panel
      :header="$t('ui.network.title')"
      pt:root:class="flex flex-col min-h-0 max-h-full"
      pt:content-container:class="flex-grow min-h-0"
      pt:content:class="h-full important-p-0"
    >
      <NetworkMap
        :network="network"
        :hidden-line-ids="hiddenLineIds"
        :selected-station="selectedStation"
        :selected-group="selectedGroup"
        @select-station="selectStation"
        @select-group="selectGroup"
        @clear="clearSelection"
      >
        <template #empty>
          <div class="text-center px-6">
            {{ $t('ui.network.empty') }}
          </div>
        </template>
      </NetworkMap>
    </Panel>

    <div class="side">
      <Panel :header="$t('ui.network.panel.title')">
        <NetworkPanel
          :network="network"
          :hidden-groups="hiddenGroups"
          :selected-station="selectedStation"
          :selected-group="selectedGroup"
          @select-station="selectStation"
          @select-group="selectGroup"
          @toggle-group="store.toggleGroup"
        />
      </Panel>
    </div>
  </div>

  <BrowserCheck />
</template>

<style scoped lang="scss">
.layout {
  display: grid;
  grid-template-columns: auto 1fr 22em;
  gap: .5rem;
  min-height: 0;
  max-height: 100%;
}

.menus, .side {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  overflow-y: auto;
}

.menus {
  min-width: 20em;
}

@media (max-width: 1024px) {
  .layout {
    display: flex;
    flex-direction: column;
  }

  .menus {
    order: 1;
  }

  .side {
    order: 2;
  }
}
</style>
