import {chromium,expect} from '@playwright/test';
// Read-only fixtures; never send location or create live content.
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],writes=[],checks=[];
const user={id:'venue-viewer',nickname:'場館驗證',username:'venue_preview'},room={id:'venue-preview',owner:user.id,name:'場館切換驗證',venue:'makuhari',event_date:''};
const taiwan={lat:25.033,lng:121.5654},stamp=Date.now()/1000;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{latitude:taiwan.lat,longitude:taiwan.lng,accuracy:8}}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.addInitScript(()=>localStorage.setItem('tamago-limit-region','on'));
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(new URL(request.url()).origin!==origin)return route.continue();
  if(request.method()==='DELETE'&&path==='/api/location')return route.fulfill({json:{ok:true}});
  if(request.method()!=='GET'){writes.push(path);return route.abort();}
  if(path==='/api/config')return route.continue();
  if(path==='/api/me')return route.fulfill({json:{user,expeditions:[room],help_rooms:[]}});
  if(path==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(path==='/api/chat')return route.fulfill({json:{conversations:[],unread:0}});
  if(path==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[],squads:[],tasks:[],help_rooms:[],pins:[{id:'taiwan-point',owner:'other',owner_name:'同行夥伴',title:'台灣集合點',description:'遠方的情報點',kind:'meet',...taiwan,expires:null,created:stamp,following_author:true,reported_by_me:false,my_vote:0,likes:0,dislikes:0,can_vote:true}]}});
  if(path.endsWith('/reports'))return route.fulfill({json:{items:[],total:0}});
  return route.fulfill({json:{items:[],expeditions:[]}});
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map&&!state.demo&&friends.ready()),{timeout:30000}).toBe(true);await page.evaluate(()=>clearInterval(pollTimer));
 const google=await page.evaluate(()=>!!map.isGoogle);if(origin.startsWith('https'))expect(google).toBe(true);
 async function unrestricted(){
  await expect(page.locator('#region-toggle,.region-boundary,.region-mask')).toHaveCount(0);await expect(page.locator('.venue-map-point')).toHaveCount(await page.evaluate(()=>config.venues.length));await expect(page.getByTitle('台灣集合點',{exact:true})).toHaveCount(1);
  expect(await page.evaluate(()=>map.isGoogle?map.native.get('restriction')==null:!map.options.maxBounds)).toBe(true);expect(await page.evaluate(()=>map.getMinZoom())).toBe(2);
 }
 await unrestricted();const venues=await page.evaluate(()=>config.venues);
 expect(venues.find(venue=>venue.id==='tokyo-dome-city')).toMatchObject({name:'東京巨蛋城（Kanadevia Hall）',short:'東京巨蛋城',lat:35.70332,lng:139.75458});
 for(const venue of venues){await page.locator('#region-venue').selectOption(venue.id);await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(venue.lat,3);await expect.poll(()=>page.evaluate(()=>map.getCenter().lng)).toBeCloseTo(venue.lng,3);await unrestricted();await page.getByTitle(`${venue.name} · 場館地標`,{exact:true}).click();await expect(page.locator('#target-card')).toContainText(venue.name);await page.locator('[data-action=target-close]').click();expect(await page.evaluate(()=>state.room.id)).toBe(room.id);}
 await expect(page.locator('#region-venue')).toHaveValue('tokyo-dome-city');
 await expect(page.locator('#region-venue')).toHaveAttribute('title','切換地圖場館：東京巨蛋城（Kanadevia Hall）');
 await page.evaluate(()=>showJoin('create'));await expect(page.locator('#join-form #venue')).toHaveValue('tokyo-dome-city');await expect(page.locator('#join-form #venue option:checked')).toHaveText('東京巨蛋城（Kanadevia Hall）');await page.locator('#dialog [data-action=close]').click();
 await page.evaluate(()=>showJoin('browse'));await expect(page.locator('#join-venue')).toHaveValue('tokyo-dome-city');await page.locator('#dialog [data-action=close]').click();
 await page.setViewportSize({width:320,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/tokyo-dome-city-${google?'google':'leaflet'}-320.png`});
 await page.evaluate(()=>showExpeditionPage());await page.locator('[data-expedition-mode=browse]').click();await page.locator('#expedition-page-venue').selectOption('tokyo-dome-city');await expect(page.locator('#expedition-page-venue option:checked')).toHaveText('東京巨蛋城（Kanadevia Hall）');await page.locator('[data-expedition-back]').click();
 checks.push('all official venues including Kanadevia Hall have clickable markers, correct shortcuts and activity choices; membership stays unchanged and range restrictions stay removed');
 await page.evaluate(()=>showLocation());await page.locator('#location-scope-local').check();await page.locator('#location-form [type=submit]').click();await expect(page.locator('#dialog')).toBeHidden();await context.setGeolocation({latitude:taiwan.lat,longitude:taiwan.lng,accuracy:8});await expect.poll(()=>page.evaluate(()=>state.position?.lat),{timeout:15000}).toBe(taiwan.lat);await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(taiwan.lat,3);await unrestricted();
 await page.evaluate(()=>stopLocation({remote:false}));await page.evaluate(()=>selectTarget('pin','taiwan-point'));await expect(page.locator('#target-card')).toContainText('台灣集合點');await expect.poll(()=>page.evaluate(()=>map.getCenter().lng)).toBeCloseTo(taiwan.lng,3);await page.locator('[data-action=target-close]').click();
 await page.evaluate(point=>map.setView([point.lat,point.lng],3),taiwan);await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBe(3);
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:900});await page.waitForTimeout(200);await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(taiwan.lat,0);expect(await page.evaluate(()=>map.getZoom())).toBe(3);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await unrestricted();}
 checks.push('Taiwan GPS, distant landmarks and world zoom work without changing venue; resize preserves the chosen center and zoom at phone/tablet/desktop widths');
 await page.evaluate(()=>showPublish('pin',{lat:25.033,lng:121.5654}));await page.locator('#use-position').click();await expect(page.locator('#coord-value')).toContainText('25.03300');await page.locator('#dialog [data-action=close]').click();
 await page.setViewportSize({width:390,height:844});await page.locator('#region-venue').selectOption('k-arena');await page.screenshot({path:`artifacts/map-unrestricted-${google?'google':'leaflet'}-390.png`});
 if(google){await page.evaluate(()=>window.gm_authFailure());await expect.poll(()=>page.evaluate(()=>!!map&&!map.isGoogle)).toBe(true);await unrestricted();await page.locator('#region-venue').selectOption('pia');await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(venues.find(item=>item.id==='pia').lat,3);checks.push('Google-to-Leaflet fallback also stays unrestricted and retains functional venue shortcuts');}
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,origin,google,checks,errors,writes}));
}finally{await browser.close();}
