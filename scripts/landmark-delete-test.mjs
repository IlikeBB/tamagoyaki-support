import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw Error('Landmark deletion tests require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],users=[],suffix=randomBytes(5).toString('hex'),headers={'X-Tamago-Client':'web',Origin:origin};
async function api(person,path,method='GET',data){const response=await person.page.request.fetch(origin+'/api'+path,{method,data,headers});expect(response.ok(),`${method} ${path}: ${response.status()}`).toBe(true);return response.json();}
try{
 for(const [index,nickname] of ['隊長','地標建立者','其他隊員'].entries()){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),person={context,page};
  page.on('pageerror',error=>errors.push(error.message));person.user=await api(person,'/auth/register','POST',{username:`pindel_${index}_${suffix}`,nickname,password:'Isolated landmark deletion verification password 2026!'});users.push(person);
 }
 const [captain,owner,other]=users,room=await api(captain,'/expeditions','POST',{name:'地標刪除驗證 '+suffix,venue:'taiwan'}),path='/expeditions/'+room.id;
 for(const person of [owner,other])await api(person,'/join','POST',{code:room.code});
 const create=(kind='meet',hours=0)=>api(owner,path+'/pins','POST',{title:'自己建立的地標 '+randomBytes(3).toString('hex'),description:'確認刪除後不再回來。',kind,hours,lat:25.033,lng:121.5654});
 const pin=await create();
 for(const person of users){await person.page.goto(origin);await expect.poll(()=>person.page.evaluate(()=>!state.demo&&lastTeamSyncAt>0),{timeout:20000}).toBe(true);await person.page.evaluate(()=>{clearInterval(pollTimer);setTab('pins');});}
 const page=owner.page,row=()=>page.locator('.pin-row').filter({has:page.locator(`[data-action=delete-pin][data-id="${pin.id}"]`)});
 await expect(row()).toHaveCount(1);
 const old=await api(owner,path);let release,seen,finished;const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>seen=resolve),handled=new Promise(resolve=>finished=resolve);let once=true;
 const stale=async route=>{if(once){once=false;seen();await gate;try{await route.fulfill({json:old});}finally{finished();}return;}return route.continue();};
 await page.route('**/api'+path,stale);await page.evaluate(()=>{void refresh();});await received;
 await row().locator('[data-action=delete-pin]').click();await expect.poll(async()=>(await api(owner,path)).pins.some(item=>item.id===pin.id)).toBe(false);release();await handled;await page.unroute('**/api'+path,stale);
 await expect(row()).toHaveCount(0,{timeout:1500});await expect(page.locator('#pin-count')).toHaveText('0');
 checks.push('deleting an own permanent landmark cannot be undone on screen by a polling response captured before deletion');
 const temporary=await create('meet',2);await page.evaluate(()=>refresh({fresh:true}));await page.evaluate(id=>selectTarget('pin',id),temporary.id);
 const targetDelete=page.locator('#target-card [data-action=delete-pin]');await expect(targetDelete).toBeVisible();
 const control=await targetDelete.elementHandle();await page.evaluate(()=>{onOrientation({absolute:true,alpha:30});onOrientation({absolute:true,alpha:45});});
 expect(await control.evaluate(node=>node.isConnected),'compass updates must keep the active deletion control').toBe(true);
 let deleteStarted,releaseDelete,deleteFinished;const started=new Promise(resolve=>deleteStarted=resolve),deleteGate=new Promise(resolve=>releaseDelete=resolve),deleteHandled=new Promise(resolve=>deleteFinished=resolve);let deleteCalls=0;
 const delayedDelete=async route=>{deleteCalls++;deleteStarted();await deleteGate;try{await route.continue();}finally{deleteFinished();}};
 await page.route('**/api'+path+'/pins/'+temporary.id,delayedDelete);await targetDelete.click();await started;await expect(targetDelete).toBeDisabled();await page.evaluate(id=>deletePin(id),temporary.id);expect(deleteCalls).toBe(1);releaseDelete();await deleteHandled;
 await expect(page.locator('#target-card')).toBeHidden();await expect(page.locator('#pin-count')).toHaveText('0');await page.unroute('**/api'+path+'/pins/'+temporary.id,delayedDelete);
 checks.push('compass updates preserve the delete control; deleting from the map hides the selected card and marker; repeated clicks send only one request');
 const retry=await create();await page.evaluate(()=>{return refresh({fresh:true});});await page.locator('.mobile-tabs [data-tab=pins]').click();
 const retryButton=page.locator(`.pin-row [data-action=delete-pin][data-id="${retry.id}"]`),retryPath='**/api'+path+'/pins/'+retry.id;
 await page.route(retryPath,route=>route.abort('failed'));await retryButton.click();await expect(page.locator('#toast')).toContainText(/fetch|連線|網路/i);await expect(retryButton).toBeEnabled();await page.unroute(retryPath);await retryButton.click();await expect(retryButton).toHaveCount(0);
 const gone=await create('message',24);await page.evaluate(()=>refresh({fresh:true}));await api(captain,path+'/pins/'+gone.id,'DELETE');await page.locator(`.pin-row [data-action=delete-pin][data-id="${gone.id}"]`).click();await expect(page.locator(`[data-action=delete-pin][data-id="${gone.id}"]`)).toHaveCount(0);await expect(page.locator('#toast')).toContainText('地標已移除');
 checks.push('network failure restores a usable delete control for retry; a landmark already removed by the captain clears cleanly from the creator screen');
 const protectedPin=await create();for(const person of [captain,other]){await person.page.evaluate(()=>refresh({fresh:true}));await person.page.locator('.mobile-tabs [data-tab=pins]').click();}
 await expect(other.page.locator(`[data-action=delete-pin][data-id="${protectedPin.id}"]`)).toHaveCount(0);const denied=await other.page.request.delete(origin+'/api'+path+'/pins/'+protectedPin.id,{headers});expect(denied.status()).toBe(403);
 await captain.page.locator(`[data-action=delete-pin][data-id="${protectedPin.id}"]`).click();await expect.poll(async()=>(await api(owner,path)).pins.length).toBe(0);await page.evaluate(()=>refresh({fresh:true}));
 checks.push('temporary, permanent and ground-message landmarks share deletion behavior; another member is denied and the captain can delete');
 const beforeCreate=await api(owner,path);let releaseCreate,createSeen,createFinished;const createGate=new Promise(resolve=>releaseCreate=resolve),createReceived=new Promise(resolve=>createSeen=resolve),createHandled=new Promise(resolve=>createFinished=resolve);let createOnce=true;
 const staleCreate=async route=>{if(createOnce){createOnce=false;createSeen();await createGate;try{await route.fulfill({json:beforeCreate});}finally{createFinished();}return;}return route.continue();};
 await page.route('**/api'+path,staleCreate);await page.evaluate(()=>{void refresh();});await createReceived;await page.evaluate(()=>showPublish('pin',{lat:25.033,lng:121.5654}));await page.locator('#title').fill('同步中的新地標');await page.locator('#hours').selectOption('0');await page.locator('#publish-form [type=submit]').click();
 await expect.poll(async()=>(await api(owner,path)).pins.length).toBe(1);releaseCreate();await createHandled;await page.unroute('**/api'+path,staleCreate);await expect(page.locator('#dialog')).toBeHidden();await expect(page.locator('.pin-row h2')).toHaveText('同步中的新地標');
 checks.push('new landmarks appear after publishing even when a polling response captured before creation is in flight');
 expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
