import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;if(origin!=='http://127.0.0.1:8079')throw Error('Use isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),errors=[],checks=[],suffix=randomBytes(5).toString('hex');
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers:{'X-Tamago-Client':'web',Origin:origin}});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
async function person(name){const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const user=await api({page},'/auth/register','POST',{username:'manage_'+randomBytes(4).toString('hex')+suffix,nickname:name,password:'Isolated profile content passphrase 2026!'});return {page,context,user};}
try{
 const a=await person('隊長'),b=await person('留言作者'),c=await person('隊外夥伴'),room=await api(a,'/expeditions','POST',{name:'個人內容管理 '+suffix,venue:'makuhari'}),path='/expeditions/'+room.id;
 await api(b,'/join','POST',{code:room.code});
 const create=(kind,hours,title)=>api(b,path+'/pins','POST',{kind,hours,title,description:'第一行\n<script>window.contentInjected=true</script>',lat:35.6483,lng:140.0346});
 const temp=await create('meet',2,'臨時集合點'),permanent=await create('shop',0,'官店 <img src=x>'),message=await create('message',24,'自己的地面留言');
 await api(a,path+'/pins/'+permanent.id+'/vote','PUT',{value:1});await api(a,path+'/pins/'+message.id+'/vote','PUT',{value:1});
 for(const p of [a,b,c]){await p.page.goto(origin);await expect.poll(()=>p.page.evaluate(()=>state.authenticated&&!!map&&!!profilePage),{timeout:20000}).toBe(true);await p.page.evaluate(()=>clearInterval(pollTimer));}
 await b.page.evaluate(id=>selectTarget('pin',id),permanent.id);await b.page.locator('#account-button').click();await b.page.locator('[data-profile-action=tab][data-tab=landmarks]').click();
 await expect(b.page.locator('.profile-content-card')).toHaveCount(2);await expect(b.page.locator('#profile-records')).toContainText('定期情報點');expect(await b.page.evaluate(()=>window.contentInjected)).toBeUndefined();await expect(b.page.locator('#profile-records img,#profile-records script')).toHaveCount(0);
 const before=await api(b,'/profiles/me');
 await b.page.locator('[data-profile-action=tab][data-tab=messages]').click();await expect(b.page.locator('.profile-content-card')).toHaveCount(1);await expect(b.page.locator('.profile-content-card')).toContainText('自己的地面留言');
 await b.page.locator('[data-profile-action=remove-content]').click();await expect(b.page.locator('.profile-content-confirm')).toBeVisible();await b.page.locator('[data-profile-action=cancel-content]').click();expect((await api(b,'/profiles/me/content?kind=message')).total).toBe(1);
 let requests=0;const lost=async route=>{requests++;if(requests===1){await route.fetch();await route.abort('failed');}else await route.continue();};await b.page.route('**/api/profiles/me/content/'+message.id,lost);
 await b.page.locator('[data-profile-action=remove-content]').click();await b.page.locator('[data-profile-action=confirm-content]').click();await expect(b.page.locator('#profile-retry')).toBeVisible();
 await b.page.locator('[data-profile-action=confirm-content]').click();await expect(b.page.locator('.profile-content-card')).toHaveCount(0);await b.page.unroute('**/api/profiles/me/content/'+message.id,lost);expect(requests).toBe(2);
 const after=await api(b,'/profiles/me');expect(after.reputation).toEqual(before.reputation);expect(after.rpg).toEqual(before.rpg);checks.push('separate owner lists, safe text, deletion confirmation, lost-response retry and preserved feedback/XP');
 // A deletion finishing after closing/reopening the profile must refresh the new view.
 await b.page.locator('[data-profile-action=tab][data-tab=landmarks]').click();let release,seen,finished;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>seen=resolve),done=new Promise(resolve=>finished=resolve);
 const delayed=async route=>{seen();await gate;await route.continue();finished();};await b.page.route('**/api/profiles/me/content/'+permanent.id,delayed);
 await b.page.locator(`[data-content-id="${permanent.id}"] [data-profile-action=remove-content]`).click();await b.page.locator('[data-profile-action=confirm-content]').click();await started;
 await b.page.locator('#profile-close').click();await b.page.locator('#account-button').click();await b.page.locator('[data-profile-action=tab][data-tab=landmarks]').click();await expect(b.page.locator('[data-profile-action=remove-content]').first()).toBeDisabled();release();await done;
 await expect(b.page.locator('.profile-content-card')).toHaveCount(1);await expect(b.page.locator('[data-profile-action=remove-content]')).toBeEnabled();expect(await b.page.evaluate(()=>state.target)).toBeNull();expect((await api(b,path)).pins.some(pin=>pin.id===permanent.id)).toBe(false);await b.page.unroute('**/api/profiles/me/content/'+permanent.id,delayed);
 checks.push('completion after profile reopening refreshes its list and clears the selected map marker');
 for(let index=0;index<14;index++)await create('meet',0,'分頁情報點 '+index);
 await b.page.locator('[data-profile-action=tab][data-tab=landmarks]').click();await expect(b.page.locator('.profile-content-card')).toHaveCount(12);await b.page.locator('#profile-more').click();await expect(b.page.locator('.profile-content-card')).toHaveCount(15);
 const ids=await b.page.locator('.profile-content-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.contentId));expect(new Set(ids).size).toBe(15);checks.push('management paginates across all authored content without duplicates');
 // A late landmark list must not replace the message list.
 let releaseList,seenList,doneList;const listGate=new Promise(resolve=>releaseList=resolve),listStarted=new Promise(resolve=>seenList=resolve),listDone=new Promise(resolve=>doneList=resolve);const holdList=async route=>{seenList();await listGate;await route.continue();doneList();};await b.page.route('**/api/profiles/me/content?kind=landmark*',holdList);
 await b.page.locator('[data-profile-action=tab][data-tab=landmarks]').click();await listStarted;await b.page.locator('[data-profile-action=tab][data-tab=messages]').click();await expect(b.page.locator('.profile-empty')).toContainText('目前沒有可管理的留言');releaseList();await listDone;await b.page.unroute('**/api/profiles/me/content?kind=landmark*',holdList);await expect(b.page.locator('.profile-content-card')).toHaveCount(0);
 await b.page.locator('[data-profile-action=tab][data-tab=landmarks]').click();
 for(const width of [320,390,768,1024,1440]){await b.page.setViewportSize({width,height:900});expect(await b.page.locator('#profile-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);expect(await b.page.locator('.profile-tabs').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);if(width===390){await b.page.locator('.profile-tabs').scrollIntoViewIfNeeded();await b.page.screenshot({path:'artifacts/profile-content-390.png'});}}
 await b.page.locator('#news-launcher').click();await expect(b.page.locator('#news-dialog')).toBeVisible();await b.page.locator('#news-close').click();await expect(b.page.locator('#news-launcher')).toBeFocused();await b.page.locator('#profile-close').click();await b.page.locator('#settings-launcher').click();await expect(b.page.locator('#profile-form')).toBeVisible();await b.page.locator('#dialog [data-action=close]').click();
 await c.page.evaluate(uid=>profilePage.open(uid),b.user.id);await expect(c.page.locator('[data-tab=landmarks],[data-tab=messages]')).toHaveCount(0);await expect(c.page.locator('#news-launcher')).toBeHidden();await c.page.locator('#profile-close').click();
 checks.push('stale tab responses are ignored; management fits mobile/desktop; other profiles reveal no controls; header opens account settings and News remains in own profile');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
