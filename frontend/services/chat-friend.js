import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class ChatFriendCard extends VueService {
  constructor(root,actions){
    super(); const resources = this.resources;
    this.root=root;this.actions=actions;this.generation=0;this.owner=null;this.profile=null;
    this.status=root.querySelector('[data-friend-status]');this.button=root.querySelector('[data-friend-send]');
    resources.bind(root.querySelector('[data-friend-close]'), 'onclick', ()=>root.close());
    resources.bind(this.button, 'onclick', ()=>this.invite());
    resources.bind(root.querySelector('[data-friend-news]'), 'onclick', ()=>{root.close();actions.news();});
    resources.bind(root.querySelector('[data-friend-retry]'), 'onclick', ()=>this.load());
    resources.listen(root, 'close',()=>{this.generation++;this.clear();if(this.opener?.isConnected)this.opener.focus({preventScroll:true});});
  }
  clear(){
    this.profile=null;this.busy=false;this.status.textContent='';this.button.hidden=true;
    this.root.querySelector('[data-friend-news]').hidden=true;this.root.querySelector('[data-friend-retry]').hidden=true;
    this.root.querySelector('[data-friend-name]').textContent='';this.root.querySelector('[data-friend-username]').textContent='';
    TamagoVue.renderControl(this.root.querySelector('[data-friend-avatar]'),{kind:'avatar',name:'',url:''});
  }
  identity(){
    const owner=this.actions.user()?.id||null;if(owner===this.owner)return;
    this.owner=owner;this.generation++;if(this.root.open)this.root.close();this.clear();
  }
  async open(uid){
    this.identity();if(!this.owner||uid===this.owner)return;
    this.uid=uid;this.opener=document.activeElement;this.clear();if(!this.root.open)this.root.showModal();await this.load();
  }
  async load(){
    const generation=++this.generation;this.status.textContent='正在確認好友狀態…';this.button.hidden=true;
    this.root.querySelector('[data-friend-retry]').hidden=true;
    try{
      const [data]=await Promise.all([this.actions.api('/profiles/'+encodeURIComponent(this.uid)),this.actions.sync()]);
      if(generation!==this.generation||!this.root.open)return;
      this.profile=data.profile;this.render();
    }catch(error){if(generation===this.generation){this.status.textContent=error.message;this.root.querySelector('[data-friend-retry]').hidden=false;}}
  }
  render(){
    if(!this.profile)return;
    const profile=this.profile,root=this.root,portrait=root.querySelector('[data-friend-avatar]');
    root.querySelector('[data-friend-name]').textContent=profile.nickname;root.querySelector('[data-friend-username]').textContent='@'+profile.username;
    TamagoVue.renderControl(portrait,{kind:'avatar',name:profile.nickname,url:profile.avatar_url});
    const snapshot=this.actions.friends();this.button.hidden=true;root.querySelector('[data-friend-news]').hidden=true;
    if(!snapshot){this.status.textContent='好友狀態暫時無法確認，請重新載入。';root.querySelector('[data-friend-retry]').hidden=false;return;}
    if(snapshot.friends.some(p=>p.id===profile.id))this.status.textContent='你們已經是好友。';
    else if(snapshot.outgoing.some(p=>p.id===profile.id))this.status.textContent='已送出好友邀請，等待對方接受。';
    else if(snapshot.incoming.some(p=>p.id===profile.id)){this.status.textContent='對方已邀請你成為好友，可到 News 接受或拒絕。';root.querySelector('[data-friend-news]').hidden=false;}
    else{this.status.textContent='送出邀請後，對方可在 News 選擇接受或拒絕。';this.button.hidden=false;this.button.disabled=this.busy;this.button.textContent=this.busy?'送出中…':'送出好友邀請';}
  }
  async invite(){
    if(this.busy||!this.profile||this.owner!==this.actions.user()?.id)return;
    const generation=this.generation;this.busy=true;this.render();
    try{
      await this.actions.api('/friends/requests','POST',{username:this.profile.username});
      await this.actions.sync();if(generation!==this.generation)return;
      this.render();this.status.textContent='好友邀請已送出，對方可在 News 回覆。';this.button.hidden=true;
    }catch(error){
      if(generation!==this.generation)return;
      await this.actions.sync();if(generation!==this.generation)return;
      this.render();this.status.textContent=error.message;
    }finally{if(generation===this.generation){this.busy=false;this.button.disabled=false;}}
  }
}
