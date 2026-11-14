<script setup>
import AppIcon from './AppIcon.vue';
import ChatPortrait from './ChatPortrait.vue';
defineProps({ model: Object });
</script>
<template>
  <template v-if="model.kind === 'icon'"><AppIcon :name="model.name" /></template>
  <template v-else-if="model.kind === 'filters'"><button v-for="[key, label] in model.items" :key="key" :data-filter="key" :class="{ active: model.selected === key }" :aria-pressed="model.selected === key">{{ label }}</button></template>
  <template v-else-if="model.kind === 'options'"><option v-for="item in model.items" :key="item.id" :value="item.id" :title="item.name">{{ item.short || item.name }}</option></template>
  <template v-else-if="model.kind === 'connection'"><i></i>{{ model.label }}</template>
  <template v-else-if="model.kind === 'avatar'"><ChatPortrait :name="model.name" :url="model.url" /></template>
  <div v-else-if="model.kind === 'error'" class="empty"><strong>{{ model.title }}</strong>{{ model.detail }}</div>
</template>
