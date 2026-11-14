import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class ExpeditionMemberManagement extends VueService {
  constructor(actions){
    super(); const resources = this.resources;this.actions=actions;this.generation=0;}
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){return generation===this.generation&&this.uid===this.actions.user()?.id&&this.root?.isConnected&&document.querySelector('#dialog').open;}
  open(room){
    const user=this.actions.user();if(!user)return;
    this.uid=user.id;this.room=room;this.items=[];this.next=0;this.total=0;this.loading=false;this.busy=false;this.pending=null;this.canRename=false;this.generation++;
    this.actions.dialog({kind:'members',room:{...room}});
    this.root=document.querySelector('#expedition-members');this.resources.bind(this.root, 'onclick', event=>this.click(event));this.resources.bind(this.root.querySelector('form'), 'onsubmit', event=>{event.preventDefault();this.rename();});this.resources.bind(this.root.querySelector('[name=name]'), 'oninput', event=>{event.target.dataset.dirty='true';event.target.setCustomValidity('');});this.load(true);
  }
  render(){
    if(!this.current())return;
    const rename=this.root.querySelector('[data-expedition-rename]');rename.hidden=!this.canRename;rename.querySelector('input').disabled=this.busy;rename.querySelector('[type=submit]').disabled=this.busy||this.loading;
    const labels={leader:'團長',deputy:'副團長',member:'成員'};
    this.root.querySelector('[data-member-total]').textContent=this.loading&&!this.items.length?'載入中…':`${this.total} 位成員`;
    TamagoVue.renderList(this.root.querySelector('[data-member-list]'),'members',{items:this.items,uid:this.uid,loading:this.loading,busy:this.busy,pending:this.pending});
    const more=this.root.querySelector('[data-member-more]');more.hidden=this.next===null||!this.items.length;more.disabled=this.loading||this.busy;
    this.root.querySelector('[data-member-refresh]').disabled=this.loading||this.busy;
    this.root.querySelector('[data-member-list]').setAttribute('aria-busy',String(this.loading||this.busy));
  }
  async load(reset=false){
    if(!this.current()||this.loading||!reset&&this.next===null)return;
    const generation=this.generation;this.loading=true;if(reset){this.items=[];this.next=0;this.pending=null;this.root.querySelector('.expedition-preview-scroll').scrollTop=0;}
    this.root.querySelector('[data-member-status]').textContent='正在載入成員…';this.render();
    try{const data=await this.actions.api(`/expeditions/${encodeURIComponent(this.room.id)}/management?offset=${this.next}`);if(!this.current(generation))return;
      this.canRename=data.my_role==='leader';this.room=data.room;this.root.parentElement.querySelector('[data-expedition-room-name]').textContent=data.room.name;const name=this.root.querySelector('[name=name]');if(!name.dataset.dirty)name.value=data.room.name;
      const seen=new Set(this.items.map(person=>person.id));this.items.push(...data.items.filter(person=>!seen.has(person.id)));this.total=data.total;this.next=data.next_offset;this.root.querySelector('[data-member-status]').textContent='';
    }catch(error){if(this.current(generation)){this.root.querySelector('[data-member-status]').textContent=error.message;if([401,403,404].includes(error.status)){this.items=[];this.total=0;this.next=null;this.pending=null;this.canRename=false;}}}
    finally{if(this.current(generation)){this.loading=false;this.render();}}
  }
  click(event){
    const button=event.target.closest('button');if(!button||this.busy)return;
    if(button.hasAttribute('data-member-refresh'))return this.load(true);
    if(button.hasAttribute('data-member-more'))return this.load();
    if(button.hasAttribute('data-member-confirm'))return this.mutate();
    if(button.hasAttribute('data-member-cancel')){const prior=this.pending;this.pending=null;this.render();this.root.querySelector(`[data-member-${prior.kind}="${prior.id}"]`)?.focus();return;}
    const id=button.dataset.memberKick||button.dataset.memberRole;if(!id)return;
    this.pending={id,kind:button.dataset.memberKick?'kick':'role'};this.render();this.root.querySelector('[data-member-confirm]')?.focus();
  }
  async rename(){
    if(!this.current()||!this.canRename||this.busy||this.loading)return;
    const input=this.root.querySelector('[name=name]'),name=input.value.trim(),error=this.root.querySelector('#expedition-rename-form .form-error'),generation=this.generation;
    if(!name){input.setCustomValidity('請輸入遠征隊名稱。');input.reportValidity();return;}
    if(!input.reportValidity())return;
    this.busy=true;error.textContent='';this.render();
    try{const data=await this.actions.api(`/expeditions/${encodeURIComponent(this.room.id)}/name`,'PUT',{name});if(!this.current(generation))return;
      this.room=data.room;this.root.parentElement.querySelector('[data-expedition-room-name]').textContent=data.room.name;input.value=data.room.name;delete input.dataset.dirty;this.root.querySelector('[data-expedition-rename]').open=false;
      this.actions.toast('遠征隊名稱已更新。');await this.actions.changed(this.uid,data.room);
    }catch(failure){if(this.current(generation))error.textContent=failure.message;}
    finally{if(this.current(generation)){this.busy=false;this.render();if(!error.textContent)this.root.querySelector('[data-expedition-rename] summary').focus();}}
  }
  async mutate(){
    if(!this.current()||!this.pending||this.busy)return;
    const generation=this.generation,{id,kind}=this.pending,person=this.items.find(person=>person.id===id);if(!person)return;
    this.busy=true;this.render();
    try{const path=`/expeditions/${encodeURIComponent(this.room.id)}/members/${encodeURIComponent(id)}`;await this.actions.api(kind==='kick'?path:path+'/role',kind==='kick'?'DELETE':'PUT',kind==='kick'?undefined:{role:person.role==='deputy'?'member':'deputy'});
      if(!this.current(generation))return;this.actions.toast(kind==='kick'?'已移除成員。':'已更新副團長權限。');await this.load(true);await this.actions.changed(this.uid);if(this.current(generation))this.root.querySelector('[data-member-refresh]').focus();
    }catch(error){if(this.current(generation)){this.root.querySelector('[data-member-status]').textContent=error.message;if([401,403,404].includes(error.status)){this.items=[];this.next=null;this.pending=null;}}}
    finally{if(this.current(generation)){this.busy=false;this.render();}}
  }
}
