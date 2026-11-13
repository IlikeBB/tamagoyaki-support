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
  clear(){this.generation++;this.selected=null;this.content.replaceChildren();this.status.textContent='';this.close();this.options.changed();}
  async search(){
    const query=this.input.value.trim();if(this.busy)return;
    if(query.length<2){this.content.replaceChildren();this.status.textContent='請輸入至少 2 個字的地點名稱或地址。';this.open();return;}
    const generation=++this.generation;this.busy=true;this.button.disabled=true;this.root.setAttribute('aria-busy','true');
    this.content.replaceChildren();this.status.textContent='正在搜尋地點…';this.open();
    try{
      const data=await this.options.search(query);
      if(generation!==this.generation)return;
      const results=(data.results||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180).slice(0,8);
      this.content.replaceChildren();this.status.textContent=results.length?`找到 ${results.length} 個地點，選取後可標記。`:'找不到地點，試試完整名稱、日文名稱或地址。';
      for(const point of results){
        const button=document.createElement('button');button.type='button';button.className='place-search-result';
        const name=document.createElement('strong'),address=document.createElement('small');name.textContent=point.name;address.textContent=point.address||'查看地圖位置';
        button.append(name,address);button.addEventListener('click',()=>this.choose(point));this.content.append(button);
      }
    }catch(error){if(generation===this.generation){this.content.replaceChildren();this.status.textContent=error.message;}}
    finally{this.busy=false;this.button.disabled=false;this.root.removeAttribute('aria-busy');}
  }
  choose(point){this.selected={...point};this.options.select(point);this.showSelected();}
  showSelected(){
    if(!this.selected)return;
    this.open();this.content.replaceChildren();this.status.textContent='已移到地圖上的選定地點。';
    const title=document.createElement('strong'),address=document.createElement('p'),actions=document.createElement('div');
    title.className='place-selected-name';title.textContent=this.selected.name;address.className='place-selected-address';address.textContent=this.selected.address;
    actions.className='place-selected-actions';
    for(const [type,label] of [['pin','標記臨時地標'],['task','插旗任務']]){
      const button=document.createElement('button');button.type='button';button.textContent=label;button.dataset.placeCreate=type;
      button.addEventListener('click',()=>{const point={...this.selected};this.close();this.options.create(type,point);});actions.append(button);
    }
    this.content.append(title,address,actions);
  }
}
