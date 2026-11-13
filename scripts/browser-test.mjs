import {chromium,expect} from '@playwright/test';
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';

const origin=process.env.QA_ORIGIN;
if(!origin||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)||origin.endsWith(':8078'))throw new Error('QA_ORIGIN must point to a separate local QA server, not production port 8078.');
const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const suffix=randomBytes(6).toString('hex'),password='A private browser QA passphrase 2026!';
const errors=[],checks=[];fs.mkdirSync('artifacts',{recursive:true});
const locationResponses=[];
async function newPage(name,lat,lng){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{latitude:lat,longitude:lng,accuracy:10}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',response=>{if(name==='Captain'&&response.url().endsWith('/location'))locationResponses.push({status:response.status(),method:response.request().method()});});
  await page.goto(origin);await expect(page.locator('.region-boundary')).toBeVisible();
  await page.locator('.header-actions [data-action=join]').click();await page.locator('[data-action=auth-register]').click();
  await page.locator('#auth-nickname').fill(name);await page.locator('#auth-username').fill(name.toLowerCase()+'_'+suffix);
  await page.locator('#auth-password').fill(password);await page.locator('#auth-confirm').fill(password);
  await page.locator('#auth-form [type=submit]').click();await expect(page.locator('#venue-catalog')).toBeVisible();return page;
}
async function snapshot(page,eid){return (await(await page.request.get(origin+'/api/expeditions/'+eid)).json());}
function taskFrom(data,id){return data.tasks.find(t=>t.id===id);}
function noMemberCoordinates(data){return data.members.every(m=>m.lat===null&&m.lng===null&&m.accuracy===null&&m.located===null);}
async function publish(page,title,type='task'){
  await page.locator(`.mobile-tabs [data-tab=${type==='task'?'tasks':'pins'}]`).click();await page.locator('#publish-small').click();
  await page.locator('#title').fill(title);await page.locator('#description').fill('隔離資料庫的瀏覽器驗證');
  await page.locator('#publish-form [type=submit]').click();await expect(page.locator('#dialog')).not.toBeVisible();
}
try{
  const a=await newPage('Captain',35.6483,140.0346);
  await a.locator('[data-action=create-mode]').first().click();await a.locator('#name').fill('場館列表測試遠征隊 '+suffix);
  await a.locator('#join-form [type=submit]').click();await expect(a.locator('#dialog')).not.toBeVisible();
  const me=(await(await a.request.get(origin+'/api/me')).json()),room=me.expeditions[0];expect(room.discoverable).toBe(1);
  const b=await newPage('Receiver',35.6490,140.0350);await b.locator(`[data-room-id="${room.id}"]`).click();await expect(b.locator('#room-name')).toHaveText(room.name);
  const c=await newPage('Bystander',35.6488,140.0348);await c.locator(`[data-room-id="${room.id}"]`).click();await expect(c.locator('#room-name')).toHaveText(room.name);
  checks.push('venue catalog joining after registration');
  await a.evaluate(()=>{
    const original=navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition=(success,error,options)=>{window.__testGPSFix=success;return original(success,error,options);};
  });
  await a.locator('#location-button').click();await a.locator('#location-form [type=submit]').click();
  await expect.poll(()=>a.evaluate(()=>state.position?.lat)).toBe(35.6483);
  const beforeTask=await snapshot(a,room.id);expect(beforeTask.me.lat).toBeNull();expect(noMemberCoordinates(await snapshot(b,room.id))).toBe(true);
  expect(locationResponses.some(r=>r.method==='PUT')).toBe(false);
  checks.push('GPS stays local before publishing a task');
  await publish(a,'隊內特典領取情報','pin');
  await expect.poll(async()=> (await snapshot(b,room.id)).pins.some(p=>p.title==='隊內特典領取情報')).toBe(true);
  const intel=(await snapshot(c,room.id)).pins.find(p=>p.title==='隊內特典領取情報');expect(intel.lat).not.toBeNull();expect(intel.lng).not.toBeNull();
  checks.push('intelligence point shared to expedition members');
  await publish(a,'35 換狐 <img src=x onerror=alert(1)>');const task=(await snapshot(a,room.id)).tasks[0];
  for(const viewer of [b,c]){const data=await snapshot(viewer,room.id),item=taskFrom(data,task.id);expect(item.lat).toBeNull();expect(item.lng).toBeNull();expect(item.location_visible).toBe(false);expect(noMemberCoordinates(data)).toBe(true);}
  await b.locator('.mobile-tabs [data-tab=tasks]').click();await expect(b.locator('.quest')).toHaveCount(1,{timeout:15000});
  await expect(b.locator('.quest')).toContainText('座標僅接取者可見');await expect(b.locator('.quest img')).toHaveCount(0);
  checks.push('unaccepted task hides coordinates and distance; task text escapes HTML');
  await b.locator('[data-action=accept]').click();await expect(b.locator('#teammate-finder')).toBeVisible();await expect(b.locator('#finder-name')).toHaveText('Captain');
  expect(taskFrom(await snapshot(b,room.id),task.id).lat).toBe(35.6483);expect(taskFrom(await snapshot(c,room.id),task.id).lat).toBeNull();expect(noMemberCoordinates(await snapshot(b,room.id))).toBe(true);
  await a.bringToFront();
  // Deliver a deterministic movement fix through the registered browser callback.
  await a.evaluate(()=>window.__testGPSFix({timestamp:Date.now(),coords:{latitude:35.64835,longitude:140.03465,accuracy:10}}));
  await expect.poll(async()=>taskFrom(await snapshot(b,room.id),task.id).location_source,{timeout:20000}).toBe('live');
  await b.bringToFront();
  await b.locator('#location-button').click();await b.locator('#location-form [type=submit]').click();await expect.poll(()=>b.evaluate(()=>state.position?.lat)).toBe(35.6490);
  await expect(b.locator('#finder-distance')).toContainText('m');checks.push('only assigned receiver sees publisher live GPS in the floating finder');
  await b.locator('#finder-collapse').click();
  await b.locator('.mobile-tabs [data-tab=tasks]').click();await b.locator('[data-action=release]').click();
  await expect.poll(async()=>taskFrom(await snapshot(b,room.id),task.id).lat).toBeNull();await expect(b.locator('#finder-guidance')).not.toBeVisible();await expect(b.locator('#finder-name')).toHaveText('');
  await c.bringToFront();await c.locator('.mobile-tabs [data-tab=tasks]').click();await expect(c.locator('[data-action=accept]')).toBeVisible({timeout:15000});await c.locator('[data-action=accept]').click();
  await expect(c.locator('#teammate-finder')).toBeVisible();await expect(c.locator('#finder-name')).toHaveText('Captain');expect(taskFrom(await snapshot(c,room.id),task.id).lat).toBe(35.64835);expect(taskFrom(await snapshot(b,room.id),task.id).lat).toBeNull();
  await a.locator('.mobile-tabs [data-tab=tasks]').click();await a.locator('[data-action=complete]').click();
  await expect.poll(async()=>taskFrom(await snapshot(c,room.id),task.id).lat).toBeNull();await c.bringToFront();await expect(c.locator('#finder-name')).toHaveText('',{timeout:15000});checks.push('release, reassignment and completion remove floating finder positions');
  await b.locator('#finder-close').click();
  await b.locator('.mobile-tabs [data-tab=members]').click();await expect(b.locator('.member-row')).toHaveCount(3);await expect(b.locator('.member-row [data-action=task-target]')).toHaveCount(0);await expect(b.locator('.member-row [data-action=view-profile]')).toHaveCount(3);
  await expect(b.locator('#panel-content')).toContainText('未分享即時位置');await b.screenshot({path:'artifacts/private-members-mobile.png'});
  await expect(b.locator('.squad-card')).toHaveCount(0);await b.locator('.mobile-tabs [data-tab=pins]').click();await b.locator('[data-action=publish]').click();await expect(b.locator('#dialog')).toContainText('標記地標');await b.locator('#dialog [data-action=close]').click();
  checks.push('member list has no personal-coordinate or find-teammate controls');
  await a.locator('.mobile-tabs [data-mobile=map]').click();for(const width of [320,390,768,1024,1440]){await a.setViewportSize({width,height:900});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await a.screenshot({path:'artifacts/private-expedition-desktop.png'});await c.reload();await expect(c.locator('#room-name')).toHaveText(room.name);expect(noMemberCoordinates(await snapshot(c,room.id))).toBe(true);
  checks.push('responsive layout and account reload retain privacy');expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
