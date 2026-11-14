import * as TamagoVue from '../views.js';
import { VueService } from '../runtime/resources.js';
export class PinReviewBoard extends VueService {
  constructor(actions){
    super(); const resources = this.resources;this.actions=actions;this.generation=0;}
  sync(){if(this.uid&&this.uid!==this.actions.user()?.id){this.generation++;if(this.root?.isConnected){this.root.replaceChildren();document.querySelector('#dialog').close();}this.root=null;this.uid=null;}}
  current(generation=this.generation){return generation===this.generation&&this.uid===this.actions.user()?.id&&this.root?.isConnected&&document.querySelector('#dialog').open;}
  open(room){if(!this.actions.user())return;this.uid=this.actions.user().id;this.room=room;this.generation++;this.items=[];this.next=0;this.busy=false;this.loading=false;
    this.actions.dialog({kind:'reviewFrame',room:{...room}});
    this.root=document.querySelector('#pin-review');this.resources.bind(this.root, 'onclick', event=>this.click(event));this.load(true);
  }
  render(){if(!this.current())return;TamagoVue.renderList(this.root.querySelector('[data-review-list]'),'review',{items:this.items,canReview:this.canReview,busy:this.busy,loading:this.loading});const more=this.root.querySelector('[data-review-more]');more.hidden=this.next===null||!this.items.length;more.disabled=this.busy||this.loading;this.root.querySelector('[data-review-refresh]').disabled=this.busy||this.loading;}
  async load(reset=false){if(!this.current()||this.loading||!reset&&this.next===null)return;const generation=this.generation;this.loading=true;if(reset){this.items=[];this.next=0;}this.root.querySelector('[data-review-status]').textContent='正在載入…';this.render();
    try{const data=await this.actions.api(`/expeditions/${this.room.id}/pin-submissions?offset=${this.next}`);if(!this.current(generation))return;const seen=new Set(this.items.map(item=>item.id));this.items.push(...data.items.filter(item=>!seen.has(item.id)));this.next=data.next_offset;this.canReview=data.can_review;this.root.querySelector('[data-review-total]').textContent=`${data.total} 個待審圖釘`;this.root.querySelector('[data-review-status]').textContent='';}
    catch(error){if(this.current(generation)){this.root.querySelector('[data-review-status]').textContent=error.message;if([401,403,404].includes(error.status)){this.items=[];this.next=null;}}}
    finally{if(this.current(generation)){this.loading=false;this.render();}}
  }
  click(event){const button=event.target.closest('button');if(!button||this.busy||this.loading)return;if(button.hasAttribute('data-review-refresh'))return this.load(true);if(button.hasAttribute('data-review-more'))return this.load();if(button.dataset.reviewId)this.decide(button.dataset.reviewId,button.dataset.decision);}
  async decide(id,decision){if(!this.current()||this.busy||this.loading)return;const generation=this.generation;this.busy=true;this.render();
    try{await this.actions.api(`/expeditions/${this.room.id}/pin-submissions/${id}`,decision==='withdraw'?'DELETE':'PUT',decision==='withdraw'?undefined:{decision});if(!this.current(generation))return;await this.load(true);await this.actions.changed(this.uid);if(!this.current(generation))return;this.actions.toast(decision==='approve'?'圖釘已核准，現在可從地標列表查看。':decision==='reject'?'已拒絕這個圖釘。':'已撤回送審。');}
    catch(error){if(this.current(generation))this.root.querySelector('[data-review-status]').textContent=error.message;}
    finally{if(this.current(generation)){this.busy=false;this.render();}}
  }
}
