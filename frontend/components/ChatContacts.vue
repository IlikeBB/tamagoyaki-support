<script setup>
import { computed } from 'vue';
import ChatPortrait from './ChatPortrait.vue';
const props = defineProps({ controller: { type: Object, required: true } });
const state = props.controller.state;
const filters = { all: '全部', friend: '好友', expedition: '遠征隊', squad: '小隊' };
const contacts = computed(() => state.contacts.filter(contact => state.filter === 'all' || contact.kind === state.filter));
const empty = computed(() => ({
  friend: '還沒有好友。先到「好友」加入對方，就能私訊。',
  expedition: '加入遠征隊後，就能和全隊聊天。',
  squad: '建立或加入小隊後，聊天室會顯示在這裡。',
  all: '還沒有對話。加入好友、遠征隊或小隊，就能在這裡聯絡夥伴。',
})[state.filter]);
</script>

<template>
  <section class="chat-list-pane" aria-label="對話列表">
    <div class="chat-filters" aria-label="對話類型">
      <button v-for="(label, key) in filters" :key="key" type="button" :data-chat-filter="key" :aria-pressed="state.filter === key" @click="state.filter = key">{{ label }}</button>
    </div>
    <div class="chat-list-scroll">
      <div id="chat-conversations">
        <button v-for="contact in contacts" :key="contact.id" type="button" class="chat-contact" :data-chat-key="contact.id" :aria-current="contact.id === state.active?.id" @click="controller.actions.choose(contact.id)">
          <ChatPortrait class="chat-contact-icon" :class="contact.kind" :name="contact.title" :url="contact.avatar_url" :group="contact.kind !== 'friend'" aria-hidden="true" />
          <span class="chat-contact-copy">
            <strong>{{ contact.title }}</strong>
            <small class="chat-contact-meta">{{ contact.kind === 'friend' ? '好友私訊' : contact.kind === 'squad' ? contact.subtitle : '遠征隊群聊' }}</small>
            <small>{{ contact.latest ? `${contact.latest.sender_name}：${contact.latest.body}` : contact.kind === 'friend' ? '傳送第一則私訊' : contact.kind === 'squad' ? '和同行小隊聊聊集合與行程' : '和遠征夥伴聊聊集合與現場情報' }}</small>
          </span>
          <span v-if="contact.unread" class="chat-count" :aria-label="`${contact.unread} 則未讀`">{{ contact.unread > 99 ? '99+' : contact.unread }}</span>
        </button>
      </div>
      <p id="chat-list-empty" class="chat-empty" :hidden="!!contacts.length">{{ empty }}</p>
    </div>
  </section>
</template>
