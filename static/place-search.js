'use strict';
class PlaceSearch {
  constructor(root,options){
    this.root=root;this.options=options;this.input=root.querySelector('input');
    this.form=root.querySelector('form');this.panel=root.querySelector('.place-search-panel');
    this.content=root.querySelector('[data-place-content]');this.status=root.querySelector('[role=status]');
    this.button=root.querySelector('[type=submit]');this.generation=0;this.busy=false;this.selected=null;
    this.form.addEventListener('submit',e=>{e.preventDefault();this.search();});
    this.input.addEventListener('input',()=>{this.generation++;this.close();if(this.selected){this.selected=null;this.options.changed();}if(!this.input.value.trim())this.clear();});
    this.input.addEventListener('focus',()=>{if(!this.ignoreFocus&&this.selected)this.showSelected();});
    root.querySelector('[data-place-clear]').addEventListener('click',()=>{this.input.value='';this.clear();this.input.focus();});
    root.querySelector('[data-place-close]').addEventListener('click',()=>{this.close();this.focusInput();});
    document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))this.close();});
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){this.close();this.focusInput();e.preventDefault();}});
    const top=root.closest('.map-top'),stage=root.closest('.map-stage');
    this.resize=new ResizeObserver(()=>stage.style.setProperty('--map-top-height',Math.ceil(top.getBoundingClientRect().height)+'px'));
    this.resize.observe(top);
  }
  close(){this.panel.hidden=true;this.input.setAttribute('aria-expanded','false');}
  focusInput(){this.ignoreFocus=true;this.input.focus({preventScroll:true});this.ignoreFocus=false;}
  open(){this.options.open?.();this.panel.hidden=false;this.input.setAttribute('aria-expanded','true');}
  clear(){this.generation++;this.selected=null;TamagoVue.renderPlaces(this.content,{items:[]});this.status.textContent='';this.close();this.options.changed();}
  async search(){
    const query=this.input.value.trim();if(this.busy)return;
    if(query.length<2){TamagoVue.renderPlaces(this.content,{items:[]});this.status.textContent='請輸入至少 2 個字的地點名稱或地址。';this.open();return;}
    const generation=++this.generation;this.busy=true;this.button.disabled=true;this.root.setAttribute('aria-busy','true');
    TamagoVue.renderPlaces(this.content,{items:[]});this.status.textContent='正在搜尋地點…';this.open();
    try{
      const data=await this.options.search(query);
      if(generation!==this.generation)return;
      const results=(data.results||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180).slice(0,8);
      TamagoVue.renderPlaces(this.content,{items:[]});this.status.textContent=results.length?`找到 ${results.length} 個地點，選取後可標記。`:'找不到地點，試試完整名稱、日文名稱或地址。';
      TamagoVue.renderPlaces(this.content,{items:results},{onChoose:point=>this.choose(point)});
    }catch(error){if(generation===this.generation){TamagoVue.renderPlaces(this.content,{items:[]});this.status.textContent=error.message;}}
    finally{this.busy=false;this.button.disabled=false;this.root.removeAttribute('aria-busy');}
  }
  choose(point){this.selected={...point};this.options.select(point);this.showSelected();}
  showSelected(){
    if(!this.selected)return;this.open();this.status.textContent='已移到地圖上的選定地點。';
    TamagoVue.renderPlaces(this.content,{selected:{...this.selected},items:[]},{onCreate:type=>{const point={...this.selected};this.close();this.options.create(type,point);}});
  }
}
