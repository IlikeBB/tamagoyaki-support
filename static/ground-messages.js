'use strict';
class GroundMessages {
  constructor(actions){this.actions=actions;}
  open(){
    const actions=this.actions,context=actions.context();if(!context)return actions.join();
    actions.dialog({kind:'ground'});
    const form=document.querySelector('#ground-message-form'),status=form.querySelector('#ground-message-position'),gps=form.querySelector('#ground-message-gps');
    let point=null,pending=null;
    const current=()=>form.isConnected&&document.querySelector('#dialog').open&&actions.context()?.room===context.room&&actions.context()?.user===context.user;
    const locate=()=>{
      if(pending)return pending;
      point=null;status.textContent='正在取得 GPS 定位…';gps.disabled=true;
      pending=Promise.resolve().then(async()=>{
        try{
          if(!navigator.geolocation)throw new Error('這個瀏覽器不支援定位，無法在原地留下留言。');
          const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:20000}));
          if(!current())throw new Error('發布視窗或遠征隊已變更，請重新開啟。');
          if(!Number.isFinite(position.timestamp)||Date.now()-position.timestamp>20000)throw new Error('定位資料已過期，請重新取得目前位置。');
          point={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
          status.textContent=`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} · 精度 ±${Math.round(point.accuracy)}m`;
          return point;
        }catch(error){
          const message=error.code===1?'請允許瀏覽器定位，才能在自己腳下留下留言。':error.message||'暫時無法取得定位，請稍後重試。';
          if(current())status.textContent=message;
          throw new Error(message);
        }finally{pending=null;gps.disabled=false;}
      });return pending;
    };
    gps.onclick=()=>locate().catch(()=>{});
    form.onsubmit=event=>{
      event.preventDefault();actions.submit(form,async()=>{
        if(!current())throw new Error('遠征隊已變更，請重新開啟留言。');
        const text=new FormData(form).get('message').trim();if(!text)throw new Error('請先輸入留言內容。');
        await locate();
        if(!current())throw new Error('發布視窗或遠征隊已變更，請重新開啟。');
        const pin=await actions.api(`/expeditions/${context.room}/pins`,'POST',{
          title:text.split(/\r?\n/)[0].slice(0,80),description:text,kind:'message',hours:Number(new FormData(form).get('hours')),lat:point.lat,lng:point.lng
        });
        if(!current())return;
        await actions.refresh();if(!current())return;
        actions.close();actions.center(point);actions.select(pin.id);actions.toast('留言已留在腳下的位置，同隊夥伴可以點開閱讀。');
      });
    };
    locate().catch(()=>{});
  }
}
