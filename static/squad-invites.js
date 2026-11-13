'use strict';
class SquadInvites {
  constructor(actions){this.actions=actions;this.records=new Map();this.owner=null;}
  static invitationURL(text,origin=location.origin,publicOrigin=null){
    for(const part of String(text).split(/\s+/)){
      if(!/^https?:\/\//.test(part))continue;
      try{
        const url=new URL(part),keys=[...url.searchParams.keys()];
        if([origin,publicOrigin].includes(url.origin)&&url.pathname==='/'&&!url.username&&!url.password&&!url.hash&&keys.length===2&&keys.includes('join')&&keys.includes('squad')&&['join','squad'].every(key=>/^[A-Za-z0-9]{8}$/.test(url.searchParams.get(key))))return url.href;
      }catch{}
    }
    return null;
  }
  alive(op){const c=this.actions.context();return this.active===op&&op.root.isConnected&&op.root.closest('dialog')?.open&&c?.user===op.user&&c.eid===op.eid&&c.sid===op.sid;}
  mount(root,context){
    if(this.owner!==context.user){this.records.clear();this.owner=context.user;}
    const op={...context,root,people:[],loaded:false,request:0};this.active=op;
    root.innerHTML='<h3>從好友邀請</h3><p class="field-note">邀請會傳送到好友私訊，對方開啟連結並確認後才加入。</p><div class="squad-invite-filters"><div><label for="squad-friend-query">搜尋好友</label><input id="squad-friend-query" type="search" autocomplete="off" maxlength="80" placeholder="暱稱或帳號" disabled></div><div><label for="squad-friend-filter">篩選</label><select id="squad-friend-filter" disabled><option value="all">全部好友</option><option value="available">可邀請的好友</option><option value="expedition">同遠征隊好友</option></select></div></div><p class="squad-invite-status" role="status" aria-live="polite"></p><button type="button" class="button outline squad-invite-retry" hidden>重新載入好友</button><div class="squad-invite-list"></div>';
    root.querySelector('input').oninput=()=>this.render(op);root.querySelector('select').onchange=()=>this.render(op);
    root.querySelector('.squad-invite-retry').onclick=()=>this.load(op);
    root.querySelector('.squad-invite-list').onclick=event=>{const button=event.target.closest('[data-squad-friend]');if(button&&!button.disabled)this.send(op,button.dataset.squadFriend);};
    this.load(op);
  }
  key(op,id){return [op.user,op.eid,op.sid,id].join(':');}
  status(op,message,error=false){if(!this.alive(op))return;op.root.querySelector('[role=status]').textContent=message;op.root.querySelector('.squad-invite-retry').hidden=!error;}
  async load(op){
    if(!this.alive(op))return;const request=++op.request;this.status(op,'正在載入好友…');
    try{
      const data=await this.actions.api(`/expeditions/${encodeURIComponent(op.eid)}/squads/${encodeURIComponent(op.sid)}/invitees`);
      if(!this.alive(op)||op.request!==request)return;
      op.people=data.friends;op.loaded=true;op.root.querySelectorAll('input,select').forEach(node=>node.disabled=false);this.status(op,'');this.render(op);
    }catch(error){if(this.alive(op)&&op.request===request)this.status(op,error.message,true);}
  }
  render(op){
    if(!this.alive(op)||!op.loaded)return;
    const query=op.root.querySelector('input').value.trim().normalize('NFKC').toLocaleLowerCase(),filter=op.root.querySelector('select').value;
    const prefix=this.key(op,''),busy=[...this.records].some(([key,record])=>key.startsWith(prefix)&&record.pending);
    const people=op.people.filter(p=>[p.nickname,p.username].some(value=>value?.normalize('NFKC').toLocaleLowerCase().includes(query))&&(filter!=='available'||!p.in_squad&&!this.records.get(this.key(op,p.id))?.sent)&&(filter!=='expedition'||p.in_expedition));
    const list=op.root.querySelector('.squad-invite-list');
    list.innerHTML=people.length?people.map(p=>{
      const record=this.records.get(this.key(op,p.id)),label=p.in_squad?'已在小隊':record?.pending?'傳送中…':record?.sent?'已傳送':'傳送邀請';
      return `<div class="squad-invite-person">${profileAvatar(p.nickname,p.id,p.avatar_url)}<div><strong>${esc(p.nickname)}</strong><small>@${esc(p.username)} · ${p.in_squad?'同小隊':p.in_expedition?'同遠征隊':'尚未加入此遠征隊'}</small></div><button type="button" data-squad-friend="${esc(p.id)}" aria-label="${esc(p.nickname+' · '+label)}" ${busy||p.in_squad||record?.sent?'disabled':''}>${label}</button></div>`;
    }).join(''):`<p class="squad-invite-empty">${op.people.length?'沒有符合條件的好友。':'還沒有已互相接受邀請的好友，先到「好友」加入同行夥伴。'}</p>`;
  }
  async send(op,id){
    if(!this.alive(op)||!op.loaded||!op.people.some(p=>p.id===id&&!p.in_squad))return;
    const prefix=this.key(op,'');if([...this.records].some(([key,r])=>key.startsWith(prefix)&&r.pending))return;
    const key=this.key(op,id);let record=this.records.get(key);if(record?.sent)return;
    if(!record){record={client_id:[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('')};this.records.set(key,record);}
    if(!navigator.onLine)return this.status(op,'目前離線，恢復連線後可再傳送。');
    record.pending=true;this.status(op,'正在傳送小隊邀請…');this.render(op);
    try{
      await this.actions.api(`/expeditions/${encodeURIComponent(op.eid)}/squads/${encodeURIComponent(op.sid)}/invites`,'POST',{friend_id:id,client_id:record.client_id});
      record.sent=true;if(this.alive(op)){this.status(op,'已傳送至好友私訊，等待對方確認加入。');this.actions.sent();}
    }catch(error){if(this.alive(op))this.status(op,error.message);}
    finally{record.pending=false;if(this.active&&this.alive(this.active))this.render(this.active);}
  }
}
