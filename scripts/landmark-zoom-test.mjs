import {chromium,expect} from '@playwright/test';
const origin=process.env.QA_ORIGIN||process.argv[2]||'https://tamagoyaki-support.modoubletw.com';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],writes=[],checks=[];
const user={id:'zoom-viewer',nickname:'縮放驗證',username:'preview'},room={id:'zoom-room',owner:user.id,name:'地標縮放驗證',venue:'makuhari',event_date:''};
const point={lat:35.6483,lng:140.0346},pin={id:'zoom-pin',owner:'landmark-owner',owner_name:'地標作者',title:'縮放保留地標',kind:'meet',...point,created:Date.now()/1000,expires:null,following_author:true,reported_by_me:false,my_vote:0};
const previewPin={...pin,id:'zoom-preview-pin',title:'從列表查看的地標',following_author:false};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.continue();if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/config')return route.continue();
  if(url.pathname==='/api/me')return route.fulfill({json:{user,expeditions:[room],help_rooms:[]}});
  if(url.pathname==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(url.pathname==='/api/chat')return route.fulfill({json:{conversations:[],unread:0}});
  if(url.pathname==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[],squads:[],tasks:[],pins:[pin,previewPin],help_rooms:[]}});
  return route.fulfill({json:{items:[],expeditions:[]}});
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map&&!state.demo&&state.pins.length===2),{timeout:30000}).toBe(true);await page.evaluate(()=>clearInterval(pollTimer));
 await page.evaluate(point=>map.setView(point,16),point);await expect(page.getByTitle(pin.title,{exact:true})).toBeVisible();
 const diagnostics=()=>page.evaluate(title=>{const el=document.querySelector(`[title="${title}"]`),r=el?.getBoundingClientRect(),box=document.querySelector('#map').getBoundingClientRect();return {provider:map.isGoogle?'google':'leaflet',zoom:map.getZoom(),pins:state.pins.length,filtered:state.pins.filter(pin=>pinFilters.matches(pin)).length,markers:document.querySelectorAll(`[title="${title}"]`).length,style:el?{display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,opacity:getComputedStyle(el).opacity,left:el.style.left,top:el.style.top}:null,inside:r?{x:r.x>=box.x&&r.x<box.right,y:r.y>=box.y&&r.y<box.bottom}:null};},pin.title);
 await expect(page.getByTitle(previewPin.title,{exact:true})).toHaveCount(0);
 await page.evaluate(id=>selectTarget('pin',id),previewPin.id);await expect(page.getByTitle(previewPin.title,{exact:true})).toBeVisible();await page.locator('[data-action=target-close]').click();
 await page.evaluate(async()=>{map.zoomOut();await refresh({fresh:true});});
 await expect(page.getByTitle(previewPin.title,{exact:true})).toBeVisible();
 checks.push('closing the information card keeps a manually revealed landmark visible across zoom and synchronization');
 for(const zoom of [17,18,15,12,16,19,14,16]){
  await page.evaluate(({point,zoom})=>map.setView(point,zoom),{point,zoom});await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBe(zoom);await page.waitForTimeout(400);
  const status=await diagnostics();await expect(page.getByTitle(pin.title,{exact:true})).toBeVisible();expect(status.inside).toEqual({x:true,y:true});
 }
 checks.push('landmark stays visible through repeated zoom-in and zoom-out at its center');
 for(let index=0;index<8;index++){
  await page.evaluate(async index=>{map[index%2?'zoomOut':'zoomIn']();await refresh({fresh:true});},index);await page.waitForTimeout(200);await expect(page.getByTitle(pin.title,{exact:true})).toBeVisible();
 }
 checks.push('synchronization during zoom preserves the visible landmark');
 const cdp=await page.context().newCDPSession(page),box=await page.locator('#map').boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height*.6;
 for(const scale of [1.5,.65]){
  // Leaflet ignores a new pinch until its preceding zoom animation has settled.
  await page.waitForTimeout(450);
  const zoom=await page.evaluate(()=>map.getZoom()),touches=distance=>[{x:cx-distance,y:cy},{x:cx+distance,y:cy}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(55)});
  for(let step=1;step<=8;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(55*(1+(scale-1)*step/8))});await page.waitForTimeout(20);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>page.evaluate(value=>Math.abs(map.getZoom()-value),zoom)).toBeGreaterThan(.1);
  await expect(page.getByTitle(pin.title,{exact:true})).toBeVisible();await expect(page.getByTitle(previewPin.title,{exact:true})).toBeVisible();
 }
 await cdp.detach();checks.push('two-finger pinch-in and pinch-out keep both followed and manually viewed landmarks visible');
 await page.locator('[data-action=zoom-in]').click();await expect(page.getByTitle(pin.title,{exact:true})).toBeVisible();await page.locator('[data-action=zoom-out]').click();await expect(page.getByTitle(pin.title,{exact:true})).toBeVisible();
 await expect(page.getByTitle(previewPin.title,{exact:true})).toBeVisible();
 expect(await page.evaluate(id=>{const pin=state.pins.find(item=>item.id===id);return [pin.following_author,pin.reported_by_me,pin.my_vote];},previewPin.id)).toEqual([false,false,0]);
 await page.locator('#pin-filter-handle').click();await page.locator('#pin-filter-following').uncheck();await expect(page.getByTitle(previewPin.title,{exact:true})).toHaveCount(0);await expect(page.getByTitle(pin.title,{exact:true})).toHaveCount(0);await page.locator('#pin-filter-following').check();await expect(page.getByTitle(pin.title,{exact:true})).toBeVisible();await expect(page.getByTitle(previewPin.title,{exact:true})).toHaveCount(0);await page.locator('[data-pin-filter-close]').click();
 checks.push('manual viewing does not follow or vote; changing the filters clears the extra marker and respects the selected categories');
 await page.screenshot({path:`artifacts/landmark-zoom-${origin.startsWith('https')?'google':'leaflet'}.png`,animations:'disabled'});
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors,writes}));
}finally{await browser.close();}
