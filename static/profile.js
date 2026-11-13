'use strict';
class ProfileClient {
  constructor(root,actions){
    this.root=root;this.actions=actions;this.owner=null;this.generation=0;this.recordRequest=0;this.tab='wall';this.items=[];this.editing=false;
    this.view=new ProfileView(root,{tab:tab=>this.selectTab(tab),more:()=>this.records(true),photo:slot=>this.pick(slot),room:id=>this.navigate(()=>actions.room(id)),removeRoom:id=>this.navigate(()=>actions.removeRoom(id)),pin:(eid,pid)=>this.navigate(()=>actions.pin(eid,pid)),withdraw:(eid,pid)=>this.withdraw(eid,pid),edit:()=>this.edit(),settings:()=>this.navigate(actions.settings),save:form=>this.save(form),closed:()=>this.closed(),removeAvatar:()=>this.remove('avatar'),removeBanner:()=>this.remove('banner')});
    this.crop=new ProfileCrop(root.querySelector('#profile-crop'),{opened:()=>{this.view.scroll.hidden=true;},cancelled:()=>{this.view.scroll.hidden=false;},save:(slot,image)=>this.upload(slot,image),error:message=>this.view.status(message,true)});
    this.file=root.querySelector('#profile-file');this.file.onchange=async()=>{const file=this.file.files[0];this.file.value='';try{await this.crop.open(file,this.slot);}catch(error){this.view.status(error.message,true);}};
    root.querySelector('#profile-retry').onclick=()=>this.load();root.querySelector('#profile-edit').onclick=()=>this.edit();root.querySelector('#profile-settings').onclick=()=>this.navigate(actions.settings);
    root.addEventListener('cancel',event=>{if(!root.querySelector('#profile-crop').hidden){event.preventDefault();this.crop.cancel();}});
  }
  identity(){
    const uid=this.actions.user()?.id||null;if(uid===this.owner)return uid;
    this.owner=uid;this.generation++;this.uid=null;this.data=null;this.draft=null;this.crop.clear();if(this.root.open)this.root.close();return uid;
  }
  async open(uid='me'){
    if(!this.identity())return this.actions.login(uid);
    this.generation++;this.recordRequest++;this.loadingRecords=false;this.uid=uid==='me'?this.owner:uid;this.tab='wall';this.editing=false;this.draft=null;this.data=null;this.items=[];
    this.root.querySelector('#profile-crop').hidden=true;this.view.scroll.hidden=false;this.view.body.replaceChildren();this.root.querySelector('#profile-edit').hidden=true;this.root.querySelector('#profile-settings').hidden=true;
    if(!this.root.open){this.view.opener=document.activeElement;this.root.showModal();}this.view.fit();await this.load();
  }
  closed(){this.generation++;this.recordRequest++;this.loadingRecords=false;this.crop.clear();this.data=null;this.draft=null;this.items=[];this.uid=null;this.view.body.replaceChildren();this.view.status('');}
  navigate(action){this.root.close();Promise.resolve(action()).catch(error=>this.actions.toast(error.message));}
  async load(){
    if(!this.uid||!this.identity())return;
    const generation=this.generation,uid=this.uid;this.view.status('正在載入個人檔案…');
    try{
      const data=await this.actions.api('/profiles/'+encodeURIComponent(uid));if(generation!==this.generation)return;
      this.data=data;this.view.render(data,this.tab,this.editing,this.draft);this.view.status('');
      if(!this.editing){if(this.tab==='wall'){this.items=data.wall.items;this.next=data.wall.next_offset;this.view.records(this.items,'wall',data.wall.total,this.next);}else await this.records();}
      if(data.profile.own)this.actions.updated(data.profile);
    }catch(error){this.fail(error,generation);}
  }
  fail(error,generation=this.generation){if(generation!==this.generation)return;this.view.status(error.message,true);if(error.status===401){this.actions.expired();this.identity();}}
  edit(){
    if(!this.data?.profile.own)return;this.editing=!this.editing;this.draft=null;this.view.render(this.data,this.tab,this.editing);if(!this.editing)this.selectTab(this.tab);
  }
  capture(){const form=this.root.querySelector('#profile-details-form');if(form)this.draft=Object.fromEntries(new FormData(form));}
  pick(slot){this.capture();this.slot=slot;this.file.click();}
  async upload(slot,image){
    const generation=this.generation;await this.actions.api('/profiles/me/media/'+slot,'PUT',{image});if(generation!==this.generation)return;
    await this.load();this.actions.toast(slot==='avatar'?'頭貼已更新。':'橫幅已更新。');
  }
  async remove(slot){
    this.capture();const generation=this.generation;
    try{await this.actions.api('/profiles/me/media/'+slot,'DELETE');if(generation===this.generation)await this.load();}catch(error){this.fail(error,generation);}
  }
  async save(form){
    const button=form.querySelector('[type=submit]'),generation=this.generation;button.disabled=true;this.capture();
    try{await this.actions.api('/profiles/me','PATCH',this.draft);if(generation!==this.generation)return;this.editing=false;this.draft=null;await this.load();this.actions.toast('個人檔案已儲存。');}
    catch(error){this.fail(error,generation);}finally{button.disabled=false;}
  }
  async selectTab(tab){
    if(!this.data||tab==='given'&&!this.data.profile.own)return;this.recordRequest++;this.loadingRecords=false;this.tab=tab;this.items=[];this.next=null;
    this.root.querySelectorAll('[data-profile-action=tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tab===tab)));
    this.root.querySelector('#profile-records')?.replaceChildren();this.root.querySelector('#profile-more').hidden=true;await this.records();
  }
  async records(more=false){
    if(!this.uid||this.editing||this.loadingRecords)return;
    const generation=this.generation,tab=this.tab,offset=more?this.next:0;if(offset==null)return;const request=++this.recordRequest;this.loadingRecords=true;this.view.status('正在載入紀錄…');
    try{
      const path=tab==='wall'?'/wall?offset='+offset:'/feedback?kind='+tab+'&offset='+offset;
      const data=await this.actions.api('/profiles/'+encodeURIComponent(this.uid)+path);if(generation!==this.generation||request!==this.recordRequest||tab!==this.tab)return;
      const all=more?[...this.items,...data.items]:data.items;this.items=all.filter((item,index,array)=>array.findIndex(other=>(other.pin||other.id)===(item.pin||item.id))===index);
      this.next=data.next_offset;this.view.records(this.items,tab,data.total,this.next);this.view.status('');
    }catch(error){if(request===this.recordRequest)this.fail(error,generation);}finally{if(request===this.recordRequest)this.loadingRecords=false;}
  }
  async withdraw(eid,pid){
    const generation=this.generation;
    try{await this.actions.api(`/expeditions/${encodeURIComponent(eid)}/pins/${encodeURIComponent(pid)}/vote`,'PUT',{value:0});if(generation!==this.generation)return;await this.load();this.actions.toast('已收回評價。');}
    catch(error){this.fail(error,generation);}
  }
}
