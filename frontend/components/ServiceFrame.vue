<script setup>
import AppIcon from './AppIcon.vue';
defineProps({ model: Object });
</script>
<template>
  <template v-if="model.kind === 'preview'">
<h2>遠征隊成員</h2><p>{{ model.room.name }}</p><section id="expedition-preview" aria-label="遠征隊成員預覽"><div class="expedition-preview-heading"><strong data-preview-total>載入成員中…</strong><button type="button" data-preview-refresh>重新整理</button></div><p class="expeditions-status" data-preview-status role="status" aria-live="polite"></p><div class="expedition-preview-scroll" tabindex="0" role="region" aria-label="可捲動的成員名單"><div data-preview-list></div><button type="button" data-preview-more hidden>載入更多成員</button></div><button v-if="!model.room.joined" type="button" class="button primary full" data-preview-join disabled>加入遠征隊</button></section>
  </template>
  <template v-if="model.kind === 'members'">
<h2>管理遠征隊成員</h2><p data-expedition-room-name>{{ model.room.name }}</p><section id="expedition-members"><details class="expedition-rename" data-expedition-rename hidden><summary>變更遠征隊名稱</summary><form id="expedition-rename-form"><label for="expedition-rename-name">遠征隊名稱</label><input id="expedition-rename-name" name="name" type="text" required maxlength="60" :value="model.room.name" aria-describedby="expedition-rename-note"><p class="field-note" id="expedition-rename-note">1–60 個字</p><p class="form-error" role="alert"></p><button type="submit" class="button secondary">儲存名稱</button></form></details><p class="field-note">團長可指派副團長及移除成員；副團長可移除一般成員。</p><div class="expedition-preview-heading"><strong data-member-total>載入中…</strong><button type="button" data-member-refresh>重新整理</button></div><p class="expeditions-status" data-member-status role="status" aria-live="polite"></p><div class="expedition-preview-scroll" role="region" tabindex="0" aria-label="成員管理名單"><div data-member-list></div><button type="button" data-member-more hidden>載入更多成員</button></div></section>
  </template>
  <template v-if="model.kind === 'roomSettings'">
<h2>遠征隊管理</h2><p data-room-name>{{ model.room.name }}</p><section id="expedition-settings"><p data-room-status class="expeditions-status" role="status" aria-live="polite">正在載入…</p><button type="button" data-room-retry hidden>重新載入</button><div data-room-content></div></section>
  </template>
  <template v-if="model.kind === 'reviewFrame'">
<h2>圖釘送審</h2><p>{{ model.room.name }}</p><section id="pin-review"><div class="expedition-preview-heading"><strong data-review-total>正在載入…</strong><button type="button" data-review-refresh>重新整理</button></div><p class="expeditions-status" role="status" data-review-status></p><div class="pin-review-scroll" tabindex="0" role="region" aria-label="圖釘送審名單"><div data-review-list></div><button class="button outline full" type="button" data-review-more hidden>載入更多</button></div></section>
  </template>
  <template v-if="model.kind === 'admin'">
<h2>帳號管理</h2><section id="site-account-admin"><p class="site-admin-count" data-admin-count>正在載入註冊人數…</p><form id="site-admin-search"><label for="site-admin-query">搜尋帳號或暱稱</label><div class="site-admin-search"><input id="site-admin-query" name="search" type="search" maxlength="80" placeholder="輸入帳號或暱稱"><button class="button secondary" type="submit">搜尋</button></div></form><div class="expedition-preview-heading"><strong data-admin-matched></strong><button type="button" data-admin-refresh>重新整理</button></div><p class="expeditions-status" data-admin-status role="status" aria-live="polite"></p><div class="site-admin-scroll" role="region" aria-label="註冊帳號名單" tabindex="0"><div data-admin-list></div><button class="button outline full" type="button" data-admin-more hidden>載入更多帳號</button></div></section>
  </template>
  <template v-if="model.kind === 'blockedFrame'">
<h2>黑名單</h2><p>已封鎖好友邀請、私訊及彼此的位置分享。解除後不會自動恢復好友關係。</p><section id="blocked-people"><p role="status" data-block-status>正在載入…</p><button type="button" class="button outline" data-block-retry>重新整理</button><div class="blocked-list" data-block-list></div></section>
  </template>
  <template v-if="model.kind === 'admission'">
