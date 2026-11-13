'use strict';
// Only GPS samples renew these windows; polling and visibility events never do.
const LocationState = Object.freeze({
  freshSeconds:120,
  keepSeconds:900,
  valid(located){return Number.isFinite(located)&&located>0&&Date.now()/1000-located<=this.keepSeconds;},
  stale(located){return this.valid(located)&&Date.now()/1000-located>this.freshSeconds;},
  age(located){return `${Math.max(1,Math.floor((Date.now()/1000-located)/60))} 分鐘前`;},
  moving(target){return ['friend','member'].includes(target.kind)||['help','live','last_known','friend','expedition','squad'].includes(target.location_source);},
  lastKnown(target){return this.moving(target)&&this.stale(target.located);},
  source(target){
    const audience=target.location_source==='help'?'全遠征隊可見':target.kind==='friend'?'好友分享':target.location_source==='squad'?'僅小隊可見':target.kind==='member'?'遠征隊分享':'僅接取者可見';
    if(this.lastKnown(target))return `最後位置 · ${this.age(target.located)} · ${audience}`;
    return target.location_source==='help'?'求助即時位置 · 全遠征隊可見':target.kind==='friend'?'好友即時位置 · 對方已開啟分享':target.location_source==='squad'?'小隊即時位置 · 僅目前小隊成員可見':target.kind==='member'?'遠征隊即時位置 · 對方已開啟分享':target.location_source==='fixed'?'固定任務旗標 · 不隨發布者移動':['live','last_known'].includes(target.location_source)?'對方即時位置 · 僅接取者可見':'任務發布時的位置 · 對方未即時定位';
  }
});
