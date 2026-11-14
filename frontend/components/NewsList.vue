<script setup>
import ChatPortrait from './ChatPortrait.vue';
defineProps({ model: Object });
</script>
<template>
  <template v-if="model.kind === 'invitations'">
    <article v-for="person in model.items" :key="person.id" class="news-invite"><div class="news-invite-person"><ChatPortrait class="news-invite-avatar" :name="person.nickname" :url="person.avatar_url" /><div><strong>{{ person.nickname }}</strong><small>@{{ person.username }}</small></div></div><p>想邀請你成為好友。</p><div class="news-invite-actions"><button v-for="[response, label] in [['accept', '接受邀請'], ['reject', '拒絕']]" :key="response" type="button" class="button" :class="response === 'accept' ? 'secondary' : 'outline'" :data-news-invite="person.id" :data-news-response="response" :disabled="model.busy.includes(person.id) || !!model.error">{{ label }}</button></div></article>
    <p v-if="!model.items.length" class="news-empty">目前沒有待處理的好友邀請。</p>
  </template>
  <template v-else>
    <article v-for="item in model.items" :key="item.id" class="news-item"><div class="news-item-meta"><span class="news-tag" :class="item.type">{{ item.type === 'update' ? '網站更新' : '活動公告' }}</span><time :datetime="item.published_at">{{ item.published_at.replaceAll('-', ' / ') }}</time><span v-if="item.unread" class="news-new">新公告</span></div><h3>{{ item.title }}</h3><p v-if="item.eventDate" class="news-event-date">活動日期 · {{ item.event_date }}</p><p v-for="(paragraph, index) in item.body" :key="index">{{ paragraph }}</p><a v-if="item.safeLink" class="news-link" :href="item.safeLink" target="_blank" rel="noopener noreferrer">{{ item.link?.label || '查看詳情' }}</a></article>
    <p v-if="model.empty" class="news-empty">{{ model.empty }}</p>
  </template>
</template>
