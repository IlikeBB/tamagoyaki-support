import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Squad chat writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],suffix=randomBytes(5).toString('hex'),users=[],headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 for(const [index,nickname] of ['小玉','小狐','阿晴'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),person={context,page};
  page.on('pageerror',error=>errors.push(error.message));person.user=await api(person,'/auth/register','POST',{username:`squadchat_${index}_${suffix}`,nickname,password:'Isolated squad chat verification password 2026!'});users.push(person);
 }
 const [a,b,c]=users,room=await api(a,'/expeditions','POST',{name:'幕張同行遠征隊 '+suffix,venue:'makuhari'}),path='/expeditions/'+room.id;
 for(const person of [b,c])await api(person,'/join','POST',{code:room.code});
 for(const person of [b,c]){await api(a,'/friends/requests','POST',{username:person.user.username});await api(person,'/friends/'+a.user.id+'/accept','POST');}
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&!state.demo&&chat.owner===state.user.id),{timeout:20000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 await a.page.locator('.mobile-tabs [data-tab=members]').click();await a.page.locator('[data-action=create-squad]').click();await a.page.locator('#squad-value').fill('南口集合小隊');await a.page.locator('#squad-form [type=submit]').click();await expect(a.page.locator('#dialog')).toBeHidden();
 const first=(await api(a,path)).squads[0];expect(await a.page.evaluate(id=>chat.contacts.some(contact=>contact.id==='squad:'+id),first.id)).toBe(true);
 await a.page.locator('#chat-launcher').click();await a.page.locator('[data-chat-filter=squad]').focus();await a.page.keyboard.press('Enter');await expect(a.page.locator('[data-chat-filter=squad]')).toHaveAttribute('aria-pressed','true');await expect(a.page.locator(`[data-chat-key="squad:${first.id}"]`)).toBeVisible();await a.page.locator(`[data-chat-key="squad:${first.id}"]`).click();
 await expect(a.page.locator('#chat-title')).toHaveText(first.name);await expect(a.page.locator('#chat-contact-subtitle')).toContainText('目前小隊成員可讀');
 const text='南口集合 🥚\n<img src=x onerror="window.squadInjected=true">';await a.page.locator('#chat-input').fill(text);await a.page.locator('#chat-send').click();await expect(a.page.locator('#chat-input')).toHaveValue('');await expect(a.page.locator('#chat-messages')).toContainText(text);await expect(a.page.locator('#chat-messages img')).toHaveCount(0);
 checks.push('creating a squad immediately adds its room to Messages; squad filter works with keyboard; safe plain-text messages send in the new room');
 await b.page.locator('#chat-launcher').click();await b.page.locator('[data-chat-filter=squad]').click();await expect(b.page.locator('#chat-list-empty')).toContainText('建立或加入小隊');
 await api(b,path+'/squads/join','POST',{code:first.code});await b.page.evaluate(()=>chat.tick());await expect(b.page.locator('#chat-unread')).toHaveText('1');await b.page.locator(`[data-chat-key="squad:${first.id}"]`).click();await expect(b.page.locator('#chat-messages')).toContainText(text);await expect.poll(async()=>(await api(b,'/chat')).unread).toBe(0);
 await b.page.locator('#chat-input').fill('收到，馬上過去！');await b.page.locator('#chat-send').click();await expect(b.page.locator('#chat-input')).toHaveValue('');await a.page.evaluate(()=>chat.tick());await expect(a.page.locator('#chat-messages')).toContainText('收到，馬上過去');
 const second=await api(c,path+'/squads','POST',{name:'物販小隊'});await c.page.evaluate(()=>chat.tick());expect((await api(c,'/chat')).conversations.filter(contact=>contact.kind==='squad').map(contact=>contact.target)).toEqual([second.id]);
 checks.push('joining by invitation grants current squad history; unread and read markers sync; another squad in the same expedition has its own private room');
 for(const width of [320,390,768,1024,1440]){
  await a.page.setViewportSize({width,height:844});const box=await a.page.locator('#chat-dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(845);expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390||width===1440)await a.page.screenshot({path:`artifacts/squad-chat-${width}.png`});
 }
 await a.page.locator('#chat-input').fill('尚未送出的舊小隊草稿');await expect.poll(()=>a.page.evaluate(()=>chat.fetching)).toBe(false);
 const priorHistory=await api(a,'/chat/squad/'+first.id+'/messages');
 let release,seen,finished;const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>seen=resolve),handled=new Promise(resolve=>finished=resolve);let once=true;
 const delayed=async route=>{if(once){once=false;seen();await gate;try{await route.fulfill({json:priorHistory});}finally{finished();}return;}return route.continue();};
 await a.page.route('**/api/chat/squad/'+first.id+'/messages*',delayed);await a.page.evaluate(()=>{void chat.fetchMessages(true);});await received;
 await api(a,path+'/squads/join','POST',{code:second.code});await a.page.evaluate(()=>chat.tick());await expect(a.page.locator('#chat-conversation')).toBeHidden();release();await handled;await a.page.unroute('**/api/chat/squad/'+first.id+'/messages*',delayed);
 await expect(a.page.locator('#chat-messages>li')).toHaveCount(0);expect(await a.page.evaluate(id=>chat.drafts.has('squad:'+id),first.id)).toBe(false);
 await a.page.evaluate(()=>refresh({fresh:true}));await a.page.locator('#chat-close').click();await a.page.setViewportSize({width:390,height:844});await a.page.locator('.squad-group.is-current [data-action=squad-chat]').click();await expect(a.page.locator('#chat-title')).toHaveText(second.name);await a.page.locator('#chat-close').click();
 await b.page.locator('#chat-close').click();await b.page.locator('.mobile-tabs [data-tab=members]').click();await b.page.evaluate(()=>refresh({fresh:true}));await b.page.locator('.squad-group.is-current [data-action=leave-squad]').click();await expect(b.page.locator('.squad-intro')).toContainText('尚未加入小隊');
 await b.page.locator('#chat-launcher').click();await expect(b.page.locator(`[data-chat-key="squad:${first.id}"]`)).toHaveCount(0);await expect(b.page.locator('#chat-list-empty')).toContainText('建立或加入小隊');
 const denied=await a.page.request.get(origin+'/api/chat/squad/'+first.id+'/messages');expect(denied.status()).toBe(403);expect((await api(b,path)).squads.some(squad=>squad.id===first.id)).toBe(false);
 checks.push('320px through desktop fit; switching removes old room and draft, ignores a delayed history response; own squad shortcut opens its room; empty squad dissolves and its chat disappears');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
