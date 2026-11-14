export function createBootstrap(app) {
async function init(){
  app.icons();
  app.roomAdmission=new app.RoomAdmission({api: app.api,dialog: app.dialog,user:()=>app.state.authenticated?app.state.user:null});
  app.memberActions=new app.ExpeditionPersonActions({api: app.api,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,friend:id=>app.chatFriend.open(id),changed:async(uid,eid)=>{await app.syncRoomChanges(uid,{people:true});if(app.expeditionPreview?.current()&&app.expeditionPreview.room.id===eid)await app.expeditionPreview.load(true);}});
  app.blockedPeople=new app.BlockedPeople({api: app.api,dialog: app.dialog,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,changed:uid=>app.syncRoomChanges(uid,{people:true})});
  app.pinReview=new app.PinReviewBoard({api: app.api,dialog: app.dialog,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,changed:uid=>app.syncRoomChanges(uid)});
  app.roomSettings=new app.ExpeditionRoomSettings({api: app.api,dialog: app.dialog,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,changed:uid=>app.syncRoomChanges(uid,{catalog:true}),submissions:room=>app.pinReview.open(room),remove:app.deleteRoom,leave:app.leaveExpeditionFromMenu});
  app.expeditionPreview=new app.ExpeditionPreview({api: app.api,dialog: app.dialog,person:(eid,pid)=>app.memberActions.open(eid,pid),user:()=>app.state.authenticated?app.state.user:null,login:()=>{app.authIntent={kind:'expeditions-page',mode:'browse'};app.showAuth();},join:async(id,uid)=>{const room=await app.roomAdmission.join(id,uid);if(room&&app.state.authenticated&&app.state.user.id===uid)await app.finishRoomJoin(room,false);}});
  app.siteAccountAdmin=new app.SiteAccountAdmin({api: app.api,dialog: app.dialog,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null});
  app.expeditionManagement=new app.ExpeditionMemberManagement({api: app.api,dialog: app.dialog,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,changed:async(uid,renamed)=>{const me=await app.api('/me');if(app.state.authenticated&&app.state.user.id===uid){app.state.rooms=me.expeditions;if(renamed)app.expeditionPage?.rename(renamed);if(!app.state.demo)await app.refresh({fresh:true});app.render();if(renamed)app.chat?.tick();}}});
  app.expeditionPage=new app.TamagoVue.ExpeditionsPage(app.$('#expeditions-page'),{
    api: app.api,toast: app.toast,schedule:app.activitySchedule,preview:room=>app.expeditionPreview.open(room),manage:room=>app.roomSettings.open(room),context:()=>({user:app.state.authenticated?app.state.user:null,rooms:app.state.rooms,current:app.state.demo?null:app.state.room.id,venues:app.config?app.activityVenues():[],venue:app.config?app.activityVenue():null}),
    rooms:rooms=>{app.state.rooms=rooms;},create:vid=>{app.state.activityVenue=vid;app.showJoin('create');},expired:()=>app.friends?.actions.expired(),back:app.showMap,
    login:()=>{app.authIntent={kind:'expeditions-page',mode:app.expeditionPage.mode};app.showAuth();},
    enter:async(id,uid)=>{if(!app.state.authenticated||app.state.user.id!==uid)return;const room=app.state.rooms.find(room=>room.id===id);if(!room)throw new Error('隊伍已變更，請重新整理。');if(app.state.demo||app.state.room.id!==id)await app.enterRoom(room,app.state.user);if(app.state.authenticated&&app.state.user.id===uid){app.showMap();app.toast('已進入 '+room.name+'。');}},
    join:async(id,uid)=>{const room=await app.roomAdmission.join(id,uid);if(room&&app.state.authenticated&&app.state.user.id===uid)await app.finishRoomJoin(room,false);}
  });
  app.pinFilters=new app.PinFilters(app.$('#pin-filter'),app.$('#pin-filter-handle'),{stage:app.$('.map-stage'),user:()=>app.state.authenticated?app.state.user.id:null,changed:()=>{if(app.config)app.render();}});
  app.landmarkReports=new app.LandmarkReportBoard({api: app.api,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,refresh:()=>app.refresh({fresh:true}),context:()=>{const pin=app.targetPoint();return app.state.authenticated&&!app.state.demo&&app.state.target?.type==='pin'&&pin?.kind!=='message'&&pin?{user:app.state.user.id,eid:app.state.room.id,pid:pin.id}:null;}});
  app.groundMessages=new app.GroundMessages({
    context:()=>!app.state.demo&&app.state.authenticated?{room:app.state.room.id,user:app.state.user.id}:null,
    join:()=>app.showJoin(),dialog: app.dialog,close:app.closeDialog,submit: app.submit,api: app.api,refresh:()=>{app.pinRevision++;return app.refresh({fresh:true});},toast: app.toast,
    center:point=>{app.showPositionOnMap(point);app.renderMap();},select:id=>app.selectTarget('pin',id)
  });
  app.news=new app.NewsBoard(app.$('#news-dialog'),app.$('#news-launcher'),{
    badge:({unread,requests})=>{app.ui.newsUnread=unread;app.ui.newsRequests=requests;},
    user:()=>app.state.authenticated?app.state.user:null,sync:()=>app.friends?.sync({fresh:true}),
    respond:async(id,response)=>{await app.api('/friends/'+encodeURIComponent(id)+'/'+response,'POST');app.toast(response==='accept'?'已成為好友。':'已拒絕好友邀請。');}
  });
  app.chatFriend=new app.ChatFriendCard(app.$('#chat-friend-dialog'),{
    api: app.api,user:()=>app.state.authenticated?app.state.user:null,sync:()=>app.friends.sync({fresh:true}),
    friends:()=>app.friends.ownerId===app.state.user.id&&app.friends.ready()?app.friends.data:null,news:()=>app.news.open('friends')
  });
  app.profilePage=new app.ProfileClient(app.$('#profile-dialog'),{api: app.api,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,login:uid=>{app.authIntent={kind:'profile',uid};app.showAuth();},settings:app.showAccount,expired:()=>app.friends?.actions.expired(),contentDeleted:(eid,pid,uid,source='pin',parentPin)=>{if(!app.state.authenticated||app.state.user.id!==uid||app.state.demo||app.state.room.id!==eid)return;if(source==='report'){app.landmarkReports?.load({fresh:true});app.refresh({fresh:true});return;}app.pinRevision++;app.state.pins=app.state.pins.filter(pin=>pin.id!==pid);if(app.state.target?.type==='pin'&&app.state.target.id===pid)app.state.target=null;app.render();app.refresh({fresh:true});},updated:profile=>{app.state.user={...app.state.user,...profile};app.render();},room:id=>app.openProfileRoom(id),pin:(eid,pid)=>app.openProfileRoom(eid,pid),taskRoom:async eid=>{await app.openProfileRoom(eid);app.setTab('tasks');},removeRoom:id=>app.showDeleteRoom(id)});
  app.landmarkFeedback=new app.LandmarkFeedback({api: app.api,toast: app.toast,context:()=>({eid:app.state.room.id,user:app.state.user.id,pins:app.state.pins}),committed:()=>{app.pinRevision++;},changed:()=>app.render()});
  app.taskFeedback=new app.TaskFeedback({api: app.api,toast: app.toast,context:()=>({eid:app.state.room.id,user:app.state.user.id,tasks:app.state.tasks}),committed:()=>{app.taskRevision++;},changed:()=>app.render()});
  app.squadInvites=new app.SquadInvites({api: app.api,context:()=>!app.state.demo&&app.state.authenticated&&app.currentSquad()?{user:app.state.user.id,eid:app.state.room.id,sid:app.state.mine.squad}:null,sent:()=>app.chat?.tick()});
  app.appDisplay=new app.AppDisplay({dialog: app.dialog,close:app.closeDialog,toast: app.toast});
  app.chat=new app.ChatClient(app.$('#chat-dialog'),{badge:count=>app.ui.chatUnread=count,api: app.api,toast: app.toast,user:()=>app.state.authenticated?app.state.user:null,login:()=>{app.authIntent={kind:'chat'};app.showAuth();},expired:()=>app.friends?.actions.expired(),person:id=>app.chatFriend.open(id),invitation:body=>app.SquadInvites.invitationURL(body,location.origin,app.config?.public_origin)});
  app.mapActions=new app.MapActions(app.$('#map'),app.$('#map-actions'),{
    pointAt:(x,y)=>{
      if(!app.map)return null;
      if(app.map.isGoogle)return app.map.pointAt(x,y);
      const rect=app.$('#map').getBoundingClientRect();
      return app.map.containerPointToLatLng([x-rect.left,y-rect.top]);
    },
    allowed:app.validMapPoint,
    create:(type,point)=>type==='message'?app.groundMessages.open():app.showPublish(type,point)
  });
  app.placeSearch=new app.PlaceSearch(app.$('#place-search'),{
    search:query=>app.TamagoGooglePlaces.search(query,app.config?.maps,app.map),
    open:()=>app.mapActions?.dismiss(),
    select:point=>{app.showPositionOnMap(point);app.renderMap();},
    changed:()=>{if(app.config)app.renderMap();},
    create:(type,point)=>app.showPublish(type,point)
  });
  app.assistance=new app.AssistanceClient({
    user:()=>app.state.authenticated?app.state.user:null,api: app.api,toast: app.toast,refresh: app.refresh,
    initial:()=>app.state.position?{timestamp:app.lastPositionAt,coords:{latitude:app.state.position.lat,longitude:app.state.position.lng,accuracy:app.state.position.accuracy}}:null,
    stopRegular:()=>app.stopLocation({keepHelp:true,preservePosition:true}),
    changed:status=>{if(status==='off'){if(app.state.scope==='help'){app.state.scope='off';app.state.position=null;}}else{app.state.scope='help';if(status==='denied')app.state.position=null;}if(app.config){app.renderLocation();app.renderMap();}},
    position:p=>{app.state.scope='help';app.lastPositionAt=p.timestamp;app.state.position={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};if(app.centerOnLocationFix){app.centerOnLocationFix=false;app.showPositionOnMap(app.state.position);}app.renderLocation();app.renderMap();}
  });
  app.friends=new app.FriendsClient({api: app.api,toast: app.toast,acted:action=>{if(action!=='friend-chat')app.chat.tick();app.renderLocation();},user:()=>app.state.authenticated?app.state.user:null,location:app.showLocation,chat:id=>app.chat.open('friend',id),find:id=>app.selectTarget('friend',id),stopped:()=>{if(app.state.scope==='friends')app.state.scope='local';else if(app.state.scope==='friends_squad'){app.state.scope=app.currentSquad()?'squad':'local';app.locationSquadId=app.currentSquad()?.id||null;}},changed:()=>{app.syncNewsFriends();if(!app.config)return;app.ui.friendCount=app.friends.data.friends.length;if(app.state.tab==='friends')app.renderPanel();app.renderMap();},expired:()=>{app.state.authenticated=false;app.state.user={id:'me',nickname:'你'};app.resetLobby();app.render();app.toast('登入已失效，請重新登入。');}});
  app.finder=new app.TeammateFinder(app.$('#teammate-finder'),{join:()=>app.showJoin(),friends:()=>app.setTab('friends'),tasks:()=>app.setTab('tasks'),refresh:()=>{app.refresh();app.friends.sync();},location:()=>app.showLocation(),compass:()=>app.compass(),map:app.showFinderTaskOnMap,distance: app.distance,bearing: app.bearing,meters: app.meters,direction: app.direction});
  app.renderFinder();app.resources.interval(app.refreshTeammateGuidance,1000);
  try{
    app.config=await app.api('/config');
    if(navigator.permissions)navigator.permissions.query({name:'geolocation'}).then(permission=>{
      app.resources.listen(permission, 'change',()=>{
        if(permission.state!=='denied')return;
        if(app.assistance.active)app.assistance.fail({code:1,message:'permission revoked'},app.assistance.generation);
        else if(app.state.scope!=='off')app.locationError({code:1},app.locationGeneration);
      });
    }).catch(()=>{});
    let savedVenue;try{savedVenue=localStorage.getItem('tamago-map-venue');}catch{}
    const restoreVenue=app.config.venues.some(v=>v.id===savedVenue);if(restoreVenue)app.state.activeVenue=savedVenue;
    app.resetLobby();await app.initMap();app.render();
    const me=await app.api('/me');
    app.state.authenticated=!!me.user;if(me.user)app.state.user=me.user;app.assistance.sync(me.help_rooms||[]);app.render();
    if(me.user&&me.expeditions.length){let saved;try{saved=localStorage.getItem('tamago-room');}catch{}const room=me.expeditions.find(r=>r.id===saved)||me.expeditions[0];await app.enterRoom(room,me.user,{preserveMap:restoreVenue});}
    if(me.user){await app.friends.sync();app.chat.tick();}
    const params=new URLSearchParams(location.search);if(params.has('join'))app.showJoin('code');else if(app.expeditionRoute())app.showExpeditionPage({route:false});
    app.pollTimer=app.resources.interval(()=>{
      if(app.state.position&&!app.LocationState.valid(app.lastPositionAt/1000)){app.state.position=null;app.renderLocation();app.renderMap();}
      app.assistance.tick();app.landmarkReports.tick();app.refreshGPS();if(!app.state.demo)app.refresh();if(app.state.authenticated){app.friends.sync();app.chat.tick();}
    },5000);
    if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }catch(e){app.toast('初始化失敗：'+e.message);app.ui.connectionError='連線失敗，請重新整理';}
}
return { init };
}
