'use strict';
class SiteAccountAdmin {
  constructor(actions){this.actions=actions;this.generation=0;this.request=0;}
  sync(){if(this.uid&&(this.uid!==this.actions.user()?.id||!this.actions.user()?.site_admin)){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){const user=this.actions.user();return generation===this.generation&&user?.site_admin&&user.id===this.uid&&this.root?.isConnected&&document.querySelector('#dialog').open;}
  open(){
    const user=this.actions.user();if(!user?.site_admin)return;
    this.uid=user.id;this.generation++;this.items=[];this.next=0;this.search='';this.loading=false;this.busy=false;this.pending=null;
    this.actions.dialog('<h2>帳號管理</h2><section id="site-account-admin"><p class="site-admin-count" data-admin-count>正在載入註冊人數…</p><form id="site-admin-search"><label for="site-admin-query">搜尋帳號或暱稱</label><div class="site-admin-search"><input id="site-admin-query" name="search" type="search" maxlength="80" placeholder="輸入帳號或暱稱"><button class="button secondary" type="submit">搜尋</button></div></form><div class="expedition-preview-heading"><strong data-admin-matched></strong><button type="button" data-admin-refresh>重新整理</button></div><p class="expeditions-status" data-admin-status role="status" aria-live="polite"></p><div class="site-admin-scroll" role="region" aria-label="註冊帳號名單" tabindex="0"><div data-admin-list></div><button class="button outline full" type="button" data-admin-more hidden>載入更多帳號</button></div></section>');
    this.root=document.querySelector('#site-account-admin');this.root.querySelector('form').onsubmit=event=>{event.preventDefault();if(this.busy)return;this.search=this.root.querySelector('input').value.trim();this.load(true);};this.root.onclick=event=>this.click(event);this.load(true);
  }
  render(){
    if(!this.current())return;
    this.root.querySelector('[data-admin-list]').innerHTML=this.items.map(person=>`<article class="site-admin-person"><div><strong>${esc(person.nickname)}${person.is_admin?' <span class="expedition-current">管理員</span>':''}</strong><p>@${esc(person.username)} · ${person.suspended?'已停用':'使用中'}</p><small>${person.registered?'註冊於 '+new Date(person.registered*1000).toLocaleDateString('zh-TW'):''}</small></div>${!person.is_admin?`<button type="button" class="button outline ${person.suspended?'':'logout-button'}" data-admin-toggle="${esc(person.id)}" ${this.busy||this.loading?'disabled':''}>${person.suspended?'恢復帳號':'停用帳號'}</button>`:''}${this.pending===person.id?`<div class="site-admin-confirm"><p>${person.suspended?`恢復「${esc(person.nickname)}」？對方可再次登入。`:`停用「${esc(person.nickname)}」？將強制登出所有裝置並停止位置分享。既有資料保留，可隨時恢復帳號。`}</p><button class="button secondary" type="button" data-admin-confirm ${this.busy?'disabled':''}>${this.busy?'處理中…':'確認'}</button><button class="button outline" type="button" data-admin-cancel ${this.busy?'disabled':''}>取消</button></div>`:''}</article>`).join('')||(!this.loading?'<p class="expedition-preview-empty">沒有符合的帳號。</p>':'');
    const more=this.root.querySelector('[data-admin-more]');more.hidden=this.next===null||!this.items.length;more.disabled=this.loading||this.busy;
    this.root.querySelector('[data-admin-refresh]').disabled=this.loading||this.busy;this.root.querySelector('[type=submit]').disabled=this.busy;
    this.root.querySelector('[data-admin-list]').setAttribute('aria-busy',String(this.loading||this.busy));
  }
  async load(reset=false){
    if(!this.current()||!reset&&(this.loading||this.next===null))return;
    const generation=this.generation,request=++this.request;this.loading=true;
    if(reset){this.items=[];this.next=0;this.pending=null;this.root.querySelector('.site-admin-scroll').scrollTop=0;}
    this.root.querySelector('[data-admin-status]').textContent='正在載入帳號…';this.render();
    try{const data=await this.actions.api(`/admin/users?offset=${this.next}&search=${encodeURIComponent(this.search)}`);if(!this.current(generation)||request!==this.request)return;
      const seen=new Set(this.items.map(person=>person.id));this.items.push(...data.items.filter(person=>!seen.has(person.id)));this.next=data.next_offset;this.root.querySelector('[data-admin-count]').textContent=`已註冊 ${data.total} 人 · 使用中 ${data.active} 人 · 已停用 ${data.suspended} 人`;this.root.querySelector('[data-admin-matched]').textContent=`${data.matched} 個帳號`;this.root.querySelector('[data-admin-status]').textContent='';
    }catch(error){if(this.current(generation)&&request===this.request){this.root.querySelector('[data-admin-status]').textContent=error.message;if([401,403].includes(error.status)){this.items=[];this.next=null;this.root.querySelector('[data-admin-count]').textContent='無法存取帳號管理';this.root.querySelector('[data-admin-matched]').textContent='';}}}
    finally{if(this.current(generation)&&request===this.request){this.loading=false;this.render();}}
  }
  click(event){
    const button=event.target.closest('button');if(!button||this.busy)return;
    if(button.hasAttribute('data-admin-refresh'))return this.load(true);
    if(button.hasAttribute('data-admin-more'))return this.load();
    if(button.hasAttribute('data-admin-confirm'))return this.mutate();
    if(button.hasAttribute('data-admin-cancel')){const id=this.pending;this.pending=null;this.render();this.root.querySelector(`[data-admin-toggle="${id}"]`)?.focus();return;}
    if(button.dataset.adminToggle){this.pending=button.dataset.adminToggle;this.render();this.root.querySelector('[data-admin-confirm]')?.focus();}
  }
  async mutate(){
    if(!this.current()||this.busy||!this.pending)return;
    const generation=this.generation,person=this.items.find(person=>person.id===this.pending);if(!person||person.is_admin)return;this.busy=true;this.render();
    try{await this.actions.api(`/admin/users/${encodeURIComponent(person.id)}/status`,'PUT',{suspended:!person.suspended});if(!this.current(generation))return;await this.load(true);this.actions.toast(person.suspended?'帳號已恢復，可重新登入。':'帳號已停用，所有裝置已登出。');}
    catch(error){if(this.current(generation))this.root.querySelector('[data-admin-status]').textContent=error.message;}
    finally{if(this.current(generation)){this.busy=false;this.render();this.root.querySelector('[data-admin-refresh]')?.focus();}}
  }
}
