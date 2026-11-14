export function createMapView(app) {














async function initFacilityOverlay(){
  const ownerMap=app.map;
  const unavailable=()=>{app.facilityLayer?.remove();app.toast('場館圖暫時無法載入，仍可使用原有地圖。');};
  try{
    const response=await app.resources.fetch('/static/maps/makuhari-facility-v2.json');
    if(!response.ok)throw new Error('facility map unavailable');
    const data=await response.json();
    if(ownerMap!==app.map)return;
    const options={pane:'facility',opacity:0.85,interactive:false,alt:'幕張展覽館場館示意圖，官方設施圖標已移除',className:'facility-overlay',attribution:'場館圖：<a href="https://www.m-messe.co.jp/facility/" target="_blank" rel="noopener">幕張展覽館</a>（移除圖標、約略對齊）'};
    if(app.map.isGoogle)app.facilityLayer=app.map.addFacility(data,options);
    else{
      app.map.createPane('facility');app.map.getPane('facility').style.zIndex='300';app.map.getPane('facility').style.pointerEvents='none';
      app.facilityLayer=L.imageOverlay(data.image,data.bounds,options);
    }
    app.facilityLayer.on('error',unavailable);
    app.facilityLayer.addTo(app.map);
  }catch{unavailable();}
}

function venue(){return app.config.venues.find(v=>v.id===app.state.activeVenue)||app.config.venues[0];}

function rememberVenue(){try{localStorage.setItem('tamago-map-venue',app.state.activeVenue);}catch{}}

function validMapPoint(point){return Number.isFinite(point?.lat)&&Number.isFinite(point?.lng);}

function renderVenueControl(){
  const key=app.config.venues.map(venue=>venue.id+':'+venue.name).join('|');
  if(app.ui.venueKey!==key){app.ui.venueKey=key;app.ui.venues=app.config.venues.map(venue=>({...venue}));}
  app.ui.venueName=app.venue().name;
}

function showPositionOnMap(point,options){
  if(!app.validMapPoint(point))return;
  app.showMap();if(app.map)app.map.setView([point.lat,point.lng],Math.max(app.map.getMinZoom(),17),options);
}

function focusVenue(){
  if(app.map)app.map.setView([app.venue().lat,app.venue().lng],16,{animate:false});
}

function switchVenue(id){
  if(!app.config.venues.some(v=>v.id===id))return;
  app.state.activeVenue=id;app.state.activityVenue=id;app.rememberVenue();app.state.target=null;
  app.focusVenue();app.render();
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

async function initMap(forceLeaflet=false){
  if(!app.resources.active)return;
  if(!window.L){app.TamagoVue.renderControl(app.$('#map'),{kind:'error',title:'地圖元件載入失敗',detail:'請重新整理。任務面板仍可使用。'});return;}
  if(app.config.maps?.provider==='google'&&!forceLeaflet){
    try{app.map=await app.TamagoGoogleMap.create('map',app.config.maps);}
    catch{forceLeaflet=true;}
  }
  if(!app.resources.active)return;
  app.$('#map-provider-notice').hidden=!(forceLeaflet&&app.config.maps?.provider==='google');
  if(!app.map?.isGoogle){
    app.map=L.map('map',{zoomControl:false,zoomSnap:0.25,minZoom:2}).setView([35.6483,140.0353],16);
    L.tileLayer(app.config.tile_url,{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(app.map);
  }
  app.ui.mapProvider=app.map.isGoogle?'google':'leaflet';
  app.map.on(app.map.isGoogle?'zoom_changed':'zoomend',()=>{if(app.resources.active)app.ui.mapZoom=app.map.getZoom();});
  app.ui.mapZoom=app.map.getZoom();
  app.$('#map').classList.toggle('google-map',!!app.map.isGoogle);
  document.body.classList.toggle('google-basemap',!!app.map.isGoogle);
  app.layers=app.map.isGoogle?app.map.layerGroup():L.layerGroup().addTo(app.map);
  app.initFacilityOverlay();
  app.map.on(app.map.isGoogle?'bounds_changed':'movestart',()=>app.mapActions?.dismiss());
  app.map.on('resize',()=>app.renderRadar());
  app.focusVenue();
}

function marker(point,html,label,onClick){
  if(!app.map||point.lat==null)return;
  if(app.map.isGoogle)return app.map.addMarker(point,html,label,onClick,app.layers);
  const m=L.marker([point.lat,point.lng],{icon:L.divIcon({html,className:'custom-marker',iconSize:[40,40],iconAnchor:[20,20]}),title:label,alt:label,keyboard:!!onClick}).addTo(app.layers);
  m.on('remove',()=>app.TamagoVue.releaseMapMarker(html));
  if(onClick){
    m.on('click',onClick);
    app.resources.listen(m.getElement(), 'keydown',event=>{
      if(!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();
      if(event.key==='Enter'&&!event.repeat)onClick();
    });
    app.resources.listen(m.getElement(), 'keyup',event=>{if(event.key===' '){event.preventDefault();event.stopPropagation();onClick();}});
  }
  return m;
}

function renderMap(){
  if(!app.resources.active)return;
  if(!app.map||document.body.classList.contains('expeditions-open'))return;
  const allowed=new Set(app.finderTasks().map(t=>t.id));
  const sharedPoints=app.sharedPeople();
  const sharedOwners=new Set(sharedPoints.map(p=>p.owner)),helpOwners=new Set();
  app.visibleTeammateKey=app.guidanceKey();
  app.layers.clearLayers();
  app.config.venues.filter(app.validMapPoint).forEach(v=>app.marker(v,app.TamagoVue.createMapMarker({kind:'venue',current:v.id===app.state.activeVenue,label:v.short}),`${v.name} · 場館地標`,()=>app.selectTarget('venue',v.id)));
  if(app.placeSearch?.selected&&app.validMapPoint(app.placeSearch.selected))app.marker(app.placeSearch.selected,app.TamagoVue.createMapMarker({kind:'pin',className:'blue search-result-marker',icon:'search'}),`${app.placeSearch.selected.name} · 搜尋結果`,()=>app.placeSearch.showSelected());
  app.state.pins.filter(app.validMapPoint).filter(p=>!app.pinFilters||app.pinFilters.matches(p)).forEach(p=>{
    const html=app.TamagoVue.createMapMarker({kind:p.kind==='message'?'message':'pin',className:'blue',icon:p.kind==='shop'?'shop':'pin'});
    app.marker(p,html,p.kind==='message'?'地面留言 · '+p.title:p.title,()=>app.selectTarget('pin',p.id));
  });
  app.state.tasks.filter(t=>['open','accepted'].includes(t.status)&&(t.owner===app.state.user.id||allowed.has(t.id))&&app.validMapPoint(t)).forEach(t=>{
    if(t.help_active&&(sharedOwners.has(t.owner)||helpOwners.has(t.owner)))return;
    if(t.help_active)helpOwners.add(t.owner);
    if(t.help_active)app.marker(t,app.TamagoVue.createMapMarker({kind:'help'}),`${t.owner_name} · 求助 · ${t.title}`,()=>app.selectTarget('task',t.id));
    else if(t.location_mode==='fixed')app.marker(t,app.TamagoVue.createMapMarker({kind:'pin',className:'fixed-task',icon:'flag'}),`${t.title} · 固定任務旗標`,()=>app.selectTarget('task',t.id));
    else if(allowed.has(t.id)){
      if(sharedOwners.has(t.owner))return;
      app.personMarker(t);
    }else app.marker(t,app.TamagoVue.createMapMarker({kind:'pin',icon:t.kind==='giveaway'?'gift':'flag'}),t.title,()=>app.selectTarget('task',t.id));
  });
  sharedPoints.filter(app.validMapPoint).forEach(app.personMarker);
  if(app.state.position&&app.LocationState.valid(app.lastPositionAt/1000)&&app.validMapPoint(app.state.position)&&!app.state.tasks.some(t=>t.help_active&&t.owner===app.state.user.id&&t.location_visible&&app.validMapPoint(t))){
    const stale=app.LocationState.stale(app.lastPositionAt/1000),accuracy=Number.isFinite(app.state.position.accuracy)?`±${Math.round(app.state.position.accuracy)}m`:'目前位置';
    app.marker(app.state.position,app.MapPresence.render({kind:'self',angle:stale?null:app.state.heading,lastKnown:stale,label:`你 · ${stale?`最後位置 · ${app.LocationState.age(app.lastPositionAt/1000)}`:accuracy}`}),'我的位置');
    app.MapPresence.updateSelf(app.$('#map .self-map-point'),stale?null:app.state.heading);
  }
  app.pinFilters?.update(app.state.pins.filter(app.validMapPoint));app.renderRadar();app.renderTarget();
}

function personMarker(t){
  if(t.help_shared||t.help_active)return app.marker(t,app.TamagoVue.createMapMarker({kind:'help',label:app.LocationState.lastKnown(t)?`最後位置 · ${app.LocationState.age(t.located)}`:''}),`${t.owner_name} · ${app.LocationState.source(t)}`,()=>app.selectTarget(['friend','member'].includes(t.kind)?t.kind:'task',t.id));
  const hasPosition=!!app.state.position&&app.LocationState.valid(app.lastPositionAt/1000),angle=hasPosition?app.bearing(app.state.position,t):null;
  const relation=t.kind==='friend'?'heart':t.kind==='member'?'users':null,stale=app.LocationState.lastKnown(t),ownStale=hasPosition&&app.LocationState.stale(app.lastPositionAt/1000);
  const symbol=relation?'':[...(t.owner_name||'隊友')][0];
  const label=`${t.owner_name}${stale?` · 最後位置 · ${app.LocationState.age(t.located)}`:t.kind==='friend'?' · 好友':t.kind==='member'?t.location_source==='squad'?' · 小隊':' · 遠征隊':''}${ownStale?' · 方位估算':''}`;
  const html=app.MapPresence.render({kind:t.kind,angle,symbol,label,lastKnown:stale||ownStale});
  const guidance=angle===null?'取得你的位置後可顯示方位':`從你的位置往${app.direction(angle)}方向${ownStale?' · 依最後位置估算':''}`;
  app.marker(t,html,`${t.owner_name} · ${t.title} · ${guidance}`,()=>app.selectTarget(['friend','member'].includes(t.kind)?t.kind:'task',t.id));
}

function renderRadar(){
  const root=app.$('#radar');
  if(!app.state.radar||!app.state.position||!app.LocationState.valid(app.lastPositionAt/1000)){app.TamagoVue.renderRadar(root,{items:[]});return;}
  const owners=new Set(),tasks=app.visiblePeople().filter(app.validMapPoint).filter(t=>{const key=t.location_mode==='fixed'?t.id:t.owner;if(owners.has(key))return false;owners.add(key);return true;}).slice(0,8);
  const items=tasks.map(t=>{
    const angle=app.bearing(app.state.position,t),relative=(angle-(app.state.heading??0)+360)%360;
    const d=(app.LocationState.stale(app.lastPositionAt/1000)||app.LocationState.lastKnown(t)?'約 ':'')+app.meters(app.distance(app.state.position,t));
    const source=app.LocationState.lastKnown(t)?`最後位置 · ${app.LocationState.age(t.located)}`:t.location_source==='help'?'求助':t.kind==='friend'?'好友':t.kind==='member'?t.location_source==='squad'?'小隊':'遠征隊':t.location_source==='fixed'?'任務旗標':t.location_source==='live'?'即時':'發布點';
    return {...t,relative,distance:d,source,selected:!app.finder?.root.hidden&&app.finder?.selectedId===t.id,label:`${t.owner_name} · ${t.title} · ${app.direction(angle)} · ${d} · ${source}`};
  });
  app.TamagoVue.renderRadar(root,{items});const occupied=[];
  for(const item of items){
    const chip=[...root.querySelectorAll('.radar-chip')].find(el=>el.dataset.id===item.id),r=item.relative*Math.PI/180;
    const x=root.clientWidth*(.5+.44*Math.sin(r)),desired=root.clientHeight*(.5-.44*Math.cos(r));
    const w=chip.offsetWidth,h=chip.offsetHeight,clamp=y=>Math.max(h/2,Math.min(y,root.clientHeight-h/2));let y=clamp(desired);
    for(const step of [0,1,-1,2,-2,3,-3,4,-4]){const trial=clamp(desired+step*(h+6));if(!occupied.some(box=>Math.abs(box.x-x)<(box.w+w)/2+5&&Math.abs(box.y-trial)<(box.h+h)/2+5)){y=trial;break;}}
    chip.style.left=x+'px';chip.style.top=y+'px';occupied.push({x,y,w,h});
  }
}

function guidanceKey(){
  return app.visiblePeople().map(t=>`${t.id}:${app.LocationState.lastKnown(t)?app.LocationState.age(t.located):'live'}`).sort().join(',')+`|${app.state.position&&app.LocationState.stale(app.lastPositionAt/1000)?app.LocationState.age(app.lastPositionAt/1000):''}`;
}
return { initFacilityOverlay, venue, rememberVenue, validMapPoint, renderVenueControl, showPositionOnMap, focusVenue, switchVenue, distance, bearing, meters, direction, age, initMap, marker, renderMap, personMarker, renderRadar, guidanceKey };
}
