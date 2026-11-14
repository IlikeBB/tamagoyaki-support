import { VueService } from '../runtime/resources.js';
export class TaskFeedback extends VueService {
  constructor(actions){
    super(); const resources = this.resources;this.actions=actions;this.pending=new Set();}
  async vote(tid,value){
    const context=this.actions.context(),task=context.tasks.find(t=>t.id===tid);if(!task||!task.can_vote||this.pending.has(tid))return;
    this.pending.add(tid);this.actions.changed();
    try{
      const result=await this.actions.api(`/expeditions/${encodeURIComponent(context.eid)}/tasks/${encodeURIComponent(tid)}/vote`,'PUT',{value:task.my_vote===value?0:value});
      const current=this.actions.context();if(current.eid===context.eid&&current.user===context.user){
        this.actions.committed();const latest=current.tasks.find(t=>t.id===tid);if(latest)Object.assign(latest,result);
      }
    }catch(error){this.actions.toast(error.message);}
    finally{this.pending.delete(tid);this.actions.changed();}
  }
}
