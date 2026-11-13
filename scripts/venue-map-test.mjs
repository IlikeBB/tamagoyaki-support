import {chromium,expect} from '@playwright/test';

// Read-only on the live app: identities and locations are browser-only fixtures.
const origin=process.argv[2]||'http://127.0.0.1:8078';
if(!['http://127.0.0.1:8078','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
const room={id:'venue-preview',name:'場館切換驗證',venue:'makuhari',event_date:'2026-11-13',code:'PREVIEW1'};
const user={id:'venue-viewer',nickname:'你',username:'venue_preview'};
const places=[{id:'makuhari',lat:35.6482,lng:140.0346703},{id:'k-arena',lat:35.4645775,lng:139.6306334},{id:'pia',lat:35.4557702,lng:139.6284058},{id:'ariake',lat:35.6433718,lng:139.7941814}];
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){writes.push(path);return route.abort();}
  if(path==='/api/me')return route.fulfill({json:{user,expeditions:[room]}});
  if(path==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(path==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[],squads:[],tasks:places.map((p,i)=>({id:'task-'+p.id,owner:'owner-'+i,owner_name:'隊友 '+i,assignee:user.id,title:'場館會合 '+i,kind:'help',status:'accepted',lat:p.lat+.002,lng:p.lng+.002,location_visible:true,location_source:'published',created:Date.now()/1000,expires:Date.now()/1000+3600})),pins:[]}});
  return route.continue();
 });
 async function ready(){await expect.poll(()=>page.evaluate(()=>!!map?.isGoogle&&!state.demo&&lastTeamSyncAt>0),{timeout:25000}).toBe(true);}
 async function checkGooglePlace(place){
  await expect(page.locator('#region-venue')).toHaveValue(place.id);await expect(page.locator('#region-toggle')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(place.lat,3);
  await expect.poll(()=>page.evaluate(()=>map.getCenter().lng)).toBeCloseTo(place.lng,3);
  const circle=await page.evaluate(()=>{const c=layers.items.find(x=>x instanceof google.maps.Circle);return {center:c?.getCenter().toJSON(),radius:c?.getRadius()};});
  expect(circle.radius).toBe(1000);expect(circle.center.lat).toBeCloseTo(place.lat,5);expect(circle.center.lng).toBeCloseTo(place.lng,5);
  await expect(page.locator('.venue-map-point.is-current')).toHaveCount(1);
  await expect(page.locator('.teammate-map-label')).toHaveText(place.id==='k-arena'?['隊友 1','隊友 2']:['隊友 '+places.indexOf(place)]);
  expect(await page.evaluate(()=>state.room.id)).toBe(room.id);
 }
 await page.goto(origin);await ready();await expect(page.locator('#region-venue option')).toHaveCount(4);
 for(const place of places){await page.locator('#region-venue').selectOption(place.id);await checkGooglePlace(place);}
 checks.push('all four Japanese venue centres update the 1 km boundary, markers and authorized targets without changing membership');
 await page.evaluate(()=>refresh());await checkGooglePlace(places[3]);
 await page.reload();await ready();await checkGooglePlace(places[3]);checks.push('venue selection survives sync and reload while joined to another venue');
 await page.locator('#region-toggle').click();await expect(page.locator('.venue-map-point')).toHaveCount(4);
 expect(await page.evaluate(()=>map.native.get('restriction'))).toBeNull();
 await page.evaluate(place=>map.setView([place.lat,place.lng],16),places[1]);
 await page.locator('.google-custom-marker[aria-label="Kアリーナ横浜 · 固定地標"]').click();await checkGooglePlace(places[1]);
 await page.locator('#region-toggle').click();await page.locator('#region-venue').selectOption('pia');await checkGooglePlace(places[2]);
 checks.push('unlimited map includes all four permanent landmarks; selecting a venue or marker restores its 1 km view');
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  const stage=await page.locator('.map-stage').boundingBox(),controls=await page.locator('.map-control-actions').boundingBox();
  expect(controls.x).toBeGreaterThanOrEqual(stage.x);expect(controls.x+controls.width).toBeLessThanOrEqual(stage.x+stage.width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>{const tiles=[...document.querySelectorAll('#map img')].filter(img=>img.src.includes('/maps/vt'));return tiles.length>0&&tiles.every(img=>img.complete&&img.naturalWidth>0);},{},{timeout:20000});
 await page.waitForTimeout(400);await page.screenshot({path:'artifacts/venue-switch-mobile.png'});
 await page.setViewportSize({width:320,height:568});await page.screenshot({path:'artifacts/venue-switch-small.png'});
 checks.push('venue selector and map controls fit mobile, tablet and desktop widths');
 await page.evaluate(()=>window.gm_authFailure());await expect(page.locator('.region-boundary')).toBeVisible({timeout:15000});
 expect(await page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(places[2].lat,3);
 await page.locator('#region-venue').selectOption('ariake');
 expect(await page.evaluate(()=>layers.getLayers().find(x=>x instanceof L.Circle).getLatLng().lng)).toBeCloseTo(places[3].lng,5);
 await page.locator('#region-toggle').click();await expect(page.locator('.region-boundary')).toHaveCount(0);await expect(page.locator('.venue-map-point')).toHaveCount(4);
 checks.push('Leaflet fallback uses the selected venue and the same range toggle');
 expect(writes).toEqual([]);expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,origin,checks,writes,errors}));
}catch(error){console.error(JSON.stringify({error:error.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]'),errors,writes}));process.exitCode=1;}
finally{await browser.close();}
