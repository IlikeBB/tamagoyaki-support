<script setup>
defineProps({ model: Object });
const iosSteps = ['用 Safari 開啟本站，按「分享」。', '選擇「加入主畫面」；若出現「打開為網頁 App」，請保持開啟。', '按「加入」，之後點主畫面的玉子燒圖示開啟。'];
const androidSteps = ['用 Chrome 或 Edge 開啟本站。', '開啟瀏覽器選單，選「安裝應用程式」、「安裝並建立捷徑」或「加入主畫面」。', '完成安裝後，從主畫面的玉子燒圖示開啟。'];
</script>
<template>
  <h2>用 App 模式開啟。</h2><p>{{ model.installed ? '目前已在 App 模式中。' : '加入主畫面後，從 App 圖示開啟就不會顯示瀏覽器網址列。' }}</p><button v-if="!model.installed && model.installPrompt" class="button primary full" data-action="app-install">安裝到主畫面</button><button v-if="model.fullscreen" class="button full" :class="model.installPrompt ? 'outline' : 'primary'" data-action="app-fullscreen">{{ model.fullscreenActive ? '離開全螢幕' : '立即全螢幕顯示' }}</button>
  <div v-if="!model.installed" class="app-install-guide"><h3>{{ model.ios ? 'iPhone／iPad' : 'Android／電腦' }}</h3><ol class="app-install-steps"><li v-for="step in model.ios ? iosSteps : androidSteps" :key="step">{{ step }}</li></ol><details><summary>{{ model.ios ? 'Android／電腦的安裝方式' : 'iPhone／iPad 的安裝方式' }}</summary><ol class="app-install-steps"><li v-for="step in model.ios ? androidSteps : iosSteps" :key="step">{{ step }}</li></ol></details></div><p class="field-note">一般瀏覽器分頁無法自動隱藏網址列。手機系統的狀態列與全螢幕支援依裝置而定。</p><button class="button outline full" data-action="help">查看網站使用說明</button>
</template>
