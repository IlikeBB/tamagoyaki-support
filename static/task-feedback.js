'use strict';
class TaskFeedback {
  constructor(actions){this.actions=actions;this.pending=new Set();}
  controls(task){
    return `<div class="landmark-feedback task-feedback" role="group" aria-label="任務評價"><span>任務回饋 · 給發布者的支持</span><div>${[[1,'thumb-up','讚',task.likes||0],[-1,'thumb-down','倒讚',task.dislikes||0]].map(([value,symbol,label,count])=>`<button type="button" data-action="task-vote" data-id="${esc(task.id)}" data-value="${value}" aria-pressed="${task.my_vote===value}" ${!task.can_vote||this.pending.has(task.id)?'disabled':''}>${icon(symbol)} ${label} <b>${count}</b></button>`).join('')}</div><small>${task.can_vote?'再點一次可收回；每人一份評價。':'任務發布者僅查看回饋。'} 讚＋20 XP，倒讚－5 XP。</small></div>`;
  }
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
