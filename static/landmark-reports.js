'use strict';
class LandmarkReportBoard {
  constructor(actions){this.actions=actions;this.generation=0;this.drafts=new Map();this.retries=new Map();this.owner=null;}
  identity(){const uid=this.actions.user()?.id||null;if(uid!==this.owner){this.owner=uid;this.drafts.clear();this.retries.clear();this.detach();}return uid;}
  detach(){this.generation++;this.root=null;this.ctx=null;this.items=[];this.loading=null;this.sending=false;this.deleting=null;this.confirmation=null;}
  current(){const ctx=this.actions.context();return this.root?.isConnected&&ctx&&this.ctx&&ctx.user===this.ctx.user&&ctx.eid===this.ctx.eid&&ctx.pid===this.ctx.pid;}
  endpoint(){return `/expeditions/${encodeURIComponent(this.ctx.eid)}/pins/${encodeURIComponent(this.ctx.pid)}/reports`;}
  mount(root,ctx){
    if(!this.identity())return;const key=[this.owner,ctx.eid,ctx.pid].join(':');
    if(this.root===root&&this.key===key)return;
    this.detach();this.root=root;this.ctx={...ctx,user:this.owner};this.key=key;this.total=0;this.lastRead=0;
    root.innerHTML='<div class="report-heading"><h3>留言板</h3><button type="button" data-report-refresh>更新</button></div><form class="report-form"><label for="landmark-report-text" class="visually-hidden">回報目前狀況</label><textarea id="landmark-report-text" name="body" rows="2" maxlength="600" required placeholder="回報排隊、人潮或領取狀況…"></textarea><button type="submit" class="button secondary">發布回報</button></form><p class="report-status" role="status" aria-live="polite"></p><div class="report-feed"></div>';
    this.input=root.querySelector('textarea');this.input.value=this.drafts.get(key)||'';this.input.oninput=()=>this.drafts.set(key,this.input.value);
    root.querySelector('form').onsubmit=event=>{event.preventDefault();this.send();};
    root.onclick=event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-report-refresh'))this.load({fresh:true});if(button.dataset.reportRemove){this.confirmation=button.dataset.reportRemove;this.render();}if(button.dataset.reportConfirm)this.remove(button.dataset.reportConfirm);if(button.hasAttribute('data-report-cancel')){this.confirmation=null;this.render();}};
    this.load();
  }
  status(text){if(this.root)this.root.querySelector('.report-status').textContent=text;}
  render(){
    if(!this.current())return;
    this.root.querySelector('.report-feed').innerHTML=this.items.length?this.items.map(item=>`<article class="report-item" data-report-id="${esc(item.id)}"><div class="report-author">${profileAvatar(item.author_name,item.author,item.author_avatar_url)}<strong>${esc(item.author_name)}</strong><time>${esc(new Date(item.created*1000).toLocaleString('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</time></div><p>${esc(item.body)}</p>${item.can_delete?this.confirmation===item.id?`<div class="report-remove"><span>刪除此回報？</span><button type="button" data-report-confirm="${esc(item.id)}" ${this.deleting?'disabled':''}>${this.deleting===item.id?'刪除中…':'確認刪除'}</button><button type="button" data-report-cancel ${this.deleting?'disabled':''}>取消</button></div>`:`<button type="button" data-report-remove="${esc(item.id)}" ${this.deleting?'disabled':''}>刪除</button>`:''}</article>`).join('')+(this.total>20?`<p class="report-empty">顯示最新 20 則，共 ${this.total} 則回報</p>`:''):'<p class="report-empty">還沒有現場回報。</p>';
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
