<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ item: Object, task: Boolean, compact: Boolean, pending: Boolean });
</script>
<template>
  <div class="landmark-feedback" :class="{ 'task-feedback': task }" role="group" :aria-label="task ? '任務評價' : '地標有效性評價'">
    <span v-if="!compact">{{ task ? '任務回饋 · 給發布者的支持' : '現場回饋' }}</span>
    <div><button v-for="[value, symbol, label, count] in [[1, 'thumb-up', task ? '讚' : '有效', item.likes || 0], [-1, 'thumb-down', task ? '倒讚' : '無效', item.dislikes || 0]]" :key="value" type="button" :data-action="task ? 'task-vote' : 'pin-vote'" :data-id="item.id" :data-value="value" :aria-pressed="item.my_vote === value" :disabled="!item.can_vote || pending"><AppIcon :name="symbol" /> {{ label }} <b>{{ count }}</b></button></div>
    <template v-if="!compact"><small v-if="task">{{ item.can_vote ? '再點一次可收回；每人一份評價。' : '任務發布者僅查看回饋。' }} 讚＋20 XP，倒讚－5 XP。</small><template v-else><small>{{ item.can_vote ? '再點一次可收回；每人一份回饋。' : '地標建立者僅查看回饋' }}</small><small>有效＋20 XP，無效－5 XP。{{ item.expires ? '無效票較多時自動移除，評價紀錄保留。' : '' }}</small></template></template>
  </div>
</template>
