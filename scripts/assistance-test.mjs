import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(!origin||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)||origin.endsWith(':8078'))throw new Error('An isolated QA_ORIGIN is required.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],users=[],locationRequests=[],suffix=randomBytes(5).toString('hex');
try{
 for(const name of ['owner','member','other']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{latitude:25.033,longitude:121.5654,accuracy:8},extraHTTPHeaders:{'X-Tamago-Client':'web'}});
  const response=await context.request.post(origin+'/api/auth/register',{data:{username:'help_'+name+'_'+suffix,nickname:name,password:'Private help browser QA passphrase 2026!'}});expect(response.ok()).toBe(true);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));users.push({context,page,user:await response.json()});
 }
 const [a,b,c]=users;
 const create=async name=>await (await a.context.request.post(origin+'/api/expeditions',{data:{name,venue:'makuhari',event_date:new Date().toISOString().slice(0,10)}})).json();
 const room=await create('求助測試 '+suffix),other=await create('另一支遠征隊 '+suffix),path='/api/expeditions/'+room.id;
 await b.context.request.post(origin+'/api/join',{data:{code:room.code}});await c.context.request.post(origin+'/api/join',{data:{code:other.code}});
 for(const user of users){await user.page.goto(origin);await expect.poll(()=>user.page.evaluate(()=>!state.demo&&!!map),{timeout:20000}).toBe(true);}
 const page=a.page;page.on('response',r=>{if(new URL(r.url()).pathname==='/api/help/location')locationRequests.push({method:r.request().method(),status:r.status()});});
 await page.evaluate(async id=>{await enterRoom(state.rooms.find(r=>r.id===id),state.user);},room.id);
 async function publish(title){
  await page.locator('.mobile-tabs [data-tab=tasks]').click();await page.locator('#publish-small').click();await page.locator('#kind').selectOption('help');
  await expect(page.locator('#help-setup')).toBeVisible();await expect(page.locator('#hours')).toBeHidden();await expect(page.locator('#help-coord')).toContainText('25.03');await page.locator('#title').fill(title);
  await page.screenshot({path:'artifacts/help-publish-mobile.png'});
  await page.locator('#publish-form [type=submit]').click();await expect(page.locator('#dialog')).not.toBeVisible();await expect.poll(()=>page.evaluate(()=>assistance.active&&assistance.watch!=null&&!assistance.pending)).toBe(true);
 }
 await publish('需要協助 '+suffix);
 let snapshot=await (await a.context.request.get(origin+path)).json();const first=snapshot.tasks.find(t=>t.help_active);expect(first.location_source).toBe('help');expect(first.status).toBe('open');
 await b.page.evaluate(()=>refresh());await expect(b.page.locator('.help-map-marker')).toHaveCount(1);await b.page.evaluate(id=>selectTarget('task',id),first.id);await expect(b.page.locator('#finder-source')).toHaveText('求助即時位置 · 全遠征隊可見');await b.page.locator('#finder-close').click();await b.page.locator('.help-map-marker').click();await b.page.locator('#finder-close').click();await b.page.screenshot({path:'artifacts/help-red-marker-mobile.png'});
 await c.page.evaluate(()=>refresh());await expect(c.page.locator('.help-map-marker')).toHaveCount(0);
 const otherSnapshot=await (await c.context.request.get(origin+'/api/expeditions/'+other.id)).json();expect(otherSnapshot.members.find(m=>m.user===a.user.id).lat).toBeNull();
 checks.push('choosing help requires GPS; publication immediately broadcasts to all members of its own room; another joined room cannot see it; red exclamation marker opens live finder without acceptance');
 await page.locator('[data-mobile=map]').click();await page.locator('[data-action=location]').first().click();await expect(page.locator('#dialog-body h2')).toHaveText('求助定位分享中。');await expect(page.locator('#location-form')).toHaveCount(0);await expect(page.locator('#dialog [data-action=stop-location]')).toHaveCount(0);await page.locator('#dialog [data-action=close]').last().click();
 await a.context.setGeolocation({latitude:25.034,longitude:121.566,accuracy:7});
 await expect.poll(async()=>{const data=await (await b.context.request.get(origin+path)).json();return data.tasks.find(t=>t.id===first.id).lat;},{timeout:25000}).toBeCloseTo(25.034,4);
 await publish('第二個求助 '+suffix);
 snapshot=await (await a.context.request.get(origin+path)).json();const second=snapshot.tasks.find(t=>t.help_active&&t.id!==first.id);expect(snapshot.help_rooms[0].tasks).toBe(2);
 await page.locator(`[data-action=cancel][data-id="${first.id}"]`).click();await expect.poll(()=>page.evaluate(()=>assistance.rooms[0]?.tasks)).toBe(1);expect(await page.evaluate(()=>assistance.watch!=null)).toBe(true);
 await page.reload();await expect.poll(()=>page.evaluate(()=>assistance.active&&assistance.watch!=null&&!assistance.pending)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>state.rooms.length)).toBe(2);
 await page.evaluate(async id=>{await enterRoom(state.rooms.find(r=>r.id===id),state.user);},other.id);expect(await page.evaluate(()=>assistance.active&&assistance.watch!=null)).toBe(true);await expect(page.locator('.help-map-marker')).toHaveCount(0);
 await page.locator('[data-action=location]').first().click();await page.locator(`[data-action=help-room][data-id="${room.id}"]`).click();await page.locator(`[data-action=cancel][data-id="${second.id}"]`).click();
 await expect.poll(()=>page.evaluate(()=>!assistance.active&&assistance.watch==null&&state.scope==='off')).toBe(true);
 await b.page.evaluate(()=>refresh());await expect(b.page.locator('.help-map-marker')).toHaveCount(0);
 checks.push('help settings prevent changing audience; updates follow GPS; deleting one of multiple requests keeps sharing; reload and room switch keep the watch; deleting the last request stops it');
 await a.context.clearPermissions();await page.locator('#publish-small').click();await page.locator('#kind').selectOption('help');await expect(page.locator('#help-coord')).toContainText('定位未獲允許');await page.locator('#title').fill('拒絕定位不可發布');await page.locator('#publish-form [type=submit]').click();await expect(page.locator('#publish-form .form-error')).toContainText('求助需要有效的 GPS 定位');
 expect((await (await a.context.request.get(origin+path)).json()).tasks.filter(t=>t.help_active&&['open','accepted'].includes(t.status))).toHaveLength(0);
 checks.push('denied geolocation blocks publishing help and does not fall back to a selected map point');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}catch(error){if(users[0])console.log(JSON.stringify({diagnostic:await users[0].page.evaluate(()=>({scope:state.scope,position:state.position,helper:{rooms:assistance.rooms,watch:assistance.watch,pending:assistance.pending,error:assistance.error,lastError:assistance.lastError,lastSent:assistance.lastSent},toast:document.getElementById('toast').textContent,hidden:document.hidden})).catch(()=>null),locationRequests}));throw error;}finally{await browser.close();}
