export function createContent(app) {
async function deletePin(id){
  if(app.pendingPinDeletes.has(id))return;
  const pin=app.state.pins.find(item=>item.id===id),roomId=app.state.room?.id,userId=app.state.user.id;
  if(!pin)return;
  if(!pin.can_delete)throw new Error('只有建立者或遠征隊隊長可以刪除此地標。');
  const current=()=>!app.state.demo&&app.state.room?.id===roomId&&app.state.user.id===userId;
  app.pendingPinDeletes.add(id);app.render();
  try{
    try{await app.api(`/expeditions/${roomId}/pins/${encodeURIComponent(id)}`,'DELETE');}
    catch(error){if(error.status!==404)throw error;}
    if(!current())return;
    app.pinRevision++;app.state.pins=app.state.pins.filter(item=>item.id!==id);
    if(app.state.target?.type==='pin'&&app.state.target.id===id)app.state.target=null;
    app.render();app.toast('地標已移除。');
    await app.refresh({fresh:true});
  }finally{app.pendingPinDeletes.delete(id);if(current())app.render();}
}

function showPublish(type='task',point,options={}){
  if(!app.state.demo&&app.state.mine.muted){app.toast('你在這支遠征隊已被禁言，暫時無法發布內容。');return;}
  if(app.state.demo)return app.showJoin();
  const task=type==='task',fixed=task&&!!point,center=point||app.map?.getCenter()||app.venue(),roomId=app.state.room.id,userId=app.state.user.id;
  const pos=task&&!fixed?(app.state.position?{...app.state.position}:null):{lat:center.lat,lng:center.lng};
  let chosen=pos;
  const description=fixed?'任務旗標固定在你選的地點，不會隨你的定位移動。只有接取任務的人能查看座標。':task?'發布前記錄你目前的位置。任務尚未被接取時，其他隊員看不到座標。':'分享給目前遠征隊的成員。';
  const initialHours=!task&&options.lifetime==='permanent'?0:!task&&(point||options.lifetime==='temporary')?2:6;

  app.dialog({kind:'publish',fixed,task,description,types:task?app.types:app.pinTypes,initialHours,chosen:chosen?{...chosen}:null,point:!!point});
  if(point?.name)app.$('#title').value=point.name.slice(0,80);
  const form=app.$('#publish-form');let helpPoint=null,helpRequest=0;
  if(!task){
    const duration=app.$('#hours'),note=form.querySelector('.coordinate-note .field-note');
    form.querySelector('label[for="kind"]').textContent='情報分類';
    form.querySelector('label[for="hours"]').textContent='保留方式';
    const describe=()=>{const permanent=duration.value==='0';app.$('#dialog-body h2').textContent=permanent?'建立定期情報點。':'建立臨時情報點。';form.querySelector('[type=submit]').textContent='建立情報點 ＋';note.textContent=permanent?'永久保留，可由本人或隊長刪除。':'到期自動隱藏；無效票較多時自動移除，評價紀錄保留。';};
    app.resources.listen(duration, 'change',describe);describe();
  }
  if(task){
    const setup=form.querySelector('#help-setup');
    const helpCoordinate=setup.querySelector('#help-coord');
    async function acquireHelp(){
      const request=++helpRequest;helpPoint=null;helpCoordinate.textContent='正在取得 GPS 定位…';
      try{
        if(!navigator.geolocation)throw new Error('瀏覽器不支援定位。');
        const p=await new Promise((resolve,reject)=>app.resources.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:5000,timeout:20000}));
        if(request!==helpRequest)return;
        if(Date.now()-p.timestamp>20000)throw new Error('定位資料已過期，請重新取得定位。');
        helpPoint={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp};
        helpCoordinate.textContent=`${helpPoint.lat.toFixed(5)}, ${helpPoint.lng.toFixed(5)} · 精度 ±${Math.round(helpPoint.accuracy)}m`;
      }catch(error){if(request===helpRequest){helpCoordinate.textContent=error.code===1?'定位未獲允許；請開啟瀏覽器定位權限，才能發布求助。':'暫時無法取得定位，請重試。';}throw error;}
    }
    form.acquireHelp=acquireHelp;
    app.resources.bind(app.$('#help-gps'), 'onclick', ()=>acquireHelp().catch(()=>{}));
    const header=app.$('#dialog-body h2'),intro=app.$('#dialog-body>p'),submitButton=form.querySelector('[type=submit]');
    const original={header:header.textContent,intro:intro.textContent,submit:submitButton.textContent};
    app.resources.bind(app.$('#kind'), 'onchange', ()=>{
      const active=app.$('#kind').value==='help';setup.hidden=!active;form.querySelector('.coordinate-note').hidden=active;
      app.$('#hours').disabled=active;app.$('#hours').hidden=active;form.querySelector('label[for="hours"]').hidden=active;
      header.textContent=active?'向遠征隊求助。':original.header;intro.textContent=active?'發布求助即同意向這支遠征隊分享即時位置，持續到你刪除求助任務。':original.intro;
      if(active){submitButton.textContent='發布求助並分享定位';acquireHelp().catch(()=>{});}else{helpRequest++;submitButton.textContent=original.submit;}
    });
  }
  async function getPosition(){
    if(!navigator.geolocation)throw new Error('瀏覽器不支援定位。');
    const p=await new Promise((resolve,reject)=>app.resources.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:5000,timeout:20000}));
    const result={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
    chosen=result;
    if(task){app.state.position=result;app.lastPositionAt=p.timestamp;app.renderMap();}
    app.$('#coord-value').textContent=`${chosen.lat.toFixed(5)}, ${chosen.lng.toFixed(5)}`;
  }
  if(app.$('#use-position'))app.resources.bind(app.$('#use-position'), 'onclick', async event=>{const b=event.target;b.disabled=true;try{await getPosition();}catch(error){app.toast(error.code===1?'請允許定位，才能記錄任務發布位置。':error.message||'暫時無法取得位置。');}finally{b.disabled=false;}});
  app.resources.bind(app.$('#publish-form'), 'onsubmit', async event=>{
    event.preventDefault();await app.submit(event.target,async()=>{
      if(app.state.demo||app.state.room?.id!==roomId||app.state.user.id!==userId)throw new Error('遠征隊已變更，請重新選擇地點。');
      const isHelp=task&&new FormData(event.target).get('kind')==='help';
      if(isHelp&&(!helpPoint||Date.now()-helpPoint.timestamp>20000)){try{await form.acquireHelp();}catch{throw new Error('求助需要有效的 GPS 定位，請先允許定位並重試。');}}
      if(isHelp&&!helpPoint)throw new Error('求助需要有效的 GPS 定位。');
      if(task&&!isHelp&&!fixed&&(!chosen||Date.now()-app.lastPositionAt>120000)){
        try{await getPosition();}catch{throw new Error('發布任務需要目前位置，請允許瀏覽器定位後重試。');}
      }
      const f=new FormData(event.target),body={title:f.get('title'),description:f.get('description'),kind:f.get('kind'),hours:isHelp?6:Number(f.get('hours')),lat:(isHelp?helpPoint:chosen).lat,lng:(isHelp?helpPoint:chosen).lng};
      if(app.state.demo||app.state.room?.id!==roomId||app.state.user.id!==userId||!form.isConnected||!app.$('#dialog').open||app.$('#publish-form')!==form)throw new Error('發布視窗或遠征隊已變更，請重新開啟後發布。');
      if(task)body.location_mode=!isHelp&&fixed?'fixed':'publisher';
      if(isHelp){body.help_broadcast=true;body.accuracy=helpPoint.accuracy;app.state.position={lat:helpPoint.lat,lng:helpPoint.lng,accuracy:helpPoint.accuracy};app.lastPositionAt=helpPoint.timestamp;}
      const published=await app.api(`/expeditions/${roomId}/${task?'tasks':'pins'}`,'POST',body);
      if(app.state.demo||app.state.room?.id!==roomId||app.state.user.id!==userId)return;
      if(task)app.taskRevision++;else app.pinRevision++;
      await app.refresh({fresh:true});
      if(app.state.demo||app.state.room?.id!==roomId||app.state.user.id!==userId||!form.isConnected||app.$('#publish-form')!==form)return;
      app.closeDialog();app.setTab(task?'tasks':'pins');app.toast(published.pending?'圖釘已送審，核准後才會顯示於地圖。':isHelp?'求助已發布，全遠征隊可查看即時位置；刪除求助後才停止分享。':fixed?'任務旗標已插在選定地點；接取者可查看。':task?'任務已發布；只有接取者能取得你的座標。':body.hours?'臨時情報點已分享，到期後自動隱藏。':'定期情報點已分享，永久保留。');
    });
  });
}

