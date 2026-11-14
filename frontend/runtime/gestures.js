// Map providers handle their own pinch gestures. Browser viewport zoom must
// not resize the surrounding controls, dialogs, or navigation.
export function useInterfaceGestures(resources) {
  const inMap=target=>target instanceof Element&&!!target.closest('#map');
  const keepInterfaceScale=event=>{
    if(event.touches.length>1&&![...event.touches].every(touch=>inMap(touch.target)))event.preventDefault();
  };
  resources.listen(document, 'touchstart',keepInterfaceScale,{passive:false});
  resources.listen(document, 'touchmove',keepInterfaceScale,{passive:false});
  // WebKit's native gesture default can zoom the viewport despite viewport
  // hints. Bubble listeners leave the map's own event handling intact.
  for(const name of ['gesturestart','gesturechange','gestureend'])resources.listen(window, name,event=>event.preventDefault(),{passive:false});
  resources.listen(document, 'wheel',event=>{if(event.ctrlKey||event.metaKey)event.preventDefault();},{passive:false});
  resources.listen(document, 'keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&['+','=','-','0','Add','Subtract'].includes(event.key))event.preventDefault();
  });
}
