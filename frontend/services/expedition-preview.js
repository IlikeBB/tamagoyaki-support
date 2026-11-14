import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class ExpeditionPreview extends VueService {
  constructor(actions){
    super(); const resources = this.resources;this.actions=actions;this.generation=0;}
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){return generation===this.generation&&this.root?.isConnected&&document.querySelector('#dialog').open&&this.uid===this.actions.user()?.id;}
  open(room){
    const user=this.actions.user();if(!user)return this.actions.login();
    const generation=++this.generation;this.uid=user.id;this.room=room;this.items=[];this.total=0;this.next=0;this.loading=false;this.joining=false;this.valid=false;
    this.actions.dialog({kind:'preview',room:{...room}});
    this.root=document.querySelector('#expedition-preview');
    this.resources.bind(this.root, 'onclick', event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-preview-refresh'))this.load(true);else if(button.hasAttribute('data-preview-more'))this.load();else if(button.hasAttribute('data-preview-join'))this.join();else if(button.dataset.previewPerson)this.actions.person(this.room.id,button.dataset.previewPerson);});
    this.load(true,generation);
  }
  render(){
    if(!this.current())return;
    this.root.querySelector('[data-preview-total]').textContent=this.loading&&!this.items.length?'載入成員中…':`${this.total} 位成員`;
    TamagoVue.renderList(this.root.querySelector('[data-preview-list]'),'preview',{items:this.items,uid:this.uid,loading:this.loading});
    const more=this.root.querySelector('[data-preview-more]');more.hidden=this.next===null||!this.items.length;more.disabled=this.loading;more.textContent=this.loading?'載入中…':'載入更多成員';
    this.root.querySelector('[data-preview-refresh]').disabled=this.loading||this.joining;
    const join=this.root.querySelector('[data-preview-join]');if(join){join.disabled=this.loading||this.joining||!this.valid;join.textContent=this.joining?'正在加入…':'加入遠征隊';}
    this.root.querySelector('[data-preview-list]').setAttribute('aria-busy',String(this.loading));
  }
  async load(reset=false,generation=this.generation){
    if(!this.current(generation)||this.loading||!reset&&this.next===null)return;
    if(reset){this.items=[];this.next=0;this.valid=false;this.root.querySelector('.expedition-preview-scroll').scrollTop=0;}
    this.loading=true;this.root.querySelector('[data-preview-status]').textContent='正在載入成員…';this.render();
    try{const data=await this.actions.api(`/expeditions/${encodeURIComponent(this.room.id)}/preview?offset=${this.next}`);if(!this.current(generation))return;
      const seen=new Set(this.items.map(item=>item.id));this.items.push(...data.items.filter(item=>!seen.has(item.id)));this.total=data.total;this.next=data.next_offset;this.valid=true;this.root.querySelector('[data-preview-status]').textContent='';
    }catch(error){if(this.current(generation)){this.root.querySelector('[data-preview-status]').textContent=error.message;if([401,403,404].includes(error.status)){this.valid=false;this.items=[];this.next=null;}}}
    finally{if(this.current(generation)){this.loading=false;this.render();}}
  }
  async join(){
    if(!this.current()||this.joining||!this.valid)return;
    const generation=this.generation;this.joining=true;this.render();
    try{await this.actions.join(this.room.id,this.uid);}
    catch(error){if(this.current(generation))this.root.querySelector('[data-preview-status]').textContent=error.message;}
    finally{if(this.current(generation)){this.joining=false;this.render();}}
  }
}
