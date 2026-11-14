<script setup>
import AppIcon from './AppIcon.vue';
defineProps({
  room: { type: Object, required: true },
  joined: Boolean,
  current: Boolean,
  user: Object,
  venueName: String,
  schedule: String,
  busy: String,
});
defineEmits(['manage', 'preview', 'enter', 'join']);
</script>

<template>
  <article class="expedition-entry" :class="{ 'is-current': current }">
    <div class="expedition-entry-copy">
      <div class="expedition-entry-name">
        <h3>{{ room.name }}</h3>
        <span v-if="current" class="expedition-current">目前遠征隊</span>
      </div>
      <p>{{ venueName }}<span aria-hidden="true"> · </span>{{ schedule }}<template v-if="!joined"> · {{ Number(room.member_count) || 0 }} 人</template></p>
      <small v-if="joined && room.owner === user?.id">我建立的遠征隊</small>
    </div>
    <div class="expedition-entry-buttons">
      <button v-if="joined" type="button" class="button outline" :data-expedition-manage="room.id" @click="$emit('manage', room.id)">管理</button>
      <button type="button" class="button outline" :data-expedition-preview="room.id" @click="$emit('preview', room.id)">查看成員</button>
      <button v-if="joined" type="button" class="button secondary" :data-expedition-enter="room.id" :disabled="!!busy" @click="$emit('enter', room.id)">
        {{ busy === room.id ? '處理中…' : '進入遠征隊' }} <AppIcon name="chevron" />
      </button>
      <button v-else type="button" class="button outline" :data-expedition-join="room.id" :disabled="!!busy" @click="$emit('join', room.id)">
        {{ busy === room.id ? '處理中…' : user ? '加入' : '登入加入' }} <AppIcon name="chevron" />
      </button>
    </div>
    <div v-if="joined && current" class="expedition-entry-actions">
      <button type="button" data-action="invite">邀請隊友</button>
      <button type="button" data-action="leave">退出遠征隊</button>
    </div>
  </article>
</template>
