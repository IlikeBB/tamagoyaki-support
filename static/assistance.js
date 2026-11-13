'use strict';
// This watch remains active when the user switches between joined expeditions.
class AssistanceClient {
  constructor(options){this.options=options;this.rooms=[];this.watch=null;this.generation=0;this.lastSent=0;this.lastSampleAt=0;this.writes=Promise.resolve();this.error=false;this.suspended=false;}
  get active(){return !!this.options.user()&&this.rooms.length>0;}
  sync(rooms){
    this.rooms=rooms||[];
    if(!this.active){if(this.watch!=null||this.pending||this.error)this.stop();return;}
    if(this.watch==null&&!this.pending&&!this.error&&!this.suspended)this.start();
  }
  async start(){
    if(this.pending||!this.active||this.suspended)return;
    this.pending=true;this.error=false;this.lastSent=0;
    const generation=++this.generation,initial=this.options.initial();
    try{
      if(!navigator.geolocation)throw new Error('此瀏覽器不支援定位。');
      await this.options.stopRegular();
      if(generation!==this.generation||!this.active||this.suspended)return;
      this.options.changed('active');
      this.watch=navigator.geolocation.watchPosition(p=>this.receive(p,generation),e=>this.fail(e,generation),{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
      if(initial&&Date.now()-initial.timestamp<20000)this.receive(initial,generation);
    }catch(error){this.fail(error,generation);}
    finally{if(generation===this.generation)this.pending=false;}
  }
  receive(position,generation){
    if(generation!==this.generation||!this.active||this.suspended||Date.now()-position.timestamp>20000)return;
    this.options.position(position);
    if(position.timestamp<=this.lastSampleAt||Date.now()-this.lastSent<4000)return;
    this.lastSent=Date.now();this.lastSampleAt=position.timestamp;
    const body={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy};
    this.writes=this.writes.catch(()=>{}).then(async()=>{
      if(generation!==this.generation||!this.active||this.suspended||Date.now()-position.timestamp>20000)return;
      try{await this.options.api('/help/location','PUT',body);this.options.refresh();}
      catch(error){if(error.status!==409)this.options.toast(error.message);}
    });
  }
  fail(error,generation){
    if(generation!==this.generation)return;
    this.lastError={code:error.code,message:error.message};
    this.retryAt=error.code===1?Infinity:Date.now()+2000;
    if(this.watch!=null)navigator.geolocation.clearWatch(this.watch);
    this.watch=null;this.pending=false;this.error=true;this.generation++;
    this.options.changed(error.code===1?'denied':'error');
    if(error.code===1)this.writes=this.writes.catch(()=>{}).then(()=>this.options.api('/help/location','DELETE')).catch(()=>{});
    this.options.toast(error.code===1?'求助定位未獲允許；請開啟權限並重試，或刪除求助任務。':'求助定位暫時無法更新；最後位置保留 15 分鐘，正在重試定位。');
  }
  async stop({suspend=false,remote=false}={}){
    this.generation++;this.suspended=suspend;this.pending=false;this.error=false;
    if(suspend)this.rooms=[];
    if(this.watch!=null)navigator.geolocation.clearWatch(this.watch);this.watch=null;
    this.options.changed('off');
    if(remote){await this.writes.catch(()=>{});if(this.options.user())await this.options.api('/help/location','DELETE').catch(()=>{});}
  }
  retry(){this.error=false;this.suspended=false;return this.start();}
  tick(force=false){
    if(this.active&&this.error&&!this.suspended&&!document.hidden&&Date.now()>=this.retryAt){this.retry();return;}
    if(!this.active||this.watch==null||this.error||this.suspended||this.gpsPending||document.hidden||!force&&Date.now()-this.lastSent<10000)return;
    const generation=this.generation;this.gpsPending=true;
    navigator.geolocation.getCurrentPosition(p=>{this.gpsPending=false;this.receive(p,generation);},e=>{this.gpsPending=false;this.fail(e,generation);},{enableHighAccuracy:true,maximumAge:force?0:5000,timeout:15000});
  }
}
