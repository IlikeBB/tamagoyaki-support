import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Wall history writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],users=[],suffix=randomBytes(5).toString('hex'),headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 for(const [index,nickname] of ['小玉','小狐'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),person={context,page};page.on('pageerror',error=>errors.push(error.message));person.user=await api(person,'/auth/register','POST',{username:`wall_${index}_${suffix}`,nickname,password:'Isolated wall record verification password 2026!'});users.push(person);
 }
 const [a,b]=users,current=await api(a,'/expeditions','POST',{name:'目前參加的遠征隊',venue:'taiwan'}),past=await api(a,'/expeditions','POST',{name:'先前參加的幕張場次',venue:'makuhari'}),deleted=await api(a,'/expeditions','POST',{name:'已解散的遠征隊',venue:'japan'});
 for(const room of [past,deleted])await api(b,'/join','POST',{code:room.code});await api(a,'/expeditions/'+past.id+'/membership','DELETE');await api(a,'/expeditions/'+deleted.id,'DELETE');
 const page=a.page;await page.goto(origin);await expect.poll(()=>page.evaluate(()=>state.authenticated),{timeout:20000}).toBe(true);await page.evaluate(()=>clearInterval(pollTimer));await page.locator('#account-button').click();await expect(page.locator('.profile-wall-card')).toHaveCount(3);await expect(page.locator('[data-profile-action=remove-history]')).toHaveCount(2);
 await expect(page.locator(`[data-profile-action=remove-history][data-id="${current.id}"]`)).toHaveCount(0);
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:844});expect(await page.locator('#profile-content').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);if(width===390||width===1440)await page.screenshot({path:`artifacts/wall-history-${width}.png`});}
 const old=await api(a,'/profiles/me/wall');let release,seen,finished;const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>seen=resolve),handled=new Promise(resolve=>finished=resolve);let once=true;
 const stale=async route=>{if(once){once=false;seen();await gate;try{await route.fulfill({json:old});}finally{finished();}return;}return route.continue();};
 await page.route('**/api/profiles/'+a.user.id+'/wall?*',stale);await page.evaluate(()=>{void profilePage.records();});await received;
 await page.locator(`[data-profile-action=remove-history][data-id="${past.id}"]`).click();await expect.poll(async()=>(await api(a,'/profiles/me/wall')).items.some(item=>item.id===past.id)).toBe(false);release();await handled;await page.unroute('**/api/profiles/'+a.user.id+'/wall?*',stale);
 await expect(page.locator('.profile-wall-card')).toHaveCount(2);await expect(page.locator('[data-profile-action=remove-history]')).toHaveCount(1);expect((await api(b,'/expeditions/'+past.id)).room.id).toBe(past.id);expect((await api(b,'/profiles/me/wall')).items.some(item=>item.id===past.id)).toBe(true);
 checks.push('only your past records offer removal; removing a card leaves the live expedition and other profiles intact; a delayed wall response cannot restore it');
 await page.locator(`[data-profile-action=remove-history][data-id="${deleted.id}"]`).click();await expect(page.locator('.profile-wall-card')).toHaveCount(1);await page.reload();await page.locator('#account-button').click();await expect(page.locator('.profile-wall-card')).toHaveCount(1);await expect(page.locator('.profile-wall-card h4')).toHaveText(current.name);
 await page.evaluate(id=>profilePage.open(id),b.user.id);await expect(page.locator('[data-profile-action=remove-history]')).toHaveCount(0);await expect(page.locator('.profile-wall-card')).toHaveCount(2);
 checks.push('archived records can be removed and stay removed after reload; current membership remains on the wall; someone else’s wall never offers history removal');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
