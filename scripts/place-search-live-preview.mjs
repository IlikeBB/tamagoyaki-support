import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'https://tamagoyaki-support.modoubletw.com';
if(!['http://127.0.0.1:8078','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected preview origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const writes=[],errors=[],checks=[];
const user={id:'search-viewer',nickname:'搜尋預覽',username:'search_preview'},room={id:'search-preview',name:'搜尋預覽',venue:'makuhari',owner:'search-viewer',event_date:'2026-11-13',code:'PREVIEW1'};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET'){writes.push(path);return route.abort();}
  if(path==='/api/me')return route.fulfill({json:{user,expeditions:[room]}});
  if(path==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(path==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[],squads:[],tasks:[],pins:[]}});
  return route.continue();
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map?.isGoogle&&!!placeSearch),{timeout:25000}).toBe(true);
 await page.locator('#place-query').fill('海浜幕張駅');await page.locator('#place-search [type=submit]').click();await expect(page.locator('.place-search-result').first()).toBeVisible({timeout:20000});await page.locator('.place-search-result').first().click();
 const selected=await page.evaluate(()=>placeSearch.selected);expect(selected.lat).toBeGreaterThan(35.6);expect(selected.lat).toBeLessThan(35.7);expect(selected.lng).toBeGreaterThan(140);expect(selected.lng).toBeLessThan(140.1);
 await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(selected.lat,4);await expect.poll(()=>page.evaluate(()=>map.getCenter().lng)).toBeCloseTo(selected.lng,4);
 await expect(page.locator('.search-result-marker')).toHaveCount(1);
 await page.waitForFunction(()=>{const images=[...document.querySelectorAll('#map img')].filter(i=>i.src.includes('/maps/vt'));return images.length&&images.every(i=>i.complete&&i.naturalWidth);},{},{timeout:20000});await page.waitForTimeout(400);
 expect(await page.evaluate(()=>map.getCenter().lng)).toBeCloseTo(selected.lng,4);await page.screenshot({path:'artifacts/place-search-google-mobile.png'});
 await page.locator('[data-place-create=pin]').click();await expect(page.locator('#title')).toHaveValue(selected.name.slice(0,80));await expect(page.locator('#hours')).toHaveValue('2');await expect(page.locator('#coord-value')).toHaveText(selected.lat.toFixed(5)+', '+selected.lng.toFixed(5));await page.screenshot({path:'artifacts/place-search-google-pin.png'});await page.locator('[data-action=close]').click();
 checks.push('real Japanese station search via public endpoint moves Google map and prefills a temporary landmark without any production writes');
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:width===320?568:900});await page.waitForTimeout(200);
  const stage=await page.locator('.map-stage').boundingBox(),search=await page.locator('#place-search').boundingBox(),controls=await page.locator('.map-control-actions').boundingBox();
  expect(search.x-stage.x).toBeLessThanOrEqual(25);expect(search.x+search.width).toBeLessThanOrEqual(stage.x+stage.width);expect(controls.x+controls.width).toBeLessThanOrEqual(stage.x+stage.width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 checks.push('search and venue controls fit 320, 768, 1024 and 1440 px');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.gm_authFailure());await expect(page.locator('.region-boundary')).toBeVisible({timeout:15000});
 await page.locator('#place-query').fill('K橫');await page.locator('#place-search [type=submit]').click();await page.locator('.place-search-result').first().click();
 expect(await page.evaluate(()=>placeSearch.selected.lat)).toBeCloseTo(35.4645775,6);await expect(page.locator('.search-result-marker')).toHaveCount(1);
 checks.push('search also works on the fallback map; K Arena uses the verified venue coordinate');
 expect(writes).toEqual([]);expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,writes,errors}));
}finally{await browser.close();}
