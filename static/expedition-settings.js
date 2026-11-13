'use strict';
class ExpeditionRoomSettings {
  constructor(actions){this.actions=actions;this.generation=0;}
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){return generation===this.generation&&this.uid===this.actions.user()?.id&&this.root?.isConnected&&document.querySelector('#dialog').open;}
  open(room){
    const user=this.actions.user();if(!user)return;this.uid=user.id;this.room=room;this.leader=room.owner===user.id;this.busy=false;this.data=null;this.generation++;
    this.actions.dialog(`<h2>遠征隊管理</h2><p data-room-name>${esc(room.name)}</p><section id="expedition-settings"><p data-room-status class="expeditions-status" role="status" aria-live="polite">正在載入…</p><button type="button" data-room-retry hidden>重新載入</button><div data-room-content></div></section>`);
    this.root=document.querySelector('#expedition-settings');this.root.onclick=event=>this.click(event);this.root.onsubmit=event=>{if(event.target.matches('form')){event.preventDefault();this.save(event.target);}};this.load();
  }
  async load(){
    const generation=this.generation;
    try{if(this.leader)this.data=await this.actions.api(`/expeditions/${this.room.id}/settings`);else{const me=await this.actions.api('/me');if(!this.current(generation))return;const room=me.expeditions.find(room=>room.id===this.room.id);if(!room)throw Error('你已不在這支遠征隊。');this.room=room;}
      if(!this.current(generation))return;this.root.querySelector('[data-room-status]').textContent='';this.root.querySelector('[data-room-retry]').hidden=true;this.render();
    }catch(error){if(this.current(generation)){this.root.querySelector('[data-room-status]').textContent=error.message;this.root.querySelector('[data-room-retry]').hidden=false;}}
  }
  render(){
    const data=this.data,section=(title,kind,body)=>`<details class="room-setting"><summary>${title}</summary><form data-room-form="${kind}">${body}<p class="form-error" role="alert"></p><button class="button secondary" type="submit">${kind==='copy'?'建立複本':'儲存'}</button></form></details>`;
    const time=data?section('調整遠征隊時間','time',`<label for="room-event-date">開始日期（可不指定）</label><input id="room-event-date" name="event_date" type="date" value="${esc(data.room.event_date)}"><label for="room-event-end-date">結束日期（可選）</label><input id="room-event-end-date" name="event_end_date" type="date" value="${esc(data.room.event_end_date||'')}" min="${esc(data.room.event_date)}" aria-describedby="room-date-range-note"><p id="room-date-range-note" class="field-note">單日活動只填開始日期；多日活動再選擇結束日期。</p><label for="room-event-time">開始時間（可選）</label><input id="room-event-time" name="event_time" type="time" value="${esc(data.event_time)}"><label for="room-time-zone">時區</label><select id="room-time-zone" name="time_zone"><option value="Asia/Tokyo" ${data.time_zone==='Asia/Tokyo'?'selected':''}>日本時間（UTC+9）</option><option value="Asia/Taipei" ${data.time_zone==='Asia/Taipei'?'selected':''}>台灣時間（UTC+8）</option></select>`):'';
    const name=data?section('變更遠征隊名稱','name',`<label for="room-name-input">遠征隊名稱</label><input id="room-name-input" name="name" required maxlength="60" value="${esc(data.room.name)}"><p class="field-note">1–60 個字</p>`):'';
    const pins=data?section('設定圖釘','pins',`<label for="room-pin-policy">放置方式</label><select id="room-pin-policy" name="pin_policy"><option value="free" ${data.pin_policy==='free'?'selected':''}>自由放置</option><option value="approval" ${data.pin_policy==='approval'?'selected':''}>審核放置</option></select><p class="field-note">審核放置的圖釘，須經團長或副團長核准才會出現在地圖上。既有待審圖釘仍需審核。</p><button type="button" class="button outline full" data-room-submissions>審核圖釘</button>`):'';
    const privacy=data?section('更改遠征隊隱私','privacy',`<label for="room-privacy">加入方式</label><select id="room-privacy" name="privacy"><option value="public" ${data.privacy==='public'?'selected':''}>公開：可從場館列表加入</option><option value="password" ${data.privacy==='password'?'selected':''}>密碼：輸入密碼才能加入</option><option value="invite" ${data.privacy==='invite'?'selected':''}>邀請：僅使用邀請碼加入</option></select><div data-room-password ${data.privacy==='password'?'':'hidden'}><label for="room-join-password">${data.has_password?'新加入密碼（留空保留原密碼）':'加入密碼'}</label><input id="room-join-password" name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" ${data.privacy==='password'?'':'disabled'}><p class="field-note">8–128 個字元。密碼隊伍仍會出現在場館列表。</p></div><p class="field-note">變更只影響後續加入，既有成員會保留。</p>`):'';
    const copy=data?section('複製遠征隊','copy',`<label for="room-copy-name">新遠征隊名稱</label><input id="room-copy-name" name="name" required maxlength="60" value="${esc([...data.room.name].slice(0,55).join('')+'（副本）')}"><p class="field-note">沿用會場、時間、隱私、加入密碼與圖釘設定。新隊伍只有你，使用新的邀請碼。</p>`):'';
    this.root.querySelector('[data-room-content]').innerHTML=`${time}${name}${copy}${pins}${privacy}<div class="room-management-actions">${this.leader?'<button type="button" class="button outline full logout-button" data-room-danger="delete">解散遠征隊</button>':''}${data?.joined===false?'<p class="field-note">目前未加入這支遠征隊。</p>':'<button type="button" class="button outline full" data-room-danger="leave">退出遠征隊</button>'}</div><div data-room-confirm hidden></div>`;
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
    if(button.dataset.roomDanger){this.pending=button.dataset.roomDanger;const confirm=this.root.querySelector('[data-room-confirm]');confirm.hidden=false;confirm.innerHTML=`<p>${this.pending==='delete'?'解散後，隊內任務、地標與群聊會刪除，所有成員將退出，無法復原。':'退出會撤回你未完成的任務、釋出已接任務並退出小隊；好友位置分享維持原設定。'}</p><button type="button" class="button primary" data-room-confirm>${this.pending==='delete'?'確認解散':'確認退出'}</button><button type="button" class="button outline" data-room-cancel>取消</button>`;confirm.querySelector('button').focus();return;}
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
