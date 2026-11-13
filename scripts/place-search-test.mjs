import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(!origin||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)||origin.endsWith(':8078'))throw new Error('Isolated QA_ORIGIN required.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],legacyCalls=[],suffix=randomBytes(5).toString('hex');
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Tamago-Client':'web'}});
 expect((await context.request.post(origin+'/api/auth/register',{data:{username:'search_'+suffix,nickname:'搜尋測試',password:'Private place search QA passphrase 2026!'}})).ok()).toBe(true);
 const room=await (await context.request.post(origin+'/api/expeditions',{data:{name:'搜尋地點 '+suffix,venue:'makuhari',event_date:new Date().toISOString().slice(0,10)}})).json();
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const point={id:'google-test-place',name:'台北101 <img src=x onerror=alert(1)>',address:'臺灣 · 臺北市 · 信義區',lat:25.034,lng:121.5645,source:'google',attributions:[{provider:'供應者 <img src=x>',uri:'javascript:alert(1)'}]};
 await page.route('**/api/places/search?*',route=>{legacyCalls.push(route.request().url());return route.abort();});
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!state.demo&&!!map)).toBe(true);
 // Mock only the Google SDK boundary; exercise the real search adapter and UI.
 await page.evaluate(({point})=>{
  const search=TamagoGooglePlaces.search;window.qaQueries=[];
  window.google={maps:{importLibrary:async()=>({Place:{searchByText:async request=>{
   window.qaQueries.push(request);const query=request.textQuery;
   if(query==='沒有地點')return {places:[]};
   if(query==='連線故障')throw new Error('private SDK details');
   if(query==='緩慢搜尋')await new Promise(resolve=>setTimeout(resolve,650));
   return {places:[{id:point.id,displayName:point.name,formattedAddress:point.address,location:{lat:()=>point.lat,lng:()=>point.lng},attributions:point.attributions.map(a=>({provider:a.provider,providerURI:a.uri}))}]};
  }}})}};
  TamagoGooglePlaces.search=query=>search(query,{language:'zh-TW',region:'TW'},{isGoogle:true});
 },{point});
 await page.locator('#place-query').fill('台北101');await page.waitForTimeout(350);expect(await page.evaluate(()=>qaQueries)).toEqual([]);
 await page.locator('#place-search [type=submit]').click();await expect(page.locator('.place-search-result')).toHaveCount(1);await expect(page.locator('#place-search-panel img')).toHaveCount(0);await expect(page.locator('.place-provider')).toHaveText('供應者 <img src=x>');await expect(page.locator('.place-provider a')).toHaveCount(0);await expect(page.locator('.place-search-credit')).toHaveText('Google Maps');
 await page.locator('.place-search-result').click();await expect(page.locator('#region-toggle')).toHaveAttribute('aria-pressed','false');await expect(page.locator('.search-result-marker')).toHaveCount(1);
 expect(await page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(point.lat,4);
 await expect(page.locator('[data-place-create=pin]')).toBeVisible();await page.screenshot({path:'artifacts/place-search-mobile.png'});
 await page.locator('[data-place-close]').click();await expect(page.locator('#place-search-panel')).toBeHidden();await expect(page.locator('#place-query')).toBeFocused();
 await page.locator('#place-query').blur();await page.locator('#place-query').focus();await expect(page.locator('#place-search-panel')).toBeVisible();
 await expect(page.locator('[data-place-create=pin]')).toHaveText('標記地標');
 await page.locator('[data-place-create=pin]').click();await expect(page.locator('#title')).toHaveValue(point.name);await expect(page.locator('#coord-value')).toHaveText('25.03400, 121.56450');await expect(page.locator('#hours')).toHaveValue('2');
 await page.locator('#hours').selectOption('0');await expect(page.locator('.coordinate-note .field-note')).toContainText('永久標記不會自動到期');await page.screenshot({path:'artifacts/permanent-landmark-form.png'});
 await page.locator('#publish-form [type=submit]').click();await expect(page.locator('#dialog')).not.toBeVisible();
 const path='/api/expeditions/'+room.id;let snapshot=await (await context.request.get(origin+path)).json();expect(snapshot.pins).toHaveLength(1);expect(snapshot.pins[0].lat).toBe(point.lat);expect(snapshot.pins[0].expires).toBeNull();
 await expect(page.locator('#panel-content')).toContainText('永久標記');await expect(page.locator('#panel-content .landmark-feedback')).toHaveCount(1);await expect(page.locator('#panel-content .landmark-feedback [data-value="1"]')).toBeDisabled();
 await page.evaluate(()=>refresh());expect((await (await context.request.get(origin+path)).json()).pins[0].expires).toBeNull();
 checks.push('manual search only; safe result text; outside-range selection expands map; selected place creates a permanent landmark that survives synchronization without an expiry; author can see feedback but cannot self-vote');
 await page.locator('[data-mobile=map]').click();await page.locator('#place-query').focus();await page.locator('[data-place-create=task]').click();await expect(page.locator('#use-position')).toHaveCount(0);await page.locator('#publish-form [type=submit]').click();await expect(page.locator('#dialog')).not.toBeVisible();
 snapshot=await (await context.request.get(origin+path)).json();expect(snapshot.tasks).toHaveLength(1);expect(snapshot.tasks[0].location_mode).toBe('fixed');expect(snapshot.tasks[0].lng).toBe(point.lng);
 checks.push('a searched location also creates a fixed task flag without requesting GPS');
 await page.locator('[data-mobile=map]').click();
 for(const [query,message] of [['沒有地點','找不到地點'],['連線故障','Google 地點搜尋暫時無法連線']]){
  await page.locator('#place-query').fill(query);await page.locator('#place-search [type=submit]').click();await expect(page.locator('#place-search-panel [role=status]')).toContainText(message);
 }
 await page.locator('#place-query').fill('緩慢搜尋');await page.locator('#place-search [type=submit]').click();await page.locator('#place-query').fill('新的搜尋');await page.waitForTimeout(850);await expect(page.locator('#place-search-panel')).toBeHidden();await expect(page.locator('#place-search [type=submit]')).toBeEnabled();
 checks.push('empty, offline and stale-response states work without replacing a newer query');
 await page.evaluate(id=>selectTarget('pin',id),snapshot.pins[0].id);
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:width===320?568:900});await page.waitForTimeout(200);
  const stage=await page.locator('.map-stage').boundingBox(),search=await page.locator('#place-search').boundingBox(),card=await page.locator('#target-card').boundingBox(),location=await page.locator('.location-card').boundingBox();
  expect(search.x-stage.x).toBeLessThanOrEqual(25);expect(search.x).toBeLessThan((await page.locator('.map-control-actions').boundingBox()).x+1);
  expect(card.x-stage.x).toBeLessThanOrEqual(25);expect(card.y+card.height).toBeLessThan(stage.y+stage.height);expect(location.y+location.height).toBeLessThanOrEqual(card.y);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===320)await page.screenshot({path:'artifacts/target-card-lower-left-small.png'});
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/target-card-lower-left.png'});
 checks.push('search stays at the upper left; direction card stays at the lower left below location settings, at all four widths');
 expect(legacyCalls).toEqual([]);expect((await context.request.get(origin+'/api/places/search?q=test')).status()).toBe(410);expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
