import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class LandmarkReportBoard extends VueService {
  constructor(actions){
    super(); const resources = this.resources;this.actions=actions;this.generation=0;this.drafts=new Map();this.retries=new Map();this.owner=null;}
  identity(){const uid=this.actions.user()?.id||null;if(uid!==this.owner){this.owner=uid;this.drafts.clear();this.retries.clear();this.detach();}return uid;}
  detach(){this.generation++;this.root=null;this.ctx=null;this.items=[];this.loading=null;this.sending=false;this.deleting=null;this.confirmation=null;}
  current(){const ctx=this.actions.context();return this.root?.isConnected&&ctx&&this.ctx&&ctx.user===this.ctx.user&&ctx.eid===this.ctx.eid&&ctx.pid===this.ctx.pid;}
  endpoint(){return `/expeditions/${encodeURIComponent(this.ctx.eid)}/pins/${encodeURIComponent(this.ctx.pid)}/reports`;}
  mount(root,ctx){
    if(!this.identity())return;const key=[this.owner,ctx.eid,ctx.pid].join(':');
    if(this.root===root&&this.key===key)return;
    this.detach();this.root=root;this.ctx={...ctx,user:this.owner};this.key=key;this.total=0;this.lastRead=0;
    TamagoVue.renderFrame(root,{kind:'reportFrame'});
    this.input=root.querySelector('textarea');this.input.value=this.drafts.get(key)||'';this.resources.bind(this.input, 'oninput', ()=>this.drafts.set(key,this.input.value));
    this.resources.bind(root.querySelector('form'), 'onsubmit', event=>{event.preventDefault();this.send();});
    this.resources.bind(root, 'onclick', event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-report-refresh'))this.load({fresh:true});if(button.dataset.reportRemove){this.confirmation=button.dataset.reportRemove;this.render();}if(button.dataset.reportConfirm)this.remove(button.dataset.reportConfirm);if(button.hasAttribute('data-report-cancel')){this.confirmation=null;this.render();}});
    this.load();
  }
  status(text){if(this.root)this.root.querySelector('.report-status').textContent=text;}
  render(){
    if(!this.current())return;
    TamagoVue.renderList(this.root.querySelector('.report-feed'),'reports',{items:this.items,total:this.total,confirmation:this.confirmation,deleting:this.deleting});
    this.input.disabled=!!this.sending;this.root.querySelector('[type=submit]').disabled=!!this.sending;
  }
  async load({fresh=false}={}){
    if(!this.current()||document.hidden)return;
    if(this.loading){await this.loading;if(fresh&&this.current())return this.load();return;}
    const generation=this.generation,path=this.endpoint();
    this.loading=(async()=>{try{const data=await this.actions.api(path);if(generation!==this.generation||!this.current())return;this.items=data.items;this.total=data.total;this.lastRead=Date.now();this.status('');this.render();}catch(error){if(generation!==this.generation)return;if([401,403,404].includes(error.status)){this.items=[];this.render();this.input.disabled=true;this.root.querySelector('[type=submit]').disabled=true;this.actions.refresh();}this.status(error.message);}finally{if(generation===this.generation)this.loading=null;}})();return this.loading;
  }
  async send(){
    if(!this.identity()||!this.current()||this.sending)return;const body=this.input.value.trim();if(!body)return;
    const generation=this.generation,key=this.key,path=this.endpoint();let retry=this.retries.get(key);
    if(!retry||retry.body!==body){retry={body,client_id:[...crypto.getRandomValues(new Uint8Array(16))].map(value=>value.toString(16).padStart(2,'0')).join('')};this.retries.set(key,retry);}
    this.sending=true;this.status('發布中…');this.render();
    try{await this.actions.api(path,'POST',retry);if(generation!==this.generation||!this.current())return;this.retries.delete(key);this.drafts.delete(key);this.input.value='';await this.actions.refresh();if(generation!==this.generation||!this.current())return;await this.load({fresh:true});this.actions.toast('現場回報已發布。');}catch(error){if(generation===this.generation)this.status(error.message);}finally{if(generation===this.generation){this.sending=false;this.render();}}
  }
  async remove(id){
    if(!this.current()||this.deleting||this.confirmation!==id||!this.items.some(item=>item.id===id&&item.can_delete))return;
    const generation=this.generation,path=this.endpoint();this.deleting=id;this.render();
    try{try{await this.actions.api(path+'/'+encodeURIComponent(id),'DELETE');}catch(error){if(error.status!==404)throw error;}if(generation!==this.generation)return;this.confirmation=null;await this.load({fresh:true});}catch(error){if(generation===this.generation)this.status(error.message);}finally{if(generation===this.generation){this.deleting=null;this.render();}}
  }
  tick(){this.identity();if(this.current()&&!document.hidden&&Date.now()-this.lastRead>=5000)this.load();}
}
