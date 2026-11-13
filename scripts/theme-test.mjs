import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'http://127.0.0.1:8079';
if(!['http://127.0.0.1:8079','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],writes=[],checks=[];
const user={id:'theme-viewer',nickname:'玉子燒',username:'theme'},room={id:'theme-room',owner:user.id,name:'黑夜模式驗證',venue:'makuhari',event_date:''},stamp=Date.now()/1000;
async function fixtures(page,authenticated=false){
 page.on('pageerror',error=>errors.push(error.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{const request=route.request(),path=new URL(request.url()).pathname;if(new URL(request.url()).origin!==origin)return route.continue();if(request.method()!=='GET'){writes.push(path);return route.abort();}
  if(path==='/api/config')return route.continue();
  if(path==='/api/me')return route.fulfill({json:{user:authenticated?user:null,expeditions:authenticated?[room]:[],help_rooms:[]}});
  if(path==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(path==='/api/chat')return route.fulfill({json:{conversations:[],unread:0}});
  if(path==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[],squads:[],tasks:[],help_rooms:[],pins:[{id:'theme-pin',owner:'another',owner_name:'現場夥伴',title:'領取特典',description:'排隊約十分鐘',kind:'booth',lat:35.6485,lng:140.0349,created:stamp,expires:null,following_author:true,my_vote:0,likes:0,dislikes:0,can_vote:true}]}});
  if(path.endsWith('/reports'))return route.fulfill({json:{items:[],total:0}});
  return route.fulfill({json:{items:[],expeditions:[]}});
 });
}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'light'}),page=await context.newPage();await fixtures(page);
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map),{timeout:30000}).toBe(true);await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('#settings-launcher').click();await expect(page.locator('[data-theme-toggle]')).not.toBeChecked();await page.getByRole('switch',{name:'黑夜模式'}).check();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');expect(await page.evaluate(()=>localStorage.getItem('tamago-theme'))).toBe('dark');await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content','#14211c');
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.locator('#settings-launcher').click();await expect(page.getByRole('switch',{name:'黑夜模式'})).toBeChecked();await page.locator('[data-theme-toggle]').uncheck();await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await context.close();checks.push('guest settings provide an accessible switch; light/dark choice and browser theme color persist across reloads');
 const signed=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'}),member=await signed.newPage();await fixtures(member,true);await member.goto(origin);await expect.poll(()=>member.evaluate(()=>!!map&&state.authenticated),{timeout:30000}).toBe(true);await member.evaluate(()=>clearInterval(pollTimer));await expect(member.locator('html')).toHaveAttribute('data-theme','dark');
 await member.evaluate(()=>{window.savedThemeMap=map;map.setView([35.6485,140.0349],17);selectTarget('pin','theme-pin');});await expect(member.locator('.landmark-report-board')).toBeVisible();await member.locator('#landmark-report-text').fill('尚未送出的回報');await member.evaluate(()=>window.savedThemeInput=document.querySelector('#landmark-report-text'));
 await member.locator('#settings-launcher').click();await expect(member.locator('#profile-form')).toBeVisible();await member.locator('#profile-nickname').fill('未儲存的暱稱');await member.locator('[data-theme-toggle]').uncheck();await member.locator('[data-theme-toggle]').focus();await member.keyboard.press('Space');await expect(member.locator('[data-theme-toggle]')).toBeChecked();await expect(member.locator('#profile-nickname')).toHaveValue('未儲存的暱稱');
 const google=await member.evaluate(()=>!!map.isGoogle);if(google)expect(await member.evaluate(()=>JSON.stringify(map.native.get('styles'))===JSON.stringify(TamagoTheme.googleStyles()))).toBe(true);else expect(await member.locator('.leaflet-tile-pane').evaluate(element=>getComputedStyle(element).filter)).toContain('invert(1)');
 expect(await member.evaluate(()=>savedThemeMap===map)).toBe(true);expect(await member.evaluate(()=>map.getZoom())).toBe(17);expect(await member.evaluate(()=>state.scope)).toBe('off');expect(await member.evaluate(()=>state.target.id)).toBe('theme-pin');await member.locator('#dialog [data-action=close]').click();await expect(member.locator('#landmark-report-text')).toHaveValue('尚未送出的回報');expect(await member.evaluate(()=>savedThemeInput===document.querySelector('#landmark-report-text'))).toBe(true);
 const contrast=await member.locator('.app-header').evaluate(element=>{const style=getComputedStyle(element);const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});expect(contrast).toBeGreaterThan(4.5);
 for(const width of [320,390,768,1024,1440]){await member.setViewportSize({width,height:900});expect(await member.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(width===390)await member.screenshot({path:`artifacts/dark-mode-${google?'google':'leaflet'}-390.png`});}
 await member.locator('#settings-launcher').click();if(google)await member.screenshot({path:'artifacts/dark-mode-google-settings.png'});await member.locator('[data-theme-toggle]').uncheck();await member.emulateMedia({colorScheme:'dark'});await expect(member.locator('html')).toHaveAttribute('data-theme','light');
 checks.push('system appearance supplies the initial theme; explicit choice overrides it; switching preserves map instance, zoom, target, nickname and report drafts, keeps GPS off, updates map colors and fits 320–1440px');
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,origin,google,checks,errors,writes}));await signed.close();
}finally{await browser.close();}
