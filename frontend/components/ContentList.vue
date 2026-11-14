<script setup>
import ProfileAvatar from './ProfileAvatar.vue';
defineProps({ model: Object });
</script>
<template>
  <template v-if="model.kind === 'reports'">
    <article v-for="item in model.items" :key="item.id" class="report-item" :data-report-id="item.id"><div class="report-author"><ProfileAvatar :name="item.author_name" :uid="item.author" :url="item.author_avatar_url" /><strong>{{ item.author_name }}</strong><time>{{ new Date(item.created * 1000).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</time></div><p>{{ item.body }}</p><template v-if="item.can_delete"><div v-if="model.confirmation === item.id" class="report-remove"><span>刪除此回報？</span><button type="button" :data-report-confirm="item.id" :disabled="!!model.deleting">{{ model.deleting === item.id ? '刪除中…' : '確認刪除' }}</button><button type="button" data-report-cancel :disabled="!!model.deleting">取消</button></div><button v-else type="button" :data-report-remove="item.id" :disabled="!!model.deleting">刪除</button></template></article>
    <p v-if="!model.items.length" class="report-empty">還沒有現場回報。</p><p v-if="model.total > 20" class="report-empty">顯示最新 20 則，共 {{ model.total }} 則回報</p>
  </template>
  <template v-else-if="model.kind === 'review'">
    <article v-for="pin in model.items" :key="pin.id" class="pin-submission"><h3>{{ pin.title }}</h3><p>{{ pin.owner_name }} · {{ pin.expires ? '限時圖釘' : '永久圖釘' }}</p><p v-if="pin.description">{{ pin.description }}</p><p>{{ Number(pin.lat).toFixed(5) }}, {{ Number(pin.lng).toFixed(5) }}</p><div class="pin-submission-actions"><template v-if="model.canReview"><button type="button" class="button secondary" :data-review-id="pin.id" data-decision="approve" :disabled="model.busy || model.loading">核准放置</button><button type="button" class="button outline logout-button" :data-review-id="pin.id" data-decision="reject" :disabled="model.busy || model.loading">拒絕</button></template><button v-else type="button" class="button outline" :data-review-id="pin.id" data-decision="withdraw" :disabled="model.busy || model.loading">撤回送審</button></div></article><p v-if="!model.items.length && !model.loading" class="expedition-preview-empty">目前沒有等待審核的圖釘。</p>
  </template>
  <template v-else-if="model.kind === 'blocked'">
    <div v-for="person in model.items" :key="person.id" class="blocked-person"><strong>{{ person.nickname }}<small class="field-note"> @{{ person.username }}</small></strong><button type="button" class="button outline" :data-unblock="person.id">解除封鎖</button></div><p v-if="!model.items.length" class="field-note">黑名單目前是空的。</p>
  </template>
  <template v-else-if="model.kind === 'squadInvites'">
    <div v-for="person in model.items" :key="person.id" class="squad-invite-person"><ProfileAvatar :name="person.nickname" :uid="person.id" :url="person.avatar_url" /><div><strong>{{ person.nickname }}</strong><small>@{{ person.username }} · {{ person.in_squad ? '同小隊' : person.in_expedition ? '同遠征隊' : '尚未加入此遠征隊' }}</small></div><button type="button" :data-squad-friend="person.id" :aria-label="`${person.nickname} · ${person.label}`" :disabled="model.busy || person.in_squad || person.sent">{{ person.label }}</button></div><p v-if="!model.items.length" class="squad-invite-empty">{{ model.hasFriends ? '沒有符合條件的好友。' : '還沒有已互相接受邀請的好友，先到「好友」加入同行夥伴。' }}</p>
  </template>
</template>
