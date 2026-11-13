import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw new Error('Chat writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],users=[],suffix=randomBytes(5).toString('hex'),password='Isolated chat QA passphrase 2026!';
const requestId=()=>randomBytes(12).toString('hex');
try{
 for(const name of ['小玉','小狐','遠征夥伴','另一隊友']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Tamago-Client':'web'}});
  if(!users.length)await context.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true}));
  const username='chat_'+users.length+'_'+suffix,response=await context.request.post(origin+'/api/auth/register',{data:{username,nickname:name,password}});expect(response.ok()).toBe(true);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));users.push({context,page,user:await response.json(),username});
 }
 const [a,b,c,d]=users;
 const room=await (await a.context.request.post(origin+'/api/expeditions',{data:{name:'幕張現場集合隊 '+suffix,venue:'makuhari',event_date:'2026-11-13'}})).json();
 const other=await (await a.context.request.post(origin+'/api/expeditions',{data:{name:'另一支遠征隊 '+suffix,venue:'pia',event_date:'2026-11-13'}})).json();
 for(const person of [b,c])await person.context.request.post(origin+'/api/join',{data:{code:room.code}});await d.context.request.post(origin+'/api/join',{data:{code:other.code}});
 await a.context.request.post(origin+'/api/friends/requests',{data:{username:b.username}});await b.context.request.post(origin+'/api/friends/'+a.user.id+'/accept');
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&!!map&&chat.owner===state.user.id),{timeout:25000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 const openFriend=async(person,target)=>{await person.page.evaluate(async id=>chat.open('friend',id),target);await expect(person.page.locator('#chat-conversation')).toBeVisible();};
 async function sendUI(person,body){await person.page.locator('#chat-input').fill(body);await person.page.locator('#chat-send').click();await expect(person.page.locator('#chat-input')).toHaveValue('');await expect(person.page.locator('#chat-messages')).toContainText(body);}
 await a.page.locator('.mobile-tabs [data-tab=friends]').click();await expect(a.page.locator('[data-action=friend-chat]')).toHaveCount(1);await a.page.locator('[data-action=friend-chat]').click();await expect(a.page.locator('#chat-title')).toHaveText(b.user.nickname);
 const text='我在南口附近，穿白色外套 🥚\n<img src=x onerror="window.chatInjected=true">';await sendUI(a,text);
 await b.page.evaluate(()=>chat.tick());await expect(b.page.locator('#chat-unread')).toHaveText('1');await openFriend(b,a.user.id);await expect(b.page.locator('#chat-messages')).toContainText(text);
 await expect.poll(async()=>(await (await b.context.request.get(origin+'/api/chat')).json()).unread).toBe(0);expect(await b.page.evaluate(()=>window.chatInjected)).toBeUndefined();await expect(b.page.locator('#chat-messages img,#chat-messages script')).toHaveCount(0);
 checks.push('friend-row shortcut, multiline/emoji DMs, unread badge clears on viewing, message HTML stays plain text');
 // A successful own-send must not skip another person's message between polls.
 const reply='收到，我過去找你！';await b.context.request.post(origin+'/api/chat/friend/'+a.user.id+'/messages',{data:{body:reply,client_id:requestId()}});
 await sendUI(a,'我等你，到了再說一聲。');await expect(a.page.locator('#chat-messages')).toContainText(reply);
 let failOnce=true;const postPath='**/api/chat/friend/'+b.user.id+'/messages';
 const failAfterCommit=async route=>{if(route.request().method()==='POST'&&failOnce){failOnce=false;const result=await route.fetch();expect(result.ok()).toBe(true);return route.abort('failed');}return route.continue();};
 await a.page.route(postPath,failAfterCommit);await a.page.locator('#chat-input').fill('網路重試只出現一次');await a.page.locator('#chat-send').click();await expect(a.page.locator('#chat-error')).not.toBeEmpty();await expect(a.page.locator('#chat-input')).toHaveValue('網路重試只出現一次');await a.page.unroute(postPath,failAfterCommit);await a.page.locator('#chat-send').click();await expect(a.page.locator('#chat-input')).toHaveValue('');
 const history=(await (await a.context.request.get(origin+'/api/chat/friend/'+b.user.id+'/messages')).json()).messages;expect(history.filter(m=>m.body==='網路重試只出現一次')).toHaveLength(1);
 // Typing the next draft while the previous send is pending must preserve it.
 let release,seen;const received=new Promise(resolve=>seen=resolve),gate=new Promise(resolve=>release=resolve);
 const hold=async route=>{if(route.request().method()==='POST'){seen();await gate;}return route.continue();};await a.page.route(postPath,hold);
 await a.page.locator('#chat-input').fill('先送這則');await a.page.locator('#chat-send').click();await received;await a.page.locator('#chat-input').fill('下一則草稿還在');release();await expect(a.page.locator('#chat-messages')).toContainText('先送這則');await expect(a.page.locator('#chat-send')).toBeEnabled();await expect(a.page.locator('#chat-input')).toHaveValue('下一則草稿還在');await a.page.unroute(postPath,hold);
 checks.push('own sends preserve intervening incoming messages; lost response retries deduplicate; next draft survives a pending send');
 await a.page.screenshot({path:'artifacts/chat-friend-mobile.png'});
 for(const size of [{width:320,height:568},{width:768,height:900},{width:1440,height:900},{width:390,height:844}]){
  await a.page.setViewportSize(size);const rect=await a.page.locator('#chat-dialog').boundingBox(),send=await a.page.locator('#chat-send').boundingBox();expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(size.width+1);expect(send.y+send.height).toBeLessThanOrEqual(size.height+1);expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(size.width===1440)await a.page.screenshot({path:'artifacts/chat-friend-desktop.png'});
 }
 await a.page.locator('#chat-input').focus();await a.page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>400});visualViewport.dispatchEvent(new Event('resize'));});await expect(a.page.locator('#chat-dialog')).toHaveClass(/chat-keyboard/);expect((await a.page.locator('#chat-send').boundingBox()).y).toBeLessThan(400);
 await a.page.evaluate(()=>{document.activeElement.blur();delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'));});await expect(a.page.locator('#chat-dialog')).not.toHaveClass(/chat-keyboard/);expect(await a.page.locator('#chat-dialog').evaluate(e=>e.getBoundingClientRect().bottom)).toBe(844);expect(await a.page.evaluate(()=>document.body.getBoundingClientRect().height)).toBe(844);
 checks.push('320px phone through desktop fit; iOS-style keyboard reduces only chat, and closing it restores full height without a bottom gap');
 // Server pagination and frontend prepend keep every message and the scroll anchor.
 for(let i=0;i<66;i++){const person=i%2?b:a,target=i%2?a:b;const response=await person.context.request.post(origin+'/api/chat/friend/'+target.user.id+'/messages',{data:{body:'較早訊息 '+i,client_id:requestId()}});expect(response.ok()).toBe(true);}
 await a.page.evaluate(async id=>chat.choose('friend:'+id),b.user.id);await expect(a.page.locator('#chat-messages>li')).toHaveCount(50);await a.page.locator('#chat-older').click();await expect(a.page.locator('#chat-messages>li')).toHaveCount(71);await expect(a.page.locator('#chat-older')).toBeHidden();
 checks.push('older history loads without duplicate messages and retains drafts');
 await a.page.locator('#chat-close').click();await a.page.evaluate(async id=>{await enterRoom(state.rooms.find(r=>r.id===id),state.user);setTab('members');},room.id);
 await a.page.locator('[data-action=chat-room]').click();await expect(a.page.locator('#chat-title')).toHaveText(room.name);await sendUI(a,'演出結束後，大家在南口集合。');
 await c.page.evaluate(()=>chat.tick());await expect(c.page.locator('#chat-unread')).toHaveText('1');await c.page.evaluate(async id=>chat.open('expedition',id),room.id);await expect(c.page.locator('#chat-messages')).toContainText('大家在南口集合');await expect(c.page.locator('#chat-messages')).not.toContainText('網路重試');await c.page.screenshot({path:'artifacts/chat-expedition-mobile.png'});
 const outsiderConversations=(await (await d.context.request.get(origin+'/api/chat')).json()).conversations;expect(outsiderConversations.some(t=>t.target===room.id)).toBe(false);expect((await d.context.request.get(origin+'/api/chat/expedition/'+room.id+'/messages')).status()).toBe(403);
 await c.context.request.delete(origin+'/api/expeditions/'+room.id+'/membership');await c.page.evaluate(()=>chat.tick());await expect(c.page.locator('#chat-conversation')).toBeHidden();await expect(c.page.locator('#chat-messages>li')).toHaveCount(0);
 await a.context.request.delete(origin+'/api/friends/'+b.user.id);await b.page.evaluate(()=>chat.tick());await expect(b.page.locator('#chat-conversation')).toBeHidden();await expect(b.page.locator('#chat-messages>li')).toHaveCount(0);
 checks.push('group shortcut and all-member chat work; another joined room cannot read it; leaving/removing friendship clears the open conversation and revokes access');
 await a.page.evaluate(()=>{chat.root.close();return logout();});expect(await a.page.evaluate(()=>chat.messages.length)).toBe(0);await expect(a.page.locator('#chat-unread')).toBeHidden();
 await a.context.request.post(origin+'/api/auth/login',{data:{username:d.username,password}});await a.page.reload();await expect.poll(()=>a.page.evaluate(()=>state.user.username)).toBe(d.username);await a.page.locator('#chat-launcher').click();await expect(a.page.locator('#chat-conversations')).not.toContainText(b.user.nickname);await expect(a.page.locator('#chat-messages>li')).toHaveCount(0);
 checks.push('logout clears messages/drafts and changing account cannot reuse previous chat state');expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}catch(error){console.log(JSON.stringify({diagnostic:await users[0]?.page.evaluate(()=>({chat:{active:chat.active,owner:chat.owner,cursor:chat.cursor,fetching:chat.fetching,sending:chat.sending},error:document.querySelector('#chat-error').textContent,status:document.querySelector('#chat-status').textContent})).catch(()=>null)}));throw error;}
finally{await browser.close();}
