<script setup>
import { computed } from 'vue';
import ChatPortrait from './ChatPortrait.vue';
import ChatMessage from './ChatMessage.vue';
import ChatComposer from './ChatComposer.vue';
const props = defineProps({ controller: { type: Object, required: true } });
const state = props.controller.state;
const subtitle = computed(() => state.active?.kind === 'friend' ? '好友私訊 · 僅你們雙方可讀' : state.active?.kind === 'squad' ? `${state.active.subtitle} · 目前小隊成員可讀` : '遠征隊群聊 · 目前隊員可讀');
</script>

<template>
  <section id="chat-conversation" class="chat-conversation" aria-label="目前對話" :hidden="!state.active">
    <div class="chat-contact-heading">
      <ChatPortrait id="chat-contact-avatar" as="button" class="chat-heading-avatar" :hidden="state.active?.kind !== 'friend'"
        :name="state.active?.kind === 'friend' ? state.active.title : ''" :url="state.active?.kind === 'friend' ? state.active.avatar_url : null"
        :aria-label="state.active?.kind === 'friend' ? `查看 ${state.active.title} 的好友選項` : undefined" @click="state.active?.kind === 'friend' && controller.actions.person(state.active.target)" />
      <div><h3 id="chat-contact-title">{{ state.active?.title || '' }}</h3><p id="chat-contact-subtitle">{{ subtitle }}</p></div>
    </div>
    <p id="chat-error" role="alert">{{ state.error }}</p>
    <div class="chat-history">
      <div id="chat-scroll" class="chat-scroll" @scroll="controller.scrolled()">
        <button id="chat-older" type="button" :hidden="!state.hasOlder" @click="controller.actions.older()">載入較早的訊息</button>
        <ol id="chat-messages" class="chat-messages" role="log" aria-label="對話訊息" aria-live="polite" aria-relevant="additions" aria-atomic="false">
          <ChatMessage v-for="message in state.messages" :key="message.id" :message="message" :uid="state.uid" :controller="controller" />
        </ol>
        <p id="chat-empty" class="chat-empty" :hidden="!!state.messages.length">{{ state.empty }}</p>
      </div>
      <button id="chat-new" type="button" :hidden="!state.newMessages" @click="controller.latest()">查看新訊息 ↓</button>
    </div>
    <ChatComposer :controller="controller" />
  </section>
</template>
