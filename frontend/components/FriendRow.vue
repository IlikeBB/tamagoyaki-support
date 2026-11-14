<script setup>
import { computed } from 'vue';
import ChatPortrait from './ChatPortrait.vue';
const props = defineProps({ person: Object, kind: String, controller: Object });
const photo = computed(() => typeof props.person.avatar_url === 'string' &&
  /^\/api\/profiles\/[A-Za-z0-9_-]+\/media\/avatar\?v=[a-f0-9]{24}$/.test(props.person.avatar_url) ? props.person.avatar_url : '');
const buttons = computed(() => props.kind === 'incoming' ? [['friend-accept', '接受'], ['friend-reject', '拒絕']] :
  props.kind === 'outgoing' ? [['friend-remove', '取消']] :
    [...(props.person.canFind ? [['friend-find', '查看位置']] : []), ['friend-chat', '聊天'], ['friend-remove', '移除']]);
</script>

<template>
  <article class="friend-row" :data-friend-id="person.id">
    <ChatPortrait as="button" class="avatar profile-link" :name="person.nickname" :url="photo"
      data-action="view-profile" :data-id="person.id" :aria-label="`查看${person.nickname}的個人檔案`" />
    <div class="friend-info">
      <strong>{{ person.nickname }}</strong><small>@{{ person.username }}</small>
      <small>{{ kind === 'incoming' ? '等待你接受' : kind === 'outgoing' ? '等待對方接受' : person.note }}</small>
    </div>
    <div class="friend-actions">
      <button v-for="[action, label] in buttons" :key="action" type="button"
        :data-action="action" :data-id="person.id" :aria-label="`${label} · ${person.nickname}`"
        :disabled="!!controller.state.pending" :aria-busy="controller.state.pending === `${action}:${person.id}`"
        @click.stop="controller.act(action, person.id, $event.currentTarget)">{{ label }}</button>
    </div>
  </article>
</template>
