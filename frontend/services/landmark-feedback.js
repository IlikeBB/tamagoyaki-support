import { VueService } from '../runtime/resources.js';
export class LandmarkFeedback extends VueService {
  constructor(actions){
    super(); const resources = this.resources;this.actions=actions;this.pending=new Set();}
  async vote(pid,value){
    const context=this.actions.context(),pin=context.pins.find(p=>p.id===pid);if(!pin||!pin.can_vote||this.pending.has(pid))return;
    this.pending.add(pid);this.actions.changed();
    try{
      const result=await this.actions.api(`/expeditions/${context.eid}/pins/${encodeURIComponent(pid)}/vote`,'PUT',{value:pin.my_vote===value?0:value});
      const current=this.actions.context();if(current.eid===context.eid&&current.user===context.user){
        this.actions.committed();
        const index=current.pins.findIndex(p=>p.id===pid);
        if(result.removed){if(index>=0)current.pins.splice(index,1);this.actions.toast('無效票已超過有效票，地標已自動移除；評價紀錄保留。');}
        else if(index>=0){Object.assign(current.pins[index],result);if(result.following_author)current.pins.filter(item=>item.owner===pin.owner).forEach(item=>item.following_author=true);}
      }
    }catch(error){this.actions.toast(error.message);}
    finally{this.pending.delete(pid);this.actions.changed();}
  }
}
