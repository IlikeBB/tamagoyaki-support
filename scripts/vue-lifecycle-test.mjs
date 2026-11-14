import { chromium, expect } from '@playwright/test';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Vue lifecycle checks require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.qaGPS={next:0,active:new Set(),callbacks:[],cleared:[]};
  navigator.geolocation.watchPosition=(success,failure)=>{const id=++qaGPS.next;qaGPS.active.add(id);qaGPS.callbacks.push(success);return id;};
  navigator.geolocation.clearWatch=id=>{qaGPS.active.delete(id);qaGPS.cleared.push(id);};
 });
 let nickname='第一個帳號',release;
 const user={id:'lifecycle-user',username:'lifecycle',nickname},room={id:'lifecycle-room',owner:user.id,name:'生命週期遠征隊',venue:'taiwan',event_date:''};
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.continue();
  if(url.pathname==='/api/config')return route.continue();
  if(url.pathname==='/api/lifecycle-delay'){await new Promise(resolve=>release=resolve);return route.fulfill({json:{nickname:'過期回應'}}).catch(()=>{});}
  if(request.method()!=='GET'){writes.push(url.pathname);return route.fulfill({json:{ok:true,help_rooms:[]}});}
  if(url.pathname==='/api/me')return route.fulfill({json:{user:{...user,nickname},expeditions:[room],help_rooms:[]}});
  if(url.pathname==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,squad:null,scope:'off'},members:[],squads:[],tasks:[],pins:[],help_rooms:[]}});
  if(url.pathname==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(url.pathname==='/api/chat')return route.fulfill({json:{conversations:[],unread:0}});
  return route.fulfill({json:{items:[],expeditions:[]}});
 });
 await page.goto(origin);
 await expect.poll(()=>page.evaluate(()=>!!window.TamagoTesting&&!!map&&state.authenticated)).toBe(true);
 const scripts=await page.locator('script[src^="/static/"]').evaluateAll(elements=>elements.map(element=>new URL(element.src).pathname));
 expect(scripts.sort()).toEqual(['/static/vendor/leaflet.js','/static/vue/app.js']);
 expect(await page.evaluate(()=>document.body.__vue_app__!=null)).toBe(true);
 await page.locator('[data-action=location]').first().click();
 await page.locator('#location-scope-local').check();await page.locator('#location-form [type=submit]').click();
 await expect.poll(()=>page.evaluate(()=>qaGPS.active.size)).toBe(1);
 expect((await page.evaluate(()=>TamagoTesting.stats())).watches).toBe(1);
 await page.evaluate(()=>{
  window.qaOldState=state;
  window.qaOldPromise=TamagoTesting.application().api('/lifecycle-delay').then(()=> 'resolved',error=>error.name);
 });
 await expect.poll(()=>!!release).toBe(true);
 await page.evaluate(()=>TamagoTesting.unmount());
 await expect(page.locator('#tamago-app')).toHaveCount(0);
 expect(await page.evaluate(()=>TamagoTesting.stats())).toEqual({scopes:0,listeners:0,timers:0,requests:0,watches:0});
 expect(await page.evaluate(()=>qaGPS.active.size)).toBe(0);
 expect(await page.evaluate(()=>qaOldPromise)).toBe('AbortError');
 const writesBefore=writes.length;
 await page.evaluate(()=>{
  for(const callback of qaGPS.callbacks)callback({timestamp:Date.now(),coords:{latitude:25.033,longitude:121.5654,accuracy:5}});
  window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));
 });
 expect(writes).toHaveLength(writesBefore);
 expect(await page.evaluate(()=>qaOldState.position)).toBeNull();
 release();nickname='重新掛載的帳號';
 await page.evaluate(()=>TamagoTesting.mount());
 await expect(page.locator('#account-label')).toHaveText(nickname);
 await expect.poll(()=>page.evaluate(()=>!!map&&lastTeamSyncAt>0)).toBe(true);
 expect(await page.evaluate(()=>state===qaOldState)).toBe(false);
 expect(await page.evaluate(()=>qaGPS.active.size)).toBe(0);
 await page.locator('[data-action=settings]').click();await expect(page.locator('#dialog')).toBeVisible();
 await page.locator('#dialog [data-action=close]').click();
 expect(errors).toEqual([]);
 checks.push('one Vue entry owns imported services and session/UI state; no independent business scripts load');
 checks.push('unmount removes every owned listener, timer, request and GPS watch; late samples cannot mutate state or upload');
 checks.push('remount creates fresh account state and functional controls without duplicate subscriptions');
 console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
