'use strict';
// Map providers handle their own pinch gestures. Browser viewport zoom must
// not resize the surrounding controls, dialogs, or navigation.
(() => {
  const inMap=target=>target instanceof Element&&!!target.closest('#map');
  const keepInterfaceScale=event=>{
    if(event.touches.length>1&&![...event.touches].every(touch=>inMap(touch.target)))event.preventDefault();
  };
  document.addEventListener('touchstart',keepInterfaceScale,{passive:false});
  document.addEventListener('touchmove',keepInterfaceScale,{passive:false});
  // WebKit's native gesture default can zoom the viewport despite viewport
  // hints. Bubble listeners leave the map's own event handling intact.
  for(const name of ['gesturestart','gesturechange','gestureend'])window.addEventListener(name,event=>event.preventDefault(),{passive:false});
  document.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)event.preventDefault();},{passive:false});
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&['+','=','-','0','Add','Subtract'].includes(event.key))event.preventDefault();
  });
})();
