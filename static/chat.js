'use strict';
class ChatClient {
  constructor(root,actions){
    this.actions=actions;this.root=root;this.owner=null;this.generation=0;this.selection=0;this.contacts=[];this.messages=[];this.drafts=new Map();this.retryMessages=new Map();
    this.view=new ChatView(root,{choose:key=>this.choose(key),person:id=>{if(id!==this.owner&&this.messages.some(m=>m.sender===id))this.actions.person(id);},send:()=>this.send(),draft:text=>{if(this.active)this.drafts.set(this.active.id,text);},read:()=>this.markRead(),older:()=>this.loadOlder(),retry:()=>this.tick(),back:()=>this.back(),closed:()=>this.back()});
    for(const name of ['online','offline'])window.addEventListener(name,()=>{this.view.composer(this.sending);if(navigator.onLine)this.tick();else this.view.status('離線 · 連線後重新同步');});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.tick();});
  }
  identity(){
    const uid=this.actions.user()?.id||null;if(uid===this.owner)return uid;
    this.generation++;this.selection++;this.owner=uid;this.contacts=[];this.messages=[];this.active=null;this.syncing=false;this.fetching=false;this.reading=false;this.sending=false;this.readThrough=0;this.drafts.clear();this.retryMessages.clear();
    if(this.root.open)this.root.close();this.view.select(null);this.view.threads([],null);this.view.badge(0);return uid;
  }
  endpoint(contact=this.active){return `/chat/${contact.kind}/${encodeURIComponent(contact.target)}`;}
  handle(error,generation){
    if(generation!==this.generation)return;
    if(error.status===401){this.actions.expired();this.identity();return;}
    this.view.status(navigator.onLine?'聊天暫時無法同步':'離線 · 連線後重新同步',true);this.view.error(error.message);
  }
  async sync(){
    if(!this.identity()||document.hidden)return;
    if(this.syncing)return this.syncing;
    const generation=this.generation;
    this.syncing=(async()=>{
    try{
      const data=await this.actions.api('/chat');if(generation!==this.generation)return;
      this.contacts=data.conversations;this.view.badge(data.unread);this.view.status('每 5 秒同步');
      if(this.active){const contact=this.contacts.find(t=>t.id===this.active.id);if(!contact){this.back();this.actions.toast('已移除好友或離開遠征隊，無法繼續查看對話。');}else this.active=contact;}
      this.view.threads(this.contacts,this.active);
    }catch(error){this.handle(error,generation);}
    finally{if(generation===this.generation)this.syncing=false;}
    })();
    return this.syncing;
  }
  async open(kind,target){
    if(!this.identity())return this.actions.login();
    this.root.dataset.view='list';this.view.open();await this.sync();
    if(kind&&target)await this.choose(kind+':'+target);
  }
  back(){
    this.selection++;this.active=null;this.messages=[];this.fetching=false;this.reading=false;this.hasOlder=false;this.readThrough=0;this.cursor=0;this.view.select(null);
  }
  async choose(key){
    const contact=this.contacts.find(t=>t.id===key);if(!contact)return;
    this.selection++;this.active=contact;this.messages=[];this.fetching=false;this.hasOlder=false;this.readThrough=0;this.reading=false;this.cursor=0;
    this.view.select(contact,this.drafts.get(key)||'');this.view.composer(this.sending);await this.fetchMessages(true);
  }
  async fetchMessages(initial=false){
    if(!this.active||this.fetching||!this.root.open||document.hidden)return;
    const generation=this.generation,selection=this.selection,endpoint=this.endpoint();this.fetching=true;
    try{
      const after=initial?'':`?after=${this.cursor||0}`,data=await this.actions.api(endpoint+'/messages'+after);
      if(generation!==this.generation||selection!==this.selection)return;
      const ids=new Set(this.messages.map(m=>m.id));this.messages.push(...data.messages.filter(m=>!ids.has(m.id)));this.messages.sort((a,b)=>a.id-b.id);
      this.cursor=data.messages.at(-1)?.id||this.cursor;
      if(initial)this.hasOlder=data.has_more;
      this.view.messages(this.messages,this.owner,{initial,hasOlder:this.hasOlder});this.view.error();this.markRead();return !initial&&data.has_more;
    }catch(error){
      if(generation===this.generation&&selection===this.selection){if(error.status===403){this.back();this.sync();}else this.handle(error,generation);}
    }finally{if(generation===this.generation&&selection===this.selection)this.fetching=false;}
  }
  async loadOlder(){
    if(!this.active||!this.hasOlder||this.fetching||!this.messages.length)return;
    const generation=this.generation,selection=this.selection;this.fetching=true;
    try{
      const data=await this.actions.api(this.endpoint()+`/messages?before=${this.messages[0].id}`);
      if(generation!==this.generation||selection!==this.selection)return;
      this.messages.unshift(...data.messages);this.hasOlder=data.has_more;this.view.messages(this.messages,this.owner,{prepend:true,hasOlder:this.hasOlder});
    }catch(error){if(selection===this.selection)this.handle(error,generation);}
    finally{if(generation===this.generation&&selection===this.selection)this.fetching=false;}
  }
  async markRead(){
    const latest=this.messages.filter(m=>m.id<=this.cursor).at(-1);
    if(!this.active||!latest||this.reading||!this.root.open||document.hidden||!this.view.nearBottom()||latest.id<=this.readThrough)return;
    const generation=this.generation,selection=this.selection;this.reading=true;
    try{
      const data=await this.actions.api(this.endpoint()+'/read','POST',{last_id:latest.id});
      if(generation!==this.generation||selection!==this.selection)return;
      this.readThrough=latest.id;this.active.unread=data.unread;this.view.threads(this.contacts,this.active);this.view.badge(this.contacts.reduce((sum,t)=>sum+t.unread,0));
    }catch(error){this.handle(error,generation);}
    finally{if(generation===this.generation&&selection===this.selection)this.reading=false;}
  }
  async send(){
    const value=this.view.input.value,body=value.trim();if(!this.identity()||!this.active||!body||this.sending||!navigator.onLine)return;
    const contact=this.active,generation=this.generation,selection=this.selection;
    let retry=this.retryMessages.get(contact.id);
    if(!retry||retry.body!==body){const nonce=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');retry={body,client_id:nonce};this.retryMessages.set(contact.id,retry);}
    this.sending=true;this.view.composer(true);this.view.error();
    try{
      const message=await this.actions.api(this.endpoint(contact)+'/messages','POST',retry);
      if(generation!==this.generation)return;
      if(this.drafts.get(contact.id)?.trim()===body)this.drafts.delete(contact.id);this.retryMessages.delete(contact.id);
      if(selection===this.selection){
        if(this.view.input.value===value)this.view.input.value='';if(!this.messages.some(m=>m.id===message.id))this.messages.push(message);this.messages.sort((a,b)=>a.id-b.id);
        this.view.messages(this.messages,this.owner,{initial:true,hasOlder:this.hasOlder});await this.fetchMessages();
      }
      await this.sync();
    }catch(error){if(generation===this.generation&&selection===this.selection){if(error.status===403){this.back();this.sync();}else this.handle(error,generation);}}
    finally{if(generation===this.generation){this.sending=false;this.view.composer(false);}}
  }
  async tick(){
    if(!this.identity()||document.hidden)return;
    await this.sync();if(this.root.open&&this.active){for(let i=0;i<3;i++){if(!await this.fetchMessages())break;}this.markRead();}
  }
}
