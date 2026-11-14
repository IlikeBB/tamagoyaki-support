<script setup>
import ExpeditionEntry from './ExpeditionEntry.vue';
defineProps({
  rooms: { type: Array, required: true },
  context: { type: Object, required: true },
  controller: { type: Object, required: true },
  joined: Boolean,
  loading: Boolean,
  error: String,
  query: String,
  busy: String,
});
</script>

<template>
  <template v-if="joined && !context.user">
    <div class="expeditions-empty"><strong>登入後查看你的遠征隊</strong><p>已加入的隊伍會顯示在這裡。</p></div>
    <button type="button" class="button primary" data-expedition-login @click="controller.actions.login()">登入或註冊</button>
  </template>
  <div v-else-if="error" class="expeditions-empty">
    <strong>{{ joined ? '無法載入我的遠征隊' : '暫時無法載入遠征隊' }}</strong><p>{{ error }}</p>
  </div>
  <div v-else-if="loading && (!joined || !context.rooms.length)" class="expeditions-skeleton" aria-hidden="true"></div>
  <template v-else-if="rooms.length">
    <ExpeditionEntry v-for="room in rooms" :key="room.id" :room="room"
      :joined="joined || context.rooms.some(item => item.id === room.id)" :current="context.current === room.id"
      :user="context.user" :venue-name="context.venues.find(venue => venue.id === room.venue)?.name || room.venue"
      :schedule="controller.actions.schedule(room)" :busy="busy"
      @manage="controller.manage($event)" @preview="controller.preview($event)"
      @enter="controller.admit($event, true)" @join="controller.admit($event, false)" />
  </template>
  <div v-else class="expeditions-empty">
    <strong>{{ query ? '沒有符合的遠征隊' : joined ? '尚未加入遠征隊' : '這個場館還沒有遠征隊' }}</strong>
    <p>{{ query ? '換個名稱或會場試試看。' : joined ? '到「加入遠征隊」找同行夥伴，或用邀請碼加入。' : '可以建立一支，讓同場的夥伴加入。' }}</p>
  </div>
</template>
