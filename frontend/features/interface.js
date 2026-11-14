export function createInterface(app) {
function icons(root=document){app.$$('[data-icon]',root).forEach(el=>{app.TamagoVue.renderControl(el,{kind:'icon',name:el.dataset.icon});el.removeAttribute('data-icon');});}

function toast(message){
  if(!app.resources.active)return;
  app.ui.toast=message;app.resources.clearTimeout(app.toastTimer);app.toastTimer=app.resources.timeout(()=>app.ui.toast='',5000);
}

function render(){
  if(!app.resources.active)return;
  app.chatFriend?.identity();app.chat?.identity();app.profilePage?.identity();app.expeditionPreview?.sync();app.expeditionManagement?.sync();app.siteAccountAdmin?.sync();app.roomSettings?.sync();app.memberActions?.sync();app.pinReview?.sync();app.blockedPeople?.sync();app.roomAdmission?.sync();app.syncNewsFriends();
  app.ui.roomDate=app.state.demo?'建立或加入遠征隊，和夥伴一起出發':app.activitySchedule(app.state.room)+' · '+(app.activityVenues().find(venue=>venue.id===app.state.room.venue)?.name||'');
  app.ui.friendCount=app.friends?.data.friends.length||0;
  app.ui.connectionLabel=app.state.demo?'尚未組隊':app.state.online?'已同步 · 每 5 秒更新':'連線中斷 · 位置已隱藏';
  app.renderVenueControl();
  app.renderPanel();app.renderLocation();app.renderMap();app.expeditionPage?.sync();
}

function renderPanel(){
  if(!app.resources.active)return;
  const root=app.$('#panel-content'),q=app.state.query.toLocaleLowerCase();
  if(app.state.tab==='friends'){app.TamagoVue.clearWorkspace(root);app.friends.mount(root,q);return;}
  app.friends?.unmount();
  const match=x=>[x.title,x.description,x.nickname,x.owner_name].some(v=>v?.toLocaleLowerCase().includes(q));
  const tasks=app.state.tasks.filter(t=>['open','accepted'].includes(t.status)&&match(t)&&(app.state.filter==='all'||app.state.filter===t.kind||(app.state.filter==='mine'&&(t.owner===app.state.user.id||t.assignee===app.state.user.id)))).map(t=>{
    const own=t.owner===app.state.user.id,accepted=t.assignee===app.state.user.id;
    return {...t,own,accepted,age:app.age(t.created),
      caption:t.help_active?'查看求助位置':own?'查看任務位置':accepted?(t.location_mode==='fixed'?'前往旗標':'前往會合'):t.status==='accepted'?'已有人接取':'接取任務',
      action:!t.help_active&&!own&&!accepted&&t.status==='open'?'accept':'task-target',
      privateNote:t.help_active?`全遠征隊可見 · ${t.location_visible?app.meters(app.distance(app.state.position,t)):'等待有效定位'} · 持續至刪除`:(t.location_mode==='fixed'?'固定任務旗標 · ':'')+(t.location_visible?app.meters(app.distance(app.state.position,t)):'座標僅接取者可見')};
  });
  app.TamagoVue.renderWorkspace(root,{tab:app.state.tab,query:q,demo:app.state.demo,user:{...app.state.user},owner:app.state.room?.owner,
    types: app.types,pinTypes: app.pinTypes,tasks,pins:app.state.pins.filter(match).map(p=>({...p})),
    members:app.state.members.filter(match).map(m=>({...m,shares:app.memberSharesLocation(m),targetId:(app.expeditionPeople().find(t=>t.owner===m.user)||app.finderTasks().find(t=>t.owner===m.user))?.id})),
    allMembers:app.state.members.map(m=>({...m})),squads:app.state.squads.map(s=>({...s})),mine:{...app.state.mine},
    manager:app.state.room?.owner===app.state.user.id||app.state.mine.deputy,deleting:[...app.pendingPinDeletes],
    pinVotes:[...(app.landmarkFeedback?.pending||[])],taskVotes:[...(app.taskFeedback?.pending||[])]});
}

function setTab(tab){app.hideExpeditionPage();app.mapActions?.dismiss();app.placeSearch?.close();app.state.tab=tab;app.state.query='';app.$('#search').value='';app.state.filter='all';app.ui.panelOpen=true;app.ui.mobileTab=tab;app.$$('.mobile-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));app.render();app.$('#panel-content').scrollTop=0;}

function showMap(){app.hideExpeditionPage();app.ui.panelOpen=false;app.ui.mobileTab='map';app.$$('.mobile-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.mobile==='map'));if(app.map)app.resources.timeout(()=>app.map.invalidateSize(),30);}

function dialog(model){app.mapActions?.dismiss();app.placeSearch?.close();app.TamagoVue.renderDialog(app.$('#dialog-body'),model);if(!app.$('#dialog').open)app.$('#dialog').showModal();}

function closeDialog(){app.$('#dialog').close();}

function help(){
  app.dialog({kind:'help'});
}
return { icons, toast, render, renderPanel, setTab, showMap, dialog, closeDialog, help };
}
