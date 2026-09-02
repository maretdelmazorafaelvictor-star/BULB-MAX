<script setup lang="ts">
import { useElementHover, useElementSize } from '@vueuse/core'
import { computed, inject, onUnmounted, provide, reactive, ref, watch } from 'vue'
import { STOP_PADDING } from '~/utils/dimensions'
import { BranchContextKey, LineContextKey, StopContextKey } from '~/utils/symbols'

const { reverse = false, position = null } = defineProps<{
  reverse?: boolean
  position?: BranchElementPosition
}>()
const stop = defineModel<Stop>({ required: true })
const lineContext = inject<LineContext>(LineContextKey)!
const showPropertiesDialog = ref(false)
const showConnectionsEditor = ref(false)

const el = ref()
const hovering = useElementHover(el)

const padding = computed(() => STOP_PADDING)
const margins = reactive({
  leftMargin: {
    name: '0px',
    connections: '0px',
  },
  rightMargin: {
    name: '0px',
    subtitle: '0px',
    connections: '0px',
  },
})

const leftMargin = computed(() => `max(${margins.leftMargin.name}, ${margins.leftMargin.connections})`)
const rightMargin = computed(() => `max(${margins.rightMargin.name}, ${margins.rightMargin.subtitle}, ${margins.rightMargin.connections})`)
const namesMargin = computed(() => `min(-.125em, -${Math.max(0, lineContext.lineThickness.value - 0.375) / 2}em)`)
const connectionsMargin = computed(() => `max(.125em, ${Math.max(0, lineContext.lineThickness.value - 0.825) / 2}em)`)
const inverted = computed(() => !!stop.value.$stop.reverse !== reverse)

const names = ref()
const { width } = useElementSize(names)
const namesWidth = computed(() => `${width.value}px`)

const endOfLineConnection = computed(() => stop.value.$stop.endOfLineConnection ?? null)
const showEndOfLineConnection = computed(() =>
  stop.value.$stop.terminus
  && endOfLineConnection.value !== null
  && endOfLineConnection.value.lineIndex !== null,
)
/* Terminus en tête de branche : le prolongement part vers la gauche, sinon vers la droite. */
const endOfLineTowardStart = computed(() => position === 'START')

const endOfLine = ref()
const { width: endOfLineWidth } = useElementSize(endOfLine)
const endOfLineOffset = computed(() =>
  showEndOfLineConnection.value && endOfLineTowardStart.value ? `${endOfLineWidth.value}px` : '0px',
)

/*
 * Le prolongement sort du cadre de l’arrêt, du côté du terminus. On signale ce
 * débordement à la branche, qui s’élargit d’autant : sans cela il empiète sur ce qui
 * borde le plan, le pictogramme d’accessibilité du cadre par exemple.
 */
const branchContext = inject<BranchContext | undefined>(BranchContextKey, undefined)

watch([showEndOfLineConnection, endOfLineTowardStart, endOfLineWidth, () => position], () => {
  if (!branchContext) return
  const overflow = showEndOfLineConnection.value ? endOfLineWidth.value : 0
  if (position === 'START') branchContext.overflow.start = overflow
  if (position === 'END') branchContext.overflow.end = overflow
}, { immediate: true })

onUnmounted(() => {
  if (!branchContext) return
  if (position === 'START') branchContext.overflow.start = 0
  if (position === 'END') branchContext.overflow.end = 0
})

provide<StopContext>(StopContextKey, { margins, namesWidth, inverted })
</script>

<template>
  <div
    ref="el"
    v-bind="$attrs"
    class="stop-wrapper relative z-100"
    :class="{ reverse: inverted }"
  >
    <div
      class="flex items-start" :class="{
        'flex-col-reverse': inverted,
        'flex-col': !inverted,
      }"
    >
      <div ref="names" class="names dynamic-part">
        <StopLabel
          :value="stop.$stop.name"
          :subtitle="stop.$stop.subtitle"
          :place-name="stop.$stop.placeName"
          :interest-point="stop.$stop.interestPoint"
          :interest-point-color="stop.$stop.interestPointColor"
          :prevent-subtitle-overlapping="stop.$stop.preventSubtitleOverlapping"
          :terminus="stop.$stop.terminus"
          :accessible="stop.$stop.accessible"
          :accessible-direction="stop.$stop.accessibleDirection"
          :reverse="inverted"
          @click="(e: Event) => {
            e.stopPropagation()
            showPropertiesDialog = true
          }"
        />
      </div>
      <div class="dot-connections" :class="{ 'has-end-of-line': showEndOfLineConnection }">
        <div
          class="dot"
          :data-commune="stop.$stop.commune || null"
          :class="{
            'toward-start': endOfLineTowardStart,
            'has-end-of-line': showEndOfLineConnection,
          }"
        >
          <div v-if="stop.$stop.hatched" class="hatch-overlay" />
          <StopDot
            class="branch-element-handle z-1"
            :terminus="stop.$stop.terminus"
            :connection="stop.$stop.connections.length > 0"
            :color="stop.$stop.terminus ? (stop.$stop.branch_color ?? lineContext.color.value) : lineContext.color.value"
            :closed="stop.$stop.closed"
            @click="(e: Event) => e.stopPropagation()"
          />
          <EndOfLineConnection
            v-if="showEndOfLineConnection"
            ref="endOfLine"
            :connection="endOfLineConnection!"
            :reverse="endOfLineTowardStart"
            @click="(e: Event) => {
              e.stopPropagation()
              showPropertiesDialog = true
            }"
          />
        </div>
        <div class="w-0 connections dynamic-part">
          <div
            @click="(e: Event) => {
              e.stopPropagation()
              showConnectionsEditor = true
            }"
          >
            <Connections :connections="stop.$stop.connections" :reverse="inverted" />
            <Transition v-if="stop.$stop.connections.length === 0" name="fade">
              <div v-show="hovering" class="button-holder export-hide">
                <Button icon="i-tabler-playlist-add" rounded @click="showConnectionsEditor = true" />
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>
  </div>

  <StopPropertiesDialog
    v-model:visible="showPropertiesDialog"
    v-model="stop"
    :allow-city="lineContext.frameTerminusNames.value"
    @open-connections="showConnectionsEditor = true"
  />
  <ConnectionsEditor
    v-model:visible="showConnectionsEditor"
    v-model:stop="stop"
  />
