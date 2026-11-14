'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
function icons(root=document){$$('[data-icon]',root).forEach(el=>{TamagoVue.renderControl(el,{kind:'icon',name:el.dataset.icon});el.removeAttribute('data-icon');});}
const esc = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={trade:'交換',bounty:'懸賞',giveaway:'配布',help:'求助',dining:'聚餐'};
const pinTypes={booth:'特典／配布',toilet:'洗手間',shop:'商店',meet:'集合點',other:'其他地標',message:'地面留言'};
const state={demo:true,authenticated:false,user:{id:'me',nickname:'你'},room:null,rooms:[],members:[],tasks:[],pins:[],squads:[],mine:{squad:null,scope:'off'},activeVenue:'makuhari',tab:'tasks',filter:'all',query:'',position:null,heading:null,scope:'off',watch:null,radar:true,target:null,online:true,pending:false};
let map, layers, config, toastTimer, refreshing=false, lastSent=0, pollTimer;
let pinRevision=0,taskRevision=0;
const pendingPinDeletes=new Set();
let locationGeneration=0, locationWrites=Promise.resolve(), gpsPending=false, lastPositionAt=0, lastPublishedSampleAt=0;
let locationSquadId=null;
let authIntent=null;
let facilityLayer=null;
let finder=null,lastTeamSyncAt=0;
let friends=null;
let mapActions=null;
let placeSearch=null;
let assistance=null;
let appDisplay=null;
let chat=null,squadInvites=null;
let landmarkReports=null,pinFilters=null,expeditionPage=null,expeditionPreview=null,expeditionManagement=null,siteAccountAdmin=null,roomSettings=null,memberActions=null,pinReview=null,blockedPeople=null,roomAdmission=null;
let profilePage=null,landmarkFeedback=null,taskFeedback=null,news=null,chatFriend=null,groundMessages=null;
let locationCardDismissed=false;
let centerOnLocationFix=true;
let visibleTeammateKey='';

function finderTasks(){
  if(state.demo||!state.authenticated||!state.online||document.hidden||!lastTeamSyncAt||Date.now()-lastTeamSyncAt>20000)return [];
  return state.tasks.filter(t=>(t.help_active||t.status==='accepted'&&t.assignee===state.user.id)&&t.owner!==state.user.id&&t.location_visible&&Number.isFinite(t.lat)&&Number.isFinite(t.lng)&&(t.help_active||t.expires>Date.now()/1000)&&(!LocationState.moving(t)||LocationState.valid(t.located)));
}
function expeditionPeople(){
  if(state.demo||!state.authenticated||!state.online||document.hidden||!lastTeamSyncAt||Date.now()-lastTeamSyncAt>20000)return [];
  return state.members.filter(m=>m.user!==state.user.id&&m.location_visible&&(m.scope==='expedition'||m.scope==='squad'&&!!state.mine.squad&&m.squad===state.mine.squad)&&Number.isFinite(m.lat)&&Number.isFinite(m.lng)&&LocationState.valid(m.located))
    .map(m=>({...m,id:'member:'+m.user,owner:m.user,owner_name:m.nickname,title:m.scope==='squad'?'小隊 · '+(currentSquad()?.name||'同行小隊'):'遠征隊 · '+state.room.name,kind:'member',location_source:m.help_shared?'help':m.scope}));
}
function sharedPeople(){
  const seen=new Set();return [...(friends?.targets()||[]),...expeditionPeople()].filter(p=>{if(seen.has(p.owner))return false;seen.add(p.owner);return true;});
}
function memberSharesLocation(member){
  if(member.user===state.user.id&&assistance?.active&&assistance.rooms.some(r=>r.id===state.room.id))return true;
  if(member.user!==state.user.id)return expeditionPeople().some(p=>p.owner===member.user);
  return state.online&&['expedition','squad'].includes(state.mine.scope)&&LocationState.valid(state.mine.located);
}
function navigationTargets(){return [...sharedPeople(),...finderTasks()];}
function visiblePeople(){return navigationTargets();}
function renderFinder(){
  if(!finder)return;
  const joined=!state.demo&&state.authenticated&&!!state.room?.id;
  finder.update({roomId:state.authenticated?state.user.id:null,guest:!state.authenticated,ready:!!friends?.ready()||joined&&state.online&&!document.hidden&&lastTeamSyncAt>0&&Date.now()-lastTeamSyncAt<=20000,tasks:navigationTargets(),position:state.position&&LocationState.valid(lastPositionAt/1000)?state.position:null,positionLocated:lastPositionAt/1000,heading:state.heading});
}
function showFinderTaskOnMap(id){
  const target=navigationTargets().find(t=>t.id===id);if(!target)return;
  if(['friend','member'].includes(target.kind)){showPositionOnMap(target);renderMap();return;}
  showPositionOnMap(target);
}

async function initFacilityOverlay(){
  const ownerMap=map;
  const unavailable=()=>{facilityLayer?.remove();toast('場館圖暫時無法載入，仍可使用原有地圖。');};
  try{
    const response=await fetch('/static/maps/makuhari-facility-v2.json');
    if(!response.ok)throw new Error('facility map unavailable');
    const data=await response.json();
    if(ownerMap!==map)return;
    const options={pane:'facility',opacity:0.85,interactive:false,alt:'幕張展覽館場館示意圖，官方設施圖標已移除',className:'facility-overlay',attribution:'場館圖：<a href="https://www.m-messe.co.jp/facility/" target="_blank" rel="noopener">幕張展覽館</a>（移除圖標、約略對齊）'};
    if(map.isGoogle)facilityLayer=map.addFacility(data,options);
    else{
      map.createPane('facility');map.getPane('facility').style.zIndex='300';map.getPane('facility').style.pointerEvents='none';
      facilityLayer=L.imageOverlay(data.image,data.bounds,options);
    }
    facilityLayer.on('error',unavailable);
    facilityLayer.addTo(map);
  }catch{unavailable();}
}

async function api(path, method='GET', body){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Tamago-Client':'web'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await res.json();
    if(!res.ok){const error=new Error(typeof data.detail==='string'?data.detail:'請檢查欄位內容，再試一次。');error.status=res.status;throw error;}
    return data;
  }catch(e){if(e.name==='AbortError')throw new Error('連線逾時，請檢查網路後重試。');throw e;}
  finally{clearTimeout(timeout);}
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),5000);}
function activityDate(value,end){return value?(end&&end!==value?value+' ～ '+end:value):'未指定日期';}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function resetLobby(){
  if(!state.authenticated)assistance?.sync([]);
  mapActions?.dismiss();
  const preserveFriends=state.authenticated&&(friends?.sharing||assistance?.active);
  centerOnLocationFix=true;locationCardDismissed=false;
  lastTeamSyncAt=0;
  const stamp=Date.now()/1000;
  if(!preserveFriends){locationGeneration++;if(state.watch!=null)navigator.geolocation.clearWatch(state.watch);}
  Object.assign(state,{demo:true,room:{id:null,name:'尚未加入遠征隊',venue:'makuhari',event_date:'',code:''},rooms:[],position:preserveFriends?state.position:null,squads:[],members:[],tasks:[],mine:{squad:null,scope:'off'},scope:preserveFriends?state.scope:'off',watch:preserveFriends?state.watch:null,target:null,online:true});
  state.pins=[];
}
function activityVenues(){return config.activity_venues||config.venues;}
function activityVenue(){return activityVenues().some(v=>v.id===state.activityVenue)?state.activityVenue:state.activeVenue;}
function venue(){return config.venues.find(v=>v.id===state.activeVenue)||config.venues[0];}
function rememberVenue(){try{localStorage.setItem('tamago-map-venue',state.activeVenue);}catch{}}
function validMapPoint(point){return Number.isFinite(point?.lat)&&Number.isFinite(point?.lng);}
function renderVenueControl(){
  const select=$('#region-venue'),optionsKey=config.venues.map(v=>v.id+':'+v.short+':'+v.name).join('|');
  if(select.dataset.options!==optionsKey){TamagoVue.renderControl(select,{kind:'options',items:config.venues.map(v=>({...v}))});select.dataset.options=optionsKey;}
  select.value=venue().id;select.title='切換地圖場館：'+venue().name;
  $('#map-caption-text').textContent=venue().name;
}
function showPositionOnMap(point,options){
  if(!validMapPoint(point))return;
  showMap();if(map)map.setView([point.lat,point.lng],Math.max(map.getMinZoom(),17),options);
}
function focusVenue(){
  if(map)map.setView([venue().lat,venue().lng],16,{animate:false});
}
function switchVenue(id){
  if(!config.venues.some(v=>v.id===id))return;
  state.activeVenue=id;state.activityVenue=id;rememberVenue();state.target=null;
  focusVenue();render();
}
function distance(a,b){
  if(!a||!b||a.lat==null||b.lat==null)return null;
  const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function bearing(a,b){const r=Math.PI/180,x=Math.sin((b.lng-a.lng)*r)*Math.cos(b.lat*r),y=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lng-a.lng)*r);return (Math.atan2(x,y)/r+360)%360;}
function meters(d){return d==null?'未定位':d<1000?`${Math.round(d)} m`:`${(d/1000).toFixed(1)} km`;}
function direction(deg){return ['北','東北','東','東南','南','西南','西','西北'][Math.round(deg/45)%8];}
function age(stamp){const min=Math.max(0,Math.floor((Date.now()/1000-stamp)/60));return min<1?'剛剛':min<60?`${min} 分鐘前`:`${Math.floor(min/60)} 小時前`;}
function avatar(name,index=0){return `<span class="avatar ${['','orange','blue'][index%3]}">${esc([...name][0]||'友')}</span>`;}
function currentSquad(){return state.squads.find(s=>s.id===state.mine.squad);}