async function taskAction(id,action){
  if(app.state.demo)return app.showJoin();
  if(app.state.pending)return;app.state.pending=true;
  try{
    const t=app.state.tasks.find(x=>x.id===id);if(!t)return;
    if(app.state.demo){if(action==='accept'){t.status='accepted';t.assignee='me';t.assignee_name='你';}else if(action==='release'){t.status='open';t.assignee=null;}else t.status=action==='complete'?'done':'cancelled';app.render();}
    else{await app.api(`/expeditions/${app.state.room.id}/tasks/${id}/${action}`,'POST',{});app.taskRevision++;await app.refresh({fresh:true});}
    if(action==='accept'){app.selectTarget('task',id);app.toast(app.state.demo?'演示接取成功！方向提示已開啟。':'已接取任務，地圖正指向發布者。');}
    else app.toast(action==='cancel'&&t.help_active?(app.assistance?.active?'求助已刪除；其他求助仍持續分享定位。':'求助已刪除，已停止求助定位分享。'):{release:'已放棄接取。',complete:'任務完成，謝謝你的支援！',cancel:'任務已撤回。'}[action]);
  }catch(e){app.toast(e.message);}finally{app.state.pending=false;}
}

async function openProfileRoom(id,pid){
  const me=await app.api('/me');app.state.rooms=me.expeditions;const room=app.state.rooms.find(r=>r.id===id);if(!room)throw new Error('你已不在這個遠征隊中。');
  if(app.state.room.id!==id||app.state.demo)await app.enterRoom(room,app.state.user);else await app.refresh();app.showMap();if(pid)app.selectTarget('pin',pid);
}

function syncNewsFriends(){
  const owner=app.state.authenticated?app.state.user.id:null,available=owner&&app.friends?.ownerId===owner;
  app.news?.setFriends(owner,available?app.friends.data.incoming:[],available?app.friends.error:'');
}
return { deletePin, showPublish, taskAction, openProfileRoom, syncNewsFriends };
}
