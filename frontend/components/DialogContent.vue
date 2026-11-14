<script setup>
import AccountDialogs from './AccountDialogs.vue';
import JoinDialogs from './JoinDialogs.vue';
import PublishDialog from './PublishDialog.vue';
import LocationDialogs from './LocationDialogs.vue';
import AppDisplayDialog from './AppDisplayDialog.vue';
import ServiceFrame from './ServiceFrame.vue';
import GroundMessageDialog from './GroundMessageDialog.vue';
defineProps({ model: Object });
const view = kind => ['auth', 'account', 'settings', 'password'].includes(kind) ? AccountDialogs :
  ['join', 'squad', 'invite', 'deleteRoom'].includes(kind) ? JoinDialogs : kind === 'publish' ? PublishDialog :
    ['location', 'helpLocation'].includes(kind) ? LocationDialogs : kind === 'appDisplay' ? AppDisplayDialog : kind === 'ground' ? GroundMessageDialog : ServiceFrame;
</script>
<template><component :is="view(model.kind)" :model="model" /></template>
