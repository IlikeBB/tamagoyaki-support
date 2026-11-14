export function createActions(app) {
async function handleClick(e){
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.tab)return app.setTab(b.dataset.tab);
  if(b.dataset.mobile)return app.showMap();
  if(b.dataset.filter){app.state.filter=b.dataset.filter;app.render();return;}
  const action=b.dataset.action,id=b.dataset.id;if(!action)return;
  try{
    if(action==='close')app.closeDialog();
    else if(action==='app-display')app.appDisplay.show();
    else if(action==='app-install')await app.appDisplay.install();
    else if(action==='app-fullscreen')await app.appDisplay.fullscreen();
    else if(action==='account'){if(app.state.authenticated)await app.profilePage.open();else app.showAccount();}
    else if(action==='view-profile')await app.profilePage.open(id);
    else if(action==='pin-vote')await app.landmarkFeedback.vote(id,Number(b.dataset.value));
    else if(action==='task-vote')await app.taskFeedback.vote(id,Number(b.dataset.value));
    else if(action==='chat')await app.chat.open();
    else if(action==='chat-room'&&!app.state.demo)await app.chat.open('expedition',app.state.room.id);
    else if(action?.startsWith('friend-')){b.disabled=true;try{await app.friends.act(action,id);if(action!=='friend-chat')app.chat.tick();}finally{b.disabled=false;}app.renderLocation();if(!document.contains(b))app.$('#friend-share-toggle')?.focus({preventScroll:true});}
    else if(action==='auth-login')app.showAuth('login');
    else if(action==='auth-register')app.showAuth('register');
    else if(action==='password-settings')app.showPasswordSettings();
    else if(action==='logout'){b.disabled=true;try{await app.logout();}finally{b.disabled=false;}}
    else if(action==='toggle-password'){const visible=b.getAttribute('aria-pressed')!=='true';app.$$('input',b.closest('form')).filter(input=>input.autocomplete.includes('password')).forEach(input=>input.type=visible?'text':'password');b.setAttribute('aria-pressed',visible);b.textContent=visible?'隱藏密碼':'顯示密碼';}
    else if(action==='join'||action==='join-mode')app.showJoin();
    else if(action==='create-mode')app.showJoin('create');
    else if(action==='code-mode')app.showJoin('code');
    else if(action==='publish-intel')app.showPublish('pin',undefined,{lifetime:b.dataset.lifetime});
    else if(action==='ground-message')app.groundMessages.open();
    else if(action==='rooms')app.showRooms();
    else if(action==='expeditions')app.showExpeditionPage();
    else if(action==='friends-preview'){app.closeDialog();app.setTab('friends');}
    else if(action==='member-options'&&!app.state.demo)app.memberActions.open(app.state.room.id,id);
    else if(action==='pin-submissions'&&!app.state.demo)app.pinReview.open(app.state.room);
    else if(action==='blocked-people')app.blockedPeople.open();
    else if(action==='site-account-admin')app.siteAccountAdmin.open();
    else if(action==='settings')app.showSettings();
    else if(action==='squads'){if(app.state.demo)app.showJoin();else{app.closeDialog();app.setTab('members');}}
    else if(action==='manage-members'){const data=await app.api('/expeditions/owned'),room=data.expeditions.find(room=>room.id===b.dataset.id);if(room)app.roomSettings.open(room);}
    else if(action==='owned-rooms')await app.showOwnedRooms();
    else if(action==='delete-room')await app.showDeleteRoom(id);
    else if(action==='confirm-delete-room'){b.disabled=true;try{await app.deleteRoom(id);}finally{b.disabled=false;}}
    else if(action==='invite')app.showInvite();
    else if(action==='squad-invite')app.showInvite(true);
    else if(action==='squad-chat'&&!app.state.demo&&app.state.mine.squad===id)await app.chat.open('squad',id);
    else if(action==='leave-squad'){b.disabled=true;try{await app.leaveSquad(id);}finally{b.disabled=false;}}
    else if(action==='help')app.help();
    else if(action==='create-squad'||action==='join-squad')app.showSquad(action==='create-squad'?'create':'join');
    else if(action==='publish')app.showPublish(app.state.tab==='tasks'?'task':'pin');
    else if(action==='pin-center')app.mapActions?.openCenter(app.map.getCenter());
    else if(action==='location')app.showLocation();
    else if(action==='dismiss-location'){
      if(app.state.scope!=='off'){app.locationCardDismissed=true;app.renderLocation();app.$('#location-reopen').focus({preventScroll:true});}
    }
    else if(action==='help-retry'){await app.assistance.retry();app.closeDialog();}
    else if(action==='help-room'){const room=app.state.rooms.find(r=>r.id===id);if(room){app.closeDialog();if(app.state.room.id!==id)await app.enterRoom(room,app.state.user);app.setTab('tasks');app.state.filter='help';app.renderPanel();}}
    else if(action==='stop-location'){if(app.assistance?.active)return app.showHelpLocation();await app.stopLocation();app.closeDialog();await app.refresh();app.toast('已停止即時定位；任務發布點仍供接取者使用。');}
    else if(action==='compass')await app.compass();
    else if(action==='zoom-in')app.map?.zoomIn();
    else if(action==='zoom-out')app.map?.zoomOut();
    else if(action==='radar'){app.state.radar=!app.state.radar;b.setAttribute('aria-pressed',app.state.radar);app.renderRadar();}
    else if(action==='center'){
      if(!app.state.position||!app.LocationState.valid(app.lastPositionAt/1000))app.showLocation();
      else{app.showPositionOnMap(app.state.position);app.renderMap();}
    }
    else if(action==='target-close'){app.state.target=null;app.renderTarget();}
    else if(action==='member-target')app.selectTarget('member',id);
    else if(action==='task-target')app.selectTarget('task',id);
    else if(action==='pin-target')app.selectTarget('pin',id);
    else if(['accept','release','complete','cancel'].includes(action))await app.taskAction(id,action);
    else if(action==='copy'){try{await navigator.clipboard.writeText(b.dataset.copy);app.toast('邀請連結已複製。');}catch{app.toast('無法自動複製，請選取上方邀請連結。');}}
    else if(action==='venue'){app.showMap();app.switchVenue(id);}
    else if(action==='switch-room'){const r=app.state.rooms.find(r=>r.id===id);app.closeDialog();await app.enterRoom(r,app.state.user);app.showMap();}
    else if(action==='delete-pin')await app.deletePin(id);
    else if(action==='leave'){if(app.state.authenticated&&!app.state.demo&&app.state.room)app.dialog({kind:'leaveRoom',room:{...app.state.room},userId:app.state.user.id});}
    else if(action==='confirm-leave'){
      if(!app.state.authenticated||b.dataset.user!==app.state.user.id){app.closeDialog();return;}
      b.disabled=true;try{await app.leaveExpeditionFromMenu(id,b.dataset.user);app.closeDialog();app.showMap();app.focusVenue();}finally{b.disabled=false;}
    }
  }catch(error){app.toast(error.message);}
}

function onSearchInput(e){app.state.query=e.target.value;app.renderPanel();}

function onVenueChange(e){app.switchVenue(e.target.value);}
return { handleClick, onSearchInput, onVenueChange };
}
