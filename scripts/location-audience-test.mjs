import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw new Error('Use the isolated QA server on port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const suffix=randomBytes(5).toString('hex'),errors=[],checks=[];
const headers={'X-Tamago-Client':'web',Origin:origin};
async function call(p,path,method='GET',data){const response=await p.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
async function person(name){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{latitude:25.033,longitude:121.5654,accuracy:10}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const username='aud_'+randomBytes(5).toString('hex')+'_'+suffix,user=await call(page,'/auth/register','POST',{username,nickname:name,password:'Isolated location audience password 2026!'});
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>state.authenticated&&friends.ready()),{timeout:15000}).toBe(true);
 return {page,user,username};
}
async function mode(p,value){
 await p.evaluate(()=>showLocation());await p.locator('#location-scope-'+value).check();
 await expect(p.locator('#location-form input:checked')).toHaveCount(1);
 await p.locator('#location-form [type=submit]').click();await expect(p.locator('#dialog')).not.toBeVisible();
 await expect.poll(()=>p.evaluate(()=>!!state.position)).toBe(true);await p.evaluate(async()=>{await locationWrites;await friends.writes;});
 expect(await p.evaluate(()=>state.scope)).toBe(value);
}
try{
 const a=await person('發布者'),b=await person('同隊成員'),c=await person('隊外好友'),d=await person('小隊外成員');
 // Usernames use ASCII while nicknames may contain Chinese.
 const room=await call(a.page,'/expeditions','POST',{name:'定位分享對象驗證 '+suffix,venue:'makuhari',event_date:new Date().toISOString().slice(0,10)});
 await call(b.page,'/join','POST',{code:room.code});
 await call(d.page,'/join','POST',{code:room.code});
 await a.page.evaluate(room=>enterRoom(room,state.user),room);await b.page.evaluate(room=>enterRoom(room,state.user),room);
 await a.page.evaluate(()=>showLocation());await expect(a.page.locator('#location-scope-squad')).toBeDisabled();await a.page.locator('#dialog [data-action=close]').click();
 await call(a.page,'/friends/requests','POST',{username:b.username});await call(b.page,'/friends/'+a.user.id+'/accept','POST');
 const squad=await call(a.page,'/expeditions/'+room.id+'/squads','POST',{name:'集合小隊'});
 await call(b.page,'/expeditions/'+room.id+'/squads/join','POST',{code:squad.code});
 await a.page.evaluate(()=>refresh());await b.page.evaluate(()=>refresh());
 await call(a.page,'/friends/requests','POST',{username:c.username});await call(c.page,'/friends/'+a.user.id+'/accept','POST');
 await a.page.evaluate(()=>friends.sync());
 const member=async()=>{const data=await call(b.page,'/expeditions/'+room.id);return data.members.find(m=>m.user===a.user.id);};
 const friend=async()=>{const data=await call(c.page,'/friends');return data.friends.find(f=>f.id===a.user.id);};
 await c.page.evaluate(()=>showLocation());await expect(c.page.locator('#location-scope-expedition')).toBeDisabled();await c.page.locator('#dialog [data-action=close]').click();
 await mode(a.page,'friends');expect((await friend()).location_visible).toBe(true);expect((await member()).lat).toBeNull();
 await mode(a.page,'expedition');expect((await friend()).location_visible).toBe(false);expect((await member()).lat).toBe(25.033);
 await b.page.evaluate(()=>refresh());await b.page.locator('.mobile-tabs [data-tab=members]').click();
 await b.page.locator('.member-row [data-id="member:'+a.user.id+'"]').click();
 await expect(b.page.locator('#finder-source')).toContainText('遠征隊即時位置');await b.page.locator('#finder-close').click();
 await mode(b.page,'local');await expect(b.page.locator('.expedition-map-point')).toHaveCount(1);await expect(b.page.locator('.radar-chip')).toHaveCount(1);
 await b.page.evaluate(()=>{lastTeamSyncAt=Date.now()-21000;renderMap();});await expect(b.page.locator('.expedition-map-point')).toHaveCount(0);await b.page.evaluate(()=>refresh());
 await expect(b.page.locator('.expedition-map-point')).toHaveCount(1);checks.push('friends and current-expedition audiences are exclusive; explicit member sharing appears in map, radar and finder without any task');
 await mode(a.page,'squad');expect((await member()).lat).toBe(25.033);expect((await member()).scope).toBe('squad');expect((await friend()).location_visible).toBe(false);
 const outsideMember=(await call(d.page,'/expeditions/'+room.id)).members.find(m=>m.user===a.user.id);expect(outsideMember.lat).toBeNull();expect(outsideMember.location_visible).toBe(false);
 await b.page.evaluate(()=>{setPeopleFilter('squad');});await b.page.evaluate(()=>refresh());await expect(b.page.locator('.expedition-map-point')).toHaveCount(1);await expect(b.page.locator('.radar-source')).toContainText('小隊');
 await b.page.evaluate(id=>selectTarget('member','member:'+id),a.user.id);await expect(b.page.locator('#finder-source')).toContainText('小隊即時位置');await b.page.locator('#finder-close').click();
 checks.push('squad-only GPS is visible in teammate map, radar and finder; other expedition members and friends outside the squad receive no GPS');
 await mode(a.page,'local');expect((await member()).lat).toBeNull();expect((await friend()).location_visible).toBe(false);
 const watch=await a.page.evaluate(()=>state.watch);await a.page.locator('#location-dismiss').click();expect(await a.page.evaluate(()=>state.watch)).toBe(watch);
 checks.push('local-only mode revokes both audiences; closing the information card keeps local GPS running');
 const task=await call(a.page,'/expeditions/'+room.id+'/tasks','POST',{title:'任務發布點',kind:'dining',lat:25.04,lng:121.57,hours:1});
 await call(b.page,'/expeditions/'+room.id+'/tasks/'+task.id+'/accept','POST');
 await a.page.evaluate(()=>refresh());await mode(a.page,'task');
 const snapshot=await call(b.page,'/expeditions/'+room.id);expect(snapshot.tasks.find(t=>t.id===task.id).location_source).toBe('live');expect((await member()).lat).toBeNull();expect((await friend()).location_visible).toBe(false);
 await mode(a.page,'friends');const published=(await call(b.page,'/expeditions/'+room.id)).tasks.find(t=>t.id===task.id);expect(published.location_source).toBe('published');expect(published.lat).toBe(25.04);
 checks.push('task-only mode preserves receiver authorization; switching to friends stops task live GPS while retaining the explicitly published point');
 await mode(a.page,'squad');await b.page.evaluate(()=>refresh());await a.page.evaluate(()=>showLocation());
 for(const width of [320,768,1024,1440]){await a.page.setViewportSize({width,height:844});const box=await a.page.locator('#dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await a.page.setViewportSize({width:390,height:844});await a.page.screenshot({path:'artifacts/squad-location-settings.png'});await a.page.locator('#dialog [data-action=close]').click();
 await b.page.screenshot({path:'artifacts/expedition-sharing-map.png'});
 const nextSquad=await call(a.page,'/expeditions/'+room.id+'/squads','POST',{name:'切換後的小隊'});
 await a.page.evaluate(()=>refresh());await expect.poll(()=>a.page.evaluate(()=>state.scope)).toBe('off');expect(await a.page.evaluate(()=>state.watch)).toBeNull();
 await b.page.evaluate(()=>refresh());await expect(b.page.locator('.expedition-map-point')).toHaveCount(0);
 const staleWrite=await a.page.request.put(origin+'/api/expeditions/'+room.id+'/location',{headers,data:{scope:'squad',squad_id:squad.id,lat:25.033,lng:121.5654,accuracy:10}});expect(staleWrite.status()).toBe(409);
 await mode(a.page,'squad');expect((await member()).lat).toBeNull();
 await call(a.page,'/expeditions/'+room.id+'/squads/'+nextSquad.id+'/membership','DELETE');await a.page.evaluate(()=>refresh());await expect.poll(()=>a.page.evaluate(()=>state.scope)).toBe('off');
 await a.page.evaluate(()=>showLocation());await expect(a.page.locator('#location-scope-squad')).toBeDisabled();await a.page.locator('#dialog [data-action=close]').click();
 checks.push('switching or leaving a squad stops this page GPS; stale uploads cannot migrate sharing to a new squad');
 await a.page.evaluate(()=>stopTeamLocation());await call(a.page,'/expeditions/'+room.id+'/membership','DELETE');await a.page.evaluate(()=>{resetLobby();render();});await b.page.evaluate(()=>refresh());
 await expect(b.page.locator('.expedition-map-point')).toHaveCount(0);expect((await friend()).location_visible).toBe(false);
 checks.push('leaving a team revokes expedition sharing; audience controls fit mobile and desktop');
 await a.page.evaluate(()=>showLocation());await expect(a.page.locator('#location-scope-expedition')).toBeDisabled();await a.page.locator('#dialog [data-action=close]').click();
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}catch(error){console.error(JSON.stringify({error:error.message,errors}));process.exitCode=1;}
finally{await browser.close();}
