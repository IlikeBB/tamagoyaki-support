import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Friend invitation writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const suffix=randomBytes(5).toString('hex'),password='Isolated chat friend invitation password 2026!',errors=[],checks=[];
const headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 const users=[];
 for(const [index,nickname] of ['小玉','小狐 <img src=x>','遠征夥伴'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));const person={context,page,username:`invite_${index}_${suffix}`};
  person.user=await api(person,'/auth/register','POST',{username:person.username,nickname,password});users.push(person);
 }
 const [a,b,c]=users,room=await api(a,'/expeditions','POST',{name:'聊天好友邀請驗證 '+suffix,venue:'taiwan'});
 for(const person of [b,c])await api(person,'/join','POST',{code:room.code});
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&friends.ready()),{timeout:20000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 const image=await b.page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d');ctx.fillStyle='#f7b84b';ctx.fillRect(0,0,320,320);return canvas.toDataURL('image/png');});
 await api(b,'/profiles/me/media/avatar','PUT',{image});
 for(const person of users)await api(person,`/chat/expedition/${room.id}/messages`,'POST',{body:'大家好，我是'+person.user.nickname,client_id:randomBytes(12).toString('hex')});
 const openChat=async person=>{await person.page.evaluate(id=>chat.open('expedition',id),room.id);await expect(person.page.locator('#chat-messages>li')).toHaveCount(3);};
 const openPerson=async(person,other)=>{await person.page.locator(`[data-chat-person="${other.user.id}"]`).first().click();await expect(person.page.locator('#chat-friend-dialog [data-friend-name]')).toHaveText(other.user.nickname);};
 await openChat(a);await expect(a.page.locator(`[data-chat-person="${a.user.id}"]`)).toHaveCount(0);
 await expect(a.page.locator(`[data-chat-person="${b.user.id}"] img`)).toHaveCount(1);await expect(a.page.locator('#chat-messages script')).toHaveCount(0);
 await openPerson(a,b);await expect(a.page.locator('[data-friend-send]')).toBeVisible();await a.page.screenshot({path:'artifacts/chat-friend-invite-card.png'});
 await a.page.locator('[data-friend-send]').click();await expect(a.page.locator('[data-friend-status]')).toContainText('好友邀請已送出');await expect(a.page.locator('[data-friend-send]')).toBeHidden();
 expect((await api(a,'/friends')).outgoing.map(p=>p.id)).toContain(b.user.id);await a.page.locator('[data-friend-close]').click();
 await openPerson(a,b);await expect(a.page.locator('[data-friend-status]')).toContainText('等待對方接受');await expect(a.page.locator('[data-friend-send]')).toBeHidden();await a.page.locator('[data-friend-close]').click();
 checks.push('chat shows current avatar or initial; own avatar cannot invite; tapping another avatar sends a single invitation and prevents repeat sends');
 await b.page.evaluate(()=>friends.sync());await b.page.evaluate(()=>news.open());
 await expect(b.page.locator('#news-invitations')).toBeVisible();await expect(b.page.locator('.news-invite')).toHaveCount(1);await expect(b.page.locator('#account-news-unread')).toBeVisible();
 await b.page.locator('[data-news-filter=friends]').click();await expect(b.page.locator('#news-list .news-item')).toHaveCount(0);
 await b.page.screenshot({path:'artifacts/news-friend-invitation-mobile.png'});
 for(const width of [320,768,1024,1440]){await b.page.setViewportSize({width,height:844});const box=await b.page.locator('#news-dialog').boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(width);expect(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await b.page.setViewportSize({width:390,height:844});
 let releaseSnapshot,seenSnapshot;
 const held=new Promise(resolve=>releaseSnapshot=resolve),seen=new Promise(resolve=>seenSnapshot=resolve);
 let holdOnce=true;
 const holdOldSnapshot=async route=>{
  if(route.request().method()==='GET'&&holdOnce){holdOnce=false;const response=await route.fetch();seenSnapshot();await held;return route.fulfill({response});}
  return route.continue();
 };
 await b.page.route('**/api/friends',holdOldSnapshot);await b.page.evaluate(()=>{void friends.sync();});await seen;
 await b.page.locator('[data-news-response=accept]').click();
 await expect.poll(async()=>(await api(a,'/friends')).friends.some(p=>p.id===b.user.id)).toBe(true);
 releaseSnapshot();
 await expect(b.page.locator('.news-invite')).toHaveCount(0);await expect(b.page.locator('[data-news-filter=friends]')).toHaveText('好友邀請');
 await b.page.unroute('**/api/friends',holdOldSnapshot);
 await expect(b.page.locator('#account-news-unread')).toBeHidden();
 expect((await api(b,'/friends')).friends.map(p=>p.id)).toContain(a.user.id);expect((await api(a,'/friends')).friends.map(p=>p.id)).toContain(b.user.id);
 expect((await api(b,'/friends')).sharing).toBe(false);await b.page.locator('#news-close').click();
 await a.page.evaluate(()=>friends.sync());await openPerson(a,b);await expect(a.page.locator('[data-friend-status]')).toHaveText('你們已經是好友。');await a.page.locator('[data-friend-close]').click();
 checks.push('recipient can accept in News even with an older friend sync in flight; acceptance does not enable GPS; existing friends cannot be invited again');
 await openPerson(a,c);await a.page.locator('[data-friend-send]').click();await expect(a.page.locator('[data-friend-status]')).toContainText('好友邀請已送出');await a.page.locator('[data-friend-close]').click();
 await c.page.evaluate(()=>friends.sync());await openChat(c);await openPerson(c,a);await expect(c.page.locator('[data-friend-news]')).toBeVisible();await c.page.locator('[data-friend-news]').click();
 await expect(c.page.locator('#news-dialog')).toBeVisible();await expect(c.page.locator('[data-news-filter=friends]')).toHaveAttribute('aria-pressed','true');
 await c.page.locator('[data-news-response=reject]').click();await expect(c.page.locator('.news-invite')).toHaveCount(0);
 expect((await api(c,'/friends')).friends).toEqual([]);expect((await api(a,'/friends')).outgoing).toEqual([]);
 await c.page.locator('#news-close').click();await c.page.locator('#chat-close').click();
 checks.push('incoming invitation also links from the chat card to News; rejecting removes the request without becoming friends');
 // Logout must clear a private request even while News remains open.
 await openPerson(a,c);await a.page.locator('[data-friend-send]').click();await expect(a.page.locator('[data-friend-status]')).toContainText('好友邀請已送出');await a.page.locator('[data-friend-close]').click();
 await c.page.evaluate(()=>friends.sync());await c.page.evaluate(()=>news.open());await expect(c.page.locator('.news-invite')).toHaveCount(1);
 await c.page.evaluate(()=>logout());await expect(c.page.locator('.news-invite')).toHaveCount(0);await expect(c.page.locator('[data-news-filter=friends]')).toBeHidden();
 expect(await c.page.evaluate(()=>localStorage.getItem('tamago-news-read'))).not.toContain(a.user.id);
 checks.push('logout clears private invitation UI; private invitation identities never enter persisted public-news read records');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
