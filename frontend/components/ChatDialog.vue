<script setup>
import AppIcon from './AppIcon.vue';
import ChatContacts from './ChatContacts.vue';
import ChatConversation from './ChatConversation.vue';
const props = defineProps({ controller: { type: Object, required: true } });
const state = props.controller.state;
</script>

<template>
  <header class="chat-header">
    <button id="chat-back" type="button" aria-label="返回對話列表" @click="controller.actions.back()">←</button>
    <div><h2 id="chat-title" tabindex="-1">{{ state.active?.title || '訊息' }}</h2><p id="chat-status" role="status">{{ state.status }}</p></div>
    <button id="chat-retry" type="button" :hidden="!state.retry" @click="controller.actions.retry()">重新同步</button>
    <button id="chat-close" type="button" aria-label="關閉聊天" @click="controller.root.close()">×</button>
  </header>
  <div class="chat-layout">
    <ChatContacts :controller="controller" />
    <div id="chat-placeholder" class="chat-placeholder" :hidden="!!state.active"><AppIcon name="message" />選擇好友、遠征隊或小隊，開始聊天。</div>
    <ChatConversation :controller="controller" />
  </div>
</template>