<h2>輸入遠征隊密碼</h2><form id="room-admission-form"><label for="room-admission-password">加入密碼</label><input id="room-admission-password" name="password" type="password" required maxlength="128" autocomplete="off"><p class="form-error" role="alert"></p><button class="button primary full" type="submit">加入遠征隊</button></form>
  </template>
  <template v-if="model.kind === 'owned'">
<h2>我建立的遠征隊</h2><p>即使已退出，仍可在這裡刪除自己建立的隊伍。</p><div id="owned-rooms" role="status">正在載入…</div>
  </template>
  <template v-if="model.kind === 'reportFrame'">
<div class="report-heading"><h3>留言板</h3><button type="button" data-report-refresh>更新</button></div><form class="report-form"><label for="landmark-report-text" class="visually-hidden">回報目前狀況</label><textarea id="landmark-report-text" name="body" rows="2" maxlength="600" required placeholder="回報排隊、人潮或領取狀況…"></textarea><button type="submit" class="button secondary">發布回報</button></form><p class="report-status" role="status" aria-live="polite"></p><div class="report-feed"></div>
  </template>
  <template v-if="model.kind === 'squadInviteFrame'">
<h3>從好友邀請</h3><p class="field-note">邀請會傳送到好友私訊，對方開啟連結並確認後才加入。</p><div class="squad-invite-filters"><div><label for="squad-friend-query">搜尋好友</label><input id="squad-friend-query" type="search" autocomplete="off" maxlength="80" placeholder="暱稱或帳號" disabled></div><div><label for="squad-friend-filter">篩選</label><select id="squad-friend-filter" disabled><option value="all">全部好友</option><option value="available">可邀請的好友</option><option value="expedition">同遠征隊好友</option></select></div></div><p class="squad-invite-status" role="status" aria-live="polite"></p><button type="button" class="button outline squad-invite-retry" hidden>重新載入好友</button><div class="squad-invite-list"></div>
  </template>
  <template v-if="model.kind === 'personFrame'">
<div class="dialog-top"><div class="eyebrow">成員選項</div><button type="button" class="icon-button" data-person-close aria-label="關閉成員選項" autofocus>×</button></div><h2 id="expedition-person-title">正在載入…</h2><p class="expedition-person-status" role="status" aria-live="polite"></p><div data-person-options></div><div data-person-confirm></div>
  </template>
  <template v-if="model.kind === 'help'">
<h2>和熟悉的人，一起會合。</h2><ol class="help-list"><li><strong>定位分享：</strong>主動開啟定位後，預設分享給好友與目前小隊；也可選僅供本機、僅好友、僅小隊或任務接取者。</li><li><strong>加入好友：</strong>到「好友」輸入對方帳號，雙方接受後即可選擇與好友分享，不必加入隊伍。</li><li><strong>選擇遠征隊：</strong>登入後，在場館列表加入隊伍。一般遠征隊成員看不到個別定位，可在隊內發布任務與地標。</li><li><strong>一般任務：</strong>記錄目前位置，任務發布點只有接取者能取得。停止即時定位不會移除發布點，撤回任務可停止提供。</li><li><strong>發布求助：</strong>須允許 GPS，位置會分享給求助所在遠征隊的所有成員，地圖顯示紅色驚嘆號；刪除最後一個求助後才停止持續分享。</li><li><strong>前往會合：</strong>好友、已分享位置的小隊成員及已接任務，都可在尋人視窗查看方向與直線距離。</li><li><strong>地標篩選：</strong>左側可勾選追蹤者的地標、按讚的地標、留言過的地標；留言或按讚會自動追蹤作者。</li><li><strong>長按地圖：</strong>在選定位置插旗發布任務，或建立限時／永久地標。也可按地圖右側地標按鈕選擇地圖中心。</li><li><strong>管理情報點：</strong>為同隊夥伴標記攤位、配布、洗手間或集合點；只有建立者或管理員（遠征隊隊長）能刪除。</li></ol><p class="field-note">切換分享對象會先撤回原本的即時位置。停止定位或登出會立即撤回即時座標。超過 2 分鐘未更新會標示「最後位置」，滿 15 分鐘未更新後隱藏。情報點與任務發布點依原本權限保留。</p><p class="field-note">網頁不能跨其他 App 懸浮；切到背景會保留最後位置 15 分鐘，手機系統可能暫停 GPS 更新；回到網頁會重新定位。距離是直線距離，室內 GPS 可能不準確。可自由移動地圖，或使用場館選單快速切換地點。</p><button class="button primary full" data-action="close">知道了 <AppIcon name="arrow" /></button>
  </template>
</template>
