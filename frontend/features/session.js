export function createSession(app) {
async function api(path, method='GET', body){
  const controller=new AbortController();const timeout=app.resources.timeout(()=>controller.abort(),12000);
  try{
    const res=await app.resources.fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Tamago-Client':'web'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await res.json();
    if(!res.ok){const error=new Error(typeof data.detail==='string'?data.detail:'請檢查欄位內容，再試一次。');error.status=res.status;throw error;}
    return data;
  }catch(e){if(e.name==='AbortError'&&app.resources.active)throw new Error('連線逾時，請檢查網路後重試。');throw e;}
  finally{app.resources.clearTimeout(timeout);}
}

function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}

function resetLobby(){
  if(!app.state.authenticated)app.assistance?.sync([]);
  app.mapActions?.dismiss();
  const preserveFriends=app.state.authenticated&&(app.friends?.sharing||app.assistance?.active);
  app.centerOnLocationFix=true;app.locationCardDismissed=false;
  app.lastTeamSyncAt=0;
  const stamp=Date.now()/1000;
  if(!preserveFriends){app.locationGeneration++;if(app.state.watch!=null)app.resources.clearWatch(app.state.watch);}
  Object.assign(app.state,{demo:true,room:{id:null,name:'尚未加入遠征隊',venue:'makuhari',event_date:'',code:''},rooms:[],position:preserveFriends?app.state.position:null,squads:[],members:[],tasks:[],mine:{squad:null,scope:'off'},scope:preserveFriends?app.state.scope:'off',watch:preserveFriends?app.state.watch:null,target:null,online:true});
  app.state.pins=[];
}

function showAuth(mode='login'){
  const registering=mode==='register';
  app.dialog({kind:'auth',registering});
  app.resources.bind(app.$('#auth-form'), 'onsubmit', async e=>{e.preventDefault();await app.submit(e.target,async()=>{
    const f=new FormData(e.target);
    if(registering&&f.get('password')!==f.get('confirm'))throw new Error('兩次輸入的密碼不一致。');
    const body={username:f.get('username'),password:f.get('password')};
    if(registering)body.nickname=f.get('nickname');
    const u=await app.api('/auth/'+(registering?'register':'login'),'POST',body);
    app.friends.reset();
    app.resetLobby();app.state.user=u;app.state.authenticated=true;
    const me=await app.api('/me');app.state.rooms=me.expeditions;app.state.user={...u,...me.user};
    if(app.state.rooms.length){let saved;try{saved=localStorage.getItem('tamago-room');}catch{}await app.enterRoom(app.state.rooms.find(r=>r.id===saved)||app.state.rooms[0],app.state.user);}
    await app.friends.sync();app.render();const intent=app.authIntent;app.authIntent=null;app.closeDialog();
    app.toast(registering?'帳號已建立，歡迎加入支援隊！':'登入成功，歡迎回來。');
    if(intent?.kind==='join')app.showJoin(intent.mode);
    else if(intent?.kind==='chat')app.chat.open();
    else if(intent?.kind==='profile')app.profilePage.open(intent.uid);
    else if(intent?.kind==='expeditions-page'){app.showExpeditionPage();app.expeditionPage.selectMode(intent.mode);}
    app.chat.tick();
  });});
}

function showAccount(){
  if(!app.state.authenticated){app.authIntent=null;return app.showAuth();}
  app.dialog({kind:'account',user:{...app.state.user},dark:app.TamagoTheme.dark()});
  app.resources.bind(app.$('#profile-form'), 'onsubmit', async e=>{e.preventDefault();await app.submit(e.target,async()=>{app.state.user={...app.state.user,...await app.api('/profile','POST',{nickname:new FormData(e.target).get('nickname')})};app.render();app.closeDialog();await app.refresh();app.toast('暱稱已更新。');});});
}

function showSettings(){
  if(app.state.authenticated)return app.showAccount();
  app.dialog({kind:'settings',dark:app.TamagoTheme.dark()});
}

function showPasswordSettings(){
  app.dialog({kind:'password'});
  app.resources.bind(app.$('#password-form'), 'onsubmit', async e=>{e.preventDefault();await app.submit(e.target,async()=>{const f=new FormData(e.target);if(f.get('new_password')!==f.get('confirm'))throw new Error('兩次輸入的新密碼不一致。');await app.api('/auth/password','POST',{current_password:f.get('current_password'),new_password:f.get('new_password')});await app.stopLocation();app.closeDialog();await app.refresh();app.toast('密碼已更新，其他裝置已登出。');});});
}

async function logout(){
  await app.assistance?.stop({suspend:true,remote:true});
  try{await app.stopLocation();}catch{}
  await app.api('/auth/logout','POST',{});
  app.friends.reset();app.state.authenticated=false;app.state.user={id:'me',nickname:'你'};app.authIntent=null;app.resetLobby();
  app.chat?.identity();app.profilePage?.identity();
  try{localStorage.removeItem('tamago-room');}catch{}
  app.closeDialog();app.render();app.showMap();app.toast('已登出，定位分享已停止。');
}

async function submit(form,fn){
  const b=app.$('[type=submit]',form),error=app.$('.form-error',form);if(b?.disabled)return;if(b)b.disabled=true;
  try{if(error)error.textContent='';await fn();}catch(e){if(error)error.textContent=e.message;else app.toast(e.message);}finally{if(b)b.disabled=false;}
}
return { api, today, resetLobby, showAuth, showAccount, showSettings, showPasswordSettings, logout, submit };
}
