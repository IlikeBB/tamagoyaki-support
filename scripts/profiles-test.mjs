import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw new Error('Profile writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const users=[],errors=[],checks=[],suffix=randomBytes(5).toString('hex'),password='Isolated profiles passphrase 2026!';
try{
 for(const name of ['小玉 🥚','小狐','外隊夥伴']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Tamago-Client':'web'}});
  await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
  const username='profile_'+users.length+'_'+suffix,response=await context.request.post(origin+'/api/auth/register',{data:{username,nickname:name,password}});expect(response.ok()).toBe(true);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));users.push({context,page,user:await response.json(),username});
 }
 const [a,b,c]=users,room=await (await a.context.request.post(origin+'/api/expeditions',{data:{name:'幕張的遠征回憶 '+suffix,venue:'makuhari',event_date:'2026-11-13'}})).json(),path='/api/expeditions/'+room.id;
 await b.context.request.post(origin+'/api/join',{data:{code:room.code}});
 await a.context.request.post(origin+'/api/friends/requests',{data:{username:b.username}});await b.context.request.post(origin+'/api/friends/'+a.user.id+'/accept');
 const pin=await (await a.context.request.post(origin+path+'/pins',{data:{title:'南口洗手間 <img src=x onerror="window.injected=true">',description:'往右側走，剛才不必排隊。',kind:'toilet',lat:35.648,lng:140.034,hours:2}})).json();
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&!!map&&!!profilePage),{timeout:25000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 await a.page.locator('#account-button').click();await expect(a.page.locator('.profile-name h3')).toHaveText(a.user.nickname);await expect(a.page.locator('.profile-wall-card')).toHaveCount(1);
 await a.page.locator('#profile-edit').click();await a.page.locator('#profile-name-input').fill('小玉的遠征日記');const bio='每一場 LIVE 都要找到彼此 🥚\n<script>window.injected=true</script>';await a.page.locator('#profile-bio-input').fill(bio);
 const fixture=await a.page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='#e7b44f';ctx.fillRect(0,0,600,600);ctx.fillStyle='#48694b';ctx.fillRect(120,100,360,400);ctx.fillStyle='#fffefa';ctx.font='250px sans-serif';ctx.fillText('T',215,390);return canvas.toDataURL('image/jpeg');});
 const file={name:'profile-photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(fixture.split(',')[1],'base64')};
 for(const slot of ['avatar','banner']){
  const chooser=a.page.waitForEvent('filechooser');await a.page.locator(`[data-profile-action=photo][data-slot=${slot}]`).click();await (await chooser).setFiles(file);await expect(a.page.locator('#profile-crop')).toBeVisible();
  await a.page.locator('#profile-crop-zoom').fill('1.25');await a.page.locator('#profile-crop-x').fill('35');await a.page.locator('[data-crop-save]').click();await expect(a.page.locator('#profile-crop')).toBeHidden({timeout:15000});
  await expect(a.page.locator('#profile-name-input')).toHaveValue('小玉的遠征日記');await expect(a.page.locator('#profile-bio-input')).toHaveValue(bio);
 }
 await a.page.locator('#profile-details-form [type=submit]').click();await expect(a.page.locator('.profile-name h3')).toHaveText('小玉的遠征日記');await expect(a.page.locator('.profile-bio')).toHaveText(bio);await expect(a.page.locator('#profile-content script')).toHaveCount(0);
 const images=await a.page.locator('.profile-portrait>img,.profile-banner>img').evaluateAll(images=>images.map(i=>[i.naturalWidth,i.naturalHeight]));expect(images).toEqual([[1200,400],[320,320]]);await expect(a.page.locator('#account-avatar')).toBeVisible();
 checks.push('account opens profile; JPEG crop uploads canonical avatar/banner PNG; unsaved text survives uploads; escaped nickname/bio remain plain text');
 await a.page.screenshot({path:'artifacts/profiles-own-mobile.png'});
 for(const size of [{width:320,height:568},{width:768,height:900},{width:1024,height:900},{width:1440,height:900},{width:390,height:844}]){
  await a.page.setViewportSize(size);const rect=await a.page.locator('#profile-dialog').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(size.width+1);expect(rect.y+rect.height).toBeLessThanOrEqual(size.height+1);expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(size.width===1440)await a.page.screenshot({path:'artifacts/profiles-own-desktop.png'});
 }
 expect(await a.page.locator('#profile-dialog').evaluate(e=>e.getBoundingClientRect().bottom)).toBe(844);
 await a.page.locator('#profile-edit').click();await a.page.locator('#profile-bio-input').focus();await a.page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>400});visualViewport.dispatchEvent(new Event('resize'));});await expect(a.page.locator('#profile-dialog')).toHaveClass(/profile-keyboard/);expect(await a.page.locator('#profile-dialog').evaluate(e=>e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(400);
 await a.page.evaluate(()=>{document.activeElement.blur();delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});await expect(a.page.locator('#profile-dialog')).not.toHaveClass(/profile-keyboard/);expect(await a.page.evaluate(()=>document.body.getBoundingClientRect().height)).toBe(844);
 await a.page.locator('[data-profile-action=removeAvatar]').click();await expect(a.page.locator('.profile-portrait>img')).toHaveCount(0);await a.page.locator('#profile-edit').click();
 await a.page.locator('#profile-settings').click();await expect(a.page.locator('#dialog')).toBeVisible();await a.page.locator('[data-action=close]').click();
 checks.push('320/768/1024/1440 layouts fit; installed app fills height; image removal and account-settings entry work');
 await b.page.locator('.mobile-tabs [data-tab=pins]').click();await expect(b.page.locator('.pin-row')).toHaveCount(1);await expect(b.page.locator('.pin-row [data-value="1"]')).toBeEnabled();await b.page.locator('.pin-row [data-value="1"]').click();await expect(b.page.locator('.pin-row [data-value="1"]')).toHaveAttribute('aria-pressed','true');
 await b.page.locator('[data-action=pin-target]').click();await expect(b.page.locator('#target-card [data-value="1"]')).toHaveAttribute('aria-pressed','true');await b.page.locator('#target-card [data-value="-1"]').click();await expect(b.page.locator('#target-card')).toBeHidden();await expect(b.page.locator('#pin-count')).toHaveText('0');expect(await b.page.evaluate(title=>layers.getLayers().some(layer=>layer.options?.title===title),pin.title)).toBe(false);
 await b.page.evaluate(()=>setTab('pins'));await expect(b.page.locator('.pin-row')).toHaveCount(0);await b.page.evaluate(uid=>profilePage.open(uid),a.user.id);await expect(b.page.locator('.profile-name h3')).toHaveText('小玉的遠征日記');await expect(b.page.locator('#profile-edit')).toBeHidden();await expect(b.page.locator('.profile-tabs button')).toHaveText(['遠征隊牆']);
 const feedback=await (await a.context.request.get(origin+'/api/profiles/me/feedback')).json();expect(feedback.items[0].title).toBe(pin.title);expect(feedback.items[0].invalidated).toBeTruthy();expect(await b.page.evaluate(()=>window.injected)).toBeUndefined();await b.page.locator('#profile-close').click();
 const ownResponse=await a.context.request.post(origin+path+'/pins',{data:{title:'作者自己的情報點',description:'僅供權限驗證',kind:'meet',lat:35.648,lng:140.034,hours:2}});expect(ownResponse.ok()).toBe(true);const ownPin=await ownResponse.json();await a.page.evaluate(async()=>{await refresh();setTab('pins');});await expect(a.page.locator('.pin-row [data-value="1"]')).toBeDisabled();await a.context.request.delete(origin+path+'/pins/'+ownPin.id);
 checks.push('switching to a net negative vote immediately removes map marker, target card, list entry and count; author cannot vote; archived feedback remains in the author profile');
 await b.context.request.delete(origin+path+'/membership');await b.page.locator('#account-button').click();await expect(b.page.locator('.profile-wall-card')).toContainText('曾經參加');
 const given=await (await b.context.request.get(origin+'/api/profiles/me/feedback?kind=given')).json();expect(given.items).toHaveLength(1);expect(given.items[0].removed).toBeTruthy();
 expect((await b.context.request.put(origin+path+'/pins/'+pin.id+'/vote',{data:{value:0}})).ok()).toBe(true);
 const archived=await (await a.context.request.get(origin+'/api/profiles/me/feedback')).json();expect(archived.items[0]).toMatchObject({likes:0,dislikes:0});expect(archived.items[0].invalidated).toBeTruthy();
 checks.push('leaving preserves participation wall; archived feedback is retained when the simplified profile hides evaluation sections');
 // A delayed old task tab must never replace the wall.
 let release,seen,finished;const gate=new Promise(r=>release=r),received=new Promise(r=>seen=r),done=new Promise(r=>finished=r);const hold=async route=>{seen();await gate;await route.continue();finished();};await b.page.route('**/api/profiles/me/content?kind=task*',hold);
 await b.page.locator('[data-profile-action=tab][data-tab=tasks]').click();await received;await b.page.locator('[data-profile-action=tab][data-tab=wall]').click();await expect(b.page.locator('.profile-wall-card')).toHaveCount(1);release();await done;await b.page.unroute('**/api/profiles/me/content?kind=task*',hold);await expect(b.page.locator('.profile-wall-card')).toHaveCount(1);
 await b.page.locator('#profile-close').click();await b.page.evaluate(()=>setTab('friends'));await b.page.locator('.friend-row [data-action=view-profile]').click();await expect(b.page.locator('.profile-name h3')).toHaveText('小玉的遠征日記');
 await b.page.evaluate(()=>logout());await expect(b.page.locator('#profile-dialog')).not.toBeVisible();await expect(b.page.locator('#profile-content')).toBeEmpty();
 await b.context.request.post(origin+'/api/auth/login',{data:{username:c.username,password}});await b.page.reload();await expect.poll(()=>b.page.evaluate(()=>state.user.username)).toBe(c.username);await b.page.locator('#account-button').click();await expect(b.page.locator('.profile-wall-card')).toHaveCount(0);
 checks.push('fast tab changes ignore stale responses; friend-avatar profile entry works; logout clears profile and account switch cannot reuse prior data');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}catch(error){console.log(JSON.stringify({diagnostic:await users[0]?.page.evaluate(()=>({status:document.querySelector('#profile-status').textContent,profile:profilePage.data?.profile,tab:profilePage.tab})).catch(()=>null)}));throw error;}
finally{await browser.close();}
