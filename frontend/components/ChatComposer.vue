<script setup>
import { computed } from 'vue';
const props = defineProps({ controller: { type: Object, required: true } });
const state = props.controller.state;
const muted = computed(() => state.active?.can_send === false);
const disabled = computed(() => muted.value || state.busy || !state.draft.trim() || !state.online);
function shortcut(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    if (!disabled.value) props.controller.form.requestSubmit();
  }
}
</script>

<template>
  <form id="chat-form" class="chat-composer" @submit.prevent="controller.actions.send()">
    <label for="chat-input">傳送訊息</label>
    <textarea id="chat-input" v-model="state.draft" rows="2" maxlength="2000" required :disabled="muted"
      :placeholder="muted ? '你已被禁言，仍可閱讀訊息。' : '想在哪裡會合？'" aria-describedby="chat-length"
      @input="controller.inputChanged($event.target.value)" @keydown="shortcut" />
    <div class="chat-compose-footer">
      <small class="chat-shortcut">Ctrl／⌘ + Enter 傳送</small><small id="chat-length">{{ state.draft.length }} / 2000</small>
      <button id="chat-send" type="submit" :disabled="disabled">{{ muted ? '已禁言' : state.busy ? '傳送中…' : '傳送' }}</button>
    </div>
  </form>
</template>
