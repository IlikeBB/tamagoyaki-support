export function createLocation(app) {
function memberSharesLocation(member){
  if(member.user===app.state.user.id&&app.assistance?.active&&app.assistance.rooms.some(r=>r.id===app.state.room.id))return true;
  if(member.user!==app.state.user.id)return app.expeditionPeople().some(p=>p.owner===member.user);
  return app.state.online&&['expedition','squad'].includes(app.state.mine.scope)&&app.LocationState.valid(app.state.mine.located);
}

function renderLocation(){
  if(!app.resources.active)return;
  const active=app.state.scope!=='off';
  app.ui.locationActive=active;app.ui.locationDismissed=app.locationCardDismissed;
  const labels={help:'求助中 · 全遠征隊可見',local:'僅供本機使用',friends:'僅與好友分享',friends_squad:'好友與目前小隊可見',expedition:'與目前遠征隊分享',squad:'僅與目前小隊分享',task:'任務接取者限定'};
  app.ui.locationTitle=active?'定位已開啟 · '+labels[app.state.scope]:'定位分享，由你決定。';
  let detail='預設與好友及目前小隊分享';
  if(active){
    if(app.state.position){
      const audience={help:'持續分享至刪除求助任務',expedition:app.state.room.name,squad:'僅「'+(app.currentSquad()?.name||'目前小隊')+'」成員可見',friends:'已接受邀請的好友可見',friends_squad:'好友與目前小隊成員可見',task:'有進行中的任務時提供即時位置',local:'即時位置不會上傳'};
      detail=app.LocationState.stale(app.lastPositionAt/1000)?`最後位置 · ${app.LocationState.age(app.lastPositionAt/1000)} · 未更新滿 15 分鐘後隱藏`:`精度 ±${Math.round(app.state.position.accuracy)}m · ${audience[app.state.scope]}`;
    }else detail=app.lastPositionAt&&!app.LocationState.valid(app.lastPositionAt/1000)?'超過 15 分鐘未更新，位置已隱藏；正在重新定位…':app.state.scope==='help'&&app.assistance?.error?'定位無法更新，請重試或刪除求助':'正在取得 GPS 定位…';
  }
  app.ui.locationDetail=detail;
}

function showHelpLocation(){
  app.dialog({kind:'helpLocation',rooms:app.assistance.rooms.map(r=>({...r})),error:app.assistance.error});
}

function showLocation(options={}){
  if(app.assistance?.active)return app.showHelpLocation();
  app.locationCardDismissed=false;app.renderLocation();
  const active=app.state.scope!=='off',joined=app.state.authenticated&&!app.state.demo&&!!app.state.room?.id,squad=joined?app.currentSquad():null;
  const selected=options.friends?'friends':active?app.state.scope:app.state.authenticated?'friends_squad':'local';
  const choices=[
    ['local','僅供本機使用','在自己的地圖計算方向與距離，不上傳即時位置。',false],
    ['friends_squad','好友與目前小隊（預設）','已接受的好友與目前小隊成員可查看；其他遠征隊成員看不到一般定位。',!app.state.authenticated],
    ['friends','只給好友','已互相接受邀請的好友可查看，不必加入同一隊伍。',!app.state.authenticated],
    ['squad','只給小隊',squad?`只有「${squad.name}」的目前成員可查看；離開或切換小隊後停止分享。`:'先加入小隊，才能選擇此項。',!squad],
    ['task','只給任務接取者','只有接取你進行中任務的人，可查看即時位置。',!joined]
  ];
  app.dialog({kind:'location',active,choices,selected});
  app.resources.bind(app.$('#location-form'), 'onsubmit', async event=>{
    event.preventDefault();await app.submit(event.target,async()=>{
      if(!navigator.geolocation)throw new Error('這個瀏覽器不支援定位。');
      const scope=new FormData(event.target).get('scope');
      if(!['local','friends','friends_squad','squad','task'].includes(scope))throw new Error('請選擇分享對象。');
      if(scope!=='local'&&!app.state.authenticated)throw new Error('請先登入帳號。');
      if(['squad','task'].includes(scope)&&!joined)throw new Error('請先加入遠征隊。');
      if(scope==='squad'&&(!squad||app.currentSquad()?.id!==squad.id))throw new Error('小隊已變更，請重新開啟定位設定。');
      const roomId=app.state.room?.id,userId=app.state.user.id;
      await app.stopLocation({revoke:true});
      if(app.state.room?.id!==roomId||app.state.user.id!==userId||scope==='squad'&&app.currentSquad()?.id!==squad.id)throw new Error('隊伍已變更，請重新開啟定位設定。');
      app.state.scope=scope;app.locationSquadId=scope==='squad'?squad.id:null;app.lastSent=0;const generation=app.locationGeneration;
      app.friends.sharing=['friends','friends_squad'].includes(scope);app.friends.lastSent=0;
      app.state.watch=app.resources.watchPosition(p=>app.receivePosition(p,generation),error=>app.locationError(error,generation),{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
      app.closeDialog();app.renderLocation();if(app.state.tab==='friends')app.renderPanel();app.toast('正在取得你的位置 · '+{local:'僅供本機使用',friends:'只與好友分享',friends_squad:'與好友及目前小隊分享',squad:'只與目前小隊分享',expedition:'只與目前遠征隊分享',task:'僅供任務接取者使用'}[scope]);
    });
  });
}

async function stopLocation({revoke=false,keepHelp=false,preservePosition=false,remote=true}={}){
  if(!preservePosition){app.locationCardDismissed=false;app.centerOnLocationFix=true;}
  app.locationGeneration++;
  app.locationSquadId=null;
  app.lastPublishedSampleAt=0;
  if(app.state.watch!=null)app.resources.clearWatch(app.state.watch);app.state.watch=null;const was=app.state.scope!=='off';app.state.scope='off';
  const shared=was||app.friends?.sharing||app.friends?.data.sharing||app.state.mine.scope!=='off';
  if(remote)await app.locationWrites.catch(()=>{});await app.friends?.stop({remote:false});
  try{if(remote&&!keepHelp&&app.state.authenticated&&(shared||revoke))await app.api('/location','DELETE');}
  finally{if(!preservePosition)app.state.position=null;app.renderLocation();app.renderMap();}
}

async function stopTeamLocation(){
  if(app.assistance?.active)return;
  if(!app.friends?.sharing&&!app.friends?.data.sharing)return app.stopLocation();
  if(!app.friends.sharing){
    app.locationGeneration++;app.lastPublishedSampleAt=0;
    if(app.state.watch!=null)app.resources.clearWatch(app.state.watch);
    app.state.watch=null;app.state.scope='off';app.state.position=null;
  }
  await app.locationWrites.catch(()=>{});
  if(!app.state.demo&&app.state.room?.id)await app.api(`/expeditions/${app.state.room.id}/location`,'DELETE');
  app.state.mine.scope='off';app.lastSent=0;
}

function receivePosition(p,generation){
  if(generation!==app.locationGeneration||app.state.scope==='off')return;
  if(Date.now()-p.timestamp>20000)return;
  app.lastPositionAt=p.timestamp;
  app.state.position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
  if(app.centerOnLocationFix){
    app.centerOnLocationFix=false;
    app.showPositionOnMap(app.state.position);
  }
  app.renderLocation();app.renderMap();
  if(app.state.scope==='friends')app.friends?.publish(app.state.position,p.timestamp);
  const combined=app.state.scope==='friends_squad';
  if(!combined&&(app.state.demo||!['task','squad'].includes(app.state.scope)))return;
  if(app.state.scope==='squad'&&(!app.locationSquadId||app.state.mine.squad!==app.locationSquadId))return;
  if(app.state.scope==='task'&&!app.state.tasks.some(t=>t.owner===app.state.user.id&&t.location_mode!=='fixed'&&['open','accepted'].includes(t.status)&&t.expires>Date.now()/1000))return;
  if(p.timestamp<=app.lastPublishedSampleAt||Date.now()-app.lastSent<4000)return;
  app.lastSent=Date.now();app.lastPublishedSampleAt=p.timestamp;const eid=app.state.demo?null:app.state.room.id,position={...app.state.position},scope=app.state.scope,squadId=combined?app.state.mine.squad:app.locationSquadId;
  app.locationWrites=app.locationWrites.catch(()=>{}).then(async()=>{
    if(generation!==app.locationGeneration||app.state.scope!==scope||!combined&&(app.state.demo||app.state.room.id!==eid)||combined&&(app.state.demo?null:app.state.room.id)!==eid||Date.now()-p.timestamp>20000)return;
    if(scope==='squad'&&app.state.mine.squad!==squadId)return;
    if(combined&&app.state.mine.squad!==squadId)return;
    try{await app.api(combined?'/location':`/expeditions/${eid}/location`,'PUT',{...position,scope,...(combined?{expedition_id:squadId?eid:null,squad_id:squadId||null}:scope==='squad'?{squad_id:squadId}:{})});if(combined)app.friends.data.sharing=true;if(generation===app.locationGeneration)await app.refresh();}catch(error){app.toast(error.message);if(['squad','friends_squad'].includes(scope)&&error.status===409&&generation===app.locationGeneration)await app.refresh();}
  });
}

function refreshGPS(force=false){
  if(app.gpsPending||app.state.watch==null||app.state.scope==='off'||document.hidden||!force&&Date.now()-app.lastSent<15000)return;
  const generation=app.locationGeneration;app.gpsPending=true;
  app.resources.getCurrentPosition(p=>{app.gpsPending=false;app.receivePosition(p,generation);},error=>{app.gpsPending=false;if(error.code===1)app.locationError(error,generation);},{enableHighAccuracy:true,maximumAge:force?0:5000,timeout:12000});
}

async function compass(){
  const D=window.DeviceOrientationEvent;
  if(!D)return app.toast('此裝置沒有指南針支援，方向提示維持北朝上。');
  try{
    if(typeof D.requestPermission==='function'&&(await D.requestPermission())!=='granted')return app.toast('未開啟指南針權限，方向維持北朝上。');
    app.resources.listen(window, 'deviceorientationabsolute',app.onOrientation);
    app.resources.listen(window, 'deviceorientation',app.onOrientation);
    app.toast('等待指南針訊號；沒有絕對方位時維持北朝上。');
  }catch{app.toast('此瀏覽器無法啟用指南針，方向維持北朝上。');}
}

function onOrientation(e){
  if(Number.isFinite(e.webkitCompassHeading))app.state.heading=(e.webkitCompassHeading+(screen.orientation?.angle||0))%360;
  else if(e.absolute&&Number.isFinite(e.alpha))app.state.heading=(360-e.alpha+(screen.orientation?.angle||0))%360;
  else return;
  app.MapPresence.updateSelf(app.$('#map .self-map-point'),app.LocationState.valid(app.lastPositionAt/1000)&&!app.LocationState.stale(app.lastPositionAt/1000)?app.state.heading:null);
  app.renderRadar();app.renderTarget();
}

function resumeLocation(){
  if(document.hidden||!app.config)return;
  app.refreshGPS(true);app.assistance?.tick(true);app.refresh();app.friends?.sync();
}
async function locationError(error,generation){
  if(generation!==app.locationGeneration)return;
  if(error.code===1){await app.stopLocation({revoke:true});app.toast('定位未獲允許，已撤回位置；請檢查瀏覽器設定。');}
  else{app.renderLocation();app.toast('定位暫時無法更新；最後位置保留 15 分鐘，正在重試。');}
}

return { memberSharesLocation, renderLocation, showHelpLocation, showLocation, stopLocation, stopTeamLocation, receivePosition, refreshGPS, compass, onOrientation, resumeLocation, locationError };
}
