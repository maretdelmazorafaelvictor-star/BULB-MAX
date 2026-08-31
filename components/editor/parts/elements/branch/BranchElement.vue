<script setup lang="ts">
import { isSpacer, isStop } from '~/utils/types'

const { reverse, position = null } = defineProps<{
  reverse: boolean
  position?: BranchElementPosition
}>()
const element = defineModel<BranchElement>({ required: true })
</script>

<template>
  <Stop v-if="isStop(element)" v-model="element" :reverse="reverse" :position="position" />
  <Spacer v-else-if="isSpacer(element)" v-model="element" />
</template>
