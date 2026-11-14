<script setup>
import AppIcon from './AppIcon.vue';
import SmallControls from './SmallControls.vue';
import { computed, provide, watch } from 'vue';
import { useApplication } from '../composables/useApplication.js';
const props=defineProps({ onApplication: Function });
const app=useApplication(), state=app.state, ui=app.ui;
provide('application',app);
props.onApplication?.(app);
const names={tasks:['QUEST BOARD','現場的願望，現場實現。'],members:['PARTY MEMBERS','一起遠征，位置自己決定。'],friends:['FRIENDS',''],pins:['TEAM INTELLIGENCE','']};
const panel=computed(()=>names[state.tab]);
const accountPhoto=computed(()=>state.authenticated&&!ui.accountPhotoFailed&&state.user.avatar_url);
watch(()=>state.user.avatar_url,()=>ui.accountPhotoFailed=false);
const placeholders={friends:'搜尋好友暱稱或帳號…',tasks:'找交換、配布物、或一點幫忙…',members:'找你的遠征夥伴…',pins:'找攤位、商店、或集合點…'};
</script>

<template>
<div id="tamago-app" style="display:contents" data-application="vue" :data-map-provider="ui.mapProvider" :data-map-zoom="ui.mapZoom" @click="app.handleClick">
<a class="skip-link" :href="ui.expeditionsOpen?'#expeditions-main':'#panel-content'">跳到遠征面板</a>
  <header class="app-header">
    <a class="brand" href="/" aria-label="玉子燒支援隊首頁"><img src="/static/icon.svg" alt="" width="42" height="42"><span><strong>玉子燒支援隊<span class="beta">BETA</span></strong><small>TAMAGOYAKI SUPPORT</small></span></a>
    <div class="header-note"><span class="tiny-spark">✦</span> 讓每一次遠征，都找得到彼此。</div>
    <div class="header-actions"><button class="icon-button" id="chat-launcher" data-action="chat" :aria-label="ui.chatUnread?'訊息，'+ui.chatUnread+' 則未讀':'訊息'" title="好友私訊／遠征隊／小隊群聊"><AppIcon name="message" /><span id="chat-unread" :hidden="!ui.chatUnread">{{ui.chatUnread>99?'99+':String(ui.chatUnread)}}</span></button><button class="icon-button" data-action="app-display" aria-label="全螢幕與加入主畫面" title="全螢幕／加入主畫面">⛶</button><button class="button outline account-button" id="account-button" :class="{'has-avatar':!!accountPhoto}" :aria-label="state.authenticated?'個人檔案：'+state.user.nickname:'登入或註冊帳號'" data-action="account"><img id="account-avatar" alt="" :src="accountPhoto || undefined" :hidden="!accountPhoto" data-profile-image @error="ui.accountPhotoFailed=true"><span id="account-label">{{ state.authenticated ? state.user.nickname : '登入' }}</span><span id="account-news-unread" class="news-unread" aria-hidden="true" :hidden="!state.authenticated||!(ui.newsUnread||ui.newsRequests)"></span></button><button class="button primary" data-action="friends-preview" aria-label="好友"><AppIcon name="heart" /><span id="join-label">好友</span></button><button type="button" id="settings-launcher" class="news-launcher" data-action="settings" aria-label="帳號設定">設定</button></div>
  </header>
  <div class="workspace" :class="{ 'panel-open': ui.panelOpen }">
    <aside class="sidebar" :class="{ 'without-room-context': ['tasks','friends'].includes(state.tab) }">
      <div class="sidebar-room-context" :hidden="['tasks','friends'].includes(state.tab)">
      <div class="eyebrow">YOUR EXPEDITION</div>
      <button class="expedition-switch" data-action="rooms" aria-label="切換遠征隊"><span class="venue-icon"><AppIcon name="ticket" /></span><span><strong id="room-name">{{ state.room?.name || '尚未加入遠征隊' }}</strong><small id="room-date">{{ ui.roomDate || '建立或加入遠征隊，和夥伴一起出發' }}</small></span><AppIcon name="chevron" /></button>
      <div class="connection-row"><span id="connection" class="status" :class="{offline:!state.online}"><i></i>{{ui.connectionError||ui.connectionLabel||'尚未組隊'}}</span><button class="text-button" data-action="invite"><AppIcon name="link" /> 邀請隊友</button></div>
      </div>
      <nav class="section-nav" aria-label="遠征功能">
        <button data-action="expeditions" :class="{active:ui.expeditionsOpen}" :aria-current="ui.expeditionsOpen?'page':undefined" aria-controls="expeditions-page"><AppIcon name="ticket" />遠征隊</button>
        <button data-tab="tasks" :class="{active:state.tab==='tasks'&&!ui.expeditionsOpen&&(ui.mobileTab==='tasks'||!ui.panelOpen)}"><AppIcon name="flag" />任務看板<span id="task-count" class="count">{{ state.tasks.filter(item=>item.status==='open').length }}</span></button>
        <button data-tab="members" :class="{active:state.tab==='members'&&!ui.expeditionsOpen&&(ui.mobileTab==='members'||!ui.panelOpen)}"><span class="nav-person-icon team-nav-icon"><AppIcon name="users" /></span>我的小隊<span id="member-count" class="count">{{ state.members.length }}</span></button>
        <button data-tab="friends" :class="{active:state.tab==='friends'&&!ui.expeditionsOpen&&(ui.mobileTab==='friends'||!ui.panelOpen)}"><span class="nav-person-icon friend-nav-icon"><AppIcon name="heart" /></span>我的好友<span id="friend-count" class="count">{{ ui.friendCount }}</span></button>
        <button data-tab="pins" :class="{active:state.tab==='pins'&&!ui.expeditionsOpen&&(ui.mobileTab==='pins'||!ui.panelOpen)}"><AppIcon name="pin" />情報點<span id="pin-count" class="count">{{ state.pins.length }}</span></button>
      </nav>
      <div class="side-divider"></div>
      <div class="panel-heading" :class="{hidden:['members','pins'].includes(state.tab)}"><div><div class="eyebrow" id="panel-eyebrow">{{ panel[0] }}</div><h1 id="panel-title" :class="{hidden:!panel[1]}">{{ panel[1] }}</h1></div><button class="square-button" id="publish-small" :class="{hidden:state.tab==='friends'}" :aria-label="state.tab==='pins'?'發布地標':state.tab==='members'?'建立情報點':'發布任務'" data-action="publish"><AppIcon name="plus" /></button></div>
      <div class="search-wrap"><AppIcon name="search" /><input id="search" type="search" :value="state.query" @input="app.onSearchInput" aria-label="搜尋任務、隊友或地標" :placeholder="placeholders[state.tab]"></div>
      <div id="filters" class="filters" aria-label="任務分類"><SmallControls :model="{kind:'filters',items:state.tab==='tasks'?Object.entries({all:'全部',...app.types,mine:'我的任務'}):[],selected:state.filter}" /></div>
      <main id="panel-content" tabindex="-1" class="panel-content"></main>
      <div class="sidebar-footer"><span class="mini-logo">✦</span><div><strong>同一場 LIVE，同一支遠征隊。</strong><small>交換一份快樂，也找到同行的人。</small></div></div>
    </aside>
    <section class="map-stage" :class="{lobby:state.demo}" aria-label="遠征地圖">
      <div id="map" tabindex="-1" aria-label="可拖曳與縮放的互動地圖"></div>
      <div id="map-provider-notice" class="map-provider-notice" role="status" hidden>Google 地圖暫時無法使用，已切回備用地圖。請確認金鑰的網站限制、Maps JavaScript API 與帳單設定。</div>
      <div class="map-top"><div id="place-search" class="place-search"><form role="search" aria-label="搜尋地圖地點"><AppIcon name="search" /><label class="visually-hidden" for="place-query">地點名稱或地址</label><input id="place-query" name="q" type="search" minlength="2" maxlength="120" autocomplete="off" placeholder="搜尋 Google 地圖地點…" aria-expanded="false" aria-controls="place-search-panel"><button type="button" data-place-clear aria-label="清除地點搜尋">×</button><button type="submit" aria-label="搜尋地點">搜尋</button></form><section id="place-search-panel" class="place-search-panel" aria-label="地點搜尋結果" hidden><div class="place-search-heading"><strong>Google 地點搜尋</strong><button type="button" data-place-close aria-label="關閉搜尋結果">×</button></div><p role="status" aria-live="polite"></p><div data-place-content></div><p class="place-search-credit">Google Maps</p></section></div><div class="map-control-actions"><label for="region-venue" class="visually-hidden">地圖場館</label><select id="region-venue" :value="state.activeVenue" :title="'切換地圖場館：'+ui.venueName" class="region-venue-select" @change="app.onVenueChange" aria-label="切換地圖場館"><option v-for="venue in ui.venues" :key="venue.id" :value="venue.id">{{venue.short||venue.name}}</option></select><button class="map-button" id="radar-toggle" data-action="radar" aria-pressed="true"><AppIcon name="compass" /><span>方向提示</span></button></div></div>
      <div id="demo-banner" class="demo-banner" :class="{hidden:!state.demo}"><AppIcon name="spark" /><span><strong>固定地標，附近集合。</strong><span class="demo-detail"> · 位置分享，由你決定</span></span><button data-action="join">選擇遠征隊 <span>↗</span></button></div>
      <div id="radar" class="radar-layer" aria-label="好友與已接任務的相對方向與距離"></div>
      <span id="map-action-anchor" class="map-action-anchor" aria-hidden="true" hidden></span>
      <button id="pin-filter-handle" class="pin-filter-handle" aria-label="篩選標記地點" aria-controls="pin-filter" aria-expanded="false"><span aria-hidden="true">☷</span><span>地點</span></button>
      <aside id="pin-filter" class="pin-filter-panel" aria-labelledby="pin-filter-title" hidden><div class="pin-filter-heading"><strong id="pin-filter-title">篩選標記地點</strong><button type="button" data-pin-filter-close aria-label="關閉地點篩選">×</button></div><label class="pin-filter-choice"><input id="pin-filter-following" name="following" type="checkbox" checked><span>追蹤者的地標</span></label><label class="pin-filter-choice"><input id="pin-filter-liked" name="liked" type="checkbox" checked><span>按讚的地標</span></label><label class="pin-filter-choice"><input id="pin-filter-commented" name="commented" type="checkbox" checked><span>留言過的地標</span></label><p>符合任一勾選條件即顯示。留言或按讚會自動追蹤作者。</p><p data-pin-filter-count>目前顯示 0 個標記地點</p></aside>
      <aside id="map-actions" class="map-actions" role="dialog" aria-labelledby="map-actions-title" hidden>
        <div class="map-actions-heading"><strong id="map-actions-title">在這裡建立</strong><button type="button" data-map-close aria-label="關閉地圖選單">×</button></div>
        <p data-map-coordinate></p>
        <button type="button" class="map-create-action" data-map-create="task"><span class="map-create-symbol task"><AppIcon name="flag" /></span><span><strong>插旗發布任務</strong><small>固定在這裡，接取者可查看</small></span><span aria-hidden="true">↗</span></button>
        <button type="button" class="map-create-action" data-map-create="pin"><span class="map-create-symbol"><AppIcon name="pin" /></span><span><strong>標記地標</strong><small>分享給遠征隊，可選限時或永久</small></span><span aria-hidden="true">↗</span></button>
      </aside>
      <div class="map-tools"><button class="map-button icon-only" data-action="zoom-in" aria-label="放大地圖" title="放大地圖">＋</button><button class="map-button icon-only" data-action="zoom-out" aria-label="縮小地圖" title="縮小地圖">−</button><button class="map-button icon-only" data-action="center" aria-label="回到我的位置" title="回到我的位置"><AppIcon name="locate" /></button><button class="map-button icon-only" data-action="compass" aria-label="啟用手機指南針" title="啟用手機指南針"><AppIcon name="compass" /></button><button class="map-button icon-only" data-action="pin-center" aria-label="在地圖中心插旗或標記地標" title="長按地圖，或按這裡插旗／標記地標"><AppIcon name="pin" /></button></div>
      <div class="map-bottom"><div class="location-card" :class="{'location-active':ui.locationActive,hidden:ui.locationActive&&ui.locationDismissed}"><span class="location-symbol"><AppIcon name="location" /></span><span><strong id="location-title">{{ ui.locationTitle }}</strong><small id="location-detail">{{ ui.locationDetail }}</small></span><button class="button dark" data-action="location" id="location-button">{{ ui.locationActive?'定位設定':'開啟定位' }}</button><button id="location-dismiss" class="location-dismiss" :class="{hidden:!ui.locationActive}" data-action="dismiss-location" aria-label="關閉定位資訊卡，保持定位" title="關閉資訊卡，保持定位">×</button></div><div id="target-card" class="target-card hidden"></div><div class="map-caption"><span id="map-caption-text">{{ui.venueName}}</span><span>距離為直線距離，請依現場動線通行</span><a class="facility-credit" href="https://www.m-messe.co.jp/facility/" target="_blank" rel="noopener">場館圖：幕張展覽館（約略對齊）</a></div><button id="location-reopen" class="location-reopen" :class="{hidden:!ui.locationActive||!ui.locationDismissed}" data-action="location"><span class="live-dot" aria-hidden="true"></span>定位設定</button></div>
    </section>
  </div>
  <main id="expeditions-page" class="expeditions-page" :hidden="!ui.expeditionsOpen" aria-labelledby="expeditions-page-title"></main>
  <nav class="mobile-tabs" aria-label="手機功能切換"><button data-mobile="map" :class="{active:ui.mobileTab==='map'&&!ui.expeditionsOpen}"><AppIcon name="map" />地圖</button><button data-tab="tasks" :class="{active:ui.mobileTab==='tasks'&&!ui.expeditionsOpen}"><AppIcon name="flag" />任務</button><button data-action="expeditions" :class="{active:ui.expeditionsOpen}" :aria-current="ui.expeditionsOpen?'page':undefined" aria-controls="expeditions-page"><AppIcon name="ticket" />遠征隊</button><button data-tab="members" :class="{active:ui.mobileTab==='members'&&!ui.expeditionsOpen}"><span class="nav-person-icon team-nav-icon"><AppIcon name="users" /></span>小隊</button><button data-tab="pins" :class="{active:ui.mobileTab==='pins'&&!ui.expeditionsOpen}"><AppIcon name="pin" />地標</button></nav>
  <aside id="teammate-finder" class="finder-window" role="region" aria-labelledby="finder-title" hidden>
    <div class="finder-header"><button id="finder-grip" class="finder-grip" aria-label="移動尋人視窗（方向鍵可移動，Home 歸位）" title="拖曳移動；也可使用方向鍵">⠿</button><h2 id="finder-title">隊友尋找</h2><span id="finder-summary" class="finder-summary"></span><button id="finder-collapse" aria-label="收合尋人視窗" aria-expanded="true" aria-controls="finder-body">−</button><button id="finder-close" aria-label="關閉尋人視窗">×</button></div>
    <div id="finder-body" class="finder-body">
      <label for="finder-person">尋找對象</label><select id="finder-person" disabled><option value="">選擇隊友的任務</option></select>
      <div id="finder-empty" class="finder-empty"><p id="finder-empty-message" role="status">加入遠征隊並接取隊友任務後，就能在這裡找人。</p><button id="finder-empty-action" class="finder-primary">選擇遠征隊</button></div>
      <div id="finder-detail" hidden><strong id="finder-name" class="finder-name"></strong><p id="finder-task" class="finder-task"></p><p id="finder-source" class="finder-source" role="status"></p>
        <div id="finder-guidance" class="finder-guidance" hidden><span id="finder-arrow" class="finder-arrow" aria-hidden="true"><svg class="direction-needle" viewBox="0 0 24 24"><path class="needle-main" d="M12 2 21 21 12 16 3 21Z"/><path class="needle-highlight" d="M12 2V16L3 21Z"/></svg></span><div><strong id="finder-distance" class="finder-distance"></strong><span id="finder-direction" class="finder-direction"></span></div></div>
        <div id="finder-needs-location" class="finder-needs-location"><p>開啟你的定位，才能計算方向與距離。</p><button id="finder-location" class="finder-primary">開啟／更新我的定位</button></div><p id="finder-accuracy" class="finder-accuracy"></p>
        <div class="finder-actions"><button id="finder-compass">啟用指南針</button><button id="finder-map">在地圖上查看</button></div><p class="finder-note">直線方向與距離，請依現場動線通行。拖曳左上角可移動視窗。</p>
      </div>
    </div>
  </aside>
  <dialog id="news-dialog" aria-labelledby="news-title" aria-describedby="news-intro">
    <header class="news-toolbar"><div><div class="eyebrow">TAMAGOYAKI SUPPORT</div><h2 id="news-title">News 公告</h2></div><button type="button" id="news-close" aria-label="關閉公告" autofocus>×</button></header>
    <p id="news-intro" class="news-intro">網站的新變化，還有下一場相聚。</p>
    <nav class="news-filters" aria-label="公告分類"><button type="button" data-news-filter="all" aria-pressed="true">全部</button><button type="button" data-news-filter="update" aria-pressed="false">網站更新</button><button type="button" data-news-filter="event" aria-pressed="false">活動公告</button><button type="button" data-news-filter="friends" aria-pressed="false" hidden>好友邀請</button></nav>
    <div class="news-status-row"><p id="news-status" role="status" aria-live="polite">正在載入公告…</p><button type="button" id="news-retry" hidden>重新載入</button></div>
    <div class="news-scroll"><section id="news-invitations" aria-labelledby="news-invitation-title" hidden><h3 id="news-invitation-title">好友邀請</h3><p id="news-invitation-status" role="status" aria-live="polite"></p><div id="news-invitation-list"></div></section><div id="news-list"></div></div>
  </dialog>
  <dialog id="chat-friend-dialog" aria-labelledby="chat-friend-title">
    <header class="chat-friend-toolbar"><h2 id="chat-friend-title">加入好友</h2><button type="button" data-friend-close aria-label="關閉好友邀請選項" autofocus>×</button></header>
    <div class="chat-friend-person"><span data-friend-avatar></span><h3 data-friend-name></h3><p data-friend-username></p></div>
    <p data-friend-status role="status" aria-live="polite"></p>
    <button type="button" class="button primary full" data-friend-send hidden>送出好友邀請</button><button type="button" class="button secondary full" data-friend-news hidden>到 News 查看邀請</button><button type="button" class="button outline full" data-friend-retry hidden>重新載入</button>
  </dialog>
  <dialog id="profile-dialog" aria-labelledby="profile-title">
    <header class="profile-toolbar"><h2 id="profile-title">個人檔案</h2><button type="button" id="profile-settings" hidden>帳號設定</button><button type="button" id="profile-edit" hidden>編輯檔案</button><button type="button" id="news-launcher" class="news-launcher" :aria-label="'News 公告'+(ui.newsRequests?'，'+ui.newsRequests+' 份好友邀請':ui.newsUnread?'，有新公告':'')" aria-haspopup="dialog" aria-controls="news-dialog" hidden>News<span class="news-unread" aria-hidden="true" :hidden="!(ui.newsUnread||ui.newsRequests)"></span></button><button type="button" id="profile-close" aria-label="關閉個人檔案" autofocus>×</button></header>
    <div class="profile-status-row"><p id="profile-status" role="status" aria-live="polite"></p><button type="button" id="profile-retry" hidden>重試</button></div>
    <div id="profile-scroll"><div id="profile-content"></div></div>
    <section id="profile-crop" aria-labelledby="profile-crop-title" hidden><h3 id="profile-crop-title" data-crop-title>調整圖片</h3><p>放大並調整位置，確認後儲存到個人檔案。</p><div class="profile-crop-preview"><canvas aria-label="裁切結果預覽"></canvas></div><label for="profile-crop-zoom">放大</label><input id="profile-crop-zoom" type="range" name="zoom" min="1" max="3" step="0.05" value="1"><label for="profile-crop-x">左右位置</label><input id="profile-crop-x" type="range" name="x" min="0" max="100" value="50"><label for="profile-crop-y">上下位置</label><input id="profile-crop-y" type="range" name="y" min="0" max="100" value="50"><div class="profile-crop-actions"><button type="button" class="button outline" data-crop-cancel>取消</button><button type="button" class="button primary" data-crop-save>確認裁切並儲存</button></div></section>
    <input id="profile-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
  </dialog>
  <dialog id="chat-dialog" aria-labelledby="chat-title" data-view="list"></dialog>
  <dialog id="dialog"><div class="dialog-top"><div class="eyebrow">TAMAGOYAKI SUPPORT</div><button class="icon-button" data-action="close" aria-label="關閉視窗"><AppIcon name="close" /></button></div><div id="dialog-body"></div></dialog>
  <div id="toast" role="status" aria-live="polite" class="toast" :class="{hidden:!ui.toast}">{{ ui.toast }}</div>
</div>
</template>
