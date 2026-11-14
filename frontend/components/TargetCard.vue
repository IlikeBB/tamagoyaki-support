<script setup>
import TargetSummary from './TargetSummary.vue';
defineProps({ model: Object });
</script>
<template>
  <template v-if="model.target"><template v-if="model.withBoard"><div class="target-summary"><TargetSummary :model="model" /></div><section class="landmark-report-board" aria-label="情報點留言板"></section></template><TargetSummary v-else :model="model" /></template>
</template>
