<script setup>
import { computed } from 'vue';
import ProfileAvatar from './ProfileAvatar.vue';
const props = defineProps({ squads: Array, members: Array, mine: Object, user: Object });
const people = computed(() => [...props.members].filter(person => person.squad === props.mine.squad).sort((a, b) =>
  (b.user === props.user.id) - (a.user === props.user.id) || a.nickname.localeCompare(b.nickname, 'zh-Hant')));
</script>
<template>
  <section class="squad-overview" aria-labelledby="squad-overview-title">
    <div class="squad-overview-heading"><div><div class="eyebrow">MY SQUAD</div><h2 id="squad-overview-title">我的小隊</h2></div><span v-if="mine.squad">{{ people.length }} 位成員</span></div>
    <p class="squad-intro">僅限好友組成小隊。</p>
    <div class="squad-overview-actions"><button type="button" class="button secondary" data-action="create-squad">＋ 建立小隊</button><button type="button" class="button outline" data-action="join-squad">輸入小隊邀請碼</button></div>
    <article v-for="squad in squads.filter(squad => squad.id === mine.squad)" :key="squad.id" class="squad-group is-current" :data-squad-id="squad.id">
      <div class="squad-group-heading"><h3>{{ squad.name }}</h3><span>我的小隊 · {{ people.length }} 人</span></div>
      <div v-if="people.length" class="squad-people" aria-label="已加入成員"><div v-for="person in people" :key="person.user" class="squad-person"><ProfileAvatar :name="person.nickname" :uid="person.user" :url="person.avatar_url" /><div class="squad-person-info"><strong>{{ person.nickname }}{{ person.user === user.id ? '（你）' : '' }}</strong><small>{{ person.online ? '在線' : '離線' }}</small></div></div></div>
      <p v-else class="squad-empty">還沒有成員。</p>
      <div class="squad-group-actions"><button type="button" data-action="squad-chat" :data-id="squad.id">小隊聊天</button><button type="button" data-action="squad-invite">邀請加入小隊</button><button type="button" data-action="leave-squad" :data-id="squad.id">離開小隊</button></div>
    </article>
  </section>
</template>
