'use strict';
class ExpeditionsPage {
  constructor(root,actions){
    this.root=root;this.actions=actions;this.uid=undefined;this.generation=0;this.catalogGeneration=0;this.openedForUser=false;this.query='';this.mode='joined';this.venue=null;this.catalog=[];this.loadingMine=false;this.loadingCatalog=false;this.mineError='';this.catalogError='';this.busy=null;
    root.innerHTML=`<div class="expeditions-layout" id="expeditions-main" tabindex="-1"><header class="expeditions-heading"><div><button type="button" class="expeditions-back" data-expedition-back>${icon('map')} 回到地圖</button><h1 id="expeditions-page-title" tabindex="-1">遠征隊</h1></div><div class="expeditions-actions"><button type="button" class="button primary" data-expedition-create>${icon('plus')} 建立遠征隊</button><button type="button" class="button outline" data-action="code-mode">邀請碼加入</button></div></header><div class="expeditions-tools"><div class="expeditions-modes" role="group" aria-label="遠征隊分類"><button type="button" data-expedition-mode="joined" aria-pressed="true">我的遠征隊 <span data-expedition-total></span></button><button type="button" data-expedition-mode="browse" aria-pressed="false">加入遠征隊</button></div><label class="expeditions-search">${icon('search')}<span class="visually-hidden">搜尋遠征隊名稱或會場</span><input type="search" maxlength="120" placeholder="搜尋遠征隊名稱或會場…" data-expedition-search></label></div><section data-expedition-section="joined" aria-labelledby="expedition-mine-title"><div class="expeditions-section-heading"><h2 id="expedition-mine-title">我的遠征隊</h2><button type="button" data-expedition-refresh="joined">重新整理</button></div><p class="expeditions-status" data-expedition-mine-status role="status" aria-live="polite"></p><div data-expedition-mine-list></div><button type="button" class="expeditions-manage" data-action="owned-rooms">管理我建立的遠征隊 ${icon('chevron')}</button></section><section data-expedition-section="browse" aria-labelledby="expedition-browse-title" hidden><div class="expeditions-section-heading"><h2 id="expedition-browse-title">加入遠征隊</h2><button type="button" data-expedition-refresh="browse">重新整理</button></div><label for="expedition-page-venue">活動會場</label><select id="expedition-page-venue"></select><p class="expeditions-status" data-expedition-catalog-status role="status" aria-live="polite"></p><div data-expedition-catalog-list></div></section></div>`;
    root.querySelector('[data-expedition-search]').oninput=event=>{this.query=event.target.value.toLocaleLowerCase().trim();this.renderLists();};
    root.querySelector('select').onchange=event=>{this.venue=event.target.value;this.loadCatalog();};
    root.onclick=event=>this.click(event);
  }
  visible(){return !this.root.hidden;}
  sync(){
    const ctx=this.actions.context(),uid=ctx.user?.id||null,changed=uid!==this.uid;
    if(changed){this.uid=uid;this.generation++;this.catalogGeneration++;this.openedForUser=false;this.catalog=[];this.query='';this.mineError='';this.catalogError='';this.loadingMine=false;this.loadingCatalog=false;this.busy=null;this.mode=uid&&ctx.rooms.length?'joined':'browse';this.root.querySelector('[data-expedition-search]').value='';}
    const options=ctx.venues.map(venue=>`<option value="${esc(venue.id)}">${esc(venue.name)}</option>`).join(''),select=this.root.querySelector('select');
    if(select.dataset.options!==options){select.innerHTML=options;select.dataset.options=options;}
    if(!ctx.venues.some(venue=>venue.id===this.venue))this.venue=ctx.venue||ctx.venues[0]?.id;
    select.value=this.venue;
    this.root.querySelector('[data-expedition-total]').textContent=uid?ctx.rooms.length:'';
    this.root.querySelector('[data-action=owned-rooms]').hidden=!uid;
    this.renderLists();this.selectMode(this.mode);
    if(changed&&this.visible()){this.loadMine();this.loadCatalog();}
  }
  open({focus=true}={}){this.sync();if(!this.openedForUser){this.openedForUser=true;this.selectMode(this.uid&&this.actions.context().rooms.length?'joined':'browse');}if(!this.loadingMine)this.loadMine();if(!this.loadingCatalog)this.loadCatalog();if(focus)this.root.querySelector('h1').focus({preventScroll:true});}
  selectMode(mode){
    this.mode=mode==='browse'?'browse':'joined';
    this.root.querySelectorAll('[data-expedition-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.expeditionMode===this.mode)));
    this.root.querySelectorAll('[data-expedition-section]').forEach(section=>section.hidden=section.dataset.expeditionSection!==this.mode);
  }
  matches(room){const venue=this.actions.context().venues.find(venue=>venue.id===room.venue);return [room.name,venue?.name,room.event_date].some(value=>value?.toLocaleLowerCase().includes(this.query));}
  empty(title,detail){return `<div class="expeditions-empty"><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;}
  row(room,joined){
    const ctx=this.actions.context(),current=ctx.current===room.id,venue=ctx.venues.find(venue=>venue.id===room.venue),pending=this.busy===room.id,joinedRoom=ctx.rooms.find(item=>item.id===room.id),canManage=joined&&(joinedRoom?.owner===ctx.user?.id||joinedRoom?.my_role==='deputy');
    return `<article class="expedition-entry ${current?'is-current':''}"><div class="expedition-entry-copy"><div class="expedition-entry-name"><h3>${esc(room.name)}</h3>${current?'<span class="expedition-current">目前遠征隊</span>':''}</div><p>${esc(venue?.name||room.venue)}<span aria-hidden="true"> · </span>${esc(room.event_date||'未指定日期')}${!joined?` · ${Number(room.member_count)||0} 人`:''}</p>${joined&&room.owner===ctx.user?.id?'<small>我建立的遠征隊</small>':''}</div><div class="expedition-entry-buttons">${canManage?`<button type="button" class="button outline" data-expedition-manage="${esc(room.id)}">管理成員</button>`:''}<button type="button" class="button outline" data-expedition-preview="${esc(room.id)}">查看成員</button><button type="button" class="button ${joined?'secondary':'outline'}" data-expedition-${joined?'enter':'join'}="${esc(room.id)}" ${this.busy?'disabled':''}>${pending?'處理中…':joined?'進入遠征隊':ctx.user?'加入':'登入加入'} ${icon('chevron')}</button></div>${joined&&current?'<div class="expedition-entry-actions"><button type="button" data-action="invite">邀請隊友</button><button type="button" data-action="leave">退出遠征隊</button></div>':''}</article>`;
  }
  rename(room){this.catalog=this.catalog.map(item=>item.id===room.id?{...item,name:room.name}:item);this.renderLists();}
  replace(selector,html){const root=this.root.querySelector(selector);if(root.dataset.html!==html){root.innerHTML=html;root.dataset.html=html;}}
  renderLists(){
    const ctx=this.actions.context(),mine=ctx.rooms.filter(room=>this.matches(room)),joined=new Set(ctx.rooms.map(room=>room.id));
    const mineHtml=!ctx.user?this.empty('登入後查看你的遠征隊','已加入的隊伍會顯示在這裡。')+'<button type="button" class="button primary" data-expedition-login>登入或註冊</button>':this.mineError?this.empty('無法載入我的遠征隊',this.mineError):this.loadingMine&&!ctx.rooms.length?'<div class="expeditions-skeleton" aria-hidden="true"></div>':mine.length?mine.map(room=>this.row(room,true)).join(''):this.empty(this.query?'沒有符合的遠征隊':'尚未加入遠征隊',this.query?'換個名稱或會場試試看。':'到「加入遠征隊」找同行夥伴，或用邀請碼加入。');
    this.replace('[data-expedition-mine-list]',mineHtml);
    const matches=this.catalog.filter(room=>this.matches(room));
    const catalogHtml=this.loadingCatalog?'<div class="expeditions-skeleton" aria-hidden="true"></div>':this.catalogError?this.empty('暫時無法載入遠征隊',this.catalogError):matches.length?matches.map(room=>this.row(room,joined.has(room.id))).join(''):this.empty(this.query?'沒有符合的遠征隊':'這個場館還沒有遠征隊',this.query?'換個名稱或會場試試看。':'可以建立一支，讓同場的夥伴加入。');
    this.replace('[data-expedition-catalog-list]',catalogHtml);
    for(const [kind,loading,error] of [['mine',this.loadingMine,this.mineError],['catalog',this.loadingCatalog,this.catalogError]]){this.root.querySelector(`[data-expedition-${kind}-status]`).textContent=loading?'正在載入…':error?'請按「重新整理」再試一次。':'';this.root.querySelector(`[data-expedition-${kind}-list]`).setAttribute('aria-busy',String(loading));}
    this.root.querySelector('[data-expedition-refresh=joined]').disabled=this.loadingMine||!ctx.user;
    this.root.querySelector('[data-expedition-refresh=browse]').disabled=this.loadingCatalog;
  }
  async loadMine(){
    if(!this.uid||this.loadingMine)return;
    const uid=this.uid,generation=this.generation;this.loadingMine=true;this.mineError='';this.renderLists();
    try{const data=await this.actions.api('/me');if(generation!==this.generation||uid!==this.actions.context().user?.id)return;if(data.user?.id!==uid){this.actions.expired();return;}this.actions.rooms(data.expeditions);}
    catch(error){if(generation===this.generation)this.mineError=error.message;}
    finally{if(generation===this.generation){this.loadingMine=false;this.root.querySelector('[data-expedition-total]').textContent=this.actions.context().rooms.length;this.renderLists();}}
  }
  async loadCatalog(){
    if(!this.venue)return;
    const venue=this.venue,generation=++this.catalogGeneration;this.loadingCatalog=true;this.catalogError='';this.catalog=[];this.renderLists();
    try{const data=await this.actions.api(`/venues/${encodeURIComponent(venue)}/expeditions`);if(generation!==this.catalogGeneration||venue!==this.venue)return;this.catalog=data.expeditions;}
    catch(error){if(generation===this.catalogGeneration)this.catalogError=error.message;}
    finally{if(generation===this.catalogGeneration){this.loadingCatalog=false;this.renderLists();}}
  }
  async click(event){
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-expedition-back'))return this.actions.back();
    if(button.hasAttribute('data-expedition-login'))return this.actions.login();
    if(button.hasAttribute('data-expedition-create'))return this.actions.create(this.venue);
    if(button.dataset.expeditionMode)return this.selectMode(button.dataset.expeditionMode);
    if(button.dataset.expeditionRefresh)return button.dataset.expeditionRefresh==='joined'?this.loadMine():this.loadCatalog();
    if(button.dataset.expeditionManage){const room=this.actions.context().rooms.find(room=>room.id===button.dataset.expeditionManage);if(room)this.actions.manage(room);return;}
    if(button.dataset.expeditionPreview){const room=[...this.actions.context().rooms,...this.catalog].find(room=>room.id===button.dataset.expeditionPreview);if(room)this.actions.preview({...room,joined:this.actions.context().rooms.some(item=>item.id===room.id)});return;}
    const id=button.dataset.expeditionEnter||button.dataset.expeditionJoin;if(!id||this.busy)return;
    if(!this.uid)return this.actions.login();
    const uid=this.uid,generation=this.generation;this.busy=id;this.renderLists();
    try{await (button.dataset.expeditionEnter?this.actions.enter(id,uid):this.actions.join(id,uid));}
    catch(error){if(generation===this.generation)this.actions.toast(error.message);}
    finally{if(generation===this.generation){this.busy=null;this.renderLists();}}
  }
}
