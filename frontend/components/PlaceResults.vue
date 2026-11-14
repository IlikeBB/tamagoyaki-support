<script setup>
defineProps({ model: Object });
defineEmits(['choose', 'create']);
const attribution = point => (point.attributions || []).filter(item => item.provider).map(item => {
  let uri; try { const url = new URL(item.uri); if (['https:', 'http:'].includes(url.protocol)) uri = url.href; } catch {}
  return { ...item, safeUri: uri };
});
</script>
<template>
  <template v-if="model.selected"><strong class="place-selected-name">{{ model.selected.name }}</strong><p class="place-selected-address">{{ model.selected.address }}</p><div class="place-selected-actions"><button v-for="[type, label] in [['pin', '標記地標'], ['task', '插旗任務']]" :key="type" type="button" :data-place-create="type" @click="$emit('create', type)">{{ label }}</button></div></template>
  <template v-for="(point, index) in model.selected ? [model.selected] : model.items" :key="point.id || index"><button v-if="!model.selected" type="button" class="place-search-result" @click="$emit('choose', point)"><strong>{{ point.name }}</strong><small>{{ point.address || '查看地圖位置' }}</small></button><p v-for="(item, i) in attribution(point)" :key="i" class="place-provider"><a v-if="item.safeUri" :href="item.safeUri" target="_blank" rel="noopener noreferrer">{{ item.provider }}</a><template v-else>{{ item.provider }}</template></p></template>
</template>
