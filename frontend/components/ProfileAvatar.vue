<script setup>
import { computed } from 'vue';
import ChatPortrait from './ChatPortrait.vue';
const props = defineProps({ name: String, uid: String, url: String, index: { type: Number, default: 0 } });
const photo = computed(() => typeof props.url === 'string' && /^\/api\/profiles\/[A-Za-z0-9_-]+\/media\/avatar\?v=[a-f0-9]{24}$/.test(props.url) ? props.url : '');
</script>
<template>
  <ChatPortrait as="button" class="avatar profile-link" :class="['', 'orange', 'blue'][index % 3]" :name="name" :url="photo" data-action="view-profile" :data-id="uid" :aria-label="`查看${name}的個人檔案`" />
</template>
