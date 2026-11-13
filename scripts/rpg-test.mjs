import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw new Error('RPG writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const users=[],errors=[],checks=[],suffix=randomBytes(5).toString('hex'),password='RPG isolated test passphrase 2026!';
try{
 for(const nickname of ['玉子燒冒險者','支援隊友','另一位隊友']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Tamago-Client':'web'}});
  const response=await context.request.post(origin+'/api/auth/register',{data:{username:'rpg_'+users.length+'_'+suffix,nickname,password}});expect(response.ok()).toBe(true);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));users.push({context,page,user:await response.json()});
 }
 const [a,b,c]=users,request=a.context.request;
 const profile=async person=>(await person.context.request.get(origin+'/api/profiles/me')).json();
 const room=await (await request.post(origin+'/api/expeditions',{data:{name:'幕張支援隊・RPG '+suffix,venue:'makuhari',event_date:''}})).json(),path='/api/expeditions/'+room.id;
 for(const person of [b,c])expect((await person.context.request.post(origin+'/api/join',{data:{code:room.code}})).ok()).toBe(true);
 const tasks=[];
 for(let i=0;i<3;i++){
  const response=await request.post(origin+path+'/tasks',{data:{title:['幫忙拍一張遠征合照','一起吃晚餐','交換一份小小紀念'][i],kind:i===1?'dining':'trade',lat:35.648,lng:140.034,hours:6}});expect(response.ok()).toBe(true);tasks.push(await response.json());
 }
 const pin=await (await request.post(origin+path+'/pins',{data:{title:'南口集合・永久情報點',kind:'meet',lat:35.648,lng:140.034,hours:0}})).json();
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&!state.demo&&!!taskFeedback),{timeout:25000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 expect((await profile(a)).rpg).toMatchObject({level:1,xp:0});
 await b.page.locator('.mobile-tabs [data-tab=tasks]').click();
 const card=b.page.locator('.quest').filter({has:b.page.locator('h2',{hasText:tasks[0].title})});
 await expect(card.locator('[data-action=task-vote][data-value="1"]')).toBeEnabled();await card.locator('[data-action=task-vote][data-value="1"]').click();await expect(card.locator('[data-action=task-vote][data-value="1"]')).toHaveAttribute('aria-pressed','true');
 expect(await b.page.evaluate(id=>state.tasks.find(t=>t.id===id).lat,tasks[0].id)).toBeNull();
 expect((await profile(a)).rpg).toMatchObject({xp:20,progress:20});
 let ready,release;const seen=new Promise(resolve=>ready=resolve),gate=new Promise(resolve=>release=resolve);
 const oldSnapshot=async route=>{const response=await route.fetch();ready();await gate;await route.fulfill({response});};
 await b.page.route(origin+path,oldSnapshot);const refreshInFlight=b.page.evaluate(()=>refresh({fresh:true}));await seen;
 await card.locator('[data-action=task-vote][data-value="-1"]').click();await expect(card.locator('[data-action=task-vote][data-value="-1"]')).toHaveAttribute('aria-pressed','true');
 release();await refreshInFlight;await b.page.unroute(origin+path,oldSnapshot);await expect(card.locator('[data-action=task-vote][data-value="-1"]')).toHaveAttribute('aria-pressed','true');
 expect((await profile(a)).rpg).toMatchObject({xp:-5,progress:0,needed:105});
 await card.locator('[data-action=task-vote][data-value="-1"]').click();await expect(card.locator('[data-action=task-vote][data-value="-1"]')).toHaveAttribute('aria-pressed','false');
 checks.push('task votes update XP; switching and retracting recompute exactly; late snapshots cannot undo votes; negative XP keeps Lv.1; rating does not reveal task GPS');
 for(const [person,task] of [[b,tasks[0]],[b,tasks[1]],[b,tasks[2]],[c,tasks[0]]])expect((await person.context.request.put(origin+path+'/tasks/'+task.id+'/vote',{data:{value:1}})).ok()).toBe(true);
 await b.page.evaluate(async()=>{await refresh({fresh:true});setTab('pins');});await expect(b.page.locator('.pin-row .landmark-feedback')).toHaveCount(1);await b.page.locator('.pin-row [data-action=pin-vote][data-value="1"]').click();await expect(b.page.locator('.pin-row [data-value="1"]')).toHaveAttribute('aria-pressed','true');
 expect((await profile(a)).rpg).toMatchObject({xp:100,level:2,progress:0});await a.page.locator('#account-button').click();
 expect((await profile(a)).reputation.landmarks).toBe(0);
 for(const width of [320,390,768,1024,1440]){
  await a.page.setViewportSize({width,height:900});expect(await a.page.locator('#profile-content').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(a.page.locator('.profile-rpg,.profile-stats')).toHaveCount(0);
  if(width===390||width===1440)await a.page.screenshot({path:`artifacts/rpg-profile-${width}.png`});
 }
 await a.page.locator('#profile-edit').click();await expect(a.page.locator('.profile-rpg,.profile-stats')).toHaveCount(0);await a.page.locator('#profile-edit').click();
 await a.page.locator('[data-profile-action=tab][data-tab=tasks]').click();await expect(a.page.locator('.profile-content-card')).toHaveCount(3);await expect(a.page.locator('[data-profile-action=task-room]')).toHaveCount(3);
 await a.page.locator('[data-profile-action=task-room]').first().click();await expect(a.page.locator('#profile-dialog')).not.toBeVisible();await expect(a.page.locator('.quest')).toHaveCount(3);await expect(a.page.locator('.quest [data-action=task-vote][data-value="1"]').first()).toBeDisabled();
 checks.push('task and landmark votes retain XP while the simplified profile hides RPG/stats and opens the authored task board');
 await request.post(origin+path+'/tasks/'+tasks[0].id+'/complete');await b.page.evaluate(async()=>{await refresh({fresh:true});setTab('tasks');});await expect(b.page.locator('.quest')).toHaveCount(2);
 const historical=(await (await b.context.request.get(origin+'/api/profiles/me/feedback?kind=given')).json()).items.find(item=>item.id===tasks[0].id);expect(historical.status).toBe('done');expect((await b.context.request.put(origin+path+'/tasks/'+tasks[0].id+'/vote',{data:{value:0}})).ok()).toBe(true);
 await b.context.request.delete(origin+path+'/membership');expect((await b.context.request.put(origin+path+'/tasks/'+tasks[1].id+'/vote',{data:{value:0}})).ok()).toBe(true);
 expect((await profile(a)).rpg).toMatchObject({xp:60,level:1});await a.page.locator('#account-button').click();await a.page.locator('[data-profile-action=tab][data-tab=tasks]').click();await expect(a.page.locator('.profile-content-card')).toHaveCount(2);
 checks.push('completed quests stay hidden; task feedback and XP survive completion; owner of historical votes can withdraw after leaving and XP/level decrease correctly');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
