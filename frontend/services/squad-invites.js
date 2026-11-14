import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class SquadInvites extends VueService {
  constructor(actions){
    super(); const resources = this.resources;this.actions=actions;this.records=new Map();this.owner=null;}
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
    TamagoVue.renderFrame(root,{kind:'squadInviteFrame'});
    this.resources.bind(root.querySelector('input'), 'oninput', ()=>this.render(op));this.resources.bind(root.querySelector('select'), 'onchange', ()=>this.render(op));
    this.resources.bind(root.querySelector('.squad-invite-retry'), 'onclick', ()=>this.load(op));
    this.resources.bind(root.querySelector('.squad-invite-list'), 'onclick', event=>{const button=event.target.closest('[data-squad-friend]');if(button&&!button.disabled)this.send(op,button.dataset.squadFriend);});
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
    TamagoVue.renderList(list,'squadInvites',{items:people.map(person=>{
      const record=this.records.get(this.key(op,person.id));return {...person,sent:!!record?.sent,label:person.in_squad?'已在小隊':record?.pending?'傳送中…':record?.sent?'已傳送':'傳送邀請'};
    }),hasFriends:!!op.people.length,busy});
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
