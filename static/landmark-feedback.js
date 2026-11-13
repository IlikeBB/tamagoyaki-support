'use strict';
class LandmarkFeedback {
  constructor(actions){this.actions=actions;this.pending=new Set();}
  controls(pin){
    return `<div class="landmark-feedback" role="group" aria-label="地標有效性評價"><span>現場回饋</span><div>${[[1,'thumb-up','有效',pin.likes||0],[-1,'thumb-down','無效',pin.dislikes||0]].map(([value,symbol,label,count])=>`<button type="button" data-action="pin-vote" data-id="${esc(pin.id)}" data-value="${value}" aria-pressed="${pin.my_vote===value}" ${!pin.can_vote||this.pending.has(pin.id)?'disabled':''}>${icon(symbol)} ${label} <b>${count}</b></button>`).join('')}</div>${!pin.can_vote?'<small>地標建立者僅查看回饋</small>':'<small>再點一次可收回；每人一份回饋。</small>'}<small>有效＋20 XP，無效－5 XP。${pin.expires?'無效票較多時自動移除，評價紀錄保留。':''}</small></div>`;
  }
  async vote(pid,value){
    const context=this.actions.context(),pin=context.pins.find(p=>p.id===pid);if(!pin||!pin.can_vote||this.pending.has(pid))return;
    this.pending.add(pid);this.actions.changed();
    try{
      const result=await this.actions.api(`/expeditions/${context.eid}/pins/${encodeURIComponent(pid)}/vote`,'PUT',{value:pin.my_vote===value?0:value});
      const current=this.actions.context();if(current.eid===context.eid&&current.user===context.user){
        this.actions.committed();
        const index=current.pins.findIndex(p=>p.id===pid);
        if(result.removed){if(index>=0)current.pins.splice(index,1);this.actions.toast('無效票已超過有效票，地標已自動移除；評價紀錄保留。');}
        else if(index>=0)Object.assign(current.pins[index],result);
      }
    }catch(error){this.actions.toast(error.message);}
    finally{this.pending.delete(pid);this.actions.changed();}
  }
}
