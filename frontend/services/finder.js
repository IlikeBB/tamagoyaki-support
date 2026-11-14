import * as TamagoVue from '../views.js';
import { LocationState } from './location-state.js';
import { VueService } from '../runtime/resources.js';
// A page-local window receiving accepted-task positions and opt-in friend positions.
export class TeammateFinder extends VueService {
  constructor(root,actions){
    super(); const resources = this.resources;
    this.root=root;this.actions=actions;this.launcher=document.querySelector('#finder-launcher');
    TamagoVue.renderFinderBody(root.querySelector('#finder-body'),{tasks:[],ready:false,target:null});
    this.select=root.querySelector('#finder-person');this.body=root.querySelector('#finder-body');
    this.grip=root.querySelector('#finder-grip');this.collapsed=false;this.selectedId=null;this.optionsKey='';
    this.model={tasks:[],ready:false,roomId:null};this.drag=null;
    resources.listen(this.launcher, 'click',()=>this.open());
    resources.listen(this.select, 'change',()=>{this.selectedId=this.select.value||null;this.revoked=false;this.render();});
    resources.listen(root.querySelector('#finder-close'), 'click',()=>this.close());
    resources.listen(root.querySelector('#finder-collapse'), 'click',()=>{
      this.collapsed=!this.collapsed;this.body.hidden=this.collapsed;
      root.querySelector('#finder-collapse').setAttribute('aria-expanded',String(!this.collapsed));
      root.querySelector('#finder-collapse').setAttribute('aria-label',this.collapsed?'展開尋人視窗':'收合尋人視窗');
      root.querySelector('#finder-collapse').textContent=this.collapsed?'＋':'−';this.clamp();
    });
    resources.listen(root.querySelector('#finder-empty-action'), 'click',()=>{
      if(this.model.guest)actions.join();else if(!this.model.ready)actions.refresh();else actions.friends();
    });
    resources.listen(root.querySelector('#finder-location'), 'click',()=>actions.location());
    resources.listen(root.querySelector('#finder-compass'), 'click',()=>actions.compass());
    resources.listen(root.querySelector('#finder-map'), 'click',()=>{const target=this.target();if(target)actions.map(target.id);});
    resources.listen(this.grip, 'pointerdown',e=>{
      if(e.button!==0||!e.isPrimary)return;
      const r=root.getBoundingClientRect();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};
      this.grip.setPointerCapture(e.pointerId);e.preventDefault();
    });
    resources.listen(this.grip, 'pointermove',e=>{
      if(this.drag?.id!==e.pointerId)return;
      this.place(this.drag.left+e.clientX-this.drag.x,this.drag.top+e.clientY-this.drag.y);e.preventDefault();
    });
    const stop=()=>{this.drag=null;};
    resources.listen(this.grip, 'pointerup',stop);resources.listen(this.grip, 'pointercancel',stop);resources.listen(this.grip, 'lostpointercapture',stop);
    resources.listen(this.grip, 'keydown',e=>{
      const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(e.key==='Home'){root.style.left='';root.style.top='';root.style.right='';this.clamp();e.preventDefault();}
      if(!moves[e.key])return;
      const r=root.getBoundingClientRect(),step=e.shiftKey?32:16;
      this.place(r.left+moves[e.key][0]*step,r.top+moves[e.key][1]*step);e.preventDefault();
    });
    resources.listen(window, 'resize',()=>this.clamp());
    resources.listen(window.visualViewport, 'resize',()=>this.clamp());
  }
  place(x,y){
    const v=window.visualViewport,r=this.root.getBoundingClientRect(),left=v?.offsetLeft||0,top=v?.offsetTop||0;
    const width=v?.width||innerWidth,height=v?.height||innerHeight,bottom=innerWidth<=700?84:16;
    this.root.style.left=Math.max(left+12,Math.min(x,left+width-r.width-12))+'px';
    this.root.style.top=Math.max(top+12,Math.min(y,top+height-r.height-bottom))+'px';this.root.style.right='auto';
  }
  clamp(){if(!this.root.hidden){const r=this.root.getBoundingClientRect();this.place(r.left,r.top);}}
  open(id){
    if(id&&this.model.tasks.some(t=>t.id===id))this.selectedId=id;
    else if(!this.selectedId&&this.model.ready)this.selectedId=this.model.tasks[0]?.id||null;
    if(this.root.hidden)this.returnFocus=document.activeElement;
    this.root.hidden=false;if(this.launcher){this.launcher.hidden=true;this.launcher.setAttribute('aria-expanded','true');}
    this.revoked=false;this.render();this.clamp();this.grip.focus({preventScroll:true});
  }
  close(){this.root.hidden=true;if(this.launcher){this.launcher.hidden=false;this.launcher.setAttribute('aria-expanded','false');this.launcher.focus({preventScroll:true});}else{const target=this.returnFocus?.isConnected&&!this.root.contains(this.returnFocus)&&this.returnFocus.getClientRects().length?this.returnFocus:document.querySelector('#map');target?.focus({preventScroll:true});}}
  update(model){
    if(model.roomId!==this.model.roomId){this.selectedId=null;this.revoked=false;}
    this.model=model;
    if(model.ready&&this.selectedId&&!model.tasks.some(t=>t.id===this.selectedId)){this.selectedId=null;this.revoked=true;}
    this.render();this.clamp();
  }
  target(){return this.model.ready?this.model.tasks.find(t=>t.id===this.selectedId):null;}
  text(id,value){const el=this.root.querySelector('#'+id);if(el.textContent!==value)el.textContent=value;}
  render(){
    const m=this.model,t=this.target(),valid=!!t&&!!m.position,ownStale=LocationState.stale(m.positionLocated);
    const message=m.guest?'登入後可加入好友、小隊或遠征隊，在這裡找人。':!m.ready?'等待重新同步，暫停顯示位置。':this.revoked?'對方已停止分享或任務已結束，請選擇其他對象。':m.tasks.length?'請選擇已分享位置的好友、成員或已接任務。':'目前沒有可尋找的人。請好友或小隊成員開啟分享，或接取隊友任務。';
    const b=valid?this.actions.bearing(m.position,t):null,d=valid?this.actions.distance(m.position,t):null;
    TamagoVue.renderFinderBody(this.body,{tasks:m.tasks.map(t=>({...t})),selectedId:this.selectedId,ready:m.ready,target:t?{...t}:null,message,
      emptyAction:m.guest?'選擇遠征隊':!m.ready?'重新同步':'查看好友',valid,source:t?LocationState.source(t):'',relative:valid?(b-(m.heading??0)+360)%360:null,
      distance:valid?`${ownStale||LocationState.lastKnown(t)?'約 ':''}${this.actions.meters(d)}`:'',direction:valid?`${this.actions.direction(b)} · ${m.heading==null?'北朝上':'相對手機朝向'}`:'',
      accuracy:valid?`${ownStale?`依你的最後位置（${LocationState.age(m.positionLocated)}）估算 · `:''}你的精度 ±${Math.round(m.position.accuracy||0)}m${t.accuracy!=null?` · 對方 ±${Math.round(t.accuracy)}m`:''}`:''});
    this.text('finder-summary',t?valid?`${t.owner_name} · ${this.actions.meters(d)}`:t.owner_name:'');
  }
}
