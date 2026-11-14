<script setup>
defineProps({ model: Object });
</script>
<template>
  <label for="finder-person">尋找對象</label><select id="finder-person" :value="model.selectedId || ''" :disabled="!model.ready || !model.tasks.length"><option value="">選擇好友、成員或任務</option><option v-for="item in model.tasks" :key="item.id" :value="item.id">{{ item.owner_name }} · {{ item.title }}</option></select>
  <div id="finder-empty" class="finder-empty" :hidden="!!model.target"><p id="finder-empty-message" role="status">{{ model.message }}</p><button id="finder-empty-action" class="finder-primary" :hidden="!!model.target || !!model.tasks.length">{{ model.emptyAction }}</button></div>
  <div id="finder-detail" :hidden="!model.target"><strong id="finder-name" class="finder-name">{{ model.target?.owner_name }}</strong><p id="finder-task" class="finder-task">{{ model.target?.title }}</p><p id="finder-source" class="finder-source" role="status">{{ model.source }}</p>
    <div id="finder-guidance" class="finder-guidance" :hidden="!model.valid"><span id="finder-arrow" class="finder-arrow" aria-hidden="true" :style="{ transform: model.valid ? `rotate(${model.relative}deg)` : '' }"><svg class="direction-needle" viewBox="0 0 24 24"><path class="needle-main" d="M12 2 21 21 12 16 3 21Z" /><path class="needle-highlight" d="M12 2V16L3 21Z" /></svg></span><div><strong id="finder-distance" class="finder-distance">{{ model.distance }}</strong><span id="finder-direction" class="finder-direction">{{ model.direction }}</span></div></div>
    <div id="finder-needs-location" class="finder-needs-location" :hidden="model.valid"><p>開啟你的定位，才能計算方向與距離。</p><button id="finder-location" class="finder-primary">開啟／更新我的定位</button></div><p id="finder-accuracy" class="finder-accuracy">{{ model.accuracy }}</p><div class="finder-actions"><button id="finder-compass">啟用指南針</button><button id="finder-map">在地圖上查看</button></div><p class="finder-note">直線方向與距離，請依現場動線通行。拖曳左上角可移動視窗。</p>
  </div>
</template>
