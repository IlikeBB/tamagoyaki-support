import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Chat/avatar writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],suffix=randomBytes(5).toString('hex'),headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 const users=[];
 for(const [index,nickname] of ['小玉','小狐','遠征夥伴'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),person={context,page};
  page.on('pageerror',error=>errors.push(error.message));person.user=await api(person,'/auth/register','POST',{username:`avatar_${index}_${suffix}`,nickname,password:'Isolated chat avatar verification password 2026!'});users.push(person);
 }
 const [a,b,c]=users,room=await api(a,'/expeditions','POST',{name:'頭貼驗證 '+suffix,venue:'taiwan'});
 for(const person of [b,c])await api(person,'/join','POST',{code:room.code});
 await api(a,'/friends/requests','POST',{username:b.user.username});await api(b,'/friends/'+a.user.id+'/accept','POST');
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&friends.ready()),{timeout:20000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 async function photo(person,color){
  const image=await person.page.evaluate(color=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,320,320);ctx.fillStyle='#293e36';for(const x of [110,210]){ctx.beginPath();ctx.arc(x,120,12,0,Math.PI*2);ctx.fill();}ctx.lineWidth=12;ctx.beginPath();ctx.arc(160,160,70,.15*Math.PI,.85*Math.PI);ctx.stroke();return canvas.toDataURL('image/png');},color);
  await api(person,'/profiles/me/media/avatar','PUT',{image});return (await api(person,'/profiles/me')).profile.avatar_url;
 }
 const aPhoto=await photo(a,'#f7b84b'),bPhoto=await photo(b,'#8dbbbd');
 await api(b,`/chat/friend/${a.user.id}/messages`,'POST',{body:'我在南口等你。',client_id:randomBytes(12).toString('hex')});
 await api(a,`/chat/friend/${b.user.id}/messages`,'POST',{body:'收到，我到了再聯絡。',client_id:randomBytes(12).toString('hex')});
 await a.page.locator('#chat-launcher').click();
 const contact=a.page.locator(`[data-chat-key="friend:${b.user.id}"]`);
 await expect(contact.locator('img')).toHaveAttribute('src',bPhoto);await expect.poll(()=>contact.locator('img').evaluate(image=>image.naturalWidth)).toBe(320);
 await a.page.screenshot({path:'artifacts/chat-avatar-list-mobile.png'});
 await contact.click();await expect(a.page.locator('#chat-contact-avatar img')).toHaveAttribute('src',bPhoto);
 await expect(a.page.locator(`[data-chat-person="${b.user.id}"] img`)).toHaveAttribute('src',bPhoto);await expect(a.page.locator('.is-own .chat-message-avatar img')).toHaveAttribute('src',aPhoto);
 await a.page.locator('#chat-contact-avatar').click();await expect(a.page.locator('[data-friend-status]')).toHaveText('你們已經是好友。');await a.page.locator('[data-friend-close]').click();
 checks.push('conversation list, friend heading and received messages use the real avatar; own messages use own avatar; heading remains clickable');
 await a.page.locator('#chat-input').fill('頭貼更新時保留的草稿');const row=a.page.locator('#chat-messages li').first();await row.evaluate(node=>node.dataset.preserved='yes');
 const changed=await photo(b,'#b2ce8b');await a.page.evaluate(()=>chat.tick());
 for(const image of [contact.locator('img'),a.page.locator('#chat-contact-avatar img'),a.page.locator(`[data-chat-person="${b.user.id}"] img`)])await expect(image).toHaveAttribute('src',changed);
 await expect(row).toHaveAttribute('data-preserved','yes');await expect(a.page.locator('#chat-input')).toHaveValue('頭貼更新時保留的草稿');
 await api(b,'/profiles/me/media/avatar','DELETE');await a.page.evaluate(()=>chat.tick());
 await expect(contact.locator('img')).toHaveCount(0);await expect(a.page.locator('#chat-contact-avatar')).toHaveText('小');await expect(a.page.locator(`[data-chat-person="${b.user.id}"] img`)).toHaveCount(0);
 checks.push('changing/removing an avatar updates already displayed messages, heading and list without losing the current draft or message nodes');
 const restored=await photo(b,'#8dbbbd');await a.page.evaluate(()=>chat.tick());
 await expect(a.page.locator('#chat-contact-avatar img')).toHaveAttribute('src',restored);
 for(const width of [320,390,768,1024,1440]){
  await a.page.setViewportSize({width,height:844});const box=await a.page.locator('#chat-dialog').boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(width);expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390||width===1440)await a.page.screenshot({path:`artifacts/chat-avatars-${width}.png`});
 }
 await api(b,`/chat/expedition/${room.id}/messages`,'POST',{body:'大家南口集合。',client_id:randomBytes(12).toString('hex')});
 await api(c,`/chat/expedition/${room.id}/messages`,'POST',{body:'我也到了。',client_id:randomBytes(12).toString('hex')});
 await a.page.evaluate(id=>chat.open('expedition',id),room.id);
 await expect(a.page.locator('#chat-contact-avatar')).toBeHidden();await expect(a.page.locator(`[data-chat-person="${b.user.id}"] img`)).toHaveAttribute('src',restored);
 await expect(a.page.locator(`[data-chat-person="${c.user.id}"]`)).toHaveText('遠');await expect(a.page.locator(`[data-chat-person="${c.user.id}"] img`)).toHaveCount(0);
 checks.push('group senders keep individual avatars; people without a photo use an initial; phone and desktop layouts fit');
 await a.page.evaluate(()=>{chat.root.close();return logout();});await expect(a.page.locator('#chat-messages img,#chat-conversations img,#chat-contact-avatar img')).toHaveCount(0);
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
