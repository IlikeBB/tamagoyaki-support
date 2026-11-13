import {chromium,expect} from '@playwright/test';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw new Error('Only isolated port 8079 is allowed.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[];
const user={id:'background-viewer',nickname:'測試者',username:'background'},room={id:'background-room',name:'背景測試隊',owner:user.id,venue:'makuhari',event_date:'2026-11-13'};
async function scenario(scope){
 const requests=[],observed=Date.now()/1000;
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.addInitScript(()=>{
  const realNow=Date.now.bind(Date);window.__offset=0;Date.now=()=>realNow()+window.__offset;
  let hidden=false,next=0;const watches=new Map();window.__gpsRequests=0;window.__clears=0;
  Object.defineProperty(document,'hidden',{get:()=>hidden});
  window.__background=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));if(value)window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));else window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));};
  Object.defineProperty(navigator,'geolocation',{value:{
   watchPosition(success,error){const id=++next;watches.set(id,{success,error});return id;},
   clearWatch(id){watches.delete(id);window.__clears++;},
   getCurrentPosition(){window.__gpsRequests++;}
  }});
  window.__sample=(lat=25.033)=>{const sample={timestamp:Date.now(),coords:{latitude:lat,longitude:121.5654,accuracy:8}};for(const {success} of watches.values())success(sample);};
  window.__gpsError=code=>{for(const {error} of [...watches.values()])error({code,message:'controlled GPS error'});};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){requests.push({method:req.method(),path,body:req.postDataJSON()});return route.fulfill({json:{ok:true}});}
  if(path==='/api/me')return route.fulfill({json:{user,expeditions:[room],help_rooms:[]}});
  if(path==='/api/friends')return route.fulfill({json:{friends:[{id:'friend',nickname:'小狐',username:'fox',lat:25.034,lng:121.564,accuracy:8,located:observed,location_visible:true}],incoming:[],outgoing:[],sharing:false}});
  if(path==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[{user:'member',nickname:'阿晴',lat:25.034,lng:121.567,accuracy:9,located:observed,scope:'expedition',location_visible:true,online:true}],squads:[],pins:[],help_rooms:[],tasks:[{id:'task',title:'交換手辦',owner:user.id,owner_name:'測試者',kind:'trade',status:'open',lat:25.033,lng:121.5654,expires:observed+3600,location_visible:true,location_source:'published',created:observed,location_mode:'publisher'}]}});
  return route.continue();
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map&&!state.demo&&friends.ready())).toBe(true);
 await page.evaluate(value=>{showLocation();document.querySelector('#location-scope-'+value).checked=true;document.querySelector('#location-form').requestSubmit();},scope);
 await expect.poll(()=>page.evaluate(()=>state.watch!=null)).toBe(true);await page.evaluate(()=>__sample());
 const path=scope==='friends'?'/api/friends/location':'/api/expeditions/'+room.id+'/location';
 await expect.poll(()=>requests.filter(r=>r.method==='PUT'&&r.path===path).length).toBe(1);
 const before=requests.filter(r=>r.method==='DELETE').length,clears=await page.evaluate(()=>__clears);
 await page.evaluate(()=>__background(true));await page.waitForTimeout(100);
 expect(requests.filter(r=>r.method==='DELETE').length).toBe(before);expect(await page.evaluate(()=>__clears)).toBe(clears);
 await page.evaluate(()=>{lastSent=0;friends.lastSent=0;__sample(25.034);});
 await expect.poll(()=>requests.filter(r=>r.method==='PUT'&&r.path===path).length).toBe(2);
 await page.evaluate(()=>__gpsError(2));expect(await page.evaluate(()=>state.position?.lat)).toBe(25.034);expect(requests.filter(r=>r.method==='DELETE').length).toBe(before);
 const gpsBefore=await page.evaluate(()=>__gpsRequests);await page.evaluate(()=>__background(false));await expect.poll(()=>page.evaluate(()=>__gpsRequests)).toBeGreaterThan(gpsBefore);
 // A GPS sample reused by a browser must not renew server freshness.
 const sent=requests.filter(r=>r.method==='PUT').length;
 await page.evaluate(()=>{lastSent=0;friends.lastSent=0;receivePosition({timestamp:lastPositionAt,coords:{latitude:state.position.lat,longitude:state.position.lng,accuracy:8}},locationGeneration);});await page.waitForTimeout(100);expect(requests.filter(r=>r.method==='PUT').length).toBe(sent);
 await page.evaluate(async()=>{__offset=5*60000;await refresh();await friends.sync();renderLocation();renderMap();});
 await expect(page.locator('#location-detail')).toContainText('最後位置');await expect(page.locator('.friend-map-point .teammate-map-label')).toContainText('5 分鐘前');
 await page.evaluate(()=>finder.open('friend:friend'));await expect(page.locator('#finder-source')).toContainText('最後位置 · 5 分鐘前');await expect(page.locator('#finder-accuracy')).toContainText('依你的最後位置');
 if(scope==='friends')await page.screenshot({path:'artifacts/background-last-known-mobile.png'});
 await page.evaluate(async()=>{__offset=14*60000+50000;await refresh();await friends.sync();renderMap();});expect(await page.evaluate(()=>friends.targets().length)).toBe(1);expect(await page.evaluate(()=>finder.model.position!==null)).toBe(true);
 await page.evaluate(async()=>{__offset=15*60000+1000;await refresh();await friends.sync();refreshTeammateGuidance();});
 await expect.poll(()=>page.evaluate(()=>state.position===null),{timeout:7000}).toBe(true);expect(await page.evaluate(()=>friends.targets().length)).toBe(0);await expect(page.locator('.friend-map-point')).toHaveCount(0);
 // Permission denial takes precedence over the retention window.
 await page.evaluate(()=>{__offset=0;__sample();});await page.evaluate(()=>__gpsError(1));await expect.poll(()=>page.evaluate(()=>state.scope)).toBe('off');await expect.poll(()=>requests.filter(r=>r.method==='DELETE').length).toBeGreaterThan(before);
 await context.close();checks.push(scope+': background keeps watch and accepts actual fixes; transient failure retains; foreground requests GPS; repeated samples do not renew; last-known age shown; 15-minute expiry; denied permission withdraws');
}
try{
 for(const scope of ['friends','expedition','task'])await scenario(scope);
 // Help watch retries temporary failures without withdrawing last known coords.
 const context=await browser.newContext();const page=await context.newPage();await page.goto(origin);await expect.poll(()=>page.evaluate(()=>typeof AssistanceClient)).toBe('function');
 const help=await page.evaluate(async()=>{
  const calls=[],changed=[];let next=0;
  Object.defineProperty(navigator,'geolocation',{value:{watchPosition:()=>++next,clearWatch:()=>{},getCurrentPosition:()=>{}}});
  const client=new AssistanceClient({user:()=>({id:'test'}),initial:()=>null,stopRegular:async()=>{},changed:s=>changed.push(s),toast:()=>{},refresh:()=>{},position:()=>{},api:async(path,method)=>{calls.push(method);}});
  client.rooms=[{id:'test'}];await client.start();client.receive({timestamp:Date.now(),coords:{latitude:25,longitude:121,accuracy:8}},client.generation);await client.writes;
  client.fail({code:2},client.generation);await client.writes;const transient=[...calls];await client.retry();client.fail({code:1},client.generation);await client.writes;
  return {transient,calls,changed};
 });
 expect(help.transient).toEqual(['PUT']);expect(help.calls).toEqual(['PUT','DELETE']);expect(help.changed).toContain('error');expect(help.changed).toContain('denied');await context.close();
 checks.push('help retains last fix on temporary GPS failure, retries, and withdraws immediately on permission denial');expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
