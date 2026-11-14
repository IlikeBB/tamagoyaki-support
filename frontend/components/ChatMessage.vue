<script setup>
import { computed } from 'vue';
import ChatPortrait from './ChatPortrait.vue';
const props = defineProps({ message: { type: Object, required: true }, uid: String, controller: { type: Object, required: true } });
const own = computed(() => props.message.sender === props.uid);
const time = computed(() => new Date(props.message.created * 1000));
const label = computed(() => new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(time.value));
const invitation = computed(() => props.controller.actions.invitation(props.message.body));
</script>

<template>
  <li class="chat-message" :class="{ 'is-own': own }" :data-message-id="message.id">
    <ChatPortrait :as="own ? 'span' : 'button'" class="chat-message-avatar" :name="message.sender_name" :url="message.sender_avatar_url"
      :data-chat-person="own ? undefined : message.sender" :aria-label="own ? undefined : `查看 ${message.sender_name} 的好友邀請選項`"
      @click="!own && controller.actions.person(message.sender)" />
    <div class="chat-message-copy">
      <div class="chat-message-meta"><strong>{{ own ? '你' : message.sender_name }}</strong><time :datetime="time.toISOString()">{{ label }}</time></div>
      <p>{{ message.body }}</p>
      <a v-if="invitation" class="chat-squad-invite" :href="invitation">查看小隊邀請 →</a>
    </div>
  </li>
</template>
