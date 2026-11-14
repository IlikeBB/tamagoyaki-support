<script setup>
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
import ExpeditionList from './ExpeditionList.vue';

const props = defineProps({ controller: { type: Object, required: true } });
const state = props.controller.state;
const context = computed(() => props.controller.context.value);
const mine = computed(() => context.value.rooms.filter(room => props.controller.matches(room)));
const catalog = computed(() => state.catalog.filter(room => props.controller.matches(room)));
</script>

<template>
  <div id="expeditions-main" class="expeditions-layout" tabindex="-1">
    <header class="expeditions-heading">
      <div>
        <button type="button" class="expeditions-back" data-expedition-back @click="controller.actions.back()"><AppIcon name="map" /> 回到地圖</button>
        <h1 id="expeditions-page-title" tabindex="-1">遠征隊</h1>
      </div>
      <div class="expeditions-actions">
        <button type="button" class="button primary" data-expedition-create @click="controller.actions.create(state.venue)"><AppIcon name="plus" /> 建立遠征隊</button>
        <button type="button" class="button outline" data-action="code-mode">邀請碼加入</button>
      </div>
    </header>
    <div class="expeditions-tools">
      <div class="expeditions-modes" role="group" aria-label="遠征隊分類">
        <button type="button" data-expedition-mode="joined" :aria-pressed="state.mode === 'joined'" @click="controller.selectMode('joined')">我的遠征隊 <span data-expedition-total>{{ context.user ? context.rooms.length : '' }}</span></button>
        <button type="button" data-expedition-mode="browse" :aria-pressed="state.mode === 'browse'" @click="controller.selectMode('browse')">加入遠征隊</button>
      </div>
      <label class="expeditions-search">
        <AppIcon name="search" /><span class="visually-hidden">搜尋遠征隊名稱或會場</span>
        <input v-model="state.query" type="search" maxlength="120" placeholder="搜尋遠征隊名稱或會場…" data-expedition-search>
      </label>
    </div>
    <section data-expedition-section="joined" aria-labelledby="expedition-mine-title" :hidden="state.mode !== 'joined'">
      <div class="expeditions-section-heading">
        <h2 id="expedition-mine-title">我的遠征隊</h2>
        <button type="button" data-expedition-refresh="joined" :disabled="state.loadingMine || !context.user" @click="controller.loadMine()">重新整理</button>
      </div>
      <p class="expeditions-status" data-expedition-mine-status role="status" aria-live="polite">{{ state.loadingMine ? '正在載入…' : state.mineError ? '請按「重新整理」再試一次。' : '' }}</p>
      <div data-expedition-mine-list :aria-busy="state.loadingMine">
        <ExpeditionList :rooms="mine" :context="context" :controller="controller" joined :loading="state.loadingMine" :error="state.mineError" :query="state.query" :busy="state.busy" />
      </div>
      <button v-if="context.user" type="button" class="expeditions-manage" data-action="owned-rooms">管理我建立的遠征隊 <AppIcon name="chevron" /></button>
    </section>
    <section data-expedition-section="browse" aria-labelledby="expedition-browse-title" :hidden="state.mode !== 'browse'">
      <div class="expeditions-section-heading">
        <h2 id="expedition-browse-title">加入遠征隊</h2>
        <button type="button" data-expedition-refresh="browse" :disabled="state.loadingCatalog" @click="controller.loadCatalog()">重新整理</button>
      </div>
      <label for="expedition-page-venue">活動會場</label>
      <select id="expedition-page-venue" :value="state.venue" @change="controller.selectVenue($event.target.value)">
        <option v-for="venue in context.venues" :key="venue.id" :value="venue.id">{{ venue.name }}</option>
      </select>
      <p class="expeditions-status" data-expedition-catalog-status role="status" aria-live="polite">{{ state.loadingCatalog ? '正在載入…' : state.catalogError ? '請按「重新整理」再試一次。' : '' }}</p>
      <div data-expedition-catalog-list :aria-busy="state.loadingCatalog">
        <ExpeditionList :rooms="catalog" :context="context" :controller="controller" :loading="state.loadingCatalog" :error="state.catalogError" :query="state.query" :busy="state.busy" />
      </div>
    </section>
  </div>
</template>
