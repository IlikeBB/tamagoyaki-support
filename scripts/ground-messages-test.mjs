import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Ground message writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],suffix=randomBytes(5).toString('hex'),headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 const users=[];
 for(const [index,nickname] of ['隊長','留言者','閱讀者'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['geolocation'],geolocation:{latitude:25.033,longitude:121.5654,accuracy:10}}),page=await context.newPage(),person={context,page};
  page.on('pageerror',error=>errors.push(error.message));person.user=await api(person,'/auth/register','POST',{username:`note_${index}_${suffix}`,nickname,password:'Isolated ground message verification password 2026!'});users.push(person);
 }
 const [a,b,c]=users,room=await api(a,'/expeditions','POST',{name:'地面留言驗證 '+suffix,venue:'makuhari'}),path='/expeditions/'+room.id;
 for(const person of [b,c])await api(person,'/join','POST',{code:room.code});
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>state.authenticated&&!state.demo&&!!map),{timeout:20000}).toBe(true);await person.page.evaluate(()=>clearInterval(pollTimer));}
 await b.page.locator('[data-action=pin-center]').click();await expect(b.page.locator('#map-actions')).toBeVisible();
 await b.page.locator('[data-map-create=message]').click();await expect(b.page.locator('#ground-message-position')).toContainText('25.03300');await expect(b.page.locator('#ground-message-hours')).toHaveValue('24');
 await b.page.screenshot({path:'artifacts/ground-message-form-mobile.png'});
 const text='前方有休息處\n<img src=x onerror="window.noteInjected=true"> 右側入口。';
 await b.page.locator('#ground-message-text').fill(text);await b.page.locator('#ground-message-form [type=submit]').click();await expect(b.page.locator('#dialog')).toBeHidden();
 const pin=(await api(b,path)).pins.find(p=>p.kind==='message');expect(pin.lat).toBe(25.033);expect(pin.lng).toBe(121.5654);expect(pin.description).toBe(text);expect(pin.expires-pin.created).toBe(86400);
 await expect(b.page.locator('.ground-message-marker')).toHaveCount(1);await expect(b.page.locator('.ground-message-copy')).toHaveText(text);await expect(b.page.locator('.ground-message-copy img,.ground-message-copy script')).toHaveCount(0);
 expect(await b.page.evaluate(()=>window.noteInjected)).toBeUndefined();expect(await b.page.evaluate(()=>state.watch)).toBeNull();expect(await b.page.evaluate(()=>state.scope)).toBe('off');
 expect((await api(b,path)).members.find(m=>m.user===b.user.id).lat).toBeNull();expect((await api(b,'/friends')).sharing).toBe(false);await expect(b.page.locator('#region-toggle')).toHaveAttribute('aria-pressed','false');
 checks.push('menu uses current Taiwan GPS rather than selected Japan map point; creates a fixed 24-hour note without live sharing; text remains safe plain text');
 await b.context.setGeolocation({latitude:25.04,longitude:121.57,accuracy:10});expect((await api(b,path)).pins[0].lat).toBe(25.033);
 await c.page.evaluate(()=>refresh());await c.page.locator('.mobile-tabs [data-tab=pins]').click();await c.page.locator(`[data-action=pin-target][data-id="${pin.id}"]`).click();
 // A member can read the shared point after expanding the venue region.
 if(await c.page.locator('#region-toggle').getAttribute('aria-pressed')==='true')await c.page.locator('#region-toggle').click();
 await c.page.locator('.mobile-tabs [data-tab=pins]').click();await c.page.locator(`[data-action=pin-target][data-id="${pin.id}"]`).click();
 await c.page.locator('#target-card [data-action=target-close]').click();await c.page.locator('.ground-message-marker').click();await expect(c.page.locator('.ground-message-copy')).toHaveText(text);
 await expect(c.page.locator(`[data-action=delete-pin][data-id="${pin.id}"]`)).toHaveCount(0);await expect(c.page.locator('#target-card [data-action=pin-vote][data-value="1"]')).toBeEnabled();
 await c.page.screenshot({path:'artifacts/ground-message-reading-mobile.png'});
 checks.push('moving the author does not move the message; another member can read the full message and vote without a deletion control');
 await b.page.locator('.mobile-tabs [data-tab=pins]').click();await expect(b.page.locator('#panel-content [data-action=ground-message]')).toBeVisible();
 await b.page.evaluate(()=>{window.realNoteGPS=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);navigator.geolocation.getCurrentPosition=(_success,error)=>error({code:1});});
 await b.page.locator('#panel-content [data-action=ground-message]').click();await expect(b.page.locator('#ground-message-position')).toContainText('請允許瀏覽器定位');
 await b.page.locator('#ground-message-text').fill('沒有定位不能發布');await b.page.locator('#ground-message-form [type=submit]').click();await expect(b.page.locator('#ground-message-form .form-error')).toContainText('請允許瀏覽器定位');expect((await api(b,path)).pins).toHaveLength(1);
 await b.page.locator('#dialog [data-action=close]').click();
 await b.page.evaluate(()=>{navigator.geolocation.getCurrentPosition=success=>{window.releaseNoteGPS=()=>success({timestamp:Date.now(),coords:{latitude:25.04,longitude:121.57,accuracy:10}});};});
 await b.page.locator('#panel-content [data-action=ground-message]').click();await b.page.locator('#dialog [data-action=close]').click();await b.page.evaluate(()=>releaseNoteGPS());expect((await api(b,path)).pins).toHaveLength(1);await expect(b.page.locator('#dialog')).toBeHidden();
 await b.page.evaluate(()=>{navigator.geolocation.getCurrentPosition=window.realNoteGPS;});
 await b.page.locator('#panel-content [data-action=ground-message]').click();await expect(b.page.locator('#ground-message-position')).toContainText('25.04000');await b.page.locator('#ground-message-text').fill('切換遠征隊後不發布');
 await b.page.evaluate(()=>{resetLobby();render();});await b.page.locator('#ground-message-form [type=submit]').click();await expect(b.page.locator('#ground-message-form .form-error')).toContainText('遠征隊已變更');expect((await api(b,path)).pins).toHaveLength(1);await b.page.locator('#dialog [data-action=close]').click();
 checks.push('GPS denial creates no note; a late GPS result cannot reopen a closed dialog; changing expedition prevents publication');
 await a.page.evaluate(()=>refresh());await a.page.locator('.mobile-tabs [data-tab=pins]').click();await a.page.locator(`[data-action=delete-pin][data-id="${pin.id}"]`).click();await expect.poll(async()=>(await api(a,path)).pins.length).toBe(0);
 checks.push('captain can delete a member message');expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
