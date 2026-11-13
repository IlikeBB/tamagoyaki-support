'use strict';
class PinFilters {
  constructor(root,handle,actions){
    this.root=root;this.handle=handle;this.actions=actions;this.value={following:true,liked:true,commented:true};this.preview=null;this.owner=null;
    this.inputs=[...root.querySelectorAll('input[type=checkbox]')];this.inputs.forEach(input=>{input.checked=this.value[input.name];input.onchange=()=>{this.value[input.name]=input.checked;this.preview=null;this.save();actions.changed();};});
    handle.onclick=()=>this.open(true);root.querySelector('[data-pin-filter-close]').onclick=()=>this.close(true);
    document.addEventListener('pointerdown',event=>{if(!root.hidden&&!root.contains(event.target)&&!handle.contains(event.target))this.close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!root.hidden){this.close(true);event.preventDefault();}});
    for(const name of ['pointerdown','pointermove'])actions.stage.addEventListener(name,event=>{const left=actions.stage.getBoundingClientRect().left;if(event.pointerType==='touch'&&(name==='pointerdown'||event.buttons)&&event.clientX>=left&&event.clientX<=left+18&&!event.target.closest('button,a,input,select,textarea,.pin-filter-panel')){this.open();event.stopPropagation();}},true);
  }
  identity(){const uid=this.actions.user()||'guest';if(uid===this.owner)return;this.owner=uid;this.preview=null;this.value={following:true,liked:true,commented:true};try{const saved=JSON.parse(localStorage.getItem('tamago-pin-filter:'+uid)||'{}');for(const key of Object.keys(this.value))if(typeof saved[key]==='boolean')this.value[key]=saved[key];}catch{}this.inputs.forEach(input=>input.checked=this.value[input.name]);}
  // Closing the information card must not hide its marker on the next refresh.
  // An explicit filter change or account change clears the manual reveal.
  matches(pin){this.identity();return pin.id===this.preview||this.value.following&&pin.following_author||this.value.commented&&pin.reported_by_me||this.value.liked&&pin.my_vote===1;}
  save(){try{localStorage.setItem('tamago-pin-filter:'+this.owner,JSON.stringify(this.value));}catch{}}
  open(focus=false){this.root.hidden=false;this.handle.setAttribute('aria-expanded','true');if(focus)this.inputs[0].focus({preventScroll:true});}
  close(focus=false){this.root.hidden=true;this.handle.setAttribute('aria-expanded','false');if(focus)this.handle.focus({preventScroll:true});}
  update(pins){this.identity();this.root.querySelector('[data-pin-filter-count]').textContent=`目前顯示 ${pins.filter(pin=>this.matches(pin)).length} 個標記地點`;this.handle.classList.add('is-filtered');}
  reveal(pin){this.identity();this.preview=pin.id;}
}
