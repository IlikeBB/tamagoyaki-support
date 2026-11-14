<script setup>
import { computed } from 'vue';
import FriendRow from './FriendRow.vue';
const props = defineProps({ controller: { type: Object, required: true } });
const state = props.controller.state;
const people = computed(() => state.friends.filter(person =>
  [person.nickname, person.username].some(value => value?.toLocaleLowerCase().includes(state.query))));
</script>

<template>
  <div v-if="!state.user" class="empty">
    <strong>和好友，隨時會合。</strong>
    <p>登入後用帳號名稱加入好友，不必加入遠征隊或小隊。</p>
    <button type="button" class="button dark" data-action="account">登入或註冊</button>
  </div>
  <div v-else id="friends-panel">
    <div class="friends-intro">
      <p>你的帳號：<b>@{{ state.user.username }}</b></p>
      <p>成為好友後，對方開啟位置分享就會顯示在地圖上。</p>
    </div>
    <form id="friend-invite-form" :aria-busy="state.inviting" @submit.prevent="controller.invite()">
      <label for="friend-username">加入好友</label>
      <div class="friend-invite-fields">
        <input id="friend-username" v-model="state.username" name="username" autocomplete="off"
          autocapitalize="none" spellcheck="false" required minlength="3" maxlength="32"
          pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" placeholder="輸入好友的帳號名稱"
          aria-describedby="friend-invite-error" :aria-invalid="!!state.inviteError">
        <button class="button dark" type="submit" :disabled="state.inviting">{{ state.inviting ? '送出中…' : '送出邀請' }}</button>
      </div>
      <div id="friend-invite-error" class="form-error" role="alert">{{ state.inviteError }}</div>
    </form>
    <div class="friend-sharing">
      <div><strong>我的好友位置分享</strong><small id="friend-share-status">{{ state.shareStatus }}</small></div>
      <button id="friend-share-toggle" type="button" class="button outline" role="switch"
        :aria-checked="state.sharing" :disabled="!!state.pending" data-action="friend-share"
        @click.stop="controller.act('friend-share', null, $event.currentTarget)">{{ state.sharing ? '關閉分享' : '開啟分享' }}</button>
    </div>
    <p id="friend-sync-status" class="friend-sync-status" role="status">{{ state.syncStatus }}</p>
    <p v-if="state.actionError" class="form-error" role="alert">{{ state.actionError }}</p>
    <div id="friend-requests">
      <template v-for="section in [{ key: 'incoming', title: '收到的邀請' }, { key: 'outgoing', title: '送出的邀請' }]" :key="section.key">
        <h2 v-if="state[section.key].length" class="friend-section-title">{{ section.title }}</h2>
        <FriendRow v-for="person in state[section.key]" :key="person.id" :person="person" :kind="section.key" :controller="controller" />
      </template>
    </div>
    <div id="friend-list">
      <h2 class="friend-section-title">我的好友 · {{ state.friends.length }}</h2>
      <FriendRow v-for="person in people" :key="person.id" :person="person" kind="friend" :controller="controller" />
      <p v-if="!people.length" class="field-note">{{ state.query ? '沒有符合的好友。' : '輸入好友帳號，邀請熟悉的夥伴。' }}</p>
    </div>
  </div>
</template>
