'use strict';
class SiteAccountAdmin {
  constructor(actions){this.actions=actions;this.generation=0;this.request=0;}
  sync(){if(this.uid&&(this.uid!==this.actions.user()?.id||!this.actions.user()?.site_admin)){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){const user=this.actions.user();return generation===this.generation&&user?.site_admin&&user.id===this.uid&&this.root?.isConnected&&document.querySelector('#dialog').open;}
  open(){
    const user=this.actions.user();if(!user?.site_admin)return;
    this.uid=user.id;this.generation++;this.items=[];this.next=0;this.search='';this.loading=false;this.busy=false;this.pending=null;
    this.actions.dialog({kind:'admin'});
    this.root=document.querySelector('#site-account-admin');this.root.querySelector('form').onsubmit=event=>{event.preventDefault();if(this.busy)return;this.search=this.root.querySelector('input').value.trim();this.load(true);};this.root.onclick=event=>this.click(event);this.load(true);
  }
  render(){
    if(!this.current())return;
    TamagoVue.renderList(this.root.querySelector('[data-admin-list]'),'admin',{items:this.items,loading:this.loading,busy:this.busy,pending:this.pending});
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
