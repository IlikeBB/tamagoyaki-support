import {chromium,expect} from '@playwright/test';
const origin=process.argv[2]||'https://tamagoyaki-support.modoubletw.com';
if(!['http://127.0.0.1:8078','https://tamagoyaki-support.modoubletw.com'].includes(origin))throw new Error('Unexpected origin.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
const user={id:'help-viewer',nickname:'現場夥伴',username:'preview'},room={id:'help-preview',name:'求助地圖預覽',venue:'makuhari',owner:'helper',event_date:'2026-11-13',code:'PREVIEW1'};
let visible=true;
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){writes.push(path);return route.abort();}
  if(path==='/api/me')return route.fulfill({json:{user,expeditions:[room],help_rooms:[]}});
  if(path==='/api/friends')return route.fulfill({json:{friends:[],incoming:[],outgoing:[],sharing:false}});
  if(path==='/api/expeditions/'+room.id)return route.fulfill({json:{room,me:{user:user.id,scope:'off',squad:null},members:[{user:'helper',nickname:'需要協助的夥伴',scope:visible?'expedition':'off',lat:visible?35.6488:null,lng:visible?140.0345:null,accuracy:visible?9:null,located:visible?Date.now()/1000:null,help_shared:visible,location_visible:visible,online:true}],squads:[],pins:[],help_rooms:[],tasks:[{id:'help-task',owner:'helper',owner_name:'需要協助的夥伴',title:'需要現場協助',description:'請遠征隊夥伴幫忙',kind:'help',help_active:1,status:'open',location_mode:'publisher',lat:visible?35.6488:null,lng:visible?140.0345:null,located:visible?Date.now()/1000:null,accuracy:visible?9:null,location_visible:visible,location_source:visible?'help':null,created:Date.now()/1000,expires:Date.now()/1000+3600}]}});
  return route.continue();
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map?.isGoogle&&!state.demo&&lastTeamSyncAt>0),{timeout:25000}).toBe(true);await expect(page.locator('.help-map-marker')).toHaveCount(1);
 expect(await page.locator('.help-map-marker').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(187, 41, 36)');await page.locator('.help-map-marker').click();await expect(page.locator('#finder-source')).toHaveText('求助即時位置 · 全遠征隊可見');await page.locator('#finder-close').click();
 await page.waitForFunction(()=>{const images=[...document.querySelectorAll('#map img')].filter(i=>i.src.includes('/maps/vt'));return images.length&&images.every(i=>i.complete&&i.naturalWidth);},{},{timeout:20000});await page.waitForTimeout(400);await page.screenshot({path:'artifacts/help-google-red-marker.png'});
 checks.push('Google map shows one red exclamation mark, with expedition-wide help guidance before task acceptance');
 visible=false;await page.evaluate(()=>refresh());await expect(page.locator('.help-map-marker')).toHaveCount(0);await expect(page.locator('#finder-person')).toBeDisabled();checks.push('stale or withdrawn help location disappears without reverting to the published point');
 await page.locator('.mobile-tabs [data-tab=tasks]').click();await page.locator('#publish-small').click();await expect(page.locator('#kind option[value=dining]')).toHaveText('聚餐');await page.locator('[data-action=close]').click();
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors,writes}));
}finally{await browser.close();}