</template>

<style scoped lang="scss">
.stop-wrapper {
  padding-left: v-bind(leftMargin);
  padding-right: v-bind(rightMargin);
  min-width: 1em;
  min-height: 5em;
  z-index: 20;

  display: flex;
  flex-direction: column;
  align-items: start;
  justify-content: center;

  .branch-elements > &:first-child,
  .branch-elements > .branch-element-ghost:first-child & {
    margin-left: calc((v-bind(namesWidth) - 1em) / -2) !important;
    padding-left: 0;

    .names {
      margin-left: 0;
    }

    .dot-connections {
      margin-left: calc((v-bind(namesWidth) - 1em) / 2 - v-bind(endOfLineOffset));
    }
  }

  .branch-elements > &:last-child,
  .branch-elements > .branch-element-ghost:last-child & {
    margin-right: calc((v-bind(namesWidth) - 1em) / -2) !important;
    padding-right: 0;

    .names {
      margin-right: 0;
    }

    /*
     * Reste à 1em même avec un prolongement : le tracé de la branche est dessiné sur
     * toute la largeur du conteneur, l’élargir le ferait passer sous les tirets et
     * reboucher les intervalles. Le prolongement déborde donc à droite, comme il
     * déborde à gauche en tête de branche.
     */
    .dot-connections {
      width: 1em;
    }
  }

  .debug & {
    outline: 1px solid cyan;
  }
}

.names {
  .debug & {
    outline: 1px solid blue;
  }

  position: relative;
  top: v-bind(namesMargin);
  height: 0;
  cursor: pointer;
  margin: 0 v-bind(STOP_PADDING);
  transition: filter .2s ease;

  .reverse & {
    top: auto;
    bottom: v-bind(namesMargin);
  }

  &:hover {
    filter: brightness(.5);
  }
}

.dot-connections {
  display: flex;
  flex-direction: column;
  align-items: start;

  margin-left: calc((v-bind(namesWidth) - 1em) / 2 + v-bind(padding) - v-bind(endOfLineOffset));

  .reverse & {
    flex-direction: column-reverse;
  }
}

.dot {
  .debug & {
    outline: 1px solid magenta;
  }

  position: relative;

  /*
   * Hachure du tronçon : des interstices blancs recouvrent le tracé continu sur toute
   * la largeur de l'élément (pastille + marges des noms), ce qui le découpe en tirets
   * couleur de ligne. Sous la pastille (z-1), au-dessus du tracé.
   */
  .hatch-overlay {
    position: absolute;
    top: 50%;
    left: calc(-1 * v-bind(leftMargin));
    right: calc(-1 * v-bind(rightMargin));
    height: calc(v-bind('lineContext.lineThickness.value') * 1em + 4px);
    transform: translateY(-50%);
    background: repeating-linear-gradient(90deg, transparent 0 .21875em, white .21875em .4375em);
    pointer-events: none;
    z-index: 1;
  }

  display: flex;
  flex-direction: row;
  align-items: center;

  /*
   * En queue de branche cette rangée est contrainte à 1em : sans cela la pastille
   * se comprime et la barre de liaison vient chevaucher la pastille colorée.
   */
  > * {
    flex: none;
  }

  &.toward-start {
    flex-direction: row-reverse;
    justify-content: flex-end;
  }

  &.has-end-of-line {
    /*
     * La rangée couvre aussi les tirets et le picto : sans cela, les survoler
     * éclairerait le symbole. Seules les pastilles et la barre restent sensibles,
     * elles se réactivent dans EndOfLineConnection.vue.
     */
    pointer-events: none;

    > :deep(.branch-element-handle) {
      pointer-events: auto;
    }

    /*
     * Le terminus et la pastille du prolongement forment un seul symbole : les deux
     * pastilles et leur barre de liaison s’éclairent ensemble, pas chacune de son côté.
     */
    &:hover {
      :deep(.dot),
      :deep(.link) {
        filter: brightness(.5);
      }
    }
  }
}

.connections {
  min-width: 1em;
  position: relative;
  top: v-bind(connectionsMargin);
  height: 0;

  /*
   * En tête de branche, le prolongement pousse la colonne vers la gauche.
   * On rattrape ici pour que les correspondances restent sous la pastille.
   */
  left: v-bind(endOfLineOffset);

  .reverse & {
    top: auto;
    bottom: v-bind(connectionsMargin);
  }

  > div {
    display: flex;
    flex-direction: column;
    align-items: start;
    cursor: pointer;

    .reverse & {
      transform: translateY(-100%);
    }

    .button-holder {
      left: .5em;
      transform: translateX(-50%);
      top: calc(v-bind(connectionsMargin) * -1);
      padding-top: .5em;
      width: .125em;
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--p-button-primary-background);

      .reverse & {
        top: auto;
        bottom: calc(v-bind(connectionsMargin) * -1);
        padding-top: 0;
        padding-bottom: .5em;
      }
    }

    transition: filter .2s ease;

    &:hover {
      filter: brightness(.5);
    }
  }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity .2s;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
