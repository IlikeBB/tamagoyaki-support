'use strict';
// Friend locations are returned only after mutual acceptance and explicit sharing.
class FriendsClient {
  constructor(actions){this.actions=actions;this.writes=Promise.resolve();this.reset();}
  reset(){
    this.generation=(this.generation||0)+1;this.ownerId=null;this.sharing=false;this.syncing=false;
    this.data={friends:[],incoming:[],outgoing:[],sharing:false};this.syncedAt=0;this.lastSent=0;this.lastSampleAt=0;this.error='';
  }
  ready(){return !!this.actions.user()&&navigator.onLine&&!document.hidden&&this.syncedAt>0&&Date.now()-this.syncedAt<=20000;}
  targets(){
    if(!this.ready())return [];
    return this.data.friends.filter(p=>p.location_visible&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&LocationState.valid(p.located))
      .map(p=>({...p,id:'friend:'+p.id,owner:p.id,owner_name:p.nickname,title:'好友 · 不受遠征隊限制',kind:'friend',location_source:'friend'}));
  }
  async sync(){
    const user=this.actions.user();if(!user||document.hidden)return;
    if(this.ownerId!==user.id){this.reset();this.ownerId=user.id;}
    if(this.syncing)return;this.syncing=true;const generation=this.generation;
    try{
      const data=await this.actions.api('/friends');if(generation!==this.generation)return;
      this.data=data;this.syncedAt=Date.now();this.error='';this.actions.changed();
    }catch(error){
      if(generation!==this.generation)return;
      this.syncedAt=0;this.error=error.status===401?'登入已失效，請重新登入。':'好友暫時無法同步，位置已隱藏。';
      if(error.status===401){this.reset();this.actions.expired();}
      this.actions.changed();
    }finally{if(generation===this.generation)this.syncing=false;}
  }
  publish(position,stamp){
    if(!this.sharing||!this.actions.user()||Date.now()-stamp>20000||stamp<=this.lastSampleAt||Date.now()-this.lastSent<4000)return;
    this.lastSent=Date.now();this.lastSampleAt=stamp;const generation=this.generation,point={...position};
    this.writes=this.writes.catch(()=>{}).then(async()=>{
      if(generation!==this.generation||!this.sharing||Date.now()-stamp>20000)return;
      try{await this.actions.api('/friends/location','PUT',point);this.data.sharing=true;}
      catch(error){if(generation===this.generation){this.syncedAt=0;this.error='好友位置分享暫時中斷，正在重試。';this.actions.changed();}}
    });
  }
  async stop({remote=true}={}){
    const was=this.sharing||this.data.sharing;this.sharing=false;this.generation++;this.syncing=false;
    await this.writes.catch(()=>{});
    try{if(remote&&was&&this.actions.user())await this.actions.api('/friends/location','DELETE');}
    finally{this.data.sharing=false;this.lastSent=0;this.lastSampleAt=0;this.actions.stopped?.();this.actions.changed();}
  }
  async invite(form){
    await this.actions.submit(form,async()=>{
      await this.actions.api('/friends/requests','POST',{username:new FormData(form).get('username')});
      form.reset();await this.sync();this.actions.toast('好友邀請已送出，等待對方接受。');
    });
  }
  async act(action,id){
    if(action==='friend-share'){
      if(this.sharing||this.data.sharing){await this.stop();this.actions.toast('已停止與好友分享位置。');}
      else this.actions.location({friends:true});
    }else if(action==='friend-find')this.actions.find('friend:'+id);
    else if(action==='friend-chat')await this.actions.chat(id);
    else{
      await this.actions.api('/friends/'+encodeURIComponent(id)+(action==='friend-accept'?'/accept':''),action==='friend-accept'?'POST':'DELETE');
      await this.sync();this.actions.toast(action==='friend-accept'?'已成為好友，開啟位置分享就能互相找人。':'已移除，不再向對方提供位置。');
    }
  }
  mount(root,query=''){
    const esc=this.actions.escape,user=this.actions.user();
    if(!user){
      root.innerHTML='<div class="empty"><strong>和好友，隨時會合。</strong><p>登入後用帳號名稱加入好友，不必加入遠征隊或小隊。</p><button class="button dark" data-action="account">登入或註冊</button></div>';return;
    }
    if(!root.querySelector('#friends-panel')){
      root.innerHTML=`<div id="friends-panel"><div class="friends-intro"><strong>不必同隊，也找得到彼此。</strong><p>你的帳號：<b>@${esc(user.username)}</b></p><p>成為好友後，對方開啟位置分享就會顯示在地圖上。</p></div><form id="friend-invite-form"><label for="friend-username">加入好友</label><div class="friend-invite-fields"><input id="friend-username" name="username" autocomplete="off" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9_.-]{2,31}" placeholder="輸入好友的帳號名稱"><button class="button dark" type="submit">送出邀請</button></div><div class="form-error" role="alert"></div></form><div class="friend-sharing"><div><strong>我的好友位置分享</strong><small id="friend-share-status"></small></div><button id="friend-share-toggle" class="button outline" role="switch" aria-checked="false" data-action="friend-share">開啟分享</button></div><p class="field-note">切到背景時保留最後位置 15 分鐘；超過 2 分鐘會標示更新時間，回到網頁會重新定位。背景 GPS 更新依手機系統而定。可隨時關閉分享或移除好友。</p><p id="friend-sync-status" class="friend-sync-status" role="status"></p><div id="friend-requests"></div><div id="friend-list"></div></div>`;
      root.querySelector('#friend-invite-form').addEventListener('submit',event=>{event.preventDefault();this.invite(event.target);});
    }
    const active=this.sharing||this.data.sharing,toggle=root.querySelector('#friend-share-toggle');
    toggle.setAttribute('aria-checked',String(active));toggle.textContent=active?'關閉分享':'開啟分享';
    root.querySelector('#friend-share-status').textContent=this.sharing?'目前與已接受的好友分享':this.data.sharing?'另一個頁面正在分享位置':'目前未分享你的位置';
    root.querySelector('#friend-sync-status').textContent=this.error||(!this.ready()?'正在同步好友…':'');
    const row=(p,buttons,note)=>`<article class="friend-row">${profileAvatar(p.nickname,p.id,p.avatar_url)}<div class="friend-info"><strong>${esc(p.nickname)}</strong><small>@${esc(p.username)}</small><small>${note}</small></div><div class="friend-actions">${buttons}</div></article>`;
    const button=(p,action,label)=>`<button data-action="${action}" data-id="${esc(p.id)}">${label}</button>`;
    const requests=root.querySelector('#friend-requests');
    const html=(this.data.incoming.length?'<h2 class="friend-section-title">收到的邀請</h2>'+this.data.incoming.map(p=>row(p,button(p,'friend-accept','接受')+button(p,'friend-remove','拒絕'),'等待你接受')).join(''):'')+
      (this.data.outgoing.length?'<h2 class="friend-section-title">送出的邀請</h2>'+this.data.outgoing.map(p=>row(p,button(p,'friend-remove','取消'),'等待對方接受')).join(''):'');
    if(requests.dataset.html!==html){requests.innerHTML=html;requests.dataset.html=html;}
    const visible=new Set(this.targets().map(t=>t.owner));
    const people=this.data.friends.filter(p=>[p.nickname,p.username].some(text=>text?.toLocaleLowerCase().includes(query)));
    const list=root.querySelector('#friend-list'),listHtml=`<h2 class="friend-section-title">我的好友 · ${this.data.friends.length}</h2>`+(people.map(p=>row(p,(visible.has(p.id)?button(p,'friend-find','查看位置'):'')+button(p,'friend-chat','聊天')+button(p,'friend-remove','移除'),visible.has(p.id)?(LocationState.stale(p.located)?`最後位置 · ${LocationState.age(p.located)}`:'正在分享位置'):'尚未分享位置或位置已過期')).join('')||'<p class="field-note">'+(query?'沒有符合的好友。':'輸入好友帳號，邀請熟悉的夥伴。')+'</p>');
    if(list.dataset.html!==listHtml){list.innerHTML=listHtml;list.dataset.html=listHtml;}
  }
}
