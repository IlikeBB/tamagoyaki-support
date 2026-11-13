import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Squad writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],suffix=randomBytes(5).toString('hex'),headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 const users=[];
 for(const [index,nickname] of ['小玉','小狐','阿晴'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),person={context,page};
  page.on('pageerror',error=>errors.push(error.message));person.user=await api(person,'/auth/register','POST',{username:`squad_${index}_${suffix}`,nickname,password:'Isolated squad composition verification password 2026!'});users.push(person);
 }
 const [a,b,c]=users,room=await api(a,'/expeditions','POST',{name:'遠征隊小隊組合 '+suffix,venue:'taiwan'}),path='/expeditions/'+room.id;
 for(const person of [b,c])await api(person,'/join','POST',{code:room.code});
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&!state.demo&&friends.ready()),{timeout:20000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 await a.page.locator('.header-actions [data-action=join]').click();await a.page.locator('[data-action=manage-squads]').click();await expect(a.page.locator('.squad-overview')).toBeVisible();await expect(a.page.locator('.squad-intro')).toContainText('尚未加入小隊');
 let release,seen;const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>seen=resolve);let once=true;
 const oldSnapshot=async route=>{if(route.request().method()==='GET'&&once){once=false;const response=await route.fetch();seen();await gate;return route.fulfill({response});}return route.continue();};
 await a.page.route('**/api'+path,oldSnapshot);await a.page.evaluate(()=>{void refresh();});await received;
 await a.page.locator('.squad-overview [data-action=create-squad]').click();await a.page.locator('#squad-value').fill('南口 <img src=x> 小隊');await a.page.locator('#squad-form [type=submit]').click();
 await expect.poll(async()=>(await api(a,path)).squads.length).toBe(1);release();await expect(a.page.locator('#dialog')).toBeHidden();await a.page.unroute('**/api'+path,oldSnapshot);
 await expect(a.page.locator('.squad-group.is-current h3')).toHaveText('南口 <img src=x> 小隊');await expect(a.page.locator('.squad-group h3 img')).toHaveCount(0);
 const first=(await api(a,path)).squads[0];await a.page.locator('[data-action=squad-invite]').click();await expect(a.page.locator('.invite-code')).toHaveText(first.code);
 const invite=new URL(await a.page.locator('.invite-url').textContent());expect(invite.searchParams.get('join')).toBe(room.code);expect(invite.searchParams.get('squad')).toBe(first.code);await a.page.locator('#dialog [data-action=close]').click();
 checks.push('top-right expedition entry opens squad compositions; creating self-joins even with an old snapshot in flight; names stay plain text; own invitation includes room and squad codes');
 await b.page.locator('.mobile-tabs [data-tab=members]').click();await b.page.locator('.squad-overview [data-action=join-squad]').click();await b.page.locator('#squad-value').fill('ZZZZZZZZ');await b.page.locator('#squad-form [type=submit]').click();await expect(b.page.locator('#squad-form .form-error')).toContainText('找不到這個小隊邀請碼');
 await b.page.locator('#squad-value').fill(first.code.toLowerCase());await b.page.locator('#squad-form [type=submit]').click();await expect(b.page.locator('#dialog')).toBeHidden();await expect(b.page.locator('.squad-group.is-current .squad-group-heading')).toContainText('2 人');
 await c.page.locator('.mobile-tabs [data-tab=members]').click();await c.page.evaluate(()=>refresh({fresh:true}));await expect(c.page.locator('.squad-group [data-action=squad-invite]')).toHaveCount(0);expect((await api(c,path)).squads[0].code).toBeUndefined();
 await c.page.locator('.squad-overview [data-action=create-squad]').click();await c.page.locator('#squad-value').fill('物販小隊');await c.page.locator('#squad-form [type=submit]').click();await expect(c.page.locator('#dialog')).toBeHidden();const second=(await api(c,path)).squads.find(squad=>squad.id!==first.id);
 await a.page.evaluate(()=>refresh({fresh:true}));await expect(a.page.locator('.squad-group')).toHaveCount(2);await expect(a.page.locator(`[data-squad-id="${first.id}"]`)).toContainText('小狐');await expect(a.page.locator(`[data-squad-id="${second.id}"]`)).toContainText('阿晴');
 checks.push('members join by case-insensitive invitation code; invalid codes stay in the form; separate squads show their members; other squads do not expose invitation codes');
 for(const width of [320,390,768,1024,1440]){
  await a.page.setViewportSize({width,height:844});expect(await a.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const box=await a.page.locator('.squad-overview').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  if(width===390||width===1440){await a.page.locator('#panel-content').evaluate(node=>node.scrollTop=0);await a.page.screenshot({path:`artifacts/squad-compositions-${width}.png`});}
 }
 await api(a,'/friends/requests','POST',{username:b.user.username});await api(b,'/friends/'+a.user.id+'/accept','POST');
 await api(a,'/friends/location','PUT',{lat:25.033,lng:121.5654,accuracy:10});await a.page.evaluate(()=>friends.sync());
 expect(await a.page.evaluate(()=>friends.sharing)).toBe(false);expect(await a.page.evaluate(()=>friends.data.sharing)).toBe(true);
 await a.page.setViewportSize({width:390,height:844});await a.page.locator('.squad-overview [data-action=join-squad]').click();await a.page.locator('#squad-value').fill(second.code);await a.page.locator('#squad-form [type=submit]').click();await expect(a.page.locator('#dialog')).toBeHidden();await expect(a.page.locator('.squad-group.is-current h3')).toHaveText('物販小隊');
 await expect(a.page.locator(`[data-squad-id="${first.id}"] .squad-group-heading`)).toContainText('1 人');await a.page.locator('.squad-group.is-current [data-action=leave-squad]').click();await expect(a.page.locator('.squad-intro')).toContainText('尚未加入小隊');
 expect((await api(a,'/me')).expeditions.some(item=>item.id===room.id)).toBe(true);expect((await api(c,path)).me.squad).toBe(second.id);expect((await api(a,path)).me.scope).toBe('off');
 expect((await api(b,'/friends')).friends.find(person=>person.id===a.user.id).location_visible).toBe(true);
 await b.page.evaluate(()=>refresh({fresh:true}));await expect(b.page.locator('.squad-group.is-current h3')).toHaveText('南口 <img src=x> 小隊');
 checks.push('phone and desktop layouts fit; joining another squad switches only yourself; leaving retains expedition membership and preserves friend sharing from another page without exposing team GPS');
 await b.page.locator('.squad-group.is-current [data-action=leave-squad]').click();await expect(b.page.locator(`[data-squad-id="${first.id}"]`)).toHaveCount(0);
 await a.page.evaluate(()=>refresh({fresh:true}));await expect(a.page.locator('.squad-group')).toHaveCount(1);await expect(a.page.locator('.squad-card')).toHaveCount(0);await expect(a.page.locator('.member-row')).toHaveCount(3);
 const expired=await b.page.request.post(origin+'/api'+path+'/squads/join',{data:{code:first.code},headers});expect(expired.status()).toBe(404);
 await api(c,path+'/membership','DELETE');await a.page.evaluate(()=>refresh({fresh:true}));await expect(a.page.locator('.squad-group')).toHaveCount(0);await expect(a.page.locator('.squad-empty')).toContainText('還沒有小隊');
 expect((await api(a,'/me')).expeditions.some(item=>item.id===room.id)).toBe(true);
 checks.push('last member leaving or exiting the expedition dissolves only the empty squad and invalidates its code; removed companion card stays absent while member list remains');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
