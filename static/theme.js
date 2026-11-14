'use strict';
window.TamagoTheme=(()=>{
  const key='tamago-theme',system=window.matchMedia('(prefers-color-scheme: dark)');
  let choice=null;
  try{const saved=localStorage.getItem(key);if(saved==='dark'||saved==='light')choice=saved;}catch{}
  const dark=()=>document.documentElement.dataset.theme==='dark';
  function apply(){
    const value=choice||(system.matches?'dark':'light');
    document.documentElement.dataset.theme=value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',value==='dark'?'#14211c':'#f7b84b');
    document.querySelectorAll('[data-theme-toggle]').forEach(input=>input.checked=value==='dark');
    window.dispatchEvent(new CustomEvent('tamago-theme-change',{detail:{dark:value==='dark'}}));
  }
  function set(value){choice=value?'dark':'light';try{localStorage.setItem(key,choice);}catch{}apply();}
  document.addEventListener('change',event=>{if(event.target.matches('[data-theme-toggle]'))set(event.target.checked);});
  system.addEventListener('change',()=>{if(!choice)apply();});
  window.addEventListener('storage',event=>{if(event.key!==key)return;choice=['dark','light'].includes(event.newValue)?event.newValue:null;apply();});
  function googleStyles(){
    const poi={featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]};
    if(!dark())return [poi];
    return [
      {elementType:'geometry',stylers:[{color:'#1d2c26'}]},
      {elementType:'labels.text.fill',stylers:[{color:'#c7d6cc'}]},
      {elementType:'labels.text.stroke',stylers:[{color:'#17241e'}]},
      {featureType:'landscape',elementType:'geometry',stylers:[{color:'#22372b'}]},
      {featureType:'landscape.man_made',elementType:'geometry.fill',stylers:[{color:'#385244'}]},
      {featureType:'landscape.man_made',elementType:'geometry.stroke',stylers:[{color:'#7b9c87'}]},
      {featureType:'road',elementType:'geometry',stylers:[{color:'#42534a'}]},
      {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#667055'}]},
      {featureType:'transit',elementType:'geometry',stylers:[{color:'#34493e'}]},
      {featureType:'water',elementType:'geometry',stylers:[{color:'#142d3a'}]},
      {featureType:'water',elementType:'labels.text.fill',stylers:[{color:'#8ab7c4'}]},poi
    ];
  }
  apply();return {dark,set,googleStyles};
})();
