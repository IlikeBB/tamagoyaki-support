import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';

const origin=process.env.QA_ORIGIN;
if(!origin||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)||origin.endsWith(':8078'))throw new Error('An isolated QA_ORIGIN is required.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],checks=[],suffix=randomBytes(5).toString('hex'),users=[];
try{
  for(const name of ['captain','creator','member']){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Tamago-Client':'web'}});
    const registration=await context.request.post(origin+'/api/auth/register',{data:{username:'hold_'+name+'_'+suffix,nickname:name,password:'Map action QA passphrase 2026!'}});
    expect(registration.ok()).toBe(true);
    users.push({context,user:await registration.json(),page:await context.newPage()});
  }
  const [a,b,c]=users;
  const response=await a.context.request.post(origin+'/api/expeditions',{data:{name:'長按驗證 '+suffix,venue:'makuhari',event_date:new Date().toISOString().slice(0,10)}});
  expect(response.ok()).toBe(true);const room=await response.json(),path='/api/expeditions/'+room.id;
  for(const user of [b,c])expect((await user.context.request.post(origin+'/api/join',{data:{code:room.code}})).ok()).toBe(true);
  for(const user of users){user.page.on('pageerror',e=>errors.push(e.message));await user.page.goto(origin);await expect(user.page.locator('.region-boundary')).toBeVisible();await expect.poll(()=>user.page.evaluate(()=>!state.demo&&lastTeamSyncAt>0)).toBe(true);await user.page.evaluate(()=>setPeopleFilter('expedition'));}
  const page=b.page;
  let pointOffset=0;
  async function point(){const r=await page.locator('#map').boundingBox();return {x:r.x+r.width*(pointOffset?.38:.64),y:r.y+r.height*(pointOffset?.38:.51)};}
  async function hold(touch=true){
    const p=await point();
    if(touch){const session=await page.context().newCDPSession(page);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await page.waitForTimeout(720);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
    else{await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(720);await page.mouse.up();}
    await expect(page.locator('#map-actions')).toBeVisible();return page.evaluate(()=>({...mapActions.point}));
  }
  let p=await point();await page.mouse.click(p.x,p.y);await page.waitForTimeout(700);await expect(page.locator('#map-actions')).toBeHidden();
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+45,p.y+30,{steps:8});await page.waitForTimeout(720);await page.mouse.up();await expect(page.locator('#map-actions')).toBeHidden();
  await page.evaluate(()=>focusRegion());
  const session=await page.context().newCDPSession(page);p=await point();
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x-25,y:p.y},{x:p.x+25,y:p.y}]});await page.waitForTimeout(720);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();await expect(page.locator('#map-actions')).toBeHidden();
  checks.push('short taps, panning and multiple fingers do not open the menu');
  const chosen=await hold();
  await page.locator('[data-map-create=task]').click();await expect(page.locator('#dialog-body h2')).toHaveText('在這裡插旗。');await expect(page.locator('#use-position')).toHaveCount(0);
  await page.locator('#title').fill('固定任務 '+suffix);await page.locator('#publish-form [type=submit]').click();await expect(page.locator('#dialog')).not.toBeVisible();
  let data=await (await b.context.request.get(origin+path)).json();const task=data.tasks.find(t=>t.title==='固定任務 '+suffix);
  expect(task.location_mode).toBe('fixed');expect(task.lat).toBeCloseTo(chosen.lat,6);expect(task.lng).toBeCloseTo(chosen.lng,6);
  expect((await (await a.context.request.get(origin+path)).json()).tasks.find(t=>t.id===task.id).lat).toBeNull();
  expect((await a.context.request.post(origin+path+'/tasks/'+task.id+'/accept')).ok()).toBe(true);
  await b.context.request.put(origin+path+'/location',{data:{scope:'expedition',lat:25.033,lng:121.5654,accuracy:10}});
  await a.page.evaluate(()=>refresh());await expect(a.page.locator('.map-pin.fixed-task')).toHaveCount(1);
  data=await (await a.context.request.get(origin+path)).json();const accepted=data.tasks.find(t=>t.id===task.id);expect(accepted.location_source).toBe('fixed');expect(accepted.lat).toBeCloseTo(chosen.lat,6);
  checks.push('touch long press publishes a static flag without GPS; moving publisher does not move it; only receiver sees coordinates');
  pointOffset=1;
  await page.locator('[data-mobile=map]').click();
  const pinPoint=await hold();await page.locator('[data-map-create=pin]').click();
  await expect(page.locator('#dialog-body h2')).toHaveText('標記地標。');
  await expect(page.locator('#hours')).toHaveValue('2');await expect(page.locator('#hours option[value="0"]')).toHaveText('永久標記');
  await page.locator('#title').fill('臨時地標 '+suffix);await page.locator('#publish-form [type=submit]').click();await expect(page.locator('#dialog')).not.toBeVisible();
  data=await (await b.context.request.get(origin+path)).json();const pin=data.pins.find(p=>p.title==='臨時地標 '+suffix);expect(pin.lat).toBeCloseTo(pinPoint.lat,6);expect(pin.expires-pin.created).toBe(7200);
  await expect(page.locator(`[data-action=delete-pin][data-id="${pin.id}"]`)).toBeVisible();
  await c.page.evaluate(()=>refresh());await c.page.locator('[data-tab=pins]').last().click();await expect(c.page.locator(`[data-action=delete-pin][data-id="${pin.id}"]`)).toHaveCount(0);
  expect((await c.context.request.delete(origin+path+'/pins/'+pin.id)).status()).toBe(403);
  await a.page.evaluate(()=>refresh());await a.page.locator('[data-tab=pins]').last().click();await a.page.locator(`[data-action=delete-pin][data-id="${pin.id}"]`).click();
  await expect.poll(async()=>(await (await b.context.request.get(origin+path)).json()).pins.length).toBe(0);
  await page.evaluate(()=>refresh());
  checks.push('temporary landmark defaults to two hours; creator and captain get deletion controls; another member receives 403; captain deletes successfully');
  await page.locator('[data-mobile=map]').click();await hold(false);await page.keyboard.press('Escape');await expect(page.locator('#map-actions')).toBeHidden();await expect(page.locator('[data-action=pin-center]')).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.locator('#map-actions')).toBeVisible();await expect(page.locator('[data-map-create=task]')).toBeFocused();await page.keyboard.press('Escape');
  checks.push('mouse long press, Escape focus restoration and keyboard map-centre menu work');
  for(const width of [320,768,1024,1440]){
    await page.setViewportSize({width,height:width===320?568:900});await page.locator('[data-action=pin-center]').click();
    const stage=await page.locator('.map-stage').boundingBox(),box=await page.locator('#map-actions').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(stage.x);expect(box.x+box.width).toBeLessThanOrEqual(stage.x+stage.width);expect(box.y).toBeGreaterThanOrEqual(stage.y);expect(box.y+box.height).toBeLessThanOrEqual(stage.y+stage.height);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:390,height:844});await hold();await page.screenshot({path:'artifacts/map-hold-mobile.png'});
  await page.locator('[data-map-create=pin]').click();await page.screenshot({path:'artifacts/map-hold-pin-form.png'});
  expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
