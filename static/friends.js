'use strict';
// Friend locations are returned only after mutual acceptance and explicit sharing.
class FriendsClient {
  constructor(actions){
    this.actions=actions;this.writes=Promise.resolve();this.reset();
    this.view=new TamagoVue.FriendsView({
      invite:username=>this.invite(username),
      act:async(action,id)=>{const uid=this.actions.user()?.id;await this.act(action,id);if(uid===this.actions.user()?.id)this.actions.acted?.(action);}
    });
  }
  reset(){
    this.generation=(this.generation||0)+1;this.ownerId=null;this.sharing=false;this.syncing=false;
    this.data={friends:[],incoming:[],outgoing:[],sharing:false};this.syncedAt=0;this.lastSent=0;this.lastSampleAt=0;this.error='';this.view?.reset();
  }
  ready(){return !!this.actions.user()&&this.ownerId===this.actions.user().id&&navigator.onLine&&!document.hidden&&this.syncedAt>0&&Date.now()-this.syncedAt<=20000;}
  targets(){
    if(!this.ready())return [];
    return this.data.friends.filter(p=>p.location_visible&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&LocationState.valid(p.located))
      .map(p=>({...p,id:'friend:'+p.id,owner:p.id,owner_name:p.nickname,title:'好友 · 不受遠征隊限制',kind:'friend',location_source:'friend'}));
  }
  async sync({fresh=false}={}){
    const user=this.actions.user();if(!user||document.hidden)return;
    if(this.ownerId!==user.id){this.reset();this.ownerId=user.id;this.actions.changed();}
    const generation=this.generation;
    if(this.syncing){
      await this.syncing;
      if(fresh&&generation===this.generation)return this.sync();
      return;
    }
    this.syncing=(async()=>{
    try{
      const data=await this.actions.api('/friends');if(generation!==this.generation||user.id!==this.actions.user()?.id)return;
      this.data=data;this.syncedAt=Date.now();this.error='';this.actions.changed();
    }catch(error){
      if(generation!==this.generation||user.id!==this.actions.user()?.id)return;
      this.syncedAt=0;this.error=error.status===401?'登入已失效，請重新登入。':'好友暫時無法同步，位置已隱藏。';
      if(error.status===401){this.reset();this.actions.expired();}
      this.actions.changed();
    }finally{if(generation===this.generation)this.syncing=false;}
    })();
    return this.syncing;
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
  async invite(username){
    const generation=this.generation,uid=this.actions.user()?.id;if(!uid)return;
    await this.actions.api('/friends/requests','POST',{username});
    if(generation!==this.generation||uid!==this.actions.user()?.id)return;
    await this.sync({fresh:true});
    if(generation===this.generation&&uid===this.actions.user()?.id)this.actions.toast('好友邀請已送出，等待對方接受。');
  }
  async act(action,id){
    if(action==='friend-share'){
      if(this.sharing||this.data.sharing){await this.stop();this.actions.toast('已停止與好友分享位置。');}
      else this.actions.location({friends:true});
    }else if(action==='friend-find')this.actions.find('friend:'+id);
    else if(action==='friend-chat')await this.actions.chat(id);
    else{
      const generation=this.generation,uid=this.actions.user()?.id;if(!uid)return;
      const operation=action==='friend-accept'?'accept':action==='friend-reject'?'reject':null;
      await this.actions.api('/friends/'+encodeURIComponent(id)+(operation?'/'+operation:''),operation?'POST':'DELETE');
      if(generation!==this.generation||uid!==this.actions.user()?.id)return;
      await this.sync({fresh:true});if(generation!==this.generation||uid!==this.actions.user()?.id)return;this.actions.toast(action==='friend-accept'?'已成為好友，開啟位置分享就能互相找人。':action==='friend-reject'?'已拒絕好友邀請。':'已移除，不再向對方提供位置。');
    }
  }
  mount(root,query=''){
    const user=this.actions.user(),own=user&&this.ownerId===user.id;
    const data=own?this.data:{friends:[],incoming:[],outgoing:[],sharing:false};
    const visible=new Set(this.targets().map(target=>target.owner));
    this.view.update({
      user:user?{...user}:null,query,
      friends:data.friends.map(person=>({...person,canFind:visible.has(person.id),note:visible.has(person.id)?
        (LocationState.stale(person.located)?`最後位置 · ${LocationState.age(person.located)}`:'正在分享位置'):'尚未分享位置或位置已過期'})),
      incoming:data.incoming.map(person=>({...person})),outgoing:data.outgoing.map(person=>({...person})),
      sharing:!!(own&&(this.sharing||data.sharing)),
      shareStatus:own&&this.sharing?'目前與已接受的好友分享':data.sharing?'另一個頁面正在分享位置':'目前未分享你的位置',
      syncStatus:this.error||(!this.ready()?'正在同步好友…':'')
    });
    this.view.mount(root);
  }
  unmount(){this.view.unmount();}
}
