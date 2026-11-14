export function createExpeditions(app) {
function activityDate(value,end){return value?(end&&end!==value?value+' ～ '+end:value):'未指定日期';}

function activityVenues(){return app.config.activity_venues||app.config.venues;}

function activityVenue(){return app.activityVenues().some(v=>v.id===app.state.activityVenue)?app.state.activityVenue:app.state.activeVenue;}

function currentSquad(){return app.state.squads.find(s=>s.id===app.state.mine.squad);}

function showJoin(mode='browse'){
  if(mode==='join')mode='browse';
  if(!app.state.authenticated){app.authIntent={kind:'join',mode};return app.showAuth();}
  const params=new URLSearchParams(location.search),squadInvitation=mode==='code'&&/^[A-Za-z0-9]{8}$/.test(params.get('squad')||'');
  const joinModel={kind:'join',mode,squadInvitation,user:{...app.state.user},venues:app.activityVenues().map(v=>({...v})),venue:app.activityVenue(),code:params.get('join')||'',today:app.today()};
  if(mode==='browse'){
    app.dialog({...joinModel});
    let generation=0;
    async function loadCatalog(vid){
      const current=++generation,list=app.$('#venue-catalog');
      try{
        const result=await app.api(`/venues/${vid}/expeditions`);
        if(current!==generation||!list.isConnected)return;
        app.TamagoVue.renderList(list,'catalog',{items:result.expeditions.map(room=>({...room,schedule:app.activityDate(room.event_date,room.event_end_date),joined:app.state.rooms.some(r=>r.id===room.id)}))});
        app.resources.bind(list, 'onclick', async event=>{
          const button=event.target.closest('[data-room-id]');if(!button||button.disabled)return;
          button.disabled=true;
          try{const room=await app.roomAdmission.join(button.dataset.roomId,app.state.user.id);if(room)await app.finishRoomJoin(room,false);}
          catch(error){app.toast(error.message);button.disabled=false;}
        });
      }catch(error){if(list.isConnected)app.TamagoVue.renderList(list,'error',{error:error.message});}
    }
    app.resources.bind(app.$('#join-venue'), 'onchange', event=>{app.state.activityVenue=event.target.value;app.switchVenue(event.target.value);loadCatalog(event.target.value);});
    loadCatalog(app.activityVenue());return;
  }
  app.dialog({...joinModel});
  if(mode==='create'){
    const start=app.$('#event-date'),end=app.$('#event-end-date');
    const syncDates=()=>{const enabled=app.$('#include-date').checked;app.$('#event-date-fields').hidden=!enabled;start.disabled=!enabled;start.required=enabled;end.disabled=!enabled||!start.value;end.min=start.value;};
    app.resources.bind(app.$('#include-date'), 'onchange', syncDates);app.resources.bind(start, 'oninput', syncDates);syncDates();
  }
  app.resources.bind(app.$('#join-form'), 'onsubmit', async event=>{
    event.preventDefault();await app.submit(event.target,async()=>{
      const f=new FormData(event.target);
      const room=mode==='code'?await app.api('/join','POST',{code:f.get('code').toUpperCase(),...(f.get('password')?{password:f.get('password')}:{}),...(squadInvitation?{squad_code:params.get('squad').toUpperCase()}:{})}):await app.api('/expeditions','POST',{name:f.get('name'),venue:f.get('venue'),event_date:f.has('include_date')?f.get('event_date'):null,event_end_date:f.has('include_date')?(f.get('event_end_date')||null):null,discoverable:f.has('discoverable')});
      await app.finishRoomJoin(room,mode==='create');
    });
  });
}

async function finishRoomJoin(room,created){
  const params=new URLSearchParams(location.search);
  await app.enterRoom(room,app.state.user);
  const squadCode=params.get('squad');let squadError=null;
  if(squadCode&&!room.squad_joined){try{await app.api(`/expeditions/${room.id}/squads/join`,'POST',{code:squadCode});await app.refresh();}catch(error){squadError=error.message;}}
  app.closeDialog();app.showMap();history.replaceState(null,'',location.pathname);
  app.toast(squadError?'已加入遠征隊；小隊未加入：'+squadError:squadCode?'已加入遠征隊與小隊，可在定位設定選擇分享對象。':'已加入遠征隊，可在定位設定選擇分享對象。');
  if(created&&!room.discoverable)app.showInvite();
}

async function enterRoom(room,u,{preserveMap=false}={}){
  app.mapActions?.dismiss();
  if(app.assistance)app.assistance.suspended=false;
  await app.stopTeamLocation();app.lastTeamSyncAt=0;app.state.demo=false;app.state.user=u;app.state.room=room;app.state.target=null;app.state.query='';app.$('#search').value='';
  app.state.activityVenue=room.venue;
  if(!preserveMap&&app.config.venues.some(v=>v.id===room.venue)){app.state.activeVenue=room.venue;app.rememberVenue();}
  try{localStorage.setItem('tamago-room',room.id);}catch{}
  await app.refresh();app.focusVenue();
  const me=await app.api('/me');app.state.rooms=me.expeditions;app.state.user={...u,...me.user};
}

function showInvite(squad=false){
  if(app.state.demo)return app.showJoin('create');const s=squad?app.currentSquad():app.state.room;if(!s)return;
  const url=location.origin+'/?join='+app.state.room.code+(squad?'&squad='+s.code:'');
  app.dialog({kind:'invite',squad:!!squad,room:{...s},url});
  if(squad)app.squadInvites.mount(app.$('#squad-invite-friends'),{eid:app.state.room.id,sid:s.id,user:app.state.user.id});
}

function showRooms(){app.showExpeditionPage();}

function expeditionRoute(){return ['#expeditions','#expeditions-main'].includes(location.hash);}

function showExpeditionPage({route=true,focus=true}={}){
  if(!app.expeditionPage||!app.config)return;
  app.closeDialog();app.mapActions?.dismiss();app.placeSearch?.close();
  if(route&&!app.expeditionRoute())history.pushState(null,'',location.pathname+location.search+'#expeditions');
  app.ui.expeditionsOpen=true;app.ui.mobileTab='expeditions';document.body.classList.add('expeditions-open');app.$('#expeditions-page').hidden=false;
  app.$('.skip-link').href='#expeditions-main';document.title='遠征隊 · 玉子燒支援隊';
  app.$$('.mobile-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.action==='expeditions'));
  app.$$('[data-action=expeditions]').forEach(button=>button.setAttribute('aria-current','page'));
  app.expeditionPage.open({focus});
}

function hideExpeditionPage(){
  if(!app.expeditionPage?.visible())return;
  app.ui.expeditionsOpen=false;app.$('#expeditions-page').hidden=true;document.body.classList.remove('expeditions-open');
  app.$('.skip-link').href='#panel-content';document.title='玉子燒支援隊 · Tamagoyaki Support';
  app.$$('[data-action=expeditions]').forEach(button=>button.removeAttribute('aria-current'));
  if(app.expeditionRoute())history.pushState(null,'',location.pathname+location.search);
  app.renderMap();if(app.map)app.resources.timeout(()=>app.map.invalidateSize(),30);
}

function showSquad(mode){
  if(app.state.demo)return app.showJoin();
  const create=mode==='create',roomId=app.state.room.id,userId=app.state.user.id;
  app.dialog({kind:'squad',create});
  app.resources.bind(app.$('#squad-form'), 'onsubmit', async e=>{e.preventDefault();await app.submit(e.target,async()=>{
    if(app.state.demo||app.state.room.id!==roomId||app.state.user.id!==userId)throw new Error('遠征隊已變更，請重新開啟小隊設定。');
    const value=new FormData(e.target).get('value');await app.stopTeamLocation();
    if(app.state.demo||app.state.room.id!==roomId||app.state.user.id!==userId||!e.target.isConnected)throw new Error('遠征隊或視窗已變更，請重新開啟。');
    await app.api(`/expeditions/${roomId}/squads${create?'':'/join'}`,'POST',create?{name:value}:{code:value.toUpperCase()});await app.refresh({fresh:true});await app.chat?.sync({fresh:true});
    if(app.state.room.id!==roomId||app.state.user.id!==userId||!e.target.isConnected)return;
    app.closeDialog();app.setTab('members');app.toast(create?'小隊已建立，使用「邀請加入小隊」分享邀請碼。':'已加入小隊。');
  });});
}

async function leaveSquad(id){
  if(app.state.demo||app.state.mine.squad!==id)return;
  const roomId=app.state.room.id,userId=app.state.user.id;
  await app.stopTeamLocation();
  if(app.state.room.id!==roomId||app.state.user.id!==userId)return;
  await app.api(`/expeditions/${roomId}/squads/${encodeURIComponent(id)}/membership`,'DELETE');await app.refresh({fresh:true});await app.chat?.sync({fresh:true});
  if(app.state.room.id===roomId&&app.state.user.id===userId){app.setTab('members');app.toast('已離開小隊，仍保留遠征隊成員資格。');}
}

async function showOwnedRooms(){
  if(!app.state.authenticated)return app.showAuth();
  app.dialog({kind:'owned'});
  const root=app.$('#owned-rooms'),uid=app.state.user.id;
  try{
    const data=await app.api('/expeditions/owned');if(!root.isConnected||app.state.user.id!==uid)return;
    app.TamagoVue.renderList(root,'owned',{items:data.expeditions.map(room=>({...room,schedule:app.activityDate(room.event_date,room.event_end_date),venue_name:app.activityVenues().find(v=>v.id===room.venue)?.name||room.venue}))});
  }catch(error){if(root.isConnected)root.textContent=error.message;}
}

async function showDeleteRoom(id){
  const data=await app.api('/expeditions/owned'),room=data.expeditions.find(r=>r.id===id);
  if(!room)throw new Error('只能刪除自己建立且仍存在的遠征隊。');
  app.dialog({kind:'deleteRoom',room:{...room},id});
}

async function deleteRoom(id){
  const current=!app.state.demo&&app.state.room.id===id;
  const result=await app.api('/expeditions/'+encodeURIComponent(id),'DELETE');app.assistance?.sync(result.help_rooms||[]);
  if(current){app.resetLobby();try{localStorage.removeItem('tamago-room');}catch{}}
  app.state.rooms=app.state.rooms.filter(room=>room.id!==id);
  app.closeDialog();app.render();if(current)app.showMap();app.chat?.tick();
  try{const me=await app.api('/me');app.state.rooms=me.expeditions;}catch{}
  app.toast('遠征隊已刪除，場次與地標評價紀錄仍保留。');
}

async function syncRoomChanges(uid,{catalog=false,people=false}={}){
  if(!app.state.authenticated||app.state.user.id!==uid)return;
  const me=await app.api('/me');if(!app.state.authenticated||app.state.user.id!==uid)return;
  app.state.rooms=me.expeditions;if(people)await app.friends.sync({fresh:true});if(!app.state.demo)await app.refresh({fresh:true});
  if(!app.state.authenticated||app.state.user.id!==uid)return;
  if(catalog&&app.expeditionPage?.visible())await app.expeditionPage.loadCatalog();app.render();app.chat?.tick();
}

function activitySchedule(room){const range=room.event_end_date&&room.event_end_date!==room.event_date;return app.activityDate(room.event_date,room.event_end_date)+(room.event_time?(range?' · 開始 ':' ')+room.event_time+'（'+(room.time_zone==='Asia/Taipei'?'台灣':'日本')+'）':'');}
async function refresh({fresh=false}={}){
  if(app.state.demo||document.hidden)return;
  const roomId=app.state.room.id,userId=app.state.user.id,pinsAtStart=app.pinRevision,tasksAtStart=app.taskRevision;
  if(app.refreshing){const pending=app.refreshing;await pending;if((fresh||pending.context!==roomId+':'+userId)&&app.state.room.id===roomId&&app.state.user.id===userId)return app.refresh();return;}
  app.refreshing=(async()=>{
  try{
    const data=await app.api(`/expeditions/${roomId}`);
    if(app.state.demo||app.state.room.id!==roomId||app.state.user.id!==userId)return;
    const priorSquad=app.state.mine.squad;
    Object.assign(app.state,{room:data.room,members:data.members,tasks:tasksAtStart===app.taskRevision?data.tasks:app.state.tasks,pins:pinsAtStart===app.pinRevision?data.pins:app.state.pins,squads:data.squads,mine:data.me,online:true});app.lastTeamSyncAt=Date.now();
    if(app.state.scope==='friends_squad'&&priorSquad!==data.me.squad){
      app.lastSent=0;app.lastPublishedSampleAt=0;
      if(app.state.position&&Date.now()-app.lastPositionAt<20000)app.receivePosition({coords:{latitude:app.state.position.lat,longitude:app.state.position.lng,accuracy:app.state.position.accuracy},timestamp:app.lastPositionAt},app.locationGeneration);
      else app.refreshGPS(true);
    }
    if(app.state.scope==='squad'&&data.me.squad!==app.locationSquadId){await app.stopLocation({remote:false});app.toast('小隊已變更，請重新選擇定位分享對象。');}
    app.assistance?.sync(data.help_rooms||[]);app.render();
  }catch(e){
    if(app.state.demo||app.state.room.id!==roomId||app.state.user.id!==userId)return;
    if([401,403,404].includes(e.status)){
      let me=null;if(e.status===401){app.friends.reset();app.state.authenticated=false;app.state.user={id:'me',nickname:'你'};}else{try{me=await app.api('/me');}catch{}}
      app.assistance?.sync(me?.help_rooms||[]);app.resetLobby();app.state.rooms=me?.expeditions||[];try{localStorage.removeItem('tamago-room');}catch{}app.render();app.chat?.tick();app.toast(e.status===401?'登入已失效，請重新登入。':'遠征隊已不存在或已退出，已回到地圖首頁。');
    }
    else{app.state.online=false;app.state.members=app.state.members.map(m=>({...m,lat:null,lng:null}));app.render();}
  }
  finally{app.refreshing=false;}
  })();app.refreshing.context=roomId+':'+userId;return app.refreshing;
}

async function leaveExpeditionFromMenu(id,uid){
  if(!app.state.authenticated||app.state.user.id!==uid)return;
  const current=!app.state.demo&&app.state.room.id===id;if(current)await app.stopTeamLocation();
  const result=await app.api(`/expeditions/${encodeURIComponent(id)}/membership`,'DELETE');if(!app.state.authenticated||app.state.user.id!==uid)return;
  app.assistance?.sync(result.help_rooms||[]);if(current){app.resetLobby();try{localStorage.removeItem('tamago-room');}catch{}}
  app.state.rooms=app.state.rooms.filter(room=>room.id!==id);if(app.roomSettings?.room?.id===id&&app.roomSettings.current())app.closeDialog();await app.syncRoomChanges(uid,{catalog:true});app.toast('已退出遠征隊。');
}

return { activityDate, activityVenues, activityVenue, currentSquad, showJoin, finishRoomJoin, enterRoom, showInvite, showRooms, expeditionRoute, showExpeditionPage, hideExpeditionPage, showSquad, leaveSquad, showOwnedRooms, showDeleteRoom, deleteRoom, syncRoomChanges, activitySchedule, refresh, leaveExpeditionFromMenu };
}
