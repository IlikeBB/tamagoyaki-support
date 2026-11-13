'use strict';
// A page-local window receiving accepted-task positions and opt-in friend positions.
class TeammateFinder {
  constructor(root,actions){
    this.root=root;this.actions=actions;this.launcher=document.querySelector('#finder-launcher');
    this.select=root.querySelector('#finder-person');this.body=root.querySelector('#finder-body');
    this.grip=root.querySelector('#finder-grip');this.collapsed=false;this.selectedId=null;this.optionsKey='';
    this.model={tasks:[],ready:false,roomId:null};this.drag=null;
    this.launcher.addEventListener('click',()=>this.open());
    this.select.addEventListener('change',()=>{this.selectedId=this.select.value||null;this.revoked=false;this.render();});
    root.querySelector('#finder-close').addEventListener('click',()=>this.close());
    root.querySelector('#finder-collapse').addEventListener('click',()=>{
      this.collapsed=!this.collapsed;this.body.hidden=this.collapsed;
      root.querySelector('#finder-collapse').setAttribute('aria-expanded',String(!this.collapsed));
      root.querySelector('#finder-collapse').setAttribute('aria-label',this.collapsed?'展開尋人視窗':'收合尋人視窗');
      root.querySelector('#finder-collapse').textContent=this.collapsed?'＋':'−';this.clamp();
    });
    root.querySelector('#finder-empty-action').addEventListener('click',()=>{
      if(this.model.guest)actions.join();else if(!this.model.ready)actions.refresh();else actions.friends();
    });
    root.querySelector('#finder-location').addEventListener('click',()=>actions.location());
    root.querySelector('#finder-compass').addEventListener('click',()=>actions.compass());
    root.querySelector('#finder-map').addEventListener('click',()=>{const target=this.target();if(target)actions.map(target.id);});
    this.grip.addEventListener('pointerdown',e=>{
      if(e.button!==0||!e.isPrimary)return;
      const r=root.getBoundingClientRect();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};
      this.grip.setPointerCapture(e.pointerId);e.preventDefault();
    });
    this.grip.addEventListener('pointermove',e=>{
      if(this.drag?.id!==e.pointerId)return;
      this.place(this.drag.left+e.clientX-this.drag.x,this.drag.top+e.clientY-this.drag.y);e.preventDefault();
    });
    const stop=()=>{this.drag=null;};
    this.grip.addEventListener('pointerup',stop);this.grip.addEventListener('pointercancel',stop);this.grip.addEventListener('lostpointercapture',stop);
    this.grip.addEventListener('keydown',e=>{
      const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(e.key==='Home'){root.style.left='';root.style.top='';root.style.right='';this.clamp();e.preventDefault();}
      if(!moves[e.key])return;
      const r=root.getBoundingClientRect(),step=e.shiftKey?32:16;
      this.place(r.left+moves[e.key][0]*step,r.top+moves[e.key][1]*step);e.preventDefault();
    });
    window.addEventListener('resize',()=>this.clamp());
    window.visualViewport?.addEventListener('resize',()=>this.clamp());
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
    this.root.hidden=false;this.launcher.hidden=true;this.launcher.setAttribute('aria-expanded','true');
    this.revoked=false;this.render();this.clamp();this.grip.focus({preventScroll:true});
  }
  close(){this.root.hidden=true;this.launcher.hidden=false;this.launcher.setAttribute('aria-expanded','false');this.launcher.focus({preventScroll:true});}
  update(model){
    if(model.roomId!==this.model.roomId){this.selectedId=null;this.revoked=false;}
    this.model=model;
    if(model.ready&&this.selectedId&&!model.tasks.some(t=>t.id===this.selectedId)){this.selectedId=null;this.revoked=true;}
    this.render();this.clamp();
  }
  target(){return this.model.ready?this.model.tasks.find(t=>t.id===this.selectedId):null;}
  text(id,value){const el=this.root.querySelector('#'+id);if(el.textContent!==value)el.textContent=value;}
  render(){
    const m=this.model,t=this.target(),key=JSON.stringify(m.tasks.map(t=>[t.id,t.owner_name,t.title]));
    if(key!==this.optionsKey){
      this.select.replaceChildren(new Option('選擇好友、成員或任務',''),...m.tasks.map(t=>new Option(`${t.owner_name} · ${t.title}`,t.id)));this.optionsKey=key;
    }
    this.select.value=this.selectedId||'';this.select.disabled=!m.ready||!m.tasks.length;
    this.root.querySelector('#finder-detail').hidden=!t;this.root.querySelector('#finder-empty').hidden=!!t;
    const emptyAction=this.root.querySelector('#finder-empty-action');emptyAction.hidden=!!t||!!m.tasks.length;
    const message=m.guest?'登入後可加入好友，或加入遠征隊接取隊友任務，在這裡找人。':!m.ready?'等待重新同步，暫停顯示位置。':this.revoked?'對方已停止分享或任務已結束，請選擇其他對象。':m.tasks.length?'請選擇好友或你已接取的隊友任務。':'目前沒有可尋找的人。加入好友並請對方開啟分享，或接取隊友任務。';
    this.text('finder-empty-message',message);emptyAction.textContent=m.guest?'選擇遠征隊':!m.ready?'重新同步':'查看好友';
    this.text('finder-summary',t?t.owner_name:'');
    if(!t){
      for(const id of ['finder-name','finder-task','finder-distance','finder-direction','finder-source','finder-accuracy'])this.text(id,'');
      this.root.querySelector('#finder-arrow').style.transform='';this.root.querySelector('#finder-guidance').hidden=true;return;
    }
    this.text('finder-name',t.owner_name);this.text('finder-task',t.title);
    this.text('finder-source',LocationState.source(t));
    const valid=!!m.position;this.root.querySelector('#finder-guidance').hidden=!valid;
    this.root.querySelector('#finder-needs-location').hidden=valid;
    const ownStale=LocationState.stale(m.positionLocated);
    this.text('finder-accuracy',valid?`${ownStale?`依你的最後位置（${LocationState.age(m.positionLocated)}）估算 · `:''}你的精度 ±${Math.round(m.position.accuracy||0)}m${t.accuracy!=null?` · 對方 ±${Math.round(t.accuracy)}m`:''}`:'');
    if(valid){
      const b=this.actions.bearing(m.position,t),d=this.actions.distance(m.position,t),relative=(b-(m.heading??0)+360)%360;
      this.text('finder-distance',`${ownStale||LocationState.lastKnown(t)?'約 ':''}${this.actions.meters(d)}`);
      this.text('finder-direction',`${this.actions.direction(b)} · ${m.heading==null?'北朝上':'相對手機朝向'}`);
      this.root.querySelector('#finder-arrow').style.transform=`rotate(${relative}deg)`;
      this.text('finder-summary',`${t.owner_name} · ${this.actions.meters(d)}`);
    }else{this.text('finder-distance','');this.text('finder-direction','');this.root.querySelector('#finder-arrow').style.transform='';}
  }
}
