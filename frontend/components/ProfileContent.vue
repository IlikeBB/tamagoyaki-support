<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ profile: Object, editing: Boolean, draft: Object, tab: String, items: Array, total: Number, next: [Number, String], content: Object, historyBusy: String });
const date = (value, end) => value ? end && end !== value ? `${value} ～ ${end}` : value : '未指定日期';
const expiry = item => item.source === 'report' ? item.parent_removed ? '地標已移除' : !item.active ? '地標已到期' : '現場回報' :
  !item.active ? '已到期' : item.expires ? '到期：' + new Intl.DateTimeFormat('zh-TW', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.expires * 1000)) : '永久保留';
const kinds = { trade: '交換', bounty: '懸賞', giveaway: '配布', help: '求助', dining: '聚餐' };
</script>

<template>
  <template v-if="profile">
    <div class="profile-banner"><img :src="profile.banner_url || '/static/profile-banner.svg'" :alt="profile.banner_url ? '個人橫幅' : ''">
      <button v-if="editing" data-profile-action="photo" data-slot="banner">更換橫幅</button></div>
    <div class="profile-identity"><div class="profile-portrait"><span>{{ [...(profile.nickname || '友')][0] }}</span>
      <img v-if="profile.avatar_url" :src="profile.avatar_url" :alt="`${profile.nickname}的頭貼`" data-profile-image>
      <button v-if="editing" data-profile-action="photo" data-slot="avatar" aria-label="更換頭貼">＋</button></div>
      <div class="profile-name"><h3>{{ profile.nickname }}</h3><p>@{{ profile.username }}</p></div></div>
    <p class="profile-bio">{{ profile.bio || '每一段遠征，都留下一點回憶。' }}</p>
    <form v-if="editing" id="profile-details-form" class="profile-details">
      <label for="profile-name-input">暱稱</label><input id="profile-name-input" name="nickname" maxlength="24" required :value="draft?.nickname ?? profile.nickname">
      <label for="profile-bio-input">簡介</label><textarea id="profile-bio-input" name="bio" maxlength="160" rows="3" placeholder="分享你喜歡的活動，或容易認出的特徵。" :value="draft?.bio ?? profile.bio ?? ''"></textarea>
      <p class="field-note">頭貼與橫幅在裁切確認後立即更新。</p>
      <div class="profile-photo-actions"><button type="button" data-profile-action="removeAvatar" :disabled="!profile.avatar_url">移除頭貼</button><button type="button" data-profile-action="removeBanner" :disabled="!profile.banner_url">移除橫幅</button></div>
      <button type="submit" class="button primary full">儲存個人檔案</button>
    </form>
    <template v-else>
      <div class="profile-tabs" :class="{ 'has-management': profile.own }" role="group" aria-label="個人紀錄">
        <button v-for="[key, label] in [['wall', '遠征隊牆'], ...(profile.own ? [['tasks', '我發布的任務'], ['landmarks', '我的地標'], ['messages', '我的留言']] : [])]" :key="key" data-profile-action="tab" :data-tab="key" :aria-pressed="tab === key">{{ label }}</button>
      </div>
      <section id="profile-records" aria-live="polite">
        <template v-if="items">
          <template v-if="tab === 'wall'">
            <p class="profile-record-note">{{ total }} 段遠征回憶 · 私人隊伍依權限顯示</p>
            <article v-for="item in items" :key="item.id" class="profile-wall-card">
              <span class="profile-wall-venue"><AppIcon name="ticket" /> {{ item.venue_name }}</span><h4>{{ item.name }}</h4>
              <p>{{ date(item.event_date, item.event_end_date) }} · {{ item.removed ? '遠征隊已刪除' : item.participating ? '參加中' : '曾經參加' }}</p>
              <button v-if="item.can_enter" data-profile-action="room" :data-id="item.id">前往遠征隊 <AppIcon name="arrow" /></button>
              <button v-if="item.can_delete" class="profile-room-delete" data-profile-action="remove-room" :data-id="item.id">刪除遠征隊</button>
              <template v-if="item.can_remove"><button class="profile-history-remove" data-profile-action="remove-history" :data-id="item.id" :aria-label="`從展示牆移除 ${item.name} 的紀錄`" :disabled="!!historyBusy">{{ historyBusy === item.id ? '移除中…' : '移除紀錄' }}</button><small class="profile-history-note">只移除自己的展示紀錄；再次加入這支遠征隊時會重新顯示。</small></template>
            </article>
            <div v-if="!items.length" class="profile-empty"><AppIcon name="ticket" /><strong>還沒有可顯示的遠征紀錄</strong><p>加入遠征隊後，這裡會留下你的場次回憶。</p></div>
          </template>
          <template v-else>
            <p class="profile-record-note">{{ total }} 筆{{ tab === 'tasks' ? '進行中的任務' : (tab === 'messages' ? '留言' : '地標') + ' · 僅本人可管理' }}</p>
            <article v-for="item in items" :key="`${item.source || 'pin'}:${item.id}`" class="profile-content-card" :data-content-id="item.id">
              <div class="profile-content-heading"><span><AppIcon :name="tab === 'tasks' ? 'flag' : tab === 'messages' ? 'message' : 'pin'" /></span><h4>{{ item.title }}</h4></div>
              <p class="profile-content-meta">{{ item.room_name }} · {{ date(item.event_date, item.event_end_date) }}</p>
              <p v-if="item.description" class="profile-content-copy">{{ item.description }}</p>
              <div class="profile-content-status"><span v-if="tab === 'tasks'">{{ kinds[item.kind] || '任務' }} · {{ item.help_active ? '求助中' : item.status === 'accepted' ? '已有人接取' : '等待接取' }}</span>
                <template v-else><span>{{ tab === 'messages' ? item.source === 'report' ? '地標回報' : '地面留言' : item.expires ? '臨時情報點' : '定期情報點' }} · {{ expiry(item) }}</span><span v-if="item.source !== 'report'"><AppIcon name="thumb-up" /> {{ item.likes }} · <AppIcon name="thumb-down" /> {{ item.dislikes }}</span></template></div>
              <div class="profile-content-actions">
                <button v-if="item.can_view" type="button" :data-profile-action="tab === 'tasks' ? 'task-room' : 'pin'" :data-room="item.expedition" :data-id="item.parent_pin || item.id">{{ tab === 'tasks' ? '前往任務看板' : '在地圖上查看' }}</button>
                <button v-if="tab !== 'tasks' && content.confirmation !== item.id" type="button" class="profile-content-delete" data-profile-action="remove-content" :data-id="item.id" :disabled="!!content.busy">刪除{{ tab === 'messages' ? '留言' : '地標' }}</button>
              </div>
              <div v-if="tab !== 'tasks' && content.confirmation === item.id" class="profile-content-confirm" role="group" :aria-label="`確認刪除${item.title}`"><p>確定刪除這筆{{ tab === 'messages' ? '留言' : '地標' }}？評價與 XP 紀錄會保留。</p><div><button type="button" class="profile-content-delete" data-profile-action="confirm-content" :data-id="item.id" :disabled="!!content.busy">{{ content.busy === item.id ? '刪除中…' : '確認刪除' }}</button><button type="button" data-profile-action="cancel-content" :disabled="!!content.busy">取消</button></div></div>
            </article>
            <div v-if="!items.length" class="profile-empty"><AppIcon :name="tab === 'tasks' ? 'flag' : tab === 'messages' ? 'message' : 'pin'" /><strong>目前沒有{{ tab === 'tasks' ? '進行中的任務' : '可管理的' + (tab === 'messages' ? '留言' : '地標') }}</strong></div>
          </template>
        </template>
      </section>
      <button id="profile-more" class="button outline profile-more" data-profile-action="more" :hidden="next == null">載入更多</button>
    </template>
  </template>
</template>
