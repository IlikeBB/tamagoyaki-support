'use strict';
class ExpeditionRoomSettings {
  constructor(actions){this.actions=actions;this.generation=0;}
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){return generation===this.generation&&this.uid===this.actions.user()?.id&&this.root?.isConnected&&document.querySelector('#dialog').open;}
  open(room){
    const user=this.actions.user();if(!user)return;this.uid=user.id;this.room=room;this.leader=room.owner===user.id;this.busy=false;this.data=null;this.generation++;
    this.actions.dialog({kind:'roomSettings',room:{...room}});
    this.root=document.querySelector('#expedition-settings');this.root.onclick=event=>this.click(event);this.root.onsubmit=event=>{if(event.target.matches('form')){event.preventDefault();this.save(event.target);}};this.load();
  }
  async load(){
    const generation=this.generation;
    try{if(this.leader)this.data=await this.actions.api(`/expeditions/${this.room.id}/settings`);else{const me=await this.actions.api('/me');if(!this.current(generation))return;const room=me.expeditions.find(room=>room.id===this.room.id);if(!room)throw Error('你已不在這支遠征隊。');this.room=room;}
      if(!this.current(generation))return;this.root.querySelector('[data-room-status]').textContent='';this.root.querySelector('[data-room-retry]').hidden=true;this.render();
    }catch(error){if(this.current(generation)){this.root.querySelector('[data-room-status]').textContent=error.message;this.root.querySelector('[data-room-retry]').hidden=false;}}
  }
  render(){
    TamagoVue.renderList(this.root.querySelector('[data-room-content]'),'roomSettings',{data:this.data,leader:this.leader});
    const start=this.root.querySelector('#room-event-date'),end=this.root.querySelector('#room-event-end-date');
    if(start){const syncDates=()=>{end.disabled=!start.value;end.min=start.value;if(!start.value)end.value='';};start.oninput=syncDates;syncDates();}
    const select=this.root.querySelector('#room-privacy');if(select)select.onchange=()=>{const field=this.root.querySelector('[data-room-password]'),input=field.querySelector('input');field.hidden=select.value!=='password';input.disabled=field.hidden;input.required=!field.hidden&&!this.data.has_password;};
  }
  setBusy(value){this.busy=value;if(this.current())this.root.querySelectorAll('button,[type=submit]').forEach(button=>button.disabled=value);}
  async save(form){
    if(!this.current()||this.busy||!this.data)return;
    const generation=this.generation,kind=form.dataset.roomForm,values=Object.fromEntries(new FormData(form)),error=form.querySelector('.form-error');error.textContent='';
    this.setBusy(true);
    try{
      if(kind==='name'){const data=await this.actions.api(`/expeditions/${this.room.id}/name`,'PUT',{name:values.name.trim()});if(!this.current(generation))return;this.data.room.name=data.room.name;this.room.name=data.room.name;this.root.parentElement.querySelector('[data-room-name]').textContent=data.room.name;}
      else if(kind==='copy'){const room=await this.actions.api(`/expeditions/${this.room.id}/copy`,'POST',{name:values.name.trim()});if(!this.current(generation))return;await this.actions.changed(this.uid);if(!this.current(generation))return;this.actions.toast('已建立遠征隊複本：'+room.name+'。');document.querySelector('#dialog').close();return;}
      else{const body={event_date:this.data.room.event_date||null,event_end_date:this.data.room.event_end_date||null,event_time:this.data.event_time,time_zone:this.data.time_zone,privacy:this.data.privacy,pin_policy:this.data.pin_policy};
        if(kind==='time')Object.assign(body,{event_date:values.event_date||null,event_end_date:values.event_date?(values.event_end_date||null):null,event_time:values.event_date?values.event_time:'',time_zone:values.time_zone});
        if(kind==='pins')body.pin_policy=values.pin_policy;
        if(kind==='privacy'){body.privacy=values.privacy;if(body.privacy==='password'&&values.password)body.password=values.password;}
        await this.actions.api(`/expeditions/${this.room.id}/settings`,'PUT',body);if(!this.current(generation))return;this.data=await this.actions.api(`/expeditions/${this.room.id}/settings`);if(!this.current(generation))return;
        if(kind==='time'){form.querySelector('[name=event_time]').value=this.data.event_time;form.querySelector('[name=event_end_date]').value=this.data.room.event_end_date||'';}
        if(kind==='privacy'){form.querySelector('[name=password]').value='';form.querySelector('label[for=room-join-password]').textContent=this.data.has_password?'新加入密碼（留空保留原密碼）':'加入密碼';}
      }
      if(!this.current(generation))return;form.closest('details').open=false;await this.actions.changed(this.uid);if(!this.current(generation))return;this.actions.toast(kind==='name'?'遠征隊名稱已更新。':'遠征隊設定已更新。');if(this.current(generation))form.closest('details').querySelector('summary').focus();
    }catch(failure){if(this.current(generation))error.textContent=failure.message;}
    finally{if(this.current(generation))this.setBusy(false);}
  }
  click(event){
    const button=event.target.closest('button');if(!button||this.busy)return;
    if(button.hasAttribute('data-room-retry'))return this.load();
    if(button.hasAttribute('data-room-submissions'))return this.actions.submissions(this.room);
    if(button.dataset.roomDanger){this.pending=button.dataset.roomDanger;const confirm=this.root.querySelector('[data-room-confirm]');confirm.hidden=false;TamagoVue.renderList(confirm,'roomConfirm',{pending:this.pending});confirm.querySelector('button').focus();return;}
    if(button.hasAttribute('data-room-cancel')){this.root.querySelector('[data-room-confirm]').hidden=true;this.root.querySelector(`[data-room-danger="${this.pending}"]`).focus();return;}
    if(button.hasAttribute('data-room-confirm'))this.depart();
  }
  async depart(){
    const generation=this.generation;this.setBusy(true);
    try{if(this.pending==='delete')await this.actions.remove(this.room.id);else await this.actions.leave(this.room.id,this.uid);}
    catch(error){if(this.current(generation))this.root.querySelector('[data-room-status]').textContent=error.message;}
    finally{if(this.current(generation))this.setBusy(false);}
  }
}
