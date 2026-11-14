<script setup>
import AppIcon from './AppIcon.vue';
import ProfileAvatar from './ProfileAvatar.vue';
import FeedbackControls from './FeedbackControls.vue';
defineProps({ model: Object });
</script>
<template>
  <div class="target-top"><span>{{ model.target.mode }}{{ model.demo ? ' · 演示' : '' }}</span><button class="target-close" data-action="target-close" aria-label="結束追蹤"><AppIcon name="close" /></button></div><h2>{{ model.target.kind === 'message' ? '地面留言' : model.target.title }}</h2>
  <template v-if="model.target.kind === 'message'"><div class="ground-message-author"><ProfileAvatar :name="model.target.owner_name" :uid="model.target.owner" :url="model.target.owner_avatar_url" /><span>{{ model.target.owner_name }} · {{ model.age }}</span></div><blockquote class="ground-message-copy">{{ model.target.description }}</blockquote></template>
  <div class="target-direction"><span class="arrow" :style="{ transform: `rotate(${model.rotation}deg)` }">↑</span><div><strong>{{ model.distance }}</strong><small>{{ model.direction }}</small></div></div><p class="field-note">{{ model.note }}</p>
  <FeedbackControls v-if="model.type === 'pin'" :item="model.target" :compact="model.withBoard" :pending="model.voting" />
  <button v-if="model.type === 'pin' && model.target.can_delete" class="text-button delete-pin" data-action="delete-pin" :data-id="model.target.id" :disabled="model.deleting" :aria-busy="model.deleting">{{ model.deleting ? '刪除中…' : '刪除此地標' }}</button>
</template>
