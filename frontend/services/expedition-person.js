import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class ExpeditionPersonActions extends VueService {
  constructor(actions){
    super(); const resources = this.resources;
    this.actions=actions;this.generation=0;this.root=document.createElement('dialog');this.root.id='expedition-person-dialog';this.root.setAttribute('aria-labelledby','expedition-person-title');document.body.append(this.root);
    resources.bind(this.root, 'onclick', event=>this.click(event));resources.listen(this.root, 'close',()=>{this.generation++;this.root.replaceChildren();if(this.opener?.isConnected)this.opener.focus({preventScroll:true});else document.querySelector('#expedition-preview [data-preview-refresh]')?.focus({preventScroll:true});});
  }
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){this.generation++;this.root.close();this.root.replaceChildren();this.uid=null;}}
  current(generation=this.generation){return generation===this.generation&&this.uid===this.actions.user()?.id&&this.root.open;}
  open(eid,pid){if(!this.actions.user()||pid===this.actions.user().id)return;this.uid=this.actions.user().id;this.eid=eid;this.pid=pid;this.data=null;this.busy=false;this.pending=null;this.error='';this.opener=document.activeElement;this.generation++;TamagoVue.renderFrame(this.root,{kind:'personFrame'});this.root.showModal();this.load();}
  async load(){
    const generation=this.generation;
    try{const data=await this.actions.api(`/expeditions/${this.eid}/members/${this.pid}/actions`);if(!this.current(generation))return;this.data=data;this.render();}
    catch(error){if(this.current(generation)){this.root.querySelector('.expedition-person-status').textContent=error.message;TamagoVue.renderList(this.root.querySelector('[data-person-options]'),'personRetry');}}
  }
  render(){
    if(!this.current()||!this.data)return;
    const data=this.data,person=data.person;this.root.querySelector('h2').textContent=person.nickname;this.root.querySelector('.expedition-person-status').textContent=({leader:'團長',deputy:'副團長',member:'成員'})[person.role]+(person.muted?' · 已禁言':'');
    TamagoVue.renderList(this.root.querySelector('[data-person-options]'),'personOptions',{data,busy:this.busy});
    const label={block:data.blocked_by_me?'解除黑名單後，可重新申請好友；原好友關係不會自動恢復。':'加入黑名單會移除好友關係，封鎖好友邀請及私訊，停止彼此的位置分享。',role:person.role==='deputy'?'取消這位成員的副團長權限？':'指定這位成員為副團長？',mute:person.muted?'解除禁言，允許在這支遠征隊發布內容？':'禁言後無法在這支遠征隊及所屬小隊聊天、發布任務、地標或留言，仍可查看及退出。',kick:'剔除後會退出遠征隊與小隊，撤回未完成任務並釋出已接任務；持有有效邀請仍可重新加入。'};
    TamagoVue.renderList(this.root.querySelector('[data-person-confirm]'),'personConfirm',{pending:this.pending,label:label[this.pending],busy:this.busy,error:this.error||''});
  }
  click(event){
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-person-close'))return this.root.close();
    if(this.busy)return;if(button.hasAttribute('data-person-retry'))return this.load();
    if(button.hasAttribute('data-person-cancel')){const prior=this.pending;this.pending=null;this.render();this.root.querySelector(`[data-person-action="${prior}"]`)?.focus();return;}
    if(button.hasAttribute('data-person-confirm-action'))return this.mutate();
    if(button.dataset.personAction==='friend'){this.root.close();return this.actions.friend(this.pid);}
    if(button.dataset.personAction){this.error='';this.pending=button.dataset.personAction;this.render();this.root.querySelector('[data-person-confirm-action]').focus();}
  }
  async mutate(){
    if(!this.current()||!this.pending||this.busy)return;const generation=this.generation,kind=this.pending,data=this.data;this.busy=true;this.render();
    try{
      const base=`/expeditions/${this.eid}/members/${this.pid}`;
      if(kind==='block')await this.actions.api('/blocks/'+this.pid,data.blocked_by_me?'DELETE':'PUT');
      if(kind==='role')await this.actions.api(base+'/role','PUT',{role:data.person.role==='deputy'?'member':'deputy'});
      if(kind==='mute')await this.actions.api(base+'/moderation','PUT',{muted:!data.person.muted});
      if(kind==='kick')await this.actions.api(base,'DELETE');
      if(!this.current(generation))return;this.pending=null;await this.actions.changed(this.uid,this.eid);if(!this.current(generation))return;this.actions.toast('已更新成員設定。');if(kind==='kick'){this.root.close();return;}await this.load();
    }catch(error){if(this.current(generation)){this.error=error.message;const field=this.root.querySelector('[data-person-error]');if(field)field.textContent=error.message;else this.root.querySelector('.expedition-person-status').textContent=error.message;}}
    finally{if(this.current(generation)){this.busy=false;this.render();}}
  }
}
