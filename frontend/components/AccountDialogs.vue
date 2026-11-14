<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ model: Object });
</script>
<template>
  <template v-if="model.kind === 'auth'">
    <h2>{{ model.registering ? '為你的遠征，取個名字。' : '歡迎回到支援隊。' }}</h2><p>用帳號保存你的隊伍、任務與暱稱，換裝置也能繼續同行。</p>
    <div class="form-tabs"><button data-action="auth-login" :class="{ active: !model.registering }">登入</button><button data-action="auth-register" :class="{ active: model.registering }">註冊帳號</button></div>
    <form id="auth-form"><template v-if="model.registering"><label for="auth-nickname">你的暱稱</label><input id="auth-nickname" name="nickname" required maxlength="24" autocomplete="nickname" placeholder="隊友會看到的名字"></template>
      <label for="auth-username">帳號名稱</label><input id="auth-username" name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="例如：tamago_explorer"><p class="field-note">3–32 個英文字母、數字、底線、句點或連字號；開頭需為英數字，不分大小寫。</p>
      <label for="auth-password">密碼</label><input id="auth-password" name="password" type="password" required :minlength="model.registering ? 15 : 1" maxlength="128" :autocomplete="model.registering ? 'new-password' : 'current-password'" :aria-describedby="model.registering ? 'password-note' : undefined">
      <template v-if="model.registering"><p class="field-note" id="password-note">15–128 個字元，可使用中文、空格或一段容易記住的句子。請保存於密碼管理工具。</p><label for="auth-confirm">確認密碼</label><input id="auth-confirm" name="confirm" type="password" required minlength="15" maxlength="128" autocomplete="new-password"></template>
      <button class="text-button password-toggle" type="button" data-action="toggle-password" aria-pressed="false">顯示密碼</button><div class="form-error" role="alert"></div><button class="button primary full" type="submit">{{ model.registering ? '建立帳號並登入' : '登入帳號' }} <AppIcon name="arrow" /></button><p class="field-note">目前使用帳號名稱登入，尚未提供電子郵件驗證或忘記密碼重設。</p>
    </form><button class="button outline full" data-action="app-display">全螢幕／加入主畫面</button>
  </template>
  <template v-else-if="model.kind === 'account' || model.kind === 'settings'">
    <h2>{{ model.user ? `你好，${model.user.nickname}。` : '設定' }}</h2><p v-if="model.user" class="account-username">@{{ model.user.username }}</p>
    <label class="theme-setting"><span><strong>黑夜模式</strong><small>套用至介面與地圖，記住此裝置的選擇</small></span><input type="checkbox" role="switch" aria-label="黑夜模式" data-theme-toggle :checked="model.dark"><span class="theme-switch" aria-hidden="true"></span></label>
    <template v-if="model.user"><form id="profile-form"><label for="profile-nickname">顯示暱稱</label><input id="profile-nickname" name="nickname" required maxlength="24" autocomplete="nickname" :value="model.user.nickname"><p class="field-note">修改暱稱不會改變登入帳號或隊伍歸屬。</p><div class="form-error" role="alert"></div><button class="button secondary full" type="submit">儲存暱稱</button></form><div class="account-divider"></div><button type="button" class="button outline full" data-action="blocked-people">黑名單</button><button v-if="model.user.site_admin" type="button" class="button outline full" data-action="site-account-admin">帳號管理</button></template>
    <button class="button outline full" data-action="app-display">全螢幕／加入主畫面</button><template v-if="model.user"><button class="button outline full" data-action="password-settings">修改密碼</button><button class="button outline full logout-button" data-action="logout">登出這個裝置</button><p class="field-note">登出會停止目前定位分享；遠征隊、任務與地標會保留在帳號中。</p></template><button v-else class="button primary full" data-action="auth-login">登入或註冊帳號</button>
  </template>
  <template v-else-if="model.kind === 'password'"><h2>更新你的密碼。</h2><p>修改成功後，其他裝置會登出，這個裝置會繼續登入。一般定位分享會停止；求助仍依求助任務持續。</p><form id="password-form"><label for="current-password">目前密碼</label><input id="current-password" name="current_password" type="password" required maxlength="128" autocomplete="current-password"><label for="new-password">新密碼</label><input id="new-password" name="new_password" type="password" required minlength="15" maxlength="128" autocomplete="new-password"><p class="field-note">15–128 個字元，可使用中文、空格或完整句子。</p><label for="confirm-password">再次輸入新密碼</label><input id="confirm-password" name="confirm" type="password" required minlength="15" maxlength="128" autocomplete="new-password"><button type="button" class="text-button password-toggle" data-action="toggle-password" aria-pressed="false">顯示密碼</button><div class="form-error" role="alert"></div><button class="button primary full" type="submit">更新密碼</button></form></template>
</template>
