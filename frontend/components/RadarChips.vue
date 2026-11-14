<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ model: Object });
</script>
<template>
  <button v-for="item in model.items" :key="item.id" class="radar-chip" :class="{ 'is-friend': item.kind === 'friend', 'is-member': item.kind === 'member', 'is-selected': item.selected }" type="button" data-action="task-target" :data-id="item.id" :title="item.label" :aria-label="item.label"><span class="radar-arrow-badge"><span class="radar-needle" :style="{ transform: `rotate(${item.relative}deg)` }"><svg class="direction-needle" viewBox="0 0 24 24"><path class="needle-main" d="M12 2 21 21 12 16 3 21Z" /><path class="needle-highlight" d="M12 2V16L3 21Z" /></svg></span></span><span class="radar-copy"><strong><span class="radar-relation-icon" aria-hidden="true"><AppIcon v-if="['friend', 'member'].includes(item.kind)" :name="item.kind === 'friend' ? 'heart' : 'users'" /></span><span class="radar-name">{{ item.owner_name }}</span></strong><small><span class="radar-distance">{{ item.distance }}</span><span class="radar-source">{{ item.source }}</span></small></span></button>
</template>
