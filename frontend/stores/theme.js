import { ref, computed, watch } from 'vue';
export function createThemeStore(resources) {
  const key='tamago-theme',system=window.matchMedia('(prefers-color-scheme: dark)');
  const choice=ref(null), systemDark=ref(system.matches);
  try { const saved=localStorage.getItem(key);if(['dark','light'].includes(saved))choice.value=saved; } catch {}
  const mode=computed(()=>choice.value||(systemDark.value?'dark':'light'));
  const dark=()=>mode.value==='dark';
  const set=value=>{choice.value=value?'dark':'light';try{localStorage.setItem(key,choice.value);}catch{}};
  function apply(){
    document.documentElement.dataset.theme=mode.value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark()?'#14211c':'#f7b84b');
    document.querySelectorAll('[data-theme-toggle]').forEach(input=>input.checked=dark());
    window.dispatchEvent(new CustomEvent('tamago-theme-change',{detail:{dark:dark()}}));
  }
  watch(mode,apply,{immediate:true,flush:'sync'});
  resources.listen(document,'change',event=>{if(event.target.matches('[data-theme-toggle]'))set(event.target.checked);});
  resources.listen(system,'change',()=>systemDark.value=system.matches);
  resources.listen(window,'storage',event=>{if(event.key===key)choice.value=['dark','light'].includes(event.newValue)?event.newValue:null;});
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

  return { mode, dark, set, googleStyles };
}
