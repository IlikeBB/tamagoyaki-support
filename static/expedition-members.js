'use strict';
class ExpeditionMemberManagement {
  constructor(actions){this.actions=actions;this.generation=0;}
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){return generation===this.generation&&this.uid===this.actions.user()?.id&&this.root?.isConnected&&document.querySelector('#dialog').open;}
  open(room){
    const user=this.actions.user();if(!user)return;
    this.uid=user.id;this.room=room;this.items=[];this.next=0;this.total=0;this.loading=false;this.busy=false;this.pending=null;this.generation++;
    this.actions.dialog(`<h2>管理遠征隊成員</h2><p>${esc(room.name)}</p><section id="expedition-members"><p class="field-note">團長可指派副團長及移除成員；副團長可移除一般成員。</p><div class="expedition-preview-heading"><strong data-member-total>載入中…</strong><button type="button" data-member-refresh>重新整理</button></div><p class="expeditions-status" data-member-status role="status" aria-live="polite"></p><div class="expedition-preview-scroll" role="region" tabindex="0" aria-label="成員管理名單"><div data-member-list></div><button type="button" data-member-more hidden>載入更多成員</button></div></section>`);
    this.root=document.querySelector('#expedition-members');this.root.onclick=event=>this.click(event);this.load(true);
  }
  render(){
    if(!this.current())return;
    const labels={leader:'團長',deputy:'副團長',member:'成員'};
    this.root.querySelector('[data-member-total]').textContent=this.loading&&!this.items.length?'載入中…':`${this.total} 位成員`;
    this.root.querySelector('[data-member-list]').innerHTML=this.items.map(person=>`<article class="expedition-managed-person"><div class="expedition-preview-person"><span class="expedition-preview-avatar">${person.avatar_url?`<img src="${esc(person.avatar_url)}" alt="" loading="lazy" data-profile-image>`:esc([...person.nickname][0]||'友')}</span><strong title="${esc(person.nickname)}">${esc(person.nickname)}${person.id===this.uid?'（你）':''}<small>${labels[person.role]||'成員'}</small></strong></div><div class="expedition-member-actions">${person.can_set_role?`<button type="button" data-member-role="${esc(person.id)}" ${this.busy?'disabled':''}>${person.role==='deputy'?'取消副團長':'設為副團長'}</button>`:''}${person.can_kick?`<button type="button" data-member-kick="${esc(person.id)}" ${this.busy?'disabled':''}>移除成員</button>`:''}</div>${this.pending?.id===person.id?`<div class="expedition-member-confirm"><p>${this.pending.kind==='kick'?`移除「${esc(person.nickname)}」？對方將退出遠征隊與小隊，未完成任務會撤回，已接任務會釋出。`:`${person.role==='deputy'?'取消':'指派'}「${esc(person.nickname)}」的副團長權限？`}</p><button type="button" class="button secondary" data-member-confirm ${this.busy?'disabled':''}>${this.busy?'處理中…':'確認'}</button><button type="button" class="button outline" data-member-cancel ${this.busy?'disabled':''}>取消</button></div>`:''}</article>`).join('')||(!this.loading?'<p class="expedition-preview-empty">目前沒有成員。</p>':'');
    const more=this.root.querySelector('[data-member-more]');more.hidden=this.next===null||!this.items.length;more.disabled=this.loading||this.busy;
    this.root.querySelector('[data-member-refresh]').disabled=this.loading||this.busy;
    this.root.querySelector('[data-member-list]').setAttribute('aria-busy',String(this.loading||this.busy));
  }
  async load(reset=false){
    if(!this.current()||this.loading||!reset&&this.next===null)return;
    const generation=this.generation;this.loading=true;if(reset){this.items=[];this.next=0;this.pending=null;this.root.querySelector('.expedition-preview-scroll').scrollTop=0;}
    this.root.querySelector('[data-member-status]').textContent='正在載入成員…';this.render();
    try{const data=await this.actions.api(`/expeditions/${encodeURIComponent(this.room.id)}/management?offset=${this.next}`);if(!this.current(generation))return;
      const seen=new Set(this.items.map(person=>person.id));this.items.push(...data.items.filter(person=>!seen.has(person.id)));this.total=data.total;this.next=data.next_offset;this.root.querySelector('[data-member-status]').textContent='';
    }catch(error){if(this.current(generation)){this.root.querySelector('[data-member-status]').textContent=error.message;if([401,403,404].includes(error.status)){this.items=[];this.total=0;this.next=null;this.pending=null;}}}
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