async function initMap(forceLeaflet=false){
  if(!window.L){TamagoVue.renderControl($('#map'),{kind:'error',title:'地圖元件載入失敗',detail:'請重新整理。任務面板仍可使用。'});return;}
  if(config.maps?.provider==='google'&&!forceLeaflet){
    try{map=await TamagoGoogleMap.create('map',config.maps);}
    catch{forceLeaflet=true;}
  }
  $('#map-provider-notice').hidden=!(forceLeaflet&&config.maps?.provider==='google');
  if(!map?.isGoogle){
    map=L.map('map',{zoomControl:false,zoomSnap:0.25,minZoom:2}).setView([35.6483,140.0353],16);
    L.tileLayer(config.tile_url,{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
  }
  $('#map').classList.toggle('google-map',!!map.isGoogle);
  document.body.classList.toggle('google-basemap',!!map.isGoogle);
  layers=map.isGoogle?map.layerGroup():L.layerGroup().addTo(map);
  initFacilityOverlay();
  map.on(map.isGoogle?'bounds_changed':'movestart',()=>mapActions?.dismiss());
  map.on('resize',()=>renderRadar());
  focusVenue();
}
function marker(point,html,label,onClick){
  if(!map||point.lat==null)return;
  if(map.isGoogle)return map.addMarker(point,html,label,onClick,layers);
  const m=L.marker([point.lat,point.lng],{icon:L.divIcon({html,className:'custom-marker',iconSize:[40,40],iconAnchor:[20,20]}),title:label,alt:label,keyboard:!!onClick}).addTo(layers);
  m.on('remove',()=>TamagoVue.releaseMapMarker(html));
  if(onClick){
    m.on('click',onClick);
    m.getElement().addEventListener('keydown',event=>{
      if(!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();
      if(event.key==='Enter'&&!event.repeat)onClick();
    });
    m.getElement().addEventListener('keyup',event=>{if(event.key===' '){event.preventDefault();event.stopPropagation();onClick();}});
  }
  return m;
}
function renderMap(){
  if(!map||document.body.classList.contains('expeditions-open'))return;
  const allowed=new Set(finderTasks().map(t=>t.id));
  const sharedPoints=sharedPeople();
  const sharedOwners=new Set(sharedPoints.map(p=>p.owner)),helpOwners=new Set();
  visibleTeammateKey=guidanceKey();
  layers.clearLayers();
  config.venues.filter(validMapPoint).forEach(v=>marker(v,TamagoVue.createMapMarker({kind:'venue',current:v.id===state.activeVenue,label:v.short}),`${v.name} · 場館地標`,()=>selectTarget('venue',v.id)));
  if(placeSearch?.selected&&validMapPoint(placeSearch.selected))marker(placeSearch.selected,TamagoVue.createMapMarker({kind:'pin',className:'blue search-result-marker',icon:'search'}),`${placeSearch.selected.name} · 搜尋結果`,()=>placeSearch.showSelected());
  state.pins.filter(validMapPoint).filter(p=>!pinFilters||pinFilters.matches(p)).forEach(p=>{
    const html=TamagoVue.createMapMarker({kind:p.kind==='message'?'message':'pin',className:'blue',icon:p.kind==='shop'?'shop':'pin'});
    marker(p,html,p.kind==='message'?'地面留言 · '+p.title:p.title,()=>selectTarget('pin',p.id));
  });
  state.tasks.filter(t=>['open','accepted'].includes(t.status)&&(t.owner===state.user.id||allowed.has(t.id))&&validMapPoint(t)).forEach(t=>{
    if(t.help_active&&(sharedOwners.has(t.owner)||helpOwners.has(t.owner)))return;
    if(t.help_active)helpOwners.add(t.owner);
    if(t.help_active)marker(t,TamagoVue.createMapMarker({kind:'help'}),`${t.owner_name} · 求助 · ${t.title}`,()=>selectTarget('task',t.id));
    else if(t.location_mode==='fixed')marker(t,TamagoVue.createMapMarker({kind:'pin',className:'fixed-task',icon:'flag'}),`${t.title} · 固定任務旗標`,()=>selectTarget('task',t.id));
    else if(allowed.has(t.id)){
      if(sharedOwners.has(t.owner))return;
      personMarker(t);
    }else marker(t,TamagoVue.createMapMarker({kind:'pin',icon:t.kind==='giveaway'?'gift':'flag'}),t.title,()=>selectTarget('task',t.id));
  });
  sharedPoints.filter(validMapPoint).forEach(personMarker);
  if(state.position&&LocationState.valid(lastPositionAt/1000)&&validMapPoint(state.position)&&!state.tasks.some(t=>t.help_active&&t.owner===state.user.id&&t.location_visible&&validMapPoint(t))){
    const stale=LocationState.stale(lastPositionAt/1000),accuracy=Number.isFinite(state.position.accuracy)?`±${Math.round(state.position.accuracy)}m`:'目前位置';
    marker(state.position,MapPresence.render({kind:'self',angle:stale?null:state.heading,lastKnown:stale,label:`你 · ${stale?`最後位置 · ${LocationState.age(lastPositionAt/1000)}`:accuracy}`}),'我的位置');
    MapPresence.updateSelf($('#map .self-map-point'),stale?null:state.heading);
  }
  pinFilters?.update(state.pins.filter(validMapPoint));renderRadar();renderTarget();
}
function personMarker(t){
  if(t.help_shared||t.help_active)return marker(t,TamagoVue.createMapMarker({kind:'help',label:LocationState.lastKnown(t)?`最後位置 · ${LocationState.age(t.located)}`:''}),`${t.owner_name} · ${LocationState.source(t)}`,()=>selectTarget(['friend','member'].includes(t.kind)?t.kind:'task',t.id));
  const hasPosition=!!state.position&&LocationState.valid(lastPositionAt/1000),angle=hasPosition?bearing(state.position,t):null;
  const relation=t.kind==='friend'?'heart':t.kind==='member'?'users':null,stale=LocationState.lastKnown(t),ownStale=hasPosition&&LocationState.stale(lastPositionAt/1000);
  const symbol=relation?'':[...(t.owner_name||'隊友')][0];
  const label=`${t.owner_name}${stale?` · 最後位置 · ${LocationState.age(t.located)}`:t.kind==='friend'?' · 好友':t.kind==='member'?t.location_source==='squad'?' · 小隊':' · 遠征隊':''}${ownStale?' · 方位估算':''}`;
  const html=MapPresence.render({kind:t.kind,angle,symbol,label,lastKnown:stale||ownStale});
  const guidance=angle===null?'取得你的位置後可顯示方位':`從你的位置往${direction(angle)}方向${ownStale?' · 依最後位置估算':''}`;
  marker(t,html,`${t.owner_name} · ${t.title} · ${guidance}`,()=>selectTarget(['friend','member'].includes(t.kind)?t.kind:'task',t.id));
}
function renderRadar(){
  const root=$('#radar');
  if(!state.radar||!state.position||!LocationState.valid(lastPositionAt/1000)){TamagoVue.renderRadar(root,{items:[]});return;}
  const owners=new Set(),tasks=visiblePeople().filter(validMapPoint).filter(t=>{const key=t.location_mode==='fixed'?t.id:t.owner;if(owners.has(key))return false;owners.add(key);return true;}).slice(0,8);
  const items=tasks.map(t=>{
    const angle=bearing(state.position,t),relative=(angle-(state.heading??0)+360)%360;
    const d=(LocationState.stale(lastPositionAt/1000)||LocationState.lastKnown(t)?'約 ':'')+meters(distance(state.position,t));
    const source=LocationState.lastKnown(t)?`最後位置 · ${LocationState.age(t.located)}`:t.location_source==='help'?'求助':t.kind==='friend'?'好友':t.kind==='member'?t.location_source==='squad'?'小隊':'遠征隊':t.location_source==='fixed'?'任務旗標':t.location_source==='live'?'即時':'發布點';
    return {...t,relative,distance:d,source,selected:!finder?.root.hidden&&finder?.selectedId===t.id,label:`${t.owner_name} · ${t.title} · ${direction(angle)} · ${d} · ${source}`};
  });
  TamagoVue.renderRadar(root,{items});const occupied=[];
  for(const item of items){
    const chip=[...root.querySelectorAll('.radar-chip')].find(el=>el.dataset.id===item.id),r=item.relative*Math.PI/180;
    const x=root.clientWidth*(.5+.44*Math.sin(r)),desired=root.clientHeight*(.5-.44*Math.cos(r));
    const w=chip.offsetWidth,h=chip.offsetHeight,clamp=y=>Math.max(h/2,Math.min(y,root.clientHeight-h/2));let y=clamp(desired);
    for(const step of [0,1,-1,2,-2,3,-3,4,-4]){const trial=clamp(desired+step*(h+6));if(!occupied.some(box=>Math.abs(box.x-x)<(box.w+w)/2+5&&Math.abs(box.y-trial)<(box.h+h)/2+5)){y=trial;break;}}
    chip.style.left=x+'px';chip.style.top=y+'px';occupied.push({x,y,w,h});
  }
}
function guidanceKey(){
  return visiblePeople().map(t=>`${t.id}:${LocationState.lastKnown(t)?LocationState.age(t.located):'live'}`).sort().join(',')+`|${state.position&&LocationState.stale(lastPositionAt/1000)?LocationState.age(lastPositionAt/1000):''}`;
}
function refreshTeammateGuidance(){
  renderFinder();
  if(guidanceKey()!==visibleTeammateKey){renderLocation();renderMap();}
  else $$('.radar-chip').forEach(chip=>chip.classList.toggle('is-selected',!finder?.root.hidden&&finder?.selectedId===chip.dataset.id));
}
function targetPoint(){
  const t=state.target;if(!t)return null;
  if(t.type==='venue'){const v=config.venues.find(v=>v.id===t.id);return v?{...v,title:v.name,mode:'場館地標'}:null;}
  if(t.type==='task'){
    const task=state.tasks.find(x=>x.id===t.id);
    if(!task||!['open','accepted'].includes(task.status)||!task.location_visible||task.lat==null||LocationState.moving(task)&&!LocationState.valid(task.located))return null;
    return {...task,mode:LocationState.source(task)};
  }
  if(t.type==='pin'){const pin=state.pins.find(x=>x.id===t.id&&(!pinFilters||pinFilters.matches(x)));return pin?{...pin,mode:pin.kind==='message'?'遠征隊地面留言':pin.expires?'臨時情報點':'定期情報點'}:null;}
  return null;
}
function renderTarget(){
  renderFinder();const el=$('#target-card'),target=targetPoint();el.classList.toggle('hidden',!target);
  const withBoard=!!target&&state.target?.type==='pin'&&target.kind!=='message'&&state.authenticated&&!state.demo;el.classList.toggle('has-reports',withBoard);
  if(!target){landmarkReports?.identity();landmarkReports?.detach();TamagoVue.renderTarget(el,{target:null});return;}
  const d=distance(state.position,target),b=state.position?bearing(state.position,target):null,ownStale=LocationState.stale(lastPositionAt/1000);
  TamagoVue.renderTarget(el,{target:{...target},type:state.target?.type,withBoard,demo:state.demo,age:target.kind==='message'?age(target.created):'',
    rotation:((b??0)-(state.heading??0)+360)%360,distance:d==null?'開啟定位':(ownStale||LocationState.lastKnown(target)?'約 ':'')+meters(d),
    direction:b==null?'定位後顯示相對距離':`${direction(b)} · ${state.heading==null?'北朝上，尚未啟用指南針':'相對手機朝向'}`,
    note:`直線方向，非步行路線${ownStale?` · 依你的最後位置（${LocationState.age(lastPositionAt/1000)}）估算`:''}${target.accuracy!=null?` · 對方精度 ±${Math.round(target.accuracy)}m`:''}`,
    voting:!!landmarkFeedback?.pending.has(target.id),deleting:pendingPinDeletes.has(target.id)});
  if(withBoard)landmarkReports?.mount(el.querySelector('.landmark-report-board'),{eid:state.room.id,pid:target.id});else landmarkReports?.detach();
}
function selectTarget(type,id){
  if(type==='venue'){
    if(!config.venues.some(v=>v.id===id))return;
    state.activeVenue=id;state.activityVenue=id;rememberVenue();renderVenueControl();
  }
  if(type==='pin'){const pin=state.pins.find(item=>item.id===id);if(pin)pinFilters?.reveal(pin);}
  if(['task','friend','member'].includes(type)&&navigationTargets().some(t=>t.id===id)){
    state.target=null;renderTarget();finder.open(id);showFinderTaskOnMap(id);return;
  }
  state.target={type,id};const p=targetPoint();
  if(!p){state.target=null;renderTarget();return toast('接取任務後，才會取得發布者座標。');}
  showPositionOnMap(p,type==='venue'?{animate:false}:undefined);renderMap();
}
function render(){
  chatFriend?.identity();chat?.identity();profilePage?.identity();expeditionPreview?.sync();expeditionManagement?.sync();siteAccountAdmin?.sync();roomSettings?.sync();memberActions?.sync();pinReview?.sync();blockedPeople?.sync();roomAdmission?.sync();syncNewsFriends();
  const withoutRoomContext=['tasks','friends'].includes(state.tab);
  $('.sidebar-room-context').hidden=withoutRoomContext;$('.sidebar').classList.toggle('without-room-context',withoutRoomContext);
  $('#room-name').textContent=state.room.name;$('#room-date').textContent=state.demo?'建立或加入遠征隊，和夥伴一起出發':`${activitySchedule(state.room)} · ${activityVenues().find(v=>v.id===state.room.venue)?.name||''}`;
  renderVenueControl();
  $('#demo-banner').classList.toggle('hidden',!state.demo);
  $('.map-stage').classList.toggle('lobby',state.demo);
  const c=$('#connection');c.classList.toggle('offline',!state.online);TamagoVue.renderControl(c,{kind:'connection',label:state.demo?'尚未組隊':state.online?'已同步 · 每 5 秒更新':'連線中斷 · 位置已隱藏'});
  $('#join-label').textContent='好友';
  $('#account-label').textContent=state.authenticated?state.user.nickname:'登入';
  const accountPhoto=state.authenticated&&state.user.avatar_url;$('#account-avatar').hidden=!accountPhoto;$('#account-button').classList.toggle('has-avatar',!!accountPhoto);if(accountPhoto)$('#account-avatar').src=accountPhoto;else $('#account-avatar').removeAttribute('src');
  $('#account-button').setAttribute('aria-label',state.authenticated?'個人檔案：'+state.user.nickname:'登入或註冊帳號');
  $('#task-count').textContent=state.tasks.filter(t=>t.status==='open').length;
  $('#member-count').textContent=state.members.length;$('#pin-count').textContent=state.pins.length;
  $('#friend-count').textContent=friends?.data.friends.length||0;
  $$('.section-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  const names={tasks:['QUEST BOARD','現場的願望，現場實現。'],members:['PARTY MEMBERS','一起遠征，位置自己決定。'],friends:['FRIENDS',''],pins:['TEAM INTELLIGENCE','']};
  $('#panel-eyebrow').textContent=names[state.tab][0];$('#panel-title').textContent=names[state.tab][1];
  $('#panel-title').classList.toggle('hidden',!names[state.tab][1]);
  $('.panel-heading').classList.toggle('hidden',['members','pins'].includes(state.tab));
  $('#publish-small').setAttribute('aria-label',state.tab==='pins'?'發布地標':state.tab==='members'?'建立情報點':'發布任務');
  $('#publish-small').classList.toggle('hidden',state.tab==='friends');
  $('#search').placeholder=state.tab==='friends'?'搜尋好友暱稱或帳號…':state.tab==='tasks'?'找交換、配布物、或一點幫忙…':state.tab==='members'?'找你的遠征夥伴…':'找攤位、商店、或集合點…';
  TamagoVue.renderControl($('#filters'),{kind:'filters',items:state.tab==='tasks'?Object.entries({all:'全部',...types,mine:'我的任務'}):[],selected:state.filter});
  renderPanel();renderLocation();renderMap();expeditionPage?.sync();
}
function empty(title,detail){return `<div class="empty">${icon('spark')}<strong>${esc(title)}</strong>${esc(detail)}</div>`;}
function renderPanel(){
  const root=$('#panel-content'),q=state.query.toLocaleLowerCase();
  if(state.tab==='friends'){TamagoVue.clearWorkspace(root);friends.mount(root,q);return;}
  friends?.unmount();
  const match=x=>[x.title,x.description,x.nickname,x.owner_name].some(v=>v?.toLocaleLowerCase().includes(q));
  const tasks=state.tasks.filter(t=>['open','accepted'].includes(t.status)&&match(t)&&(state.filter==='all'||state.filter===t.kind||(state.filter==='mine'&&(t.owner===state.user.id||t.assignee===state.user.id)))).map(t=>{
    const own=t.owner===state.user.id,accepted=t.assignee===state.user.id;
    return {...t,own,accepted,age:age(t.created),
      caption:t.help_active?'查看求助位置':own?'查看任務位置':accepted?(t.location_mode==='fixed'?'前往旗標':'前往會合'):t.status==='accepted'?'已有人接取':'接取任務',
      action:!t.help_active&&!own&&!accepted&&t.status==='open'?'accept':'task-target',
      privateNote:t.help_active?`全遠征隊可見 · ${t.location_visible?meters(distance(state.position,t)):'等待有效定位'} · 持續至刪除`:(t.location_mode==='fixed'?'固定任務旗標 · ':'')+(t.location_visible?meters(distance(state.position,t)):'座標僅接取者可見')};
  });
  TamagoVue.renderWorkspace(root,{tab:state.tab,query:q,demo:state.demo,user:{...state.user},owner:state.room?.owner,
    types,pinTypes,tasks,pins:state.pins.filter(match).map(p=>({...p})),
    members:state.members.filter(match).map(m=>({...m,shares:memberSharesLocation(m),targetId:(expeditionPeople().find(t=>t.owner===m.user)||finderTasks().find(t=>t.owner===m.user))?.id})),
    allMembers:state.members.map(m=>({...m})),squads:state.squads.map(s=>({...s})),mine:{...state.mine},
    manager:state.room?.owner===state.user.id||state.mine.deputy,deleting:[...pendingPinDeletes],
    pinVotes:[...(landmarkFeedback?.pending||[])],taskVotes:[...(taskFeedback?.pending||[])]});
}
function renderLocation(){
  const active=state.scope!=='off';
  $('.location-card').classList.toggle('location-active',active);
  $('.location-card').classList.toggle('hidden',active&&locationCardDismissed);
  $('#location-dismiss').classList.toggle('hidden',!active);
  $('#location-reopen').classList.toggle('hidden',!active||!locationCardDismissed);
  const labels={help:'求助中 · 全遠征隊可見',local:'僅供本機使用',friends:'僅與好友分享',friends_squad:'好友與目前小隊可見',expedition:'與目前遠征隊分享',squad:'僅與目前小隊分享',task:'任務接取者限定'};
  $('#location-title').textContent=active?'定位已開啟 · '+labels[state.scope]:'定位分享，由你決定。';
  let detail='預設與好友及目前小隊分享';
  if(active){
    if(state.position){
      const audience={help:'持續分享至刪除求助任務',expedition:state.room.name,squad:'僅「'+(currentSquad()?.name||'目前小隊')+'」成員可見',friends:'已接受邀請的好友可見',friends_squad:'好友與目前小隊成員可見',task:'有進行中的任務時提供即時位置',local:'即時位置不會上傳'};
      detail=LocationState.stale(lastPositionAt/1000)?`最後位置 · ${LocationState.age(lastPositionAt/1000)} · 未更新滿 15 分鐘後隱藏`:`精度 ±${Math.round(state.position.accuracy)}m · ${audience[state.scope]}`;
    }else detail=lastPositionAt&&!LocationState.valid(lastPositionAt/1000)?'超過 15 分鐘未更新，位置已隱藏；正在重新定位…':state.scope==='help'&&assistance?.error?'定位無法更新，請重試或刪除求助':'正在取得 GPS 定位…';
  }
  $('#location-detail').textContent=detail;
  $('#location-button').textContent=active?'定位設定':'開啟定位';
}
function setTab(tab){hideExpeditionPage();mapActions?.dismiss();placeSearch?.close();state.tab=tab;state.query='';$('#search').value='';state.filter='all';$('.workspace').classList.add('panel-open');$$('.mobile-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));render();$('#panel-content').scrollTop=0;}
function showMap(){hideExpeditionPage();$('.workspace').classList.remove('panel-open');$$('.mobile-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.mobile==='map'));if(map)setTimeout(()=>map.invalidateSize(),30);}
function dialog(model){mapActions?.dismiss();placeSearch?.close();TamagoVue.renderDialog($('#dialog-body'),model);if(!$('#dialog').open)$('#dialog').showModal();}
function closeDialog(){$('#dialog').close();}

function showAuth(mode='login'){
  const registering=mode==='register';
  dialog({kind:'auth',registering});
  $('#auth-form').onsubmit=async e=>{e.preventDefault();await submit(e.target,async()=>{
    const f=new FormData(e.target);
    if(registering&&f.get('password')!==f.get('confirm'))throw new Error('兩次輸入的密碼不一致。');
    const body={username:f.get('username'),password:f.get('password')};
    if(registering)body.nickname=f.get('nickname');
    const u=await api('/auth/'+(registering?'register':'login'),'POST',body);
    friends.reset();
    resetLobby();state.user=u;state.authenticated=true;
    const me=await api('/me');state.rooms=me.expeditions;state.user={...u,...me.user};
    if(state.rooms.length){let saved;try{saved=localStorage.getItem('tamago-room');}catch{}await enterRoom(state.rooms.find(r=>r.id===saved)||state.rooms[0],state.user);}
    await friends.sync();render();const intent=authIntent;authIntent=null;closeDialog();
    toast(registering?'帳號已建立，歡迎加入支援隊！':'登入成功，歡迎回來。');
    if(intent?.kind==='join')showJoin(intent.mode);
    else if(intent?.kind==='chat')chat.open();
    else if(intent?.kind==='profile')profilePage.open(intent.uid);
    else if(intent?.kind==='expeditions-page'){showExpeditionPage();expeditionPage.selectMode(intent.mode);}
    chat.tick();
  });};
}
function showAccount(){
  if(!state.authenticated){authIntent=null;return showAuth();}
  dialog({kind:'account',user:{...state.user},dark:TamagoTheme.dark()});
  $('#profile-form').onsubmit=async e=>{e.preventDefault();await submit(e.target,async()=>{state.user={...state.user,...await api('/profile','POST',{nickname:new FormData(e.target).get('nickname')})};render();closeDialog();await refresh();toast('暱稱已更新。');});};
}
function showSettings(){
  if(state.authenticated)return showAccount();
  dialog({kind:'settings',dark:TamagoTheme.dark()});
}
function showPasswordSettings(){
  dialog({kind:'password'});
  $('#password-form').onsubmit=async e=>{e.preventDefault();await submit(e.target,async()=>{const f=new FormData(e.target);if(f.get('new_password')!==f.get('confirm'))throw new Error('兩次輸入的新密碼不一致。');await api('/auth/password','POST',{current_password:f.get('current_password'),new_password:f.get('new_password')});await stopLocation();closeDialog();await refresh();toast('密碼已更新，其他裝置已登出。');});};
}
async function logout(){
  await assistance?.stop({suspend:true,remote:true});
  try{await stopLocation();}catch{}
  await api('/auth/logout','POST',{});
  friends.reset();state.authenticated=false;state.user={id:'me',nickname:'你'};authIntent=null;resetLobby();
  chat?.identity();profilePage?.identity();
  try{localStorage.removeItem('tamago-room');}catch{}
  closeDialog();render();showMap();toast('已登出，定位分享已停止。');
}
function showJoin(mode='browse'){
  if(mode==='join')mode='browse';
  if(!state.authenticated){authIntent={kind:'join',mode};return showAuth();}
  const params=new URLSearchParams(location.search),squadInvitation=mode==='code'&&/^[A-Za-z0-9]{8}$/.test(params.get('squad')||'');
  const joinModel={kind:'join',mode,squadInvitation,user:{...state.user},venues:activityVenues().map(v=>({...v})),venue:activityVenue(),code:params.get('join')||'',today:today()};
  if(mode==='browse'){
    dialog({...joinModel});
    let generation=0;
    async function loadCatalog(vid){
      const current=++generation,list=$('#venue-catalog');
      try{
        const result=await api(`/venues/${vid}/expeditions`);
        if(current!==generation||!list.isConnected)return;
        TamagoVue.renderList(list,'catalog',{items:result.expeditions.map(room=>({...room,schedule:activityDate(room.event_date,room.event_end_date),joined:state.rooms.some(r=>r.id===room.id)}))});
        list.onclick=async event=>{
          const button=event.target.closest('[data-room-id]');if(!button||button.disabled)return;
          button.disabled=true;
          try{const room=await roomAdmission.join(button.dataset.roomId,state.user.id);if(room)await finishRoomJoin(room,false);}
          catch(error){toast(error.message);button.disabled=false;}
        };
      }catch(error){if(list.isConnected)TamagoVue.renderList(list,'error',{error:error.message});}
    }
    $('#join-venue').onchange=event=>{state.activityVenue=event.target.value;switchVenue(event.target.value);loadCatalog(event.target.value);};
    loadCatalog(activityVenue());return;
  }
  dialog({...joinModel});
  if(mode==='create'){
    const start=$('#event-date'),end=$('#event-end-date');
    const syncDates=()=>{const enabled=$('#include-date').checked;$('#event-date-fields').hidden=!enabled;start.disabled=!enabled;start.required=enabled;end.disabled=!enabled||!start.value;end.min=start.value;};
    $('#include-date').onchange=syncDates;start.oninput=syncDates;syncDates();
  }
  $('#join-form').onsubmit=async event=>{
    event.preventDefault();await submit(event.target,async()=>{
      const f=new FormData(event.target);
      const room=mode==='code'?await api('/join','POST',{code:f.get('code').toUpperCase(),...(f.get('password')?{password:f.get('password')}:{}),...(squadInvitation?{squad_code:params.get('squad').toUpperCase()}:{})}):await api('/expeditions','POST',{name:f.get('name'),venue:f.get('venue'),event_date:f.has('include_date')?f.get('event_date'):null,event_end_date:f.has('include_date')?(f.get('event_end_date')||null):null,discoverable:f.has('discoverable')});
      await finishRoomJoin(room,mode==='create');
    });
  };
}
async function finishRoomJoin(room,created){
  const params=new URLSearchParams(location.search);
  await enterRoom(room,state.user);
  const squadCode=params.get('squad');let squadError=null;
  if(squadCode&&!room.squad_joined){try{await api(`/expeditions/${room.id}/squads/join`,'POST',{code:squadCode});await refresh();}catch(error){squadError=error.message;}}
  closeDialog();showMap();history.replaceState(null,'',location.pathname);
  toast(squadError?'已加入遠征隊；小隊未加入：'+squadError:squadCode?'已加入遠征隊與小隊，可在定位設定選擇分享對象。':'已加入遠征隊，可在定位設定選擇分享對象。');
  if(created&&!room.discoverable)showInvite();
}
async function submit(form,fn){
  const b=$('[type=submit]',form),error=$('.form-error',form);if(b?.disabled)return;if(b)b.disabled=true;
  try{if(error)error.textContent='';await fn();}catch(e){if(error)error.textContent=e.message;else toast(e.message);}finally{if(b)b.disabled=false;}
}
async function enterRoom(room,u,{preserveMap=false}={}){
  mapActions?.dismiss();
  if(assistance)assistance.suspended=false;
  await stopTeamLocation();lastTeamSyncAt=0;state.demo=false;state.user=u;state.room=room;state.target=null;state.query='';$('#search').value='';
  state.activityVenue=room.venue;
  if(!preserveMap&&config.venues.some(v=>v.id===room.venue)){state.activeVenue=room.venue;rememberVenue();}
  try{localStorage.setItem('tamago-room',room.id);}catch{}
  await refresh();focusVenue();
  const me=await api('/me');state.rooms=me.expeditions;state.user={...u,...me.user};
}
async function refresh({fresh=false}={}){
  if(state.demo||document.hidden)return;
  const roomId=state.room.id,userId=state.user.id,pinsAtStart=pinRevision,tasksAtStart=taskRevision;
  if(refreshing){const pending=refreshing;await pending;if((fresh||pending.context!==roomId+':'+userId)&&state.room.id===roomId&&state.user.id===userId)return refresh();return;}
  refreshing=(async()=>{
  try{
    const data=await api(`/expeditions/${roomId}`);
    if(state.demo||state.room.id!==roomId||state.user.id!==userId)return;
    const priorSquad=state.mine.squad;
    Object.assign(state,{room:data.room,members:data.members,tasks:tasksAtStart===taskRevision?data.tasks:state.tasks,pins:pinsAtStart===pinRevision?data.pins:state.pins,squads:data.squads,mine:data.me,online:true});lastTeamSyncAt=Date.now();
    if(state.scope==='friends_squad'&&priorSquad!==data.me.squad){
      lastSent=0;lastPublishedSampleAt=0;
      if(state.position&&Date.now()-lastPositionAt<20000)receivePosition({coords:{latitude:state.position.lat,longitude:state.position.lng,accuracy:state.position.accuracy},timestamp:lastPositionAt},locationGeneration);
      else refreshGPS(true);
    }
    if(state.scope==='squad'&&data.me.squad!==locationSquadId){await stopLocation({remote:false});toast('小隊已變更，請重新選擇定位分享對象。');}
    assistance?.sync(data.help_rooms||[]);render();
  }catch(e){
    if(state.demo||state.room.id!==roomId||state.user.id!==userId)return;
    if([401,403,404].includes(e.status)){
      let me=null;if(e.status===401){friends.reset();state.authenticated=false;state.user={id:'me',nickname:'你'};}else{try{me=await api('/me');}catch{}}
      assistance?.sync(me?.help_rooms||[]);resetLobby();state.rooms=me?.expeditions||[];try{localStorage.removeItem('tamago-room');}catch{}render();chat?.tick();toast(e.status===401?'登入已失效，請重新登入。':'遠征隊已不存在或已退出，已回到地圖首頁。');
    }
    else{state.online=false;state.members=state.members.map(m=>({...m,lat:null,lng:null}));render();}
  }
  finally{refreshing=false;}
  })();refreshing.context=roomId+':'+userId;return refreshing;
}
function showInvite(squad=false){
  if(state.demo)return showJoin('create');const s=squad?currentSquad():state.room;if(!s)return;
  const url=location.origin+'/?join='+state.room.code+(squad?'&squad='+s.code:'');
  dialog({kind:'invite',squad:!!squad,room:{...s},url});
  if(squad)squadInvites.mount($('#squad-invite-friends'),{eid:state.room.id,sid:s.id,user:state.user.id});
}
function showRooms(){showExpeditionPage();}
function expeditionRoute(){return ['#expeditions','#expeditions-main'].includes(location.hash);}
function showExpeditionPage({route=true,focus=true}={}){
  if(!expeditionPage||!config)return;
  closeDialog();mapActions?.dismiss();placeSearch?.close();
  if(route&&!expeditionRoute())history.pushState(null,'',location.pathname+location.search+'#expeditions');
  document.body.classList.add('expeditions-open');$('#expeditions-page').hidden=false;
  $('.skip-link').href='#expeditions-main';document.title='遠征隊 · 玉子燒支援隊';
  $$('.mobile-tabs button').forEach(button=>button.classList.toggle('active',button.dataset.action==='expeditions'));
  $$('[data-action=expeditions]').forEach(button=>button.setAttribute('aria-current','page'));
  expeditionPage.open({focus});
}
function hideExpeditionPage(){
  if(!expeditionPage?.visible())return;
  $('#expeditions-page').hidden=true;document.body.classList.remove('expeditions-open');
  $('.skip-link').href='#panel-content';document.title='玉子燒支援隊 · Tamagoyaki Support';
  $$('[data-action=expeditions]').forEach(button=>button.removeAttribute('aria-current'));
  if(expeditionRoute())history.pushState(null,'',location.pathname+location.search);
  renderMap();if(map)setTimeout(()=>map.invalidateSize(),30);
}
window.addEventListener('hashchange',()=>{if(!config)return;if(expeditionRoute()&&!expeditionPage?.visible())showExpeditionPage({route:false});else if(!expeditionRoute()&&expeditionPage?.visible()){closeDialog();showMap();}});
window.addEventListener('popstate',()=>{if(!config)return;if(expeditionRoute()&&!expeditionPage?.visible())showExpeditionPage({route:false});else if(!expeditionRoute()&&expeditionPage?.visible()){closeDialog();showMap();}});
function showSquad(mode){
  if(state.demo)return showJoin();
  const create=mode==='create',roomId=state.room.id,userId=state.user.id;
  dialog({kind:'squad',create});
  $('#squad-form').onsubmit=async e=>{e.preventDefault();await submit(e.target,async()=>{
    if(state.demo||state.room.id!==roomId||state.user.id!==userId)throw new Error('遠征隊已變更，請重新開啟小隊設定。');
    const value=new FormData(e.target).get('value');await stopTeamLocation();
    if(state.demo||state.room.id!==roomId||state.user.id!==userId||!e.target.isConnected)throw new Error('遠征隊或視窗已變更，請重新開啟。');
    await api(`/expeditions/${roomId}/squads${create?'':'/join'}`,'POST',create?{name:value}:{code:value.toUpperCase()});await refresh({fresh:true});await chat?.sync({fresh:true});
    if(state.room.id!==roomId||state.user.id!==userId||!e.target.isConnected)return;
    closeDialog();setTab('members');toast(create?'小隊已建立，使用「邀請加入小隊」分享邀請碼。':'已加入小隊。');
  });};
}
async function leaveSquad(id){
  if(state.demo||state.mine.squad!==id)return;
  const roomId=state.room.id,userId=state.user.id;
  await stopTeamLocation();
  if(state.room.id!==roomId||state.user.id!==userId)return;
  await api(`/expeditions/${roomId}/squads/${encodeURIComponent(id)}/membership`,'DELETE');await refresh({fresh:true});await chat?.sync({fresh:true});
  if(state.room.id===roomId&&state.user.id===userId){setTab('members');toast('已離開小隊，仍保留遠征隊成員資格。');}
}
async function deletePin(id){
  if(pendingPinDeletes.has(id))return;
  const pin=state.pins.find(item=>item.id===id),roomId=state.room?.id,userId=state.user.id;
  if(!pin)return;
  if(!pin.can_delete)throw new Error('只有建立者或遠征隊隊長可以刪除此地標。');
  const current=()=>!state.demo&&state.room?.id===roomId&&state.user.id===userId;
  pendingPinDeletes.add(id);render();
  try{
    try{await api(`/expeditions/${roomId}/pins/${encodeURIComponent(id)}`,'DELETE');}
    catch(error){if(error.status!==404)throw error;}
    if(!current())return;
    pinRevision++;state.pins=state.pins.filter(item=>item.id!==id);
    if(state.target?.type==='pin'&&state.target.id===id)state.target=null;
    render();toast('地標已移除。');
    await refresh({fresh:true});
  }finally{pendingPinDeletes.delete(id);if(current())render();}
}
function showPublish(type='task',point,options={}){
  if(!state.demo&&state.mine.muted){toast('你在這支遠征隊已被禁言，暫時無法發布內容。');return;}
  if(state.demo)return showJoin();
  const task=type==='task',fixed=task&&!!point,center=point||map?.getCenter()||venue(),roomId=state.room.id,userId=state.user.id;
  const pos=task&&!fixed?(state.position?{...state.position}:null):{lat:center.lat,lng:center.lng};
  let chosen=pos;
  const description=fixed?'任務旗標固定在你選的地點，不會隨你的定位移動。只有接取任務的人能查看座標。':task?'發布前記錄你目前的位置。任務尚未被接取時，其他隊員看不到座標。':'分享給目前遠征隊的成員。';
  const initialHours=!task&&options.lifetime==='permanent'?0:!task&&(point||options.lifetime==='temporary')?2:6;

  dialog({kind:'publish',fixed,task,description,types:task?types:pinTypes,initialHours,chosen:chosen?{...chosen}:null,point:!!point});
  if(point?.name)$('#title').value=point.name.slice(0,80);
  const form=$('#publish-form');let helpPoint=null,helpRequest=0;
  if(!task){
    const duration=$('#hours'),note=form.querySelector('.coordinate-note .field-note');
    form.querySelector('label[for="kind"]').textContent='情報分類';
    form.querySelector('label[for="hours"]').textContent='保留方式';
    const describe=()=>{const permanent=duration.value==='0';$('#dialog-body h2').textContent=permanent?'建立定期情報點。':'建立臨時情報點。';form.querySelector('[type=submit]').textContent='建立情報點 ＋';note.textContent=permanent?'永久保留，可由本人或隊長刪除。':'到期自動隱藏；無效票較多時自動移除，評價紀錄保留。';};
    duration.addEventListener('change',describe);describe();
  }
  if(task){
    const setup=form.querySelector('#help-setup');
    const helpCoordinate=setup.querySelector('#help-coord');
    async function acquireHelp(){
      const request=++helpRequest;helpPoint=null;helpCoordinate.textContent='正在取得 GPS 定位…';
      try{
        if(!navigator.geolocation)throw new Error('瀏覽器不支援定位。');
        const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:5000,timeout:20000}));
        if(request!==helpRequest)return;
        if(Date.now()-p.timestamp>20000)throw new Error('定位資料已過期，請重新取得定位。');
        helpPoint={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};
        helpCoordinate.textContent=`${helpPoint.lat.toFixed(5)}, ${helpPoint.lng.toFixed(5)} · 精度 ±${Math.round(helpPoint.accuracy)}m`;
      }catch(error){if(request===helpRequest){helpCoordinate.textContent=error.code===1?'定位未獲允許；請開啟瀏覽器定位權限，才能發布求助。':'暫時無法取得定位，請重試。';}throw error;}
    }
    form.acquireHelp=acquireHelp;
    $('#help-gps').onclick=()=>acquireHelp().catch(()=>{});
    const header=$('#dialog-body h2'),intro=$('#dialog-body>p'),submitButton=form.querySelector('[type=submit]');
    const original={header:header.textContent,intro:intro.textContent,submit:submitButton.textContent};
    $('#kind').onchange=()=>{
      const active=$('#kind').value==='help';setup.hidden=!active;form.querySelector('.coordinate-note').hidden=active;
      $('#hours').disabled=active;$('#hours').hidden=active;form.querySelector('label[for="hours"]').hidden=active;
      header.textContent=active?'向遠征隊求助。':original.header;intro.textContent=active?'發布求助即同意向這支遠征隊分享即時位置，持續到你刪除求助任務。':original.intro;
      if(active){submitButton.textContent='發布求助並分享定位';acquireHelp().catch(()=>{});}else{helpRequest++;submitButton.textContent=original.submit;}
    };
  }
  async function getPosition(){
    if(!navigator.geolocation)throw new Error('瀏覽器不支援定位。');
    const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:5000,timeout:20000}));
    const result={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
    chosen=result;
    if(task){state.position=result;lastPositionAt=p.timestamp;renderMap();}
    $('#coord-value').textContent=`${chosen.lat.toFixed(5)}, ${chosen.lng.toFixed(5)}`;
  }
  if($('#use-position'))$('#use-position').onclick=async event=>{const b=event.target;b.disabled=true;try{await getPosition();}catch(error){toast(error.code===1?'請允許定位，才能記錄任務發布位置。':error.message||'暫時無法取得位置。');}finally{b.disabled=false;}};
  $('#publish-form').onsubmit=async event=>{
    event.preventDefault();await submit(event.target,async()=>{
      if(state.demo||state.room?.id!==roomId||state.user.id!==userId)throw new Error('遠征隊已變更，請重新選擇地點。');
      const isHelp=task&&new FormData(event.target).get('kind')==='help';
      if(isHelp&&(!helpPoint||Date.now()-helpPoint.timestamp>20000)){try{await form.acquireHelp();}catch{throw new Error('求助需要有效的 GPS 定位，請先允許定位並重試。');}}
      if(isHelp&&!helpPoint)throw new Error('求助需要有效的 GPS 定位。');
      if(task&&!isHelp&&!fixed&&(!chosen||Date.now()-lastPositionAt>120000)){
        try{await getPosition();}catch{throw new Error('發布任務需要目前位置，請允許瀏覽器定位後重試。');}
      }
      const f=new FormData(event.target),body={title:f.get('title'),description:f.get('description'),kind:f.get('kind'),hours:isHelp?6:Number(f.get('hours')),lat:(isHelp?helpPoint:chosen).lat,lng:(isHelp?helpPoint:chosen).lng};
      if(state.demo||state.room?.id!==roomId||state.user.id!==userId||!form.isConnected||!$('#dialog').open||$('#publish-form')!==form)throw new Error('發布視窗或遠征隊已變更，請重新開啟後發布。');
      if(task)body.location_mode=!isHelp&&fixed?'fixed':'publisher';
      if(isHelp){body.help_broadcast=true;body.accuracy=helpPoint.accuracy;state.position={lat:helpPoint.lat,lng:helpPoint.lng,accuracy:helpPoint.accuracy};lastPositionAt=helpPoint.timestamp;}
      const published=await api(`/expeditions/${roomId}/${task?'tasks':'pins'}`,'POST',body);
      if(state.demo||state.room?.id!==roomId||state.user.id!==userId)return;
      if(task)taskRevision++;else pinRevision++;
      await refresh({fresh:true});
      if(state.demo||state.room?.id!==roomId||state.user.id!==userId||!form.isConnected||$('#publish-form')!==form)return;
      closeDialog();setTab(task?'tasks':'pins');toast(published.pending?'圖釘已送審，核准後才會顯示於地圖。':isHelp?'求助已發布，全遠征隊可查看即時位置；刪除求助後才停止分享。':fixed?'任務旗標已插在選定地點；接取者可查看。':task?'任務已發布；只有接取者能取得你的座標。':body.hours?'臨時情報點已分享，到期後自動隱藏。':'定期情報點已分享，永久保留。');
    });
  };
}
function showHelpLocation(){
  dialog({kind:'helpLocation',rooms:assistance.rooms.map(r=>({...r})),error:assistance.error});
}
function showLocation(options={}){
  if(assistance?.active)return showHelpLocation();
  locationCardDismissed=false;renderLocation();
  const active=state.scope!=='off',joined=state.authenticated&&!state.demo&&!!state.room?.id,squad=joined?currentSquad():null;
  const selected=options.friends?'friends':active?state.scope:state.authenticated?'friends_squad':'local';
  const choices=[
    ['local','僅供本機使用','在自己的地圖計算方向與距離，不上傳即時位置。',false],
    ['friends_squad','好友與目前小隊（預設）','已接受的好友與目前小隊成員可查看；其他遠征隊成員看不到一般定位。',!state.authenticated],
    ['friends','只給好友','已互相接受邀請的好友可查看，不必加入同一隊伍。',!state.authenticated],
    ['squad','只給小隊',squad?`只有「${squad.name}」的目前成員可查看；離開或切換小隊後停止分享。`:'先加入小隊，才能選擇此項。',!squad],
    ['task','只給任務接取者','只有接取你進行中任務的人，可查看即時位置。',!joined]
  ];
  dialog({kind:'location',active,choices,selected});
  $('#location-form').onsubmit=async event=>{
    event.preventDefault();await submit(event.target,async()=>{
      if(!navigator.geolocation)throw new Error('這個瀏覽器不支援定位。');
      const scope=new FormData(event.target).get('scope');
      if(!['local','friends','friends_squad','squad','task'].includes(scope))throw new Error('請選擇分享對象。');
      if(scope!=='local'&&!state.authenticated)throw new Error('請先登入帳號。');
      if(['squad','task'].includes(scope)&&!joined)throw new Error('請先加入遠征隊。');
      if(scope==='squad'&&(!squad||currentSquad()?.id!==squad.id))throw new Error('小隊已變更，請重新開啟定位設定。');
      const roomId=state.room?.id,userId=state.user.id;
      await stopLocation({revoke:true});
      if(state.room?.id!==roomId||state.user.id!==userId||scope==='squad'&&currentSquad()?.id!==squad.id)throw new Error('隊伍已變更，請重新開啟定位設定。');
      state.scope=scope;locationSquadId=scope==='squad'?squad.id:null;lastSent=0;const generation=locationGeneration;
      friends.sharing=['friends','friends_squad'].includes(scope);friends.lastSent=0;
      state.watch=navigator.geolocation.watchPosition(p=>receivePosition(p,generation),error=>locationError(error,generation),{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
      closeDialog();renderLocation();if(state.tab==='friends')renderPanel();toast('正在取得你的位置 · '+{local:'僅供本機使用',friends:'只與好友分享',friends_squad:'與好友及目前小隊分享',squad:'只與目前小隊分享',expedition:'只與目前遠征隊分享',task:'僅供任務接取者使用'}[scope]);
    });
  };
}
async function stopLocation({revoke=false,keepHelp=false,preservePosition=false,remote=true}={}){
  if(!preservePosition){locationCardDismissed=false;centerOnLocationFix=true;}
  locationGeneration++;
  locationSquadId=null;
  lastPublishedSampleAt=0;
  if(state.watch!=null)navigator.geolocation.clearWatch(state.watch);state.watch=null;const was=state.scope!=='off';state.scope='off';
  const shared=was||friends?.sharing||friends?.data.sharing||state.mine.scope!=='off';
  if(remote)await locationWrites.catch(()=>{});await friends?.stop({remote:false});
  try{if(remote&&!keepHelp&&state.authenticated&&(shared||revoke))await api('/location','DELETE');}
  finally{if(!preservePosition)state.position=null;renderLocation();renderMap();}
}
async function stopTeamLocation(){
  if(assistance?.active)return;
  if(!friends?.sharing&&!friends?.data.sharing)return stopLocation();
  if(!friends.sharing){
    locationGeneration++;lastPublishedSampleAt=0;
    if(state.watch!=null)navigator.geolocation.clearWatch(state.watch);
    state.watch=null;state.scope='off';state.position=null;
  }
  await locationWrites.catch(()=>{});
  if(!state.demo&&state.room?.id)await api(`/expeditions/${state.room.id}/location`,'DELETE');
  state.mine.scope='off';lastSent=0;
}
function receivePosition(p,generation){
  if(generation!==locationGeneration||state.scope==='off')return;
  if(Date.now()-p.timestamp>20000)return;
  lastPositionAt=p.timestamp;
  state.position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
  if(centerOnLocationFix){
    centerOnLocationFix=false;
    showPositionOnMap(state.position);
  }
  renderLocation();renderMap();
  if(state.scope==='friends')friends?.publish(state.position,p.timestamp);
  const combined=state.scope==='friends_squad';
  if(!combined&&(state.demo||!['task','squad'].includes(state.scope)))return;
  if(state.scope==='squad'&&(!locationSquadId||state.mine.squad!==locationSquadId))return;
  if(state.scope==='task'&&!state.tasks.some(t=>t.owner===state.user.id&&t.location_mode!=='fixed'&&['open','accepted'].includes(t.status)&&t.expires>Date.now()/1000))return;
  if(p.timestamp<=lastPublishedSampleAt||Date.now()-lastSent<4000)return;
  lastSent=Date.now();lastPublishedSampleAt=p.timestamp;const eid=state.demo?null:state.room.id,position={...state.position},scope=state.scope,squadId=combined?state.mine.squad:locationSquadId;
  locationWrites=locationWrites.catch(()=>{}).then(async()=>{
    if(generation!==locationGeneration||state.scope!==scope||!combined&&(state.demo||state.room.id!==eid)||combined&&(state.demo?null:state.room.id)!==eid||Date.now()-p.timestamp>20000)return;
    if(scope==='squad'&&state.mine.squad!==squadId)return;
    if(combined&&state.mine.squad!==squadId)return;
    try{await api(combined?'/location':`/expeditions/${eid}/location`,'PUT',{...position,scope,...(combined?{expedition_id:squadId?eid:null,squad_id:squadId||null}:scope==='squad'?{squad_id:squadId}:{})});if(combined)friends.data.sharing=true;if(generation===locationGeneration)await refresh();}catch(error){toast(error.message);if(['squad','friends_squad'].includes(scope)&&error.status===409&&generation===locationGeneration)await refresh();}
  });
}
async function locationError(error,generation){
  if(generation!==locationGeneration)return;
  if(error.code===1){await stopLocation({revoke:true});toast('定位未獲允許，已撤回位置；請檢查瀏覽器設定。');}
  else{renderLocation();toast('定位暫時無法更新；最後位置保留 15 分鐘，正在重試。');}
}
function refreshGPS(force=false){
  if(gpsPending||state.watch==null||state.scope==='off'||document.hidden||!force&&Date.now()-lastSent<15000)return;
  const generation=locationGeneration;gpsPending=true;
  navigator.geolocation.getCurrentPosition(p=>{gpsPending=false;receivePosition(p,generation);},error=>{gpsPending=false;if(error.code===1)locationError(error,generation);},{enableHighAccuracy:true,maximumAge:force?0:5000,timeout:12000});
}
async function compass(){
  const D=window.DeviceOrientationEvent;
  if(!D)return toast('此裝置沒有指南針支援，方向提示維持北朝上。');
  try{
    if(typeof D.requestPermission==='function'&&(await D.requestPermission())!=='granted')return toast('未開啟指南針權限，方向維持北朝上。');
    window.addEventListener('deviceorientationabsolute',onOrientation);
    window.addEventListener('deviceorientation',onOrientation);
    toast('等待指南針訊號；沒有絕對方位時維持北朝上。');
  }catch{toast('此瀏覽器無法啟用指南針，方向維持北朝上。');}
}
function onOrientation(e){
  if(Number.isFinite(e.webkitCompassHeading))state.heading=(e.webkitCompassHeading+(screen.orientation?.angle||0))%360;
  else if(e.absolute&&Number.isFinite(e.alpha))state.heading=(360-e.alpha+(screen.orientation?.angle||0))%360;
  else return;
  MapPresence.updateSelf($('#map .self-map-point'),LocationState.valid(lastPositionAt/1000)&&!LocationState.stale(lastPositionAt/1000)?state.heading:null);
  renderRadar();renderTarget();
}
async function taskAction(id,action){
  if(state.demo)return showJoin();
  if(state.pending)return;state.pending=true;
  try{
    const t=state.tasks.find(x=>x.id===id);if(!t)return;
    if(state.demo){if(action==='accept'){t.status='accepted';t.assignee='me';t.assignee_name='你';}else if(action==='release'){t.status='open';t.assignee=null;}else t.status=action==='complete'?'done':'cancelled';render();}
    else{await api(`/expeditions/${state.room.id}/tasks/${id}/${action}`,'POST',{});taskRevision++;await refresh({fresh:true});}
    if(action==='accept'){selectTarget('task',id);toast(state.demo?'演示接取成功！方向提示已開啟。':'已接取任務，地圖正指向發布者。');}
    else toast(action==='cancel'&&t.help_active?(assistance?.active?'求助已刪除；其他求助仍持續分享定位。':'求助已刪除，已停止求助定位分享。'):{release:'已放棄接取。',complete:'任務完成，謝謝你的支援！',cancel:'任務已撤回。'}[action]);
  }catch(e){toast(e.message);}finally{state.pending=false;}
}
function help(){
  dialog({kind:'help'});
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tab)return setTab(b.dataset.tab);
  if(b.dataset.mobile)return showMap();
  if(b.dataset.filter){state.filter=b.dataset.filter;render();return;}
  const action=b.dataset.action,id=b.dataset.id;if(!action)return;
  try{
    if(action==='close')closeDialog();
    else if(action==='app-display')appDisplay.show();
    else if(action==='app-install')await appDisplay.install();
    else if(action==='app-fullscreen')await appDisplay.fullscreen();
    else if(action==='account'){if(state.authenticated)await profilePage.open();else showAccount();}
    else if(action==='view-profile')await profilePage.open(id);
    else if(action==='pin-vote')await landmarkFeedback.vote(id,Number(b.dataset.value));
    else if(action==='task-vote')await taskFeedback.vote(id,Number(b.dataset.value));
    else if(action==='chat')await chat.open();
    else if(action==='chat-room'&&!state.demo)await chat.open('expedition',state.room.id);
    else if(action?.startsWith('friend-')){b.disabled=true;try{await friends.act(action,id);if(action!=='friend-chat')chat.tick();}finally{b.disabled=false;}renderLocation();if(!document.contains(b))$('#friend-share-toggle')?.focus({preventScroll:true});}
    else if(action==='auth-login')showAuth('login');
    else if(action==='auth-register')showAuth('register');
    else if(action==='password-settings')showPasswordSettings();
    else if(action==='logout'){b.disabled=true;try{await logout();}finally{b.disabled=false;}}
    else if(action==='toggle-password'){const visible=b.getAttribute('aria-pressed')!=='true';$$('input',b.closest('form')).filter(input=>input.autocomplete.includes('password')).forEach(input=>input.type=visible?'text':'password');b.setAttribute('aria-pressed',visible);b.textContent=visible?'隱藏密碼':'顯示密碼';}
    else if(action==='join'||action==='join-mode')showJoin();
    else if(action==='create-mode')showJoin('create');
    else if(action==='code-mode')showJoin('code');
    else if(action==='publish-intel')showPublish('pin',undefined,{lifetime:b.dataset.lifetime});
    else if(action==='ground-message')groundMessages.open();
    else if(action==='rooms')showRooms();
    else if(action==='expeditions')showExpeditionPage();
    else if(action==='friends-preview'){closeDialog();setTab('friends');}
    else if(action==='member-options'&&!state.demo)memberActions.open(state.room.id,id);
    else if(action==='pin-submissions'&&!state.demo)pinReview.open(state.room);
    else if(action==='blocked-people')blockedPeople.open();
    else if(action==='site-account-admin')siteAccountAdmin.open();
    else if(action==='settings')showSettings();
    else if(action==='squads'){if(state.demo)showJoin();else{closeDialog();setTab('members');}}
    else if(action==='manage-members'){const data=await api('/expeditions/owned'),room=data.expeditions.find(room=>room.id===b.dataset.id);if(room)roomSettings.open(room);}
    else if(action==='owned-rooms')await showOwnedRooms();
    else if(action==='delete-room')await showDeleteRoom(id);
    else if(action==='confirm-delete-room'){b.disabled=true;try{await deleteRoom(id);}finally{b.disabled=false;}}
    else if(action==='invite')showInvite();
    else if(action==='squad-invite')showInvite(true);
    else if(action==='squad-chat'&&!state.demo&&state.mine.squad===id)await chat.open('squad',id);
    else if(action==='leave-squad'){b.disabled=true;try{await leaveSquad(id);}finally{b.disabled=false;}}
    else if(action==='help')help();
    else if(action==='create-squad'||action==='join-squad')showSquad(action==='create-squad'?'create':'join');
    else if(action==='publish')showPublish(state.tab==='tasks'?'task':'pin');
    else if(action==='pin-center')mapActions?.openCenter(map.getCenter());
    else if(action==='location')showLocation();
    else if(action==='dismiss-location'){
      if(state.scope!=='off'){locationCardDismissed=true;renderLocation();$('#location-reopen').focus({preventScroll:true});}
    }
    else if(action==='help-retry'){await assistance.retry();closeDialog();}
    else if(action==='help-room'){const room=state.rooms.find(r=>r.id===id);if(room){closeDialog();if(state.room.id!==id)await enterRoom(room,state.user);setTab('tasks');state.filter='help';renderPanel();}}
    else if(action==='stop-location'){if(assistance?.active)return showHelpLocation();await stopLocation();closeDialog();await refresh();toast('已停止即時定位；任務發布點仍供接取者使用。');}
    else if(action==='compass')await compass();
    else if(action==='zoom-in')map?.zoomIn();
    else if(action==='zoom-out')map?.zoomOut();
    else if(action==='radar'){state.radar=!state.radar;b.setAttribute('aria-pressed',state.radar);renderRadar();}
    else if(action==='center'){
      if(!state.position||!LocationState.valid(lastPositionAt/1000))showLocation();
      else{showPositionOnMap(state.position);renderMap();}
    }
    else if(action==='target-close'){state.target=null;renderTarget();}
    else if(action==='member-target')selectTarget('member',id);
    else if(action==='task-target')selectTarget('task',id);
    else if(action==='pin-target')selectTarget('pin',id);
    else if(['accept','release','complete','cancel'].includes(action))await taskAction(id,action);
    else if(action==='copy'){try{await navigator.clipboard.writeText(b.dataset.copy);toast('邀請連結已複製。');}catch{toast('無法自動複製，請選取上方邀請連結。');}}
    else if(action==='venue'){showMap();switchVenue(id);}
    else if(action==='switch-room'){const r=state.rooms.find(r=>r.id===id);closeDialog();await enterRoom(r,state.user);showMap();}
    else if(action==='delete-pin')await deletePin(id);
    else if(action==='leave'){dialog('<h2>結束這一段遠征？</h2><p>退出會撤回你未完成的任務，並放棄已接取的任務。已開啟的好友分享會繼續。持有邀請碼仍可重新加入。</p><button class="button primary full" data-action="confirm-leave">確認退出遠征隊</button><button class="button outline full" data-action="close">留下來</button>');}
    else if(action==='confirm-leave'){await stopTeamLocation();const departure=await api(`/expeditions/${state.room.id}/membership`,'DELETE');assistance?.sync(departure.help_rooms||[]);closeDialog();resetLobby();render();showMap();focusVenue();try{localStorage.removeItem('tamago-room');}catch{}toast('已退出遠征隊。');}
  }catch(error){toast(error.message);}
});
window.addEventListener('tamago-theme-change',()=>map?.setTheme?.());
$('#search').addEventListener('input',e=>{state.query=e.target.value;renderPanel();});
$('#region-venue').addEventListener('change',e=>switchVenue(e.target.value));
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
function resumeLocation(){
  if(document.hidden||!config)return;
  refreshGPS(true);assistance?.tick(true);refresh();friends?.sync();
}
document.addEventListener('visibilitychange',()=>{lastTeamSyncAt=0;if(friends)friends.syncedAt=0;renderMap();if(!document.hidden)resumeLocation();});
window.addEventListener('pageshow',resumeLocation);
window.addEventListener('online',()=>{refresh();friends?.sync();});
window.addEventListener('offline',()=>{state.online=false;state.members=state.members.map(m=>({...m,lat:null,lng:null}));render();});
window.addEventListener('tamago-google-auth-failure',async()=>{
  if(!map?.isGoogle)return;
  placeSearch?.clear();
  facilityLayer?.remove();facilityLayer=null;layers.clearLayers();map.destroy();map=null;
  await initMap(true);renderMap();
});
// Backgrounding/BFCache keeps the watch and last fix. Server TTL expires it even
// when the OS freezes or kills this page; explicit stop/logout still withdraws.
async function openProfileRoom(id,pid){
  const me=await api('/me');state.rooms=me.expeditions;const room=state.rooms.find(r=>r.id===id);if(!room)throw new Error('你已不在這個遠征隊中。');
  if(state.room.id!==id||state.demo)await enterRoom(room,state.user);else await refresh();showMap();if(pid)selectTarget('pin',pid);
}
function syncNewsFriends(){
  const owner=state.authenticated?state.user.id:null,available=owner&&friends?.ownerId===owner;
  news?.setFriends(owner,available?friends.data.incoming:[],available?friends.error:'');
}
async function init(){
  icons();
  roomAdmission=new RoomAdmission({api,dialog,user:()=>state.authenticated?state.user:null});
  memberActions=new ExpeditionPersonActions({api,toast,user:()=>state.authenticated?state.user:null,friend:id=>chatFriend.open(id),changed:async(uid,eid)=>{await syncRoomChanges(uid,{people:true});if(expeditionPreview?.current()&&expeditionPreview.room.id===eid)await expeditionPreview.load(true);}});
  blockedPeople=new BlockedPeople({api,dialog,toast,user:()=>state.authenticated?state.user:null,changed:uid=>syncRoomChanges(uid,{people:true})});
  pinReview=new PinReviewBoard({api,dialog,toast,user:()=>state.authenticated?state.user:null,changed:uid=>syncRoomChanges(uid)});
  roomSettings=new ExpeditionRoomSettings({api,dialog,toast,user:()=>state.authenticated?state.user:null,changed:uid=>syncRoomChanges(uid,{catalog:true}),submissions:room=>pinReview.open(room),remove:deleteRoom,leave:leaveExpeditionFromMenu});
  expeditionPreview=new ExpeditionPreview({api,dialog,person:(eid,pid)=>memberActions.open(eid,pid),user:()=>state.authenticated?state.user:null,login:()=>{authIntent={kind:'expeditions-page',mode:'browse'};showAuth();},join:async(id,uid)=>{const room=await roomAdmission.join(id,uid);if(room&&state.authenticated&&state.user.id===uid)await finishRoomJoin(room,false);}});
  siteAccountAdmin=new SiteAccountAdmin({api,dialog,toast,user:()=>state.authenticated?state.user:null});
  expeditionManagement=new ExpeditionMemberManagement({api,dialog,toast,user:()=>state.authenticated?state.user:null,changed:async(uid,renamed)=>{const me=await api('/me');if(state.authenticated&&state.user.id===uid){state.rooms=me.expeditions;if(renamed)expeditionPage?.rename(renamed);if(!state.demo)await refresh({fresh:true});render();if(renamed)chat?.tick();}}});
  expeditionPage=new TamagoVue.ExpeditionsPage($('#expeditions-page'),{
    api,toast,schedule:activitySchedule,preview:room=>expeditionPreview.open(room),manage:room=>roomSettings.open(room),context:()=>({user:state.authenticated?state.user:null,rooms:state.rooms,current:state.demo?null:state.room.id,venues:config?activityVenues():[],venue:config?activityVenue():null}),
    rooms:rooms=>{state.rooms=rooms;},create:vid=>{state.activityVenue=vid;showJoin('create');},expired:()=>friends?.actions.expired(),back:showMap,
    login:()=>{authIntent={kind:'expeditions-page',mode:expeditionPage.mode};showAuth();},
    enter:async(id,uid)=>{if(!state.authenticated||state.user.id!==uid)return;const room=state.rooms.find(room=>room.id===id);if(!room)throw new Error('隊伍已變更，請重新整理。');if(state.demo||state.room.id!==id)await enterRoom(room,state.user);if(state.authenticated&&state.user.id===uid){showMap();toast('已進入 '+room.name+'。');}},
    join:async(id,uid)=>{const room=await roomAdmission.join(id,uid);if(room&&state.authenticated&&state.user.id===uid)await finishRoomJoin(room,false);}
  });
  pinFilters=new PinFilters($('#pin-filter'),$('#pin-filter-handle'),{stage:$('.map-stage'),user:()=>state.authenticated?state.user.id:null,changed:()=>{if(config)render();}});
  landmarkReports=new LandmarkReportBoard({api,toast,user:()=>state.authenticated?state.user:null,refresh:()=>refresh({fresh:true}),context:()=>{const pin=targetPoint();return state.authenticated&&!state.demo&&state.target?.type==='pin'&&pin?.kind!=='message'&&pin?{user:state.user.id,eid:state.room.id,pid:pin.id}:null;}});
  groundMessages=new GroundMessages({
    context:()=>!state.demo&&state.authenticated?{room:state.room.id,user:state.user.id}:null,
    join:()=>showJoin(),dialog,close:closeDialog,submit,api,refresh:()=>{pinRevision++;return refresh({fresh:true});},toast,
    center:point=>{showPositionOnMap(point);renderMap();},select:id=>selectTarget('pin',id)
  });
  news=new NewsBoard($('#news-dialog'),$('#news-launcher'),{
    user:()=>state.authenticated?state.user:null,sync:()=>friends?.sync({fresh:true}),
    respond:async(id,response)=>{await api('/friends/'+encodeURIComponent(id)+'/'+response,'POST');toast(response==='accept'?'已成為好友。':'已拒絕好友邀請。');}
  });
  chatFriend=new ChatFriendCard($('#chat-friend-dialog'),{
    api,user:()=>state.authenticated?state.user:null,sync:()=>friends.sync({fresh:true}),
    friends:()=>friends.ownerId===state.user.id&&friends.ready()?friends.data:null,news:()=>news.open('friends')
  });
  profilePage=new ProfileClient($('#profile-dialog'),{api,toast,user:()=>state.authenticated?state.user:null,login:uid=>{authIntent={kind:'profile',uid};showAuth();},settings:showAccount,expired:()=>friends?.actions.expired(),contentDeleted:(eid,pid,uid,source='pin',parentPin)=>{if(!state.authenticated||state.user.id!==uid||state.demo||state.room.id!==eid)return;if(source==='report'){landmarkReports?.load({fresh:true});refresh({fresh:true});return;}pinRevision++;state.pins=state.pins.filter(pin=>pin.id!==pid);if(state.target?.type==='pin'&&state.target.id===pid)state.target=null;render();refresh({fresh:true});},updated:profile=>{state.user={...state.user,...profile};render();},room:id=>openProfileRoom(id),pin:(eid,pid)=>openProfileRoom(eid,pid),taskRoom:async eid=>{await openProfileRoom(eid);setTab('tasks');},removeRoom:id=>showDeleteRoom(id)});
  landmarkFeedback=new LandmarkFeedback({api,toast,context:()=>({eid:state.room.id,user:state.user.id,pins:state.pins}),committed:()=>{pinRevision++;},changed:()=>render()});
  taskFeedback=new TaskFeedback({api,toast,context:()=>({eid:state.room.id,user:state.user.id,tasks:state.tasks}),committed:()=>{taskRevision++;},changed:()=>render()});
  squadInvites=new SquadInvites({api,context:()=>!state.demo&&state.authenticated&&currentSquad()?{user:state.user.id,eid:state.room.id,sid:state.mine.squad}:null,sent:()=>chat?.tick()});
  appDisplay=new AppDisplay({dialog,close:closeDialog,toast});
  chat=new ChatClient($('#chat-dialog'),{api,toast,user:()=>state.authenticated?state.user:null,login:()=>{authIntent={kind:'chat'};showAuth();},expired:()=>friends?.actions.expired(),person:id=>chatFriend.open(id),invitation:body=>SquadInvites.invitationURL(body,location.origin,config?.public_origin)});
  mapActions=new MapActions($('#map'),$('#map-actions'),{
    pointAt:(x,y)=>{
      if(!map)return null;
      if(map.isGoogle)return map.pointAt(x,y);
      const rect=$('#map').getBoundingClientRect();
      return map.containerPointToLatLng([x-rect.left,y-rect.top]);
    },
    allowed:validMapPoint,
    create:(type,point)=>type==='message'?groundMessages.open():showPublish(type,point)
  });
  placeSearch=new PlaceSearch($('#place-search'),{
    search:query=>TamagoGooglePlaces.search(query,config?.maps,map),
    open:()=>mapActions?.dismiss(),
    select:point=>{showPositionOnMap(point);renderMap();},
    changed:()=>{if(config)renderMap();},
    create:(type,point)=>showPublish(type,point)
  });
  assistance=new AssistanceClient({
    user:()=>state.authenticated?state.user:null,api,toast,refresh,
    initial:()=>state.position?{timestamp:lastPositionAt,coords:{latitude:state.position.lat,longitude:state.position.lng,accuracy:state.position.accuracy}}:null,
    stopRegular:()=>stopLocation({keepHelp:true,preservePosition:true}),
    changed:status=>{if(status==='off'){if(state.scope==='help'){state.scope='off';state.position=null;}}else{state.scope='help';if(status==='denied')state.position=null;}if(config){renderLocation();renderMap();}},
    position:p=>{state.scope='help';lastPositionAt=p.timestamp;state.position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};if(centerOnLocationFix){centerOnLocationFix=false;showPositionOnMap(state.position);}renderLocation();renderMap();}
  });
  friends=new FriendsClient({api,toast,acted:action=>{if(action!=='friend-chat')chat.tick();renderLocation();},user:()=>state.authenticated?state.user:null,location:showLocation,chat:id=>chat.open('friend',id),find:id=>selectTarget('friend',id),stopped:()=>{if(state.scope==='friends')state.scope='local';else if(state.scope==='friends_squad'){state.scope=currentSquad()?'squad':'local';locationSquadId=currentSquad()?.id||null;}},changed:()=>{syncNewsFriends();if(!config)return;$('#friend-count').textContent=friends.data.friends.length;if(state.tab==='friends')renderPanel();renderMap();},expired:()=>{state.authenticated=false;state.user={id:'me',nickname:'你'};resetLobby();render();toast('登入已失效，請重新登入。');}});
  finder=new TeammateFinder($('#teammate-finder'),{join:()=>showJoin(),friends:()=>setTab('friends'),tasks:()=>setTab('tasks'),refresh:()=>{refresh();friends.sync();},location:()=>showLocation(),compass:()=>compass(),map:showFinderTaskOnMap,distance,bearing,meters,direction});
  renderFinder();setInterval(refreshTeammateGuidance,1000);
  try{
    config=await api('/config');
    if(navigator.permissions)navigator.permissions.query({name:'geolocation'}).then(permission=>{
      permission.addEventListener('change',()=>{
        if(permission.state!=='denied')return;
        if(assistance.active)assistance.fail({code:1,message:'permission revoked'},assistance.generation);
        else if(state.scope!=='off')locationError({code:1},locationGeneration);
      });
    }).catch(()=>{});
    let savedVenue;try{savedVenue=localStorage.getItem('tamago-map-venue');}catch{}
    const restoreVenue=config.venues.some(v=>v.id===savedVenue);if(restoreVenue)state.activeVenue=savedVenue;
    resetLobby();await initMap();render();
    const me=await api('/me');
    state.authenticated=!!me.user;if(me.user)state.user=me.user;assistance.sync(me.help_rooms||[]);render();
    if(me.user&&me.expeditions.length){let saved;try{saved=localStorage.getItem('tamago-room');}catch{}const room=me.expeditions.find(r=>r.id===saved)||me.expeditions[0];await enterRoom(room,me.user,{preserveMap:restoreVenue});}
    if(me.user){await friends.sync();chat.tick();}
    const params=new URLSearchParams(location.search);if(params.has('join'))showJoin('code');else if(expeditionRoute())showExpeditionPage({route:false});
    pollTimer=setInterval(()=>{
      if(state.position&&!LocationState.valid(lastPositionAt/1000)){state.position=null;renderLocation();renderMap();}
      assistance.tick();landmarkReports.tick();refreshGPS();if(!state.demo)refresh();if(state.authenticated){friends.sync();chat.tick();}
    },5000);
    if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }catch(e){toast('初始化失敗：'+e.message);TamagoVue.renderControl($('#connection'),{kind:'connection',label:'連線失敗，請重新整理'});}
}
init();
