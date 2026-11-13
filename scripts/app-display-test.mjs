import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','http://127.0.0.1:8078','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
async function pageFor(options={},installed=false){
 const context=await browser.newContext({viewport:{width:390,height:844},...options});
 if(installed)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()!=='GET'){writes.push(path);return route.abort();}
  if(path==='/api/me')return route.fulfill({json:{user:null,expeditions:[]}});
  return route.continue();
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!appDisplay&&!!map),{timeout:25000}).toBe(true);return page;
}
try{
 const page=await pageFor();await page.locator('#account-button').click();await page.locator('#dialog [data-action=app-display]').click();await expect(page.locator('#dialog-body h2')).toHaveText('用 App 模式開啟。');
 await expect(page.locator('#dialog-body')).toContainText('一般瀏覽器分頁無法自動隱藏網址列');
 await page.locator('[data-action=app-fullscreen]').click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await page.evaluate(()=>document.exitFullscreen());await expect.poll(()=>page.evaluate(()=>!document.fullscreenElement)).toBe(true);
 checks.push('explicit button enters native fullscreen; exiting works and no automatic fullscreen is requested');
 await page.evaluate(()=>appDisplay.show());
 for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:width===320?568:900});const d=await page.locator('#dialog').boundingBox();expect(d.x).toBeGreaterThanOrEqual(0);expect(d.x+d.width).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 const ios=await pageFor({isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1'});
 await ios.evaluate(()=>appDisplay.show());await expect(ios.locator('.app-install-guide h3')).toHaveText('iPhone／iPad');await expect(ios.locator('.app-install-steps').first()).toContainText('Safari');await expect(ios.locator('.app-install-steps').first()).toContainText('加入主畫面');await ios.screenshot({path:'artifacts/app-display-ios-guide.png'});
 const installed=await pageFor({},true);await installed.evaluate(()=>appDisplay.show());await expect(installed.locator('#dialog-body')).toContainText('目前已在 App 模式中');await expect(installed.locator('.app-install-guide')).toHaveCount(0);
 const manifest=await page.evaluate(async()=>await (await fetch(document.querySelector('[rel=manifest]').href)).json());expect(manifest.display).toBe('fullscreen');expect(manifest.display_override).toContain('standalone');expect(manifest.icons.some(i=>i.sizes==='512x512')).toBe(true);
 checks.push('responsive installation guide; iOS-specific instructions; installed mode detection; fullscreen manifest with standalone fallback');
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors,writes}));
}finally{await browser.close();}
