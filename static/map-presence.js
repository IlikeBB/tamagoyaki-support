'use strict';
class MapPresence {
  static angle(value){return Number.isFinite(value)?((value%360)+360)%360:null;}
  static fan(value){
    const angle=this.angle(value);if(angle===null)return '';
    return `<span class="presence-fan" data-angle="${angle}" style="transform:rotate(${angle}deg)" aria-hidden="true"><svg viewBox="0 0 128 128"><path opacity=".12" d="M64 64 34 12a60 60 0 0 1 60 0Z"/><path opacity=".19" d="M64 64 40 22.43a48 48 0 0 1 48 0Z"/><path opacity=".23" d="M64 64 46 32.82a36 36 0 0 1 36 0Z"/></svg></span>`;
  }
  static render({kind='task',angle=null,symbol='',label='',lastKnown=false}){
    const type=['self','friend','member','task'].includes(kind)?kind:'task';
    const relation=type==='self'?'self-map-point':`teammate-map-point ${type==='friend'?'friend-map-point':type==='member'?'expedition-map-point':''}`;
    return `<div class="map-presence presence-${type} ${relation}${lastKnown?' is-last-known':''}"><span class="presence-halo" aria-hidden="true"></span>${this.fan(angle)}<span class="presence-core" aria-hidden="true">${symbol}</span><span class="teammate-map-label presence-label">${label}</span>${type==='self'?'<span class="visually-hidden presence-heading"></span>':''}</div>`;
  }
  static updateSelf(root,value){
    if(!root)return;
    const angle=this.angle(value),fan=root.querySelector('.presence-fan'),label=root.querySelector('.presence-heading');
    if(angle===null)fan?.remove();
    else if(fan){fan.style.transform=`rotate(${angle}deg)`;fan.dataset.angle=angle;}
    else root.insertAdjacentHTML('afterbegin',this.fan(angle));
    if(label)label.textContent=angle===null?'尚未取得手機朝向':`手機朝向 ${Math.round(angle)} 度`;
  }
}
