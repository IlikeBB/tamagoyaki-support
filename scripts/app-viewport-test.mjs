import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
try{
 for(const safeArea of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
  await page.route('**/api/**',route=>{
   const req=route.request();if(req.method()!=='GET'){writes.push(new URL(req.url()).pathname);return route.abort();}
   if(new URL(req.url()).pathname==='/api/me')return route.fulfill({json:{user:null,expeditions:[]}});return route.continue();
  });
  if(safeArea)await page.route(/\/static\/(app|finder)\.css/,async route=>{
   const response=await route.fetch();const text=(await response.text()).replaceAll(/env\(safe-area-inset-top(?:,0px)?\)/g,'47px').replaceAll(/env\(safe-area-inset-bottom(?:,0px)?\)/g,'34px');
   await route.fulfill({response,body:text});
  });
  await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map&&appDisplay.installed),{timeout:25000}).toBe(true);
  for(const size of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:768,height:900},{width:1440,height:900}]){
   await page.setViewportSize(size);await expect.poll(()=>page.evaluate(()=>Math.abs(document.body.getBoundingClientRect().height-visualViewport.height)<1)).toBe(true);
   const geometry=await page.evaluate(()=>{
    const b=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
    return {header:b('.app-header'),workspace:b('.workspace'),map:b('.map-stage'),tabs:b('.mobile-tabs'),body:b('body'),height:visualViewport.height,scrollHeight:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,innerWidth};
   });
   expect(Math.abs(geometry.header.bottom-geometry.workspace.top)).toBeLessThan(1);
   expect(Math.abs(geometry.workspace.bottom-(size.width<=700?geometry.tabs.top:geometry.height))).toBeLessThan(1);
   expect(Math.abs(geometry.map.bottom-geometry.workspace.bottom)).toBeLessThan(1);
   expect(geometry.width).toBeLessThanOrEqual(geometry.innerWidth);expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height+1);
   if(size.width<=700){expect(Math.abs(geometry.tabs.bottom-geometry.height)).toBeLessThan(1);expect(geometry.tabs.height).toBe(safeArea?98:64);}
   if(size.width===390)await page.screenshot({path:`artifacts/app-viewport-${safeArea?'safe-area':'edge'}.png`});
  }
  checks.push(`installed app fills viewport at phone, tablet, desktop and short landscape sizes${safeArea?'; simulated top 47px and bottom 34px safe areas are included exactly once':''}`);
  await context.close();
 }
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors,writes}));
}finally{await browser.close();}
