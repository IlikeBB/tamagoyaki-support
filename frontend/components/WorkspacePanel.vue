<script setup>
import AppIcon from './AppIcon.vue';
import ProfileAvatar from './ProfileAvatar.vue';
import FeedbackControls from './FeedbackControls.vue';
import SquadPanel from './SquadPanel.vue';
defineProps({ context: Object });
</script>
<template>
  <template v-if="context.tab === 'tasks'">
    <article v-for="(task, index) in context.tasks" :key="task.id" class="quest">
      <div class="quest-top"><span class="tag" :class="task.kind">{{ context.types[task.kind] }}</span><span>{{ task.age }}</span></div>
      <h2>{{ task.title }}</h2><p>{{ task.description || '接取任務後，取得發布者位置並前往會合。' }}</p><p class="field-note">{{ task.privateNote }}</p>
      <div class="quest-bottom"><span class="person"><span v-if="context.demo" class="avatar" :class="['', 'orange', 'blue'][index % 3]">{{ [...(task.owner_name || context.user.nickname)][0] }}</span><ProfileAvatar v-else :name="task.owner_name || context.user.nickname" :uid="task.owner" :url="task.owner_avatar_url" :index="index" />{{ task.owner_name || context.user.nickname }}</span>
        <button class="accept" :data-action="task.action" :data-id="task.id" :disabled="!task.help_active && !task.own && !task.accepted && task.status === 'accepted'">{{ task.caption }} <AppIcon :name="task.accepted ? 'location' : 'arrow'" /></button></div>
      <div v-if="task.help_active && task.own" class="quest-actions"><button data-action="cancel" :data-id="task.id">刪除求助</button></div>
      <div v-else-if="!task.help_active && (task.own || task.accepted)" class="quest-actions"><button data-action="complete" :data-id="task.id">標記完成</button><button :data-action="task.own ? 'cancel' : 'release'" :data-id="task.id">{{ task.own ? '撤回任務' : '放棄接取' }}</button></div>
      <p v-if="task.status === 'accepted'" class="field-note">接取者：{{ task.assignee_name || '隊友' }}</p>
      <FeedbackControls v-if="!context.demo" :item="task" task :pending="context.taskVotes.includes(task.id)" />
    </article>
    <div v-if="!context.tasks.length" class="empty"><AppIcon name="spark" /><strong>{{ context.query ? '沒有符合的任務' : context.demo ? '目前沒有任務' : '今天的第一個願望，由你發布。' }}</strong>{{ context.query ? '換個關鍵字試試看。' : context.demo ? '在場館選擇加入遠征隊，再發布任務。' : '按右上角 ＋，發布交換、懸賞或配布物。' }}</div>
  </template>
  <template v-else-if="context.tab === 'members'">
    <SquadPanel v-if="!context.demo" :squads="context.squads" :members="context.allMembers" :mine="context.mine" :user="context.user" />
    <div class="subheading">{{ context.allMembers.length }} 位遠征夥伴</div>
    <div v-for="(member, index) in context.members" :key="member.user" class="member-row"><span v-if="context.demo" class="avatar">{{ [...member.nickname][0] }}</span><ProfileAvatar v-else :name="member.nickname" :uid="member.user" :url="member.avatar_url" :index="index" /><div class="member-info"><strong>{{ member.nickname }}{{ member.user === context.user.id ? '（你）' : '' }}</strong><small>{{ context.owner === member.user ? '團長 · ' : member.deputy ? '副團長 · ' : '' }}{{ member.muted ? '已禁言 · ' : '' }}{{ member.online ? '在線' : '離線' }} · {{ member.shares ? '已分享給好友／小隊' : '未分享即時位置' }}</small></div><button v-if="member.targetId" data-action="task-target" :data-id="member.targetId">尋找</button><button v-if="!context.demo && member.user !== context.user.id" type="button" class="member-options-button" data-action="member-options" :data-id="member.user" :aria-label="`${member.nickname}的成員選項`">⋯</button></div>
  </template>
  <template v-else>
    <button v-if="!context.demo" type="button" class="button outline pins-review-button" data-action="pin-submissions">{{ context.manager ? '審核圖釘' : '我的送審圖釘' }}</button>
    <div class="intel-create-actions" role="group" aria-label="建立情報點"><button type="button" class="button secondary" data-action="publish-intel" data-lifetime="temporary"><AppIcon name="plus" /> 臨時情報點</button><button type="button" class="button outline" data-action="publish-intel" data-lifetime="permanent"><AppIcon name="pin" /> 定期情報點</button></div>
    <p class="field-note">此處可瀏覽隊內地標；地圖依左側追蹤／留言／按讚條件顯示。</p>
    <article v-for="pin in context.pins" :key="pin.id" class="pin-row"><div class="pin-row-head"><span class="pin-row-icon" aria-hidden="true"><AppIcon :name="pin.kind === 'message' ? 'message' : pin.kind === 'shop' ? 'shop' : 'pin'" /></span><div class="pin-row-info"><h2>{{ pin.title }}</h2><p>{{ context.pinTypes[pin.kind] }} · {{ pin.expires ? '臨時情報點' : '定期情報點' }} · {{ pin.owner_name || context.user.nickname }}</p></div><div v-if="!context.demo" class="pin-author" title="查看發布者檔案"><ProfileAvatar :name="pin.owner_name || context.user.nickname" :uid="pin.owner" :url="pin.owner_avatar_url" /></div></div>
      <p v-if="pin.description" class="pin-row-description">{{ pin.description }}</p>
      <div class="pin-row-footer"><div class="pin-row-actions"><button type="button" data-action="pin-target" :data-id="pin.id" :aria-label="`在地圖上尋找 ${pin.title}`">地圖 ↗</button><button v-if="pin.can_delete" type="button" class="delete-pin" data-action="delete-pin" :data-id="pin.id" :disabled="context.deleting.includes(pin.id)" :aria-busy="context.deleting.includes(pin.id)">{{ context.deleting.includes(pin.id) ? '刪除中…' : '刪除' }}</button></div><FeedbackControls :item="pin" compact :pending="context.pinVotes.includes(pin.id)" /></div>
    </article>
  </template>
</template>
