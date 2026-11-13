'use strict';
// The same gesture controller survives switching between Google Maps and Leaflet.
class MapActions {
  constructor(mapElement,root,options){
    this.mapElement=mapElement;this.root=root;this.options=options;
    this.anchor=document.getElementById('map-action-anchor');this.pointers=new Set();
    this.suppressUntil=0;
    mapElement.addEventListener('pointerdown',e=>this.start(e),true);
    document.addEventListener('pointerdown',e=>{
      if(this.gesture&&e.pointerId!==this.gesture.id)this.cancel();
      if(!root.hidden&&!root.contains(e.target)&&!e.target.closest('[data-action="pin-center"]'))this.close();
    },true);
    document.addEventListener('pointermove',e=>{
      const g=this.gesture;
      if(g&&e.pointerId===g.id&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>10)this.cancel();
    },true);
    for(const name of ['pointerup','pointercancel'])document.addEventListener(name,e=>{
      this.pointers.delete(e.pointerId);
      if(this.gesture?.id===e.pointerId)this.cancel();
      if(this.held){this.suppressUntil=Date.now()+400;this.held=false;}
    },true);
    mapElement.addEventListener('click',e=>{
      if(this.held||Date.now()<this.suppressUntil){e.preventDefault();e.stopImmediatePropagation();}
    },true);
    mapElement.addEventListener('contextmenu',e=>{
      if(this.interactive(e.target))return;
      e.preventDefault();this.cancel();
      if(root.hidden)this.openAt(e.clientX,e.clientY);
      this.suppressUntil=Date.now()+500;
    });
    root.querySelector('[data-map-close]').addEventListener('click',()=>this.close(true));
    root.querySelectorAll('[data-map-create]').forEach(button=>button.addEventListener('click',()=>{
      const point=this.point&&{...this.point};this.close();
      if(point)this.options.create(button.dataset.mapCreate,point);
    }));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!root.hidden){this.close(true);e.preventDefault();}
    });
    window.addEventListener('resize',()=>this.dismiss());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.dismiss();});
  }
  interactive(target){return !!target.closest('button,a,input,select,textarea,.custom-marker,.leaflet-control,.gm-style-cc');}
  start(e){
    this.pointers.add(e.pointerId);
    if(this.pointers.size>1){this.cancel();return;}
    if(e.button!==0||e.isPrimary===false||this.interactive(e.target))return;
    this.cancel();
    const g={id:e.pointerId,x:e.clientX,y:e.clientY};this.gesture=g;
    this.timer=setTimeout(()=>{
      if(this.gesture!==g)return;
      this.held=true;this.openAt(g.x,g.y);
    },600);
  }
  cancel(){clearTimeout(this.timer);this.gesture=null;}
  dismiss(){this.cancel();this.close();}
  openAt(x,y,point){
    point=point||this.options.pointAt(x,y);
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
    if(!this.options.allowed(point))return;
    this.point={lat:point.lat,lng:point.lng};
    const stage=this.root.parentElement,rect=stage.getBoundingClientRect();
    this.root.hidden=false;this.anchor.hidden=false;
    const gap=12,w=this.root.offsetWidth,h=this.root.offsetHeight;
    const left=Math.max(gap,Math.min(x-rect.left-w/2,rect.width-w-gap));
    let top=y-rect.top-h-20;
    if(top<gap){const below=y-rect.top+20;top=below+h<=rect.height-gap?below:gap;}
    top=Math.max(gap,Math.min(top,rect.height-h-gap));
    this.root.style.left=left+'px';this.root.style.top=top+'px';
    this.anchor.style.left=(x-rect.left)+'px';this.anchor.style.top=(y-rect.top)+'px';
    this.root.querySelector('[data-map-coordinate]').textContent=`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
    this.root.querySelector('[data-map-create]').focus({preventScroll:true});
  }
  openCenter(point){
    const rect=this.mapElement.getBoundingClientRect();
    this.openAt(rect.left+rect.width/2,rect.top+rect.height/2,point);
  }
  close(restore=false){
    this.root.hidden=true;this.anchor.hidden=true;this.point=null;
    if(restore)document.querySelector('[data-action="pin-center"]').focus({preventScroll:true});
  }
}
