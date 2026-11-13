import {chromium,expect} from '@playwright/test';
import {randomBytes} from 'node:crypto';
const origin=process.env.QA_ORIGIN;
if(origin!=='http://127.0.0.1:8079')throw new Error('Country venue writes require isolated QA port 8079.');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const users=[],errors=[],suffix=randomBytes(5).toString('hex'),checks=[];
try{
 for(const nickname of ['台灣的小玉','同行夥伴']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,extraHTTPHeaders:{'X-Tamago-Client':'web'}});
  const response=await context.request.post(origin+'/api/auth/register',{data:{username:'country_'+users.length+'_'+suffix,nickname,password:'Isolated country venues test 2026!'}});expect(response.ok()).toBe(true);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));users.push({context,page});await page.goto(origin);await expect.poll(()=>page.evaluate(()=>state.authenticated&&!!map),{timeout:25000}).toBe(true);await page.evaluate(()=>clearInterval(pollTimer));
 }
 const [a,b]=users;
 for(const [vid,label] of [['taiwan','台灣'],['japan','日本']]){
  await a.page.locator('.header-actions [data-action=join]').click();await expect(a.page.locator('#join-venue option')).toHaveCount(6);await a.page.locator('#join-venue').selectOption(vid);await a.page.locator('#dialog [data-action=create-mode]').first().click();await expect(a.page.locator('#venue')).toHaveValue(vid);await expect(a.page.locator('#venue option:checked')).toHaveText(label);
  await a.page.locator('#name').fill(label+'活動隊伍 '+suffix);if(vid==='taiwan')await a.page.screenshot({path:'artifacts/country-venue-create-mobile.png'});await a.page.locator('#join-form [type=submit]').click();await expect(a.page.locator('#dialog')).not.toBeVisible();await expect(a.page.locator('#room-date')).toContainText(label);await expect(a.page.locator('#region-venue option')).toHaveCount(4);await expect(a.page.locator('#region-toggle')).toHaveAttribute('aria-pressed','false');
  const room=await a.page.evaluate(()=>state.room);
  await b.page.locator('.header-actions [data-action=join]').click();await b.page.locator('#join-venue').selectOption(vid);await expect(b.page.locator(`#venue-catalog [data-room-id="${room.id}"]`)).toBeVisible();await b.page.locator(`#venue-catalog [data-room-id="${room.id}"]`).click();await expect(b.page.locator('#dialog')).not.toBeVisible();await expect(b.page.locator('#room-date')).toContainText(label);
  expect(await b.page.evaluate(()=>state.room.venue)).toBe(vid);expect(await b.page.evaluate(()=>state.members.every(m=>!m.location_visible&&m.lat==null))).toBe(true);
 }
 await b.page.locator('#account-button').click();await expect(b.page.locator('.profile-wall-card')).toHaveCount(2);expect((await b.page.locator('.profile-wall-venue').allTextContents()).map(t=>t.trim()).sort()).toEqual(['日本','台灣'].sort());await b.page.locator('#profile-close').click();await b.page.reload();await expect.poll(()=>b.page.evaluate(()=>state.room?.venue)).toBe('japan');await expect(b.page.locator('#room-date')).toContainText('日本');
 await b.page.locator('.header-actions [data-action=join]').click();await expect(b.page.locator('#join-venue')).toHaveValue('japan');await b.page.locator('#join-venue').selectOption('taiwan');await expect(b.page.locator('#venue-catalog')).toContainText('台灣活動隊伍');await expect(b.page.locator('#venue-catalog')).not.toContainText('日本活動隊伍');await b.page.screenshot({path:'artifacts/country-venue-browse-mobile.png'});
 await b.page.setViewportSize({width:1440,height:900});await b.page.screenshot({path:'artifacts/country-venue-browse-desktop.png'});expect(await b.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 checks.push('both country choices support form creation, distinct public catalogues and joining; labels appear in room header and profile wall; reload retains choice; original four map centres remain valid and country rooms clear the venue radius');expect(errors).toEqual([]);console.log(JSON.stringify({ok:true,checks,errors}));
}finally{await browser.close();}
