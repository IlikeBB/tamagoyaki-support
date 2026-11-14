<script setup>
import { ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
const props = defineProps({ name: String, url: String, group: Boolean, as: { type: String, default: 'span' } });
const failed = ref(false);
watch(() => props.url, () => { failed.value = false; });
</script>

<template>
  <component :is="as" :type="as === 'button' ? 'button' : undefined">
    <AppIcon v-if="group" name="users" /><template v-else>{{ [...(name || '夥伴')][0] }}</template>
    <img v-if="url && !failed" :src="url" alt="" @error="failed = true">
  </component>
</template>
