import {chromium,expect} from '@playwright/test';
const origin=process.argv.includes('--public')?'https://tamagoyaki-support.modoubletw.com':'http://127.0.0.1:8078';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const errors=[],writes=[],checks=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();const openNews=async()=>{await page.locator('#squad-launcher').focus();await page.evaluate(()=>news.open());};let newsMode='real',fixtures=[];
 page.on('pageerror',e=>errors.push(e.message.replace(/AIza[A-Za-z0-9_-]+/g,'[REDACTED]')));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.continue();
  if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
  if(url.pathname==='/api/config'){
   if(origin.startsWith('https:'))return route.continue();
   const response=await route.fetch(),data=await response.json();return route.fulfill({json:{...data,maps:{provider:'leaflet'}}});
  }
  if(url.pathname==='/api/me')return route.fulfill({json:{user:null,expeditions:[],help_rooms:[]}});
  return route.fulfill({status:404,json:{detail:'Read-only news preview'}});
 });
 await page.route('**/static/news.json',route=>{
  if(newsMode==='real')return route.continue();
  if(newsMode==='error')return route.fulfill({status:503,json:{error:'offline'}});
  if(newsMode==='malformed')return route.fulfill({json:{announcements:null}});
  return route.fulfill({json:{announcements:fixtures}});
 });
 await page.goto(origin);await expect.poll(()=>page.evaluate(()=>!!map),{timeout:30000}).toBe(true);
 await expect(page.locator('#squad-launcher')).toBeVisible();await expect(page.locator('#news-launcher')).toBeHidden();await expect(page.locator('#news-launcher .news-unread')).toHaveJSProperty('hidden',false);
 await openNews();await expect(page.locator('#news-dialog')).toBeVisible();
 await expect(page.locator('#news-list')).toContainText('「所有人」位置篩選暫停使用');await expect(page.locator('#news-launcher .news-unread')).toHaveJSProperty('hidden',true);
 const publishedCount=await page.locator('.news-item').count();expect(publishedCount).toBeGreaterThan(0);
 await page.locator('[data-news-filter=event]').click();await expect(page.locator('#news-list')).toContainText('目前沒有活動公告');
 await page.keyboard.press('Escape');await expect(page.locator('#news-dialog')).toBeHidden();await expect(page.locator('#squad-launcher')).toBeFocused();
 await page.reload();await expect.poll(()=>page.evaluate(()=>!!map),{timeout:30000}).toBe(true);await expect(page.locator('#news-launcher .news-unread')).toHaveJSProperty('hidden',true);
 checks.push('public announcement feed still supports read-only access; real update is published; unread clears on reading and persists across reload');
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:844});
  await page.evaluate(()=>{document.querySelector('#account-label').textContent='超長的測試帳號名稱';});
  const launcher=await page.locator('#squad-launcher').boundingBox(),header=await page.locator('.app-header').boundingBox();
  expect(launcher.x).toBeGreaterThanOrEqual(0);expect(launcher.x+launcher.width).toBeLessThanOrEqual(width);
  expect(launcher.y).toBeGreaterThanOrEqual(header.y);expect(launcher.y+launcher.height).toBeLessThanOrEqual(header.y+header.height);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await openNews();await expect(page.locator('#news-status')).toContainText(`共 ${publishedCount} 則公告`);
  const dialog=await page.locator('#news-dialog').boundingBox();expect(dialog.x).toBeGreaterThanOrEqual(0);expect(dialog.x+dialog.width).toBeLessThanOrEqual(width);expect(dialog.y+dialog.height).toBeLessThanOrEqual(845);
  if(width===390||width===1440)await page.screenshot({path:`artifacts/news-${origin.startsWith('https:')?'public':'local'}-${width}.png`});
  await page.locator('#news-close').click();
 }
 checks.push('Squad entry stays in the top right with long account names; announcement view fits 320/390/768/1024/1440px');
 newsMode='fixture';fixtures=[
  {id:'old',type:'update',published_at:'2026-11-10',title:'較早更新',body:['之前的更新。']},
  {id:'event',type:'event',published_at:'2026-11-13',event_date:'2026-11-20',title:'公告分類驗證',body:['活動集合說明。'],link:{url:'https://example.com/event',label:'活動詳情'}},
  {id:'safe',type:'update',published_at:'2026-11-12',title:'<img src=x onerror=alert(1)>',body:['<script>window.newsInjected=true</script>'],link:{url:'javascript:alert(1)',label:'不安全連結'}},
  {id:'invalid',type:'event',published_at:'2026-02-30',title:'無效日期',body:['不顯示']}
 ];
 await openNews();await expect(page.locator('.news-item')).toHaveCount(3);
 await expect(page.locator('.news-item').first()).toContainText('公告分類驗證');await expect(page.locator('.news-item').last()).toContainText('較早更新');
 await expect(page.locator('#news-list img,#news-list script')).toHaveCount(0);expect(await page.evaluate(()=>window.newsInjected)).toBeUndefined();
 await expect(page.locator('#news-list a')).toHaveCount(1);await expect(page.locator('#news-list a')).toHaveAttribute('rel','noopener noreferrer');
 await page.locator('[data-news-filter=event]').click();await expect(page.locator('.news-item')).toHaveCount(1);await expect(page.locator('.news-event-date')).toContainText('2026-11-20');
 await page.locator('[data-news-filter=update]').click();await expect(page.locator('.news-item')).toHaveCount(2);
 await page.locator('#news-close').click();
 fixtures[0].updated_at='2026-11-13T18:00:00+08:00';
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#news-launcher .news-unread')).toHaveJSProperty('hidden',false);
 await openNews();await expect(page.locator('.news-new')).toHaveCount(1);await expect(page.locator('#news-launcher .news-unread')).toHaveJSProperty('hidden',true);await page.locator('#news-close').click();
 checks.push('updates and activities sort/filter correctly; activity date/link work; revised announcements become unread; HTML and unsafe links are rejected');
 newsMode='error';await openNews();await expect(page.locator('#news-status')).toContainText('公告暫時無法載入');await expect(page.locator('#news-retry')).toBeVisible();
 newsMode='fixture';fixtures=[];await page.locator('#news-retry').click();await expect(page.locator('#news-list')).toContainText('目前沒有公告');await expect(page.locator('#news-retry')).toBeHidden();
 await page.locator('#news-close').click();newsMode='malformed';await openNews();await expect(page.locator('#news-status')).toContainText('公告暫時無法載入');
 newsMode='real';await page.locator('#news-retry').click();await expect(page.locator('.news-item')).toHaveCount(publishedCount);
 await page.keyboard.press('Escape');await expect(page.locator('#squad-launcher')).toBeFocused();
 checks.push('empty feed, network errors, malformed feed and successful retry remain usable; closing restores focus');
 expect(errors).toEqual([]);expect(writes).toEqual([]);console.log(JSON.stringify({ok:true,origin,checks,errors,writes}));
}finally{await browser.close();}
