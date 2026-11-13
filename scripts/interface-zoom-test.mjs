import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 if(process.argv.includes('--ios-installed'))await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{const req=route.request();if(req.method()!=='GET'){writes.push(new URL(req.url()).pathname);return route.abort();}if(new URL(req.url()).pathname==='/api/me')return route.fulfill({json:{user:null,expeditions:[]}});return route.continue();});
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map),{timeout:30000}).toBe(true);
 const cdp=await context.newCDPSession(page);
 async function pinch(x,y,from,to){
  const points=gap=>[{x:x-gap,y,radiusX:2,radiusY:2,id:1},{x:x+gap,y,radiusX:2,radiusY:2,id:2}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(from)});
  for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(from+(to-from)*i/12)});await page.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);
 }
 const before=await page.locator('.mobile-tabs').boundingBox();await pinch(195,35,25,80);expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);const after=await page.locator('.mobile-tabs').boundingBox();expect(after).toEqual(before);
 const defaults=await page.evaluate(()=>{
  const wheel=new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,deltaY:-100});document.querySelector('.app-header').dispatchEvent(wheel);
  const key=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,ctrlKey:true,key:'+'});document.dispatchEvent(key);
  const gesture=new Event('gesturechange',{bubbles:true,cancelable:true});document.querySelector('#map').dispatchEvent(gesture);
  return {wheel:wheel.defaultPrevented,key:key.defaultPrevented,gesture:gesture.defaultPrevented};
 });expect(defaults).toEqual({wheel:true,key:true,gesture:true});checks.push('pinch outside map keeps viewport at 1×; browser zoom wheel/shortcut and native WebKit gesture defaults suppressed');
 await page.evaluate(()=>map.setView([25.033,121.5654],16));
 const rect=await page.locator('#map').boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height*.5;
 const zoom=await page.evaluate(()=>map.getZoom());await pinch(x,y,25,90);await expect.poll(()=>page.evaluate(()=>map.getZoom()),{timeout:7000}).toBeGreaterThan(zoom);expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
 const inZoom=await page.evaluate(()=>map.getZoom());await pinch(x,y,90,25);await expect.poll(()=>page.evaluate(()=>map.getZoom()),{timeout:7000}).toBeLessThan(inZoom);expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
 const outZoom=await page.evaluate(()=>map.getZoom());await page.locator('[data-action=zoom-in]').click();await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBeGreaterThan(outZoom);
 const plusZoom=await page.evaluate(()=>map.getZoom());await page.waitForTimeout(300);await page.locator('[data-action=zoom-out]').click();await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBeLessThan(plusZoom);
 checks.push('trusted two-finger touch gestures zoom map in and out without scaling interface; map +/− controls work');
 const input=page.locator('#place-query');await input.focus();expect(parseFloat(await input.evaluate(e=>getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);expect(await page.evaluate(()=>visualViewport.scale)).toBe(1);
 await page.evaluate(()=>document.activeElement.blur());await page.screenshot({path:origin.includes('modoubletw')?'artifacts/interface-zoom-google.png':'artifacts/interface-zoom-leaflet.png'});
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors,writes}));
}finally{await browser.close();}
