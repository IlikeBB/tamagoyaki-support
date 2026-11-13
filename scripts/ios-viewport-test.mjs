import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'});
 await context.addInitScript(()=>{
  Object.defineProperty(navigator,'standalone',{value:true});window.__insetGap=47;window.__fakeScale=1;
  const viewport=visualViewport,prototype=Object.getPrototypeOf(viewport),height=Object.getOwnPropertyDescriptor(prototype,'height').get;
  Object.defineProperty(viewport,'height',{get:()=>height.call(viewport)-window.__insetGap});
  Object.defineProperty(viewport,'scale',{get:()=>window.__fakeScale});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{const req=route.request();if(req.method()!=='GET'){writes.push(new URL(req.url()).pathname);return route.abort();}if(new URL(req.url()).pathname==='/api/me')return route.fulfill({json:{user:null,expeditions:[]}});return route.continue();});
 await page.route(/\/static\/(app|finder)\.css/,async route=>{const response=await route.fetch();const text=(await response.text()).replaceAll(/env\(safe-area-inset-top(?:,0px)?\)/g,'47px').replaceAll(/env\(safe-area-inset-bottom(?:,0px)?\)/g,'34px');await route.fulfill({response,body:text});});
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map),{timeout:30000}).toBe(true);
 async function fullHeight(){
  await expect.poll(()=>page.evaluate(()=>({
   variable:document.documentElement.style.getPropertyValue('--app-height'),
   full:Math.abs(document.body.getBoundingClientRect().height-innerHeight)<1,
   bottom:innerWidth>700||Math.abs(document.querySelector('.mobile-tabs').getBoundingClientRect().bottom-innerHeight)<1
  }))).toEqual({variable:'100vh',full:true,bottom:true});
 }
 await fullHeight();expect(await page.evaluate(()=>visualViewport.height)).toBe(797);checks.push('simulated iOS cold start: visual viewport is 47px too short but app and bottom navigation fill full 844px');
 await page.evaluate(()=>{__fakeScale=1.25;__insetGap=160;visualViewport.dispatchEvent(new Event('resize'));});await fullHeight();
 await page.evaluate(()=>{__fakeScale=1;__insetGap=47;visualViewport.dispatchEvent(new Event('resize'));});await fullHeight();
 await page.locator('#place-query').focus();await page.evaluate(()=>{__insetGap=350;visualViewport.dispatchEvent(new Event('resize'));});
 await page.evaluate(()=>{document.activeElement.blur();__insetGap=47;visualViewport.dispatchEvent(new Event('resize'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await fullHeight();
 checks.push('fractional gesture scale, keyboard show/hide and BFCache return never persist a shortened body height');
 await page.screenshot({path:'artifacts/ios-viewport-recovery.png'});
 for(const size of [{width:844,height:390},{width:390,height:844},{width:1024,height:1366}]){await page.setViewportSize(size);await fullHeight();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 checks.push('iPhone portrait/landscape rotation and iPad layout recompute full viewport automatically');expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors,writes}));
}finally{await browser.close();}
