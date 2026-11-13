import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw new Error('Use the isolated QA server on port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const suffix=randomBytes(6).toString('hex'),errors=[],checks=[];
const headers={'X-Tamago-Client':'web','Origin':origin};
async function call(page,path,method='GET',data){
 const response=await page.request.fetch(origin+'/api'+path,{method,data,headers});
 expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();
}
async function person(label,lat,lng,savedFilter){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{latitude:lat,longitude:lng,accuracy:10}});
 if(savedFilter)await context.addInitScript(value=>{if(localStorage.getItem('tamago-people-filter')===null)localStorage.setItem('tamago-people-filter',value);},savedFilter);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const username=label+'_'+suffix,user=await call(page,'/auth/register','POST',{username,nickname:label==='alice'?'小狐 <img src=x>':label==='bob'?'玉子':'遠征夥伴',password:'Isolated friendship browser password 2026!'});
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>state.authenticated&&friends?.ready()),{timeout:15000}).toBe(true);
 return {page,user,username};
}
async function friendsPage(page){await page.locator('.mobile-tabs [data-tab=friends]').click();await page.evaluate(()=>friends.sync());}
async function gps(page,share){
 await page.evaluate(()=>showLocation());await page.locator('#location-scope-'+(share?'friends':'local')).check();await page.locator('#location-form [type=submit]').click();
 await expect.poll(()=>page.evaluate(()=>!!state.position)).toBe(true);await page.evaluate(()=>friends.writes);
}
async function markerCount(page,count){await expect(page.locator('.teammate-map-point')).toHaveCount(count);}
try{
 const a=await person('alice',25.033,121.5654),b=await person('bob',25.0325,121.5645,'all'),c=await person('carol',25.0345,121.5665,'expedition');
 for(const page of [a.page,b.page]){
  await expect(page.locator('#people-filter input[value=friends]')).toBeChecked();
  expect(await page.evaluate(()=>localStorage.getItem('tamago-people-filter'))).toBe('friends');
 }
 await b.page.reload();await expect.poll(()=>b.page.evaluate(()=>state.authenticated&&friends.ready())).toBe(true);
 await expect(b.page.locator('#people-filter input[value=friends]')).toBeChecked();
 await expect(c.page.locator('#people-filter input[value=expedition]')).toBeChecked();
 checks.push('new browsers default to friends; saved all preference migrates persistently; enabled preferences remain intact');
 await friendsPage(a.page);await a.page.locator('#friend-username').fill(b.username);await a.page.locator('#friend-invite-form [type=submit]').click();
 await expect(a.page.locator('#friend-requests')).toContainText('等待對方接受');
 await friendsPage(b.page);await expect(b.page.locator('#friend-requests')).toContainText('等待你接受');
 await b.page.locator('[data-action=friend-accept]').click();await expect(b.page.locator('#friend-list .friend-row')).toHaveCount(1);
 expect((await call(b.page,'/me')).expeditions).toEqual([]);await markerCount(b.page,0);
 checks.push('mutual friend invitation works without joining any expedition or squad');
 await a.page.evaluate(()=>friends.sync());await a.page.locator('#friend-share-toggle').click();await expect(a.page.locator('#location-scope-friends')).toBeChecked();
 await a.page.locator('#location-form [type=submit]').click();await expect.poll(()=>a.page.evaluate(()=>!!state.position)).toBe(true);await a.page.evaluate(()=>friends.writes);
 await friendsPage(b.page);await b.page.locator('[data-action=friend-find]').click();
 await expect(b.page.locator('#region-toggle')).toHaveAttribute('aria-pressed','false');
 await markerCount(b.page,1);await expect(b.page.locator('#finder-name')).toHaveText('小狐 <img src=x>');await expect(b.page.locator('#finder-source')).toContainText('好友即時位置');
 await expect(b.page.locator('.teammate-map-point img')).toHaveCount(0);await b.page.locator('#finder-close').click();
 await gps(b.page,false);await expect(b.page.locator('.radar-chip')).toHaveCount(1);await expect(b.page.locator('.friend-map-point .presence-fan svg')).toHaveCount(1);
 expect((await call(a.page,'/friends')).friends[0].location_visible).toBe(false);
 expect((await call(c.page,'/friends')).friends).toEqual([]);
 checks.push('opt-in Taiwan location and direction fans visible to accepted friends only');
 const room=await call(a.page,'/expeditions','POST',{name:'好友篩選驗證 '+suffix,venue:'makuhari',event_date:new Date().toISOString().slice(0,10)});
 await call(b.page,'/join','POST',{code:room.code});await call(c.page,'/join','POST',{code:room.code});
 const squad=await call(a.page,`/expeditions/${room.id}/squads`,'POST',{name:'同行好友'});
 await call(b.page,`/expeditions/${room.id}/squads/join`,'POST',{code:squad.code});
 const task=await call(c.page,`/expeditions/${room.id}/tasks`,'POST',{title:'篩選中的已接任務',kind:'dining',lat:25.0345,lng:121.5665,hours:1});
 await call(b.page,`/expeditions/${room.id}/tasks/${task.id}/accept`,'POST');
 await b.page.evaluate(async room=>enterRoom(room,state.user),room);await b.page.evaluate(()=>friends.sync());await gps(b.page,true);
 await markerCount(b.page,1);await expect(b.page.locator('.radar-chip')).toHaveCount(1);
 expect((await call(b.page,`/expeditions/${room.id}`)).members.every(m=>m.lat===null&&m.lng===null)).toBe(true);
 const stage=await b.page.locator('.map-stage').boundingBox();await b.page.touchscreen.tap(stage.x+3,stage.y+stage.height/4);
 await expect(b.page.locator('#people-filter')).toBeVisible();
 await expect(b.page.locator('#people-filter input[value=all]')).toBeDisabled();
 await expect(b.page.locator('#people-filter-blocked')).toHaveText('暫停使用');
 await b.page.locator('#people-filter label:has(input[value=all])').click({force:true});
 await expect(b.page.locator('#people-filter input[value=friends]')).toBeChecked();
 for(const [filter,count] of [['friends',1],['expedition',2],['squad',1]]){
  await b.page.locator(`#people-filter input[value=${filter}]`).check();await markerCount(b.page,count);
  await expect(b.page.locator(`[data-people-count=${filter}]`)).toHaveText(String(count));
 }
 await b.page.evaluate(()=>{
  const input=document.querySelector('#people-filter input[value=all]');
  input.disabled=false;input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await expect(b.page.locator('#people-filter input[value=all]')).toBeDisabled();
 await expect(b.page.locator('#people-filter input[value=squad]')).toBeChecked();await markerCount(b.page,1);
 expect(await b.page.evaluate(()=>localStorage.getItem('tamago-people-filter'))).toBe('squad');
 await b.page.locator('#people-filter input[value=squad]').focus();await b.page.keyboard.press('ArrowDown');
 await expect(b.page.locator('#people-filter input[value=friends]')).toBeChecked();
 await b.page.keyboard.press('ArrowDown');await expect(b.page.locator('#people-filter input[value=expedition]')).toBeChecked();await markerCount(b.page,2);
 await b.page.locator('#people-filter input[value=friends]').check();
 await b.page.screenshot({path:'artifacts/people-filter-blocked-mobile.png'});
 await b.page.locator('#people-filter-close').click();
 await expect(b.page.locator('#people-filter-handle')).toBeFocused();
 await b.page.locator('#people-filter-handle').click();await b.page.keyboard.press('Escape');await expect(b.page.locator('#people-filter')).not.toBeVisible();
 checks.push('all is visibly disabled, skipped by keyboard and rejected through change events; friend/expedition/squad markers still filter correctly');
 await b.page.evaluate(id=>selectTarget('task',id),task.id);
 await expect(b.page.locator('#people-filter input[value=expedition]')).toBeChecked();await markerCount(b.page,2);
 await expect(b.page.locator('#finder-name')).toHaveText('遠征夥伴');await b.page.locator('#finder-map').click();
 expect(await b.page.evaluate(()=>localStorage.getItem('tamago-people-filter'))).toBe('expedition');
 await b.page.locator('#finder-close').click();
 checks.push('finding an authorized task target switches to expedition rather than re-enabling all');
 await b.page.locator('#location-dismiss').click();
 await b.page.screenshot({path:'artifacts/friends-arrows-mobile.png'});
 for(const width of [320,768,1024,1440]){
  await b.page.setViewportSize({width,height:900});await b.page.locator('#people-filter-handle').click();
  const box=await b.page.locator('#people-filter').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  expect(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await b.page.locator('#people-filter-close').click();
 }
 await expect(b.page.locator('.map-title,.map-legend')).toHaveCount(0);
 await b.page.setViewportSize({width:390,height:844});await friendsPage(b.page);await b.page.screenshot({path:'artifacts/friends-page-mobile.png'});
 await b.page.locator('#friend-username').fill('still_typing');await b.page.evaluate(()=>friends.sync());await expect(b.page.locator('#friend-username')).toHaveValue('still_typing');
 const watch=await b.page.evaluate(()=>state.watch);
 await b.page.evaluate(()=>setPeopleFilter('friends'));
 await b.page.evaluate(()=>stopTeamLocation());await call(b.page,`/expeditions/${room.id}/membership`,'DELETE');await b.page.evaluate(()=>{resetLobby();render();showMap();});
 expect(await b.page.evaluate(()=>state.watch)).toBe(watch);expect(await b.page.evaluate(()=>friends.sharing)).toBe(true);
 await markerCount(b.page,1);checks.push('friend sharing and map remain active after leaving an expedition');
 await a.page.evaluate(()=>friends.stop());await b.page.evaluate(()=>friends.sync());await markerCount(b.page,0);
 await expect(b.page.locator('.radar-chip')).toHaveCount(0);
 await friendsPage(b.page);await b.page.locator('#friend-list [data-action=friend-remove]').click();await expect(b.page.locator('#friend-list .friend-row')).toHaveCount(0);
 await a.page.evaluate(()=>friends.sync());expect((await call(a.page,'/friends')).friends).toEqual([]);
 await b.page.evaluate(()=>stopLocation());checks.push('stop sharing and removal revoke location immediately');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}catch(error){console.error(JSON.stringify({error:error.message,errors}));process.exitCode=1;}
finally{await browser.close();}
