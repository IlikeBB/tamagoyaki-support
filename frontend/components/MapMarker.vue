<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ model: Object });
</script>
<template>
  <div v-if="model.kind === 'venue'" class="venue-map-point" :class="{ 'is-current': model.current }"><div class="map-pin venue"><AppIcon name="ticket" /></div><span>{{ model.label }}</span></div>
  <div v-else-if="model.kind === 'message'" class="ground-message-marker"><span><AppIcon name="message" /></span><small>留言</small></div>
  <template v-else-if="model.kind === 'help'"><div class="help-map-marker" aria-hidden="true">!</div><span v-if="model.label" class="teammate-map-label">{{ model.label }}</span></template>
  <div v-else-if="model.kind === 'pin'" class="map-pin" :class="model.className"><AppIcon :name="model.icon || 'pin'" /></div>
  <div v-else class="map-presence" :class="[`presence-${model.kind}`, model.kind === 'self' ? 'self-map-point' : 'teammate-map-point', { 'friend-map-point': model.kind === 'friend', 'expedition-map-point': model.kind === 'member', 'is-last-known': model.lastKnown }]">
    <span class="presence-halo" aria-hidden="true"></span>
    <span v-if="model.angle !== null && model.angle !== undefined" class="presence-fan" :data-angle="model.angle" :style="{ transform: `rotate(${model.angle}deg)` }" aria-hidden="true"><svg viewBox="0 0 128 128"><path opacity=".12" d="M64 64 34 12a60 60 0 0 1 60 0Z" /><path opacity=".19" d="M64 64 40 22.43a48 48 0 0 1 48 0Z" /><path opacity=".23" d="M64 64 46 32.82a36 36 0 0 1 36 0Z" /></svg></span>
    <span class="presence-core" aria-hidden="true"><span v-if="['friend', 'member'].includes(model.kind)" class="teammate-map-relation"><AppIcon :name="model.kind === 'friend' ? 'heart' : 'users'" /></span><template v-else>{{ model.symbol }}</template></span><span class="teammate-map-label presence-label">{{ model.label }}</span><span v-if="model.kind === 'self'" class="visually-hidden presence-heading">{{ model.angle == null ? '尚未取得手機朝向' : `手機朝向 ${Math.round(model.angle)} 度` }}</span>
  </div>
</template>
