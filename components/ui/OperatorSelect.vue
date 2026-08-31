<script setup lang="ts">
import type { OperatorChoice } from '~/data/operators'
import { ref, watch } from 'vue'
import { findOperatorByValue, OPERATORS } from '~/data/operators'

const operator = defineModel<Operator>({ required: true })
const selectedOperator = ref<OperatorChoice | null>(findOperatorByValue(operator.value))

watch(selectedOperator, val => operator.value = val?.value ?? 'NONE')
watch(operator, val => selectedOperator.value = findOperatorByValue(val))
</script>

<template>
  <Select
    v-model="selectedOperator"
    :options="OPERATORS"
    class="flex-auto"
  >
    <template #value="slotProps">
      <span v-if="slotProps.value">{{ $t(slotProps.value.label) }}</span>
    </template>
    <template #option="slotProps">
      <span>{{ $t(slotProps.option.label) }}</span>
    </template>
  </Select>
</template>
