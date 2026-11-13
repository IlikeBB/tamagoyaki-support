import {chromium,expect} from '@playwright/test';

const origin=process.argv[2]||'http://127.0.0.1:8078';
if(!['http://127.0.0.1:8078','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected preview origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
const user={id:'hold-viewer',nickname:'預覽隊長',username:'hold_preview'};
const room={id:'hold-preview',name:'長按功能預覽',venue:'makuhari',owner:user.id,event_date:'2026-11-13',code:'PREVIEW1'};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){writes.push(path);return route.abort();}
  if(path==='/api/me')return route.fulfill({json:{user,expeditions:[room]}});
  if(path==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(path==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[],squads:[],tasks:[{id:'fixed-preview',owner:'flag-owner',owner_name:'配布夥伴',assignee:user.id,title:'任務旗標測試',kind:'giveaway',status:'accepted',lat:35.6468,lng:140.0328,location_mode:'fixed',location_visible:true,location_source:'fixed',created:Date.now()/1000,expires:Date.now()/1000+7200}],pins:[{id:'pin-preview',owner:'pin-owner',owner_name:'夥伴',title:'臨時集合點',description:'預覽資料',kind:'meet',lat:35.651,lng:140.037,created:Date.now()/1000,expires:Date.now()/1000+7200,can_delete:true}]}});
  return route.continue();
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map?.isGoogle&&!state.demo&&lastTeamSyncAt>0),{timeout:25000}).toBe(true);
 await page.waitForFunction(()=>{const images=[...document.querySelectorAll('#map img')].filter(i=>i.src.includes('/maps/vt'));return images.length&&images.every(i=>i.complete&&i.naturalWidth);},{},{timeout:20000});
 await expect(page.locator('.map-pin.fixed-task')).toHaveCount(1);
 async function hold(xFraction=.66,yFraction=.46,touch=true){
  const rect=await page.locator('#map').boundingBox(),x=rect.x+rect.width*xFraction,y=rect.y+rect.height*yFraction;
  if(touch){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(750);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();}
  await expect(page.locator('#map-actions')).toBeVisible();
  const result=await page.evaluate(({x,y})=>{const p=mapActions.point,r=document.getElementById('map').getBoundingClientRect();const pixel=map.projection.getProjection().fromLatLngToContainerPixel(new google.maps.LatLng(p));return {dx:pixel.x-(x-r.left),dy:pixel.y-(y-r.top),point:p};},{x,y});
  expect(Math.abs(result.dx)).toBeLessThan(1);expect(Math.abs(result.dy)).toBeLessThan(1);return result.point;
 }
 const chosen=await hold();await page.waitForTimeout(350);await page.screenshot({path:'artifacts/map-hold-google-mobile.png'});
 await page.locator('[data-map-create=task]').click();await expect(page.locator('#coord-value')).toHaveText(chosen.lat.toFixed(5)+', '+chosen.lng.toFixed(5));await expect(page.locator('#use-position')).toHaveCount(0);await page.screenshot({path:'artifacts/map-hold-google-task-form.png'});await page.locator('[data-action=close]').click();
 checks.push('Google Maps touch hold opens choices; selected location matches the touched map pixel and task flag form needs no GPS');
 await page.evaluate(()=>selectTarget('task','fixed-preview'));await expect(page.locator('#finder-source')).toHaveText('固定任務旗標 · 不隨發布者移動');await page.locator('#finder-close').click();
 await page.evaluate(()=>selectTarget('pin','pin-preview'));await expect(page.locator('#target-card [data-action=delete-pin]')).toBeVisible();
 const targetBox=await page.locator('#target-card').boundingBox(),stageBox=await page.locator('.map-stage').boundingBox(),locationBox=await page.locator('.location-card').boundingBox();
 expect(targetBox.x-stageBox.x).toBeLessThanOrEqual(25);expect(locationBox.y+locationBox.height).toBeLessThanOrEqual(targetBox.y);
 await page.waitForTimeout(450);await page.screenshot({path:'artifacts/target-card-google-lower-left.png'});await page.locator('[data-action=target-close]').click();
 checks.push('fixed task uses flag marker and fixed-position finder label; expedition captain can delete a teammate landmark from its map card');
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:width===320?568:900});await page.waitForTimeout(450);
  await page.locator('[data-action=pin-center]').click();await expect(page.locator('#map-actions')).toBeVisible();
  const stage=await page.locator('.map-stage').boundingBox(),box=await page.locator('#map-actions').boundingBox();expect(box.x).toBeGreaterThanOrEqual(stage.x);expect(box.y).toBeGreaterThanOrEqual(stage.y);expect(box.x+box.width).toBeLessThanOrEqual(stage.x+stage.width);expect(box.y+box.height).toBeLessThanOrEqual(stage.y+stage.height);
  if(width===320){
   const button=await page.locator('[data-map-create=pin]').boundingBox();
   expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-map-create="pin"]'),{x:button.x+button.width-12,y:button.y+button.height/2})).toBe(true);
   await page.screenshot({path:'artifacts/map-hold-google-small.png'});
  }
  await page.keyboard.press('Escape');await expect(page.locator('[data-action=pin-center]')).toBeFocused();
 }
 checks.push('popover fits 320, 768, 1024 and 1440 px; keyboard opens menu and Escape restores focus');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(500);await hold(.68,.44,false);await page.evaluate(()=>map.panTo([35.6485,140.035]));await expect(page.locator('#map-actions')).toBeHidden();
 await page.evaluate(()=>window.gm_authFailure());await expect(page.locator('.region-boundary')).toBeVisible({timeout:15000});
 const rect=await page.locator('#map').boundingBox();await page.mouse.click(rect.x+rect.width*.68,rect.y+rect.height*.44,{button:'right'});await expect(page.locator('#map-actions')).toBeVisible();await page.locator('[data-map-create=pin]').click();await expect(page.locator('#hours')).toHaveValue('2');await expect(page.locator('#hours option[value="0"]')).toHaveCount(0);
 checks.push('map movement closes anchored menu; same controller still works after Google-to-Leaflet fallback; right-click offers temporary landmark');
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors,writes}));
}finally{await browser.close();}
