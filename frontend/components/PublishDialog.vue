<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ model: Object });
</script>
<template>
  <h2>{{ model.fixed ? '在這裡插旗。' : model.task ? '發布一個小小願望。' : '標記地標。' }}</h2><p>{{ model.description }}</p>
  <form id="publish-form"><label for="kind">{{ model.task ? '任務' : '情報' }}類型</label><select id="kind" name="kind"><option v-for="[key, label] in Object.entries(model.types).filter(([key]) => key !== 'message')" :key="key" :value="key">{{ label }}</option></select>
    <label for="title">標題</label><input id="title" name="title" required maxlength="80" :placeholder="model.task ? '例如：35 換狐，現場交換' : '例如：holodori 特典領取處'"><label for="description">補充說明</label><textarea id="description" name="description" maxlength="600" placeholder="辨識方式、數量或現場資訊…"></textarea>
    <label for="hours">有效時間</label><select id="hours" name="hours" :value="String(model.initialHours)"><option v-for="hours in model.task ? [6, 24] : [2, 6, 24, 0]" :key="hours" :value="hours">{{ hours ? hours + ' 小時' : '定期情報點（永久保留）' }}</option></select>
    <div v-if="model.task" id="help-setup" class="help-setup" hidden><strong>! 求助會開啟持續定位</strong><p>這支遠征隊的所有成員都能看到你的即時位置，不需要接取任務。使用自己的 GPS 位置，並持續分享至刪除求助任務。</p><span id="help-coord" role="status">正在取得定位…</span><button type="button" id="help-gps">取得／更新定位</button></div>
    <div class="coordinate-note"><AppIcon name="pin" /> <strong id="coord-label">{{ model.fixed ? '任務旗標位置' : model.task ? '你的任務發布位置' : model.point ? '情報點：選定地點' : '情報點：地圖中心' }}</strong><br><span id="coord-value">{{ model.chosen ? `${model.chosen.lat.toFixed(5)}, ${model.chosen.lng.toFixed(5)}` : '請先取得目前位置' }}</span><template v-if="!model.fixed"><br><button type="button" id="use-position">{{ model.task ? '取得／更新我的位置' : '改用我的目前位置' }}</button></template><p class="field-note">{{ model.fixed ? '旗標保留在這裡；完成、撤回或到期後停止提供任務位置。' : model.task ? '只有接取者能取得此座標。開啟定位可繼續更新；停止即時定位後仍保留任務發布點，撤回任務可停止提供座標。' : '可選擇限時或永久保留；建立者或管理員（隊長）可以刪除。' }}</p></div>
    <div class="form-error" role="alert"></div><button class="button primary full" type="submit">{{ model.task ? '發布任務' : '建立地標' }} <AppIcon name="plus" /></button>
  </form>
</template>
