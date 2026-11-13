'use strict';

// Native Google Maps. Application data and permissions stay in app.js / Python.
window.TamagoGoogleMap = (() => {
  const literal = p => Array.isArray(p) ? {lat:p[0],lng:p[1]} : {lat:p.lat,lng:p.lng};
  let loading;
  function load(settings){
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>finish(new Error('Google 地圖連線逾時。')),15000);
      function finish(error){
        if(settled)return;settled=true;clearTimeout(timer);
        if(error)reject(error);else resolve();
      }
      window.gm_authFailure=()=>{
        if(!settled)finish(new Error('Google 地圖金鑰尚未獲得授權。'));
        else window.dispatchEvent(new Event('tamago-google-auth-failure'));
      };
      window.__tamagoGoogleReady=()=>finish();
      const script=document.createElement('script');
      const query=new URLSearchParams({key:settings.api_key,callback:'__tamagoGoogleReady',loading:'async',v:'quarterly',language:settings.language||'zh-TW',region:settings.region||'JP'});
      script.src='https://maps.googleapis.com/maps/api/js?'+query;
      script.async=true;script.nonce=document.querySelector('script[nonce]')?.nonce||'';
      script.onerror=()=>finish(new Error('Google 地圖暫時無法連線。'));
      document.head.append(script);
    });
    return loading;
  }

  class LayerGroup {
    constructor(map){this.map=map;this.items=[];}
    add(item){this.items.push(item);item.setMap(this.map.native);return item;}
    clearLayers(){for(const item of this.items)item.setMap(null);this.items=[];}
  }

  function overlayClasses(){
    class Facility extends google.maps.OverlayView {
      constructor(data,options){super();this.data=data;this.options=options;this.handlers={};}
      on(name,handler){this.handlers[name]=handler;return this;}
      addTo(map){this.setMap(map.native);return this;}
      remove(){this.setMap(null);return this;}
      onAdd(){
        const img=document.createElement('img');img.src=this.data.image;
        img.alt=this.options.alt;img.className='facility-overlay google-facility-overlay';
        img.style.opacity=this.options.opacity;img.draggable=false;
        img.onerror=()=>this.handlers.error?.();this.element=img;
        // Below native polygons, so the 1 km mask also clips the venue overlay.
        this.getPanes().mapPane.append(img);
      }
      draw(){
        const projection=this.getProjection();if(!projection||!this.element)return;
        const [sw,ne]=this.data.bounds;
        const bottomLeft=projection.fromLatLngToDivPixel(new google.maps.LatLng(...sw));
        const topRight=projection.fromLatLngToDivPixel(new google.maps.LatLng(...ne));
        Object.assign(this.element.style,{left:bottomLeft.x+'px',top:topRight.y+'px',width:(topRight.x-bottomLeft.x)+'px',height:(bottomLeft.y-topRight.y)+'px'});
      }
      onRemove(){this.element?.remove();this.element=null;}
    }
    class Marker extends google.maps.OverlayView {
      constructor(point,html,label,onClick){super();this.point=literal(point);this.html=html;this.label=label;this.onClick=onClick;}
      onAdd(){
        const el=document.createElement(this.onClick?'button':'div');
        el.className='custom-marker google-custom-marker';el.innerHTML=this.html;
        if(this.onClick){el.type='button';el.addEventListener('click',this.onClick);}
        el.title=this.label;el.setAttribute('aria-label',this.label);
        this.element=el;google.maps.OverlayView.preventMapHitsAndGesturesFrom(el);
        this.getPanes().overlayMouseTarget.append(el);
      }
      draw(){
        const p=this.getProjection()?.fromLatLngToDivPixel(new google.maps.LatLng(this.point));
        if(p&&this.element){this.element.style.left=p.x+'px';this.element.style.top=p.y+'px';}
      }
      onRemove(){this.element?.remove();this.element=null;}
    }
    return {Facility,Marker};
  }

  class MapView {
    constructor(id){
      this.isGoogle=true;this.element=document.getElementById(id);this.minimum=0;
      this.native=new google.maps.Map(this.element,{
        center:{lat:35.6483,lng:140.0346},zoom:16,maxZoom:20,
        mapTypeId:'roadmap',renderingType:google.maps.RenderingType.RASTER,
        isFractionalZoomEnabled:true,disableDefaultUI:true,clickableIcons:false,
        gestureHandling:'greedy',keyboardShortcuts:true,tilt:0,
        styles:[{featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]}]
      });
      this.classes=overlayClasses();
      class Projection extends google.maps.OverlayView {onAdd(){} draw(){} onRemove(){}}
      this.projection=new Projection();this.projection.setMap(this.native);
      this.handlers={};this.resizeObserver=new ResizeObserver(()=>this.handlers.resize?.());
      this.resizeObserver.observe(this.element);
    }
    on(name,handler){
      if(name==='resize')this.handlers.resize=handler;
      else this.native.addListener(name,e=>handler({latlng:e?.latLng?.toJSON()}));
      return this;
    }
    focusRegion(center,radius){
      this.center=literal(center);this.radius=radius;
      const latDelta=radius/6371000*180/Math.PI,lngDelta=latDelta/Math.cos(center.lat*Math.PI/180);
      const bounds={south:center.lat-latDelta,north:center.lat+latDelta,west:center.lng-lngDelta,east:center.lng+lngDelta};
      const width=Math.max(this.element.clientWidth,1),height=Math.max(this.element.clientHeight,1);
      const mercator=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
      const fractionX=(bounds.east-bounds.west)/360;
      const fractionY=(mercator(bounds.north)-mercator(bounds.south))/(2*Math.PI);
      this.minimum=Math.min(Math.log2(width/(256*fractionX)),Math.log2(height/(256*fractionY)));
      this.native.setOptions({restriction:null,minZoom:0});
      this.native.setCenter(this.center);this.native.setZoom(this.minimum);
      this.native.setOptions({minZoom:this.minimum,restriction:{latLngBounds:bounds,strictBounds:false}});
    }
    drawRegion(center,radius,group){
      const r=Math.PI/180,phi=center.lat*r,lambda=center.lng*r,d=radius/6371000,ring=[];
      for(let i=0;i<96;i++){
        const theta=2*Math.PI*i/96;
        const lat=Math.asin(Math.sin(phi)*Math.cos(d)+Math.cos(phi)*Math.sin(d)*Math.cos(theta));
        const lng=lambda+Math.atan2(Math.sin(theta)*Math.sin(d)*Math.cos(phi),Math.cos(d)-Math.sin(phi)*Math.sin(lat));
        ring.push({lat:lat/r,lng:lng/r});
      }
      const latDelta=12*radius/6371000/r,lngDelta=latDelta/Math.cos(phi);
      const outer=[{lat:center.lat-latDelta,lng:center.lng-lngDelta},{lat:center.lat+latDelta,lng:center.lng-lngDelta},{lat:center.lat+latDelta,lng:center.lng+lngDelta},{lat:center.lat-latDelta,lng:center.lng+lngDelta}];
      group.add(new google.maps.Polygon({paths:[outer,ring.reverse()],strokeWeight:0,fillColor:'#faf8f2',fillOpacity:1,clickable:false,zIndex:10}));
      group.add(new google.maps.Circle({center:literal(center),radius,strokeColor:'#71846c',strokeWeight:1,fillOpacity:0,clickable:false,zIndex:11}));
    }
    clearRegionLimit(){this.minimum=2;this.native.setOptions({restriction:null,minZoom:2});}
    layerGroup(){return new LayerGroup(this);}
    addFacility(data,options){return new this.classes.Facility(data,options);}
    addMarker(point,html,label,onClick,group){return group.add(new this.classes.Marker(point,html,label,onClick));}
    getCenter(){return this.native.getCenter()?.toJSON()||this.center;}
    pointAt(clientX,clientY){
      const rect=this.element.getBoundingClientRect();
      return this.projection.getProjection()?.fromContainerPixelToLatLng(new google.maps.Point(clientX-rect.left,clientY-rect.top))?.toJSON();
    }
    getMinZoom(){return this.minimum;}
    getZoom(){return this.native.getZoom();}
    panTo(point){this.native.panTo(literal(point));return this;}
    setView(point,zoom){this.native.moveCamera({center:literal(point),zoom:Math.max(this.minimum,zoom)});return this;}
    zoomIn(){this.native.setZoom((this.native.getZoom()||this.minimum)+1);}
    zoomOut(){this.native.setZoom(Math.max(this.minimum,(this.native.getZoom()||this.minimum)-1));}
    invalidateSize(){google.maps.event.trigger(this.native,'resize');}
    destroy(){this.resizeObserver.disconnect();this.projection.setMap(null);google.maps.event.clearInstanceListeners(this.native);this.element.replaceChildren();}
  }
  return {async create(id,settings){await load(settings);return new MapView(id);}};
})();
