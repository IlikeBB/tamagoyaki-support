export function createMapGuidance(app) {
function refreshTeammateGuidance(){
  app.renderFinder();
  if(app.guidanceKey()!==app.visibleTeammateKey){app.renderLocation();app.renderMap();}
  else app.$$('.radar-chip').forEach(chip=>chip.classList.toggle('is-selected',!app.finder?.root.hidden&&app.finder?.selectedId===chip.dataset.id));
}

function targetPoint(){
  const t=app.state.target;if(!t)return null;
  if(t.type==='venue'){const v=app.config.venues.find(v=>v.id===t.id);return v?{...v,title:v.name,mode:'場館地標'}:null;}
  if(t.type==='task'){
    const task=app.state.tasks.find(x=>x.id===t.id);
    if(!task||!['open','accepted'].includes(task.status)||!task.location_visible||task.lat==null||app.LocationState.moving(task)&&!app.LocationState.valid(task.located))return null;
    return {...task,mode:app.LocationState.source(task)};
  }
  if(t.type==='pin'){const pin=app.state.pins.find(x=>x.id===t.id&&(!app.pinFilters||app.pinFilters.matches(x)));return pin?{...pin,mode:pin.kind==='message'?'遠征隊地面留言':pin.expires?'臨時情報點':'定期情報點'}:null;}
  return null;
}

function renderTarget(){
  if(!app.resources.active)return;
  app.renderFinder();const el=app.$('#target-card'),target=app.targetPoint();el.classList.toggle('hidden',!target);
  const withBoard=!!target&&app.state.target?.type==='pin'&&target.kind!=='message'&&app.state.authenticated&&!app.state.demo;el.classList.toggle('has-reports',withBoard);
  if(!target){app.landmarkReports?.identity();app.landmarkReports?.detach();app.TamagoVue.renderTarget(el,{target:null});return;}
  const d=app.distance(app.state.position,target),b=app.state.position?app.bearing(app.state.position,target):null,ownStale=app.LocationState.stale(app.lastPositionAt/1000);
  app.TamagoVue.renderTarget(el,{target:{...target},type:app.state.target?.type,withBoard,demo:app.state.demo,age:target.kind==='message'?app.age(target.created):'',
    rotation:((b??0)-(app.state.heading??0)+360)%360,distance:d==null?'開啟定位':(ownStale||app.LocationState.lastKnown(target)?'約 ':'')+app.meters(d),
    direction:b==null?'定位後顯示相對距離':`${app.direction(b)} · ${app.state.heading==null?'北朝上，尚未啟用指南針':'相對手機朝向'}`,
    note:`直線方向，非步行路線${ownStale?` · 依你的最後位置（${app.LocationState.age(app.lastPositionAt/1000)}）估算`:''}${target.accuracy!=null?` · 對方精度 ±${Math.round(target.accuracy)}m`:''}`,
    voting:!!app.landmarkFeedback?.pending.has(target.id),deleting:app.pendingPinDeletes.has(target.id)});
  if(withBoard)app.landmarkReports?.mount(el.querySelector('.landmark-report-board'),{eid:app.state.room.id,pid:target.id});else app.landmarkReports?.detach();
}

function selectTarget(type,id){
  if(type==='venue'){
    if(!app.config.venues.some(v=>v.id===id))return;
    app.state.activeVenue=id;app.state.activityVenue=id;app.rememberVenue();app.renderVenueControl();
  }
  if(type==='pin'){const pin=app.state.pins.find(item=>item.id===id);if(pin)app.pinFilters?.reveal(pin);}
  if(['task','friend','member'].includes(type)&&app.navigationTargets().some(t=>t.id===id)){
    app.state.target=null;app.renderTarget();app.finder.open(id);app.showFinderTaskOnMap(id);return;
  }
  app.state.target={type,id};const p=app.targetPoint();
  if(!p){app.state.target=null;app.renderTarget();return app.toast('接取任務後，才會取得發布者座標。');}
  app.showPositionOnMap(p,type==='venue'?{animate:false}:undefined);app.renderMap();
}






function finderTasks(){
  if(app.state.demo||!app.state.authenticated||!app.state.online||document.hidden||!app.lastTeamSyncAt||Date.now()-app.lastTeamSyncAt>20000)return [];
  return app.state.tasks.filter(t=>(t.help_active||t.status==='accepted'&&t.assignee===app.state.user.id)&&t.owner!==app.state.user.id&&t.location_visible&&Number.isFinite(t.lat)&&Number.isFinite(t.lng)&&(t.help_active||t.expires>Date.now()/1000)&&(!app.LocationState.moving(t)||app.LocationState.valid(t.located)));
}

function expeditionPeople(){
  if(app.state.demo||!app.state.authenticated||!app.state.online||document.hidden||!app.lastTeamSyncAt||Date.now()-app.lastTeamSyncAt>20000)return [];
  return app.state.members.filter(m=>m.user!==app.state.user.id&&m.location_visible&&(m.scope==='expedition'||m.scope==='squad'&&!!app.state.mine.squad&&m.squad===app.state.mine.squad)&&Number.isFinite(m.lat)&&Number.isFinite(m.lng)&&app.LocationState.valid(m.located))
    .map(m=>({...m,id:'member:'+m.user,owner:m.user,owner_name:m.nickname,title:m.scope==='squad'?'小隊 · '+(app.currentSquad()?.name||'同行小隊'):'遠征隊 · '+app.state.room.name,kind:'member',location_source:m.help_shared?'help':m.scope}));
}

function sharedPeople(){
  const seen=new Set();return [...(app.friends?.targets()||[]),...app.expeditionPeople()].filter(p=>{if(seen.has(p.owner))return false;seen.add(p.owner);return true;});
}

function navigationTargets(){return [...app.sharedPeople(),...app.finderTasks()];}

function visiblePeople(){return app.navigationTargets();}

function renderFinder(){
  if(!app.resources.active)return;
  if(!app.finder)return;
  const joined=!app.state.demo&&app.state.authenticated&&!!app.state.room?.id;
  app.finder.update({roomId:app.state.authenticated?app.state.user.id:null,guest:!app.state.authenticated,ready:!!app.friends?.ready()||joined&&app.state.online&&!document.hidden&&app.lastTeamSyncAt>0&&Date.now()-app.lastTeamSyncAt<=20000,tasks:app.navigationTargets(),position:app.state.position&&app.LocationState.valid(app.lastPositionAt/1000)?app.state.position:null,positionLocated:app.lastPositionAt/1000,heading:app.state.heading});
}

function showFinderTaskOnMap(id){
  const target=app.navigationTargets().find(t=>t.id===id);if(!target)return;
  if(['friend','member'].includes(target.kind)){app.showPositionOnMap(target);app.renderMap();return;}
  app.showPositionOnMap(target);
}

return { refreshTeammateGuidance, targetPoint, renderTarget, selectTarget, finderTasks, expeditionPeople, sharedPeople, navigationTargets, visiblePeople, renderFinder, showFinderTaskOnMap };
}
