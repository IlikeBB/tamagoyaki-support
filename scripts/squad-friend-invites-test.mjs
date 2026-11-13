import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;if(origin!=='http://127.0.0.1:8079')throw new Error('Invite writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),users=[],errors=[],checks=[],suffix=randomBytes(5).toString('hex');
const headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.context.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 for(const [index,nickname] of ['小玉','小狐 <img src=x>','阿晴','不是好友','尚待接受'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const person={context,page};
  person.user=await api(person,'/auth/register','POST',{username:`sqinvite_${index}_${suffix}`,nickname,password:'Isolated friend squad invitation verification 2026!'});users.push(person);
 }
 const [a,b,c,d,e]=users;
 for(const person of [b,c]){await api(a,'/friends/requests','POST',{username:person.user.username});await api(person,'/friends/'+a.user.id+'/accept','POST');}
 await api(a,'/friends/requests','POST',{username:e.user.username});
 const room=await api(a,'/expeditions','POST',{name:'幕張好友遠征隊 '+suffix,venue:'makuhari',discoverable:false}),path='/expeditions/'+room.id;
 await api(c,'/join','POST',{code:room.code});const squad=await api(a,path+'/squads','POST',{name:'南口 <img src=x> 小隊'});await api(c,path+'/squads/join','POST',{code:squad.code});
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&!!squadInvites&&friends.ready()),{timeout:25000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 await a.page.locator('.mobile-tabs [data-tab=members]').click();await a.page.locator('[data-action=squad-invite]').click();await expect(a.page.locator('.squad-invite-person')).toHaveCount(2);
 await expect(a.page.locator('.squad-invite-person img')).toHaveCount(0);const bRow=a.page.locator('.squad-invite-person').filter({hasText:b.user.username}),cRow=a.page.locator('.squad-invite-person').filter({hasText:c.user.username});
 await expect(bRow.locator('[data-squad-friend]')).toBeEnabled();await expect(cRow.locator('[data-squad-friend]')).toBeDisabled();await expect(cRow).toContainText('已在小隊');
 await a.page.locator('#squad-friend-query').fill(b.user.username.toUpperCase());await expect(a.page.locator('.squad-invite-person')).toHaveCount(1);await expect(bRow).toContainText(b.user.nickname);
 await a.page.locator('#squad-friend-query').fill('');await a.page.locator('#squad-friend-filter').selectOption('expedition');await expect(a.page.locator('.squad-invite-person')).toHaveCount(1);await expect(cRow).toBeVisible();await a.page.locator('#squad-friend-filter').selectOption('available');await expect(bRow).toBeVisible();
 await a.page.locator('#squad-friend-query').fill('不存在的好友');await expect(a.page.locator('.squad-invite-empty')).toContainText('沒有符合');await a.page.locator('#squad-friend-query').fill('');
 checks.push('accepted friends only; nickname/account search is case-insensitive; available/current-expedition filters work; same-squad people disabled; hostile names render as text');
 const endpoint=origin+'/api'+path+'/squads/'+squad.id+'/invites';let first=true;const nonces=[];
 await a.page.route(endpoint,async route=>{nonces.push(route.request().postDataJSON().client_id);const response=await route.fetch();if(first){first=false;return route.abort('failed');}return route.fulfill({response});});
 await bRow.locator('[data-squad-friend]').click();await expect(bRow.locator('[data-squad-friend]')).toBeEnabled();await bRow.locator('[data-squad-friend]').click();await expect(a.page.locator('.squad-invite-status')).toContainText('已傳送至好友私訊');await a.page.locator('#squad-friend-filter').selectOption('all');await expect(bRow.locator('[data-squad-friend]')).toHaveText('已傳送');await expect(bRow.locator('[data-squad-friend]')).toBeDisabled();expect(nonces).toHaveLength(2);expect(nonces[0]).toBe(nonces[1]);await a.page.unroute(endpoint);
 expect((await api(b,'/me')).expeditions).toEqual([]);const messages=(await api(b,'/chat/friend/'+a.user.id+'/messages')).messages;expect(messages).toHaveLength(1);expect((await api(b,'/chat')).unread).toBe(1);
 const invite=messages[0].body.split('\n').at(-1);expect(new URL(invite).searchParams.get('squad')).toBe(squad.code);
 checks.push('uncertain network retry reuses nonce and delivers one unread DM; sending never auto-joins or shares GPS');
 await a.page.locator('#squad-friend-filter').selectOption('all');
 for(const width of [320,390,768,1024,1440]){
  await a.page.setViewportSize({width,height:844});expect(await a.page.locator('#dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390||width===1440)await a.page.screenshot({path:`artifacts/squad-friend-invites-${width}.png`});
 }
 await b.page.locator('#chat-launcher').click();await b.page.locator(`[data-chat-key="friend:${a.user.id}"]`).click();await expect(b.page.locator('.chat-squad-invite')).toBeVisible();await expect(b.page.locator('.chat-message-copy p')).toContainText(squad.name);
 await b.page.locator('.chat-squad-invite').click();await expect(b.page.locator('#dialog h2')).toHaveText('接受小隊邀請。');await expect(b.page.locator('#dialog')).toContainText('互為好友');
 const accepted=b.page.waitForRequest(r=>r.url()===origin+'/api/join'&&r.method()==='POST');await b.page.locator('#join-form [type=submit]').click();expect((await accepted).postDataJSON().squad_code).toBe(squad.code);await expect(b.page.locator('#dialog')).not.toBeVisible();
 expect((await api(b,path)).me.squad).toBe(squad.id);expect((await api(b,path)).me.scope).toBe('off');
 await d.page.goto(invite);await d.page.locator('#join-form [type=submit]').click();await expect(d.page.locator('#join-form .form-error')).toContainText('互為好友');expect((await api(d,'/me')).expeditions).toEqual([]);
 checks.push('recipient can open invitation from DM and explicitly accept; combined join is atomic; forwarded link cannot admit a nonfriend');
 await a.page.evaluate(()=>showInvite(true));await expect(a.page.locator('.squad-invite-person').filter({hasText:b.user.username}).locator('[data-squad-friend]')).toHaveText('已在小隊');
 // An older candidate request cannot replace a different squad invitation panel.
 let seen,release,finished;const ready=new Promise(resolve=>seen=resolve),gate=new Promise(resolve=>release=resolve),handled=new Promise(resolve=>finished=resolve);const delayed=async route=>{const response=await route.fetch();seen();await gate;await route.fulfill({response});finished();};
 await a.page.route(origin+'/api'+path+'/squads/'+squad.id+'/invitees',delayed);await a.page.evaluate(()=>showInvite(true));await ready;await a.page.locator('#dialog [data-action=close]').click();
 const next=await api(a,path+'/squads','POST',{name:'新的同行小隊'});await a.page.evaluate(async()=>{await refresh({fresh:true});showInvite(true);});await expect(a.page.locator('.invite-code')).toHaveText(next.code);release();await handled;await a.page.unroute(origin+'/api'+path+'/squads/'+squad.id+'/invitees',delayed);await expect(a.page.locator('.squad-invite-person')).toHaveCount(2);await expect(a.page.locator('.squad-invite-person').filter({hasText:b.user.username}).locator('[data-squad-friend]')).toBeEnabled();
 checks.push('candidate list refreshes after joining; stale responses and sent state cannot leak into a newly selected squad; responsive 320/390/768/1024/1440 layouts fit');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
